/**
 * 电脑对手
 *  新手 easy  ：只看向听，经常随手打，吃碰随缘
 *  中级 normal：标准牌效（向听 + 进张），能减少向听就吃碰
 *  高手 hard  ：两步前瞻 + 不随手 + 同等牌效时选更安全的牌（读副露和巡目估计危险度）
 * AI 只使用自己视角可见的信息，不偷看。
 */
import { analyzeClaim, analyzeDiscards, compareOptions, remainingFromVisible } from './analysis';
import type { PlayerView } from './game';
import { calcShanten } from './shanten';
import { countKinds, isHonorKind, kindOf, rankOf, type Kind, type TileId } from './tiles';
import type { BotLevel, ClaimAction, ClaimOptions, Seat, TurnAction, TurnOptions } from './types';

type Rng = () => number;

export interface BotProfile {
  /** 随手打一张的概率 */
  randomDiscard: number;
  /** 只看向听不看进张 */
  shantenOnly: boolean;
  /** 次优打法的概率（同向听、进张接近时） */
  sloppy: number;
  /** 两步前瞻 */
  deep: boolean;
  /** 保留南西北对子的倾向（进张允许损失的比例） */
  windKeep: number;
  /** 弃和阈值：对手威胁超过它且自己向听 ≥ foldShanten 时打安全牌 */
  foldThreat: number;
  foldShanten: number;
  /** 进张相同的打法里优先打更安全的牌 */
  safeTie: boolean;
  /** 吃碰策略 */
  call: 'random' | 'efficiency';
  /** 向听不变但进张明显增加时也吃碰 */
  callMore: boolean;
}

export const PROFILES: Record<BotLevel, BotProfile> = {
  easy: {
    randomDiscard: 0.12,
    shantenOnly: true,
    sloppy: 0,
    deep: false,
    windKeep: 0,
    foldThreat: Infinity,
    foldShanten: 9,
    safeTie: false,
    call: 'random',
    callMore: false,
  },
  normal: {
    randomDiscard: 0,
    shantenOnly: false,
    sloppy: 0.25,
    deep: false,
    windKeep: 0,
    foldThreat: Infinity,
    foldShanten: 9,
    safeTie: false,
    call: 'efficiency',
    callMore: false,
  },
  hard: {
    // 模拟对战结论：本规则下对局节奏很快、自摸三家付，弃和/留字牌的收益都小于速度，
    // 所以高手 = 两步前瞻 + 不随手 + 同进张时打更安全的牌。
    randomDiscard: 0,
    shantenOnly: false,
    sloppy: 0,
    deep: true,
    windKeep: 0,
    foldThreat: Infinity,
    foldShanten: 9,
    safeTie: true,
    call: 'efficiency',
    callMore: false,
  },
};

function pickTileOfKind(view: PlayerView, kind: Kind): TileId {
  // 同种牌优先打刚摸的（摸切）
  if (view.drawn !== null && kindOf(view.drawn) === kind) return view.drawn;
  return view.hand.find((t) => kindOf(t) === kind)!;
}

// ---------------------------------------------------------------------------- 防守

/** 估计对手听牌概率（没有立直，只能看副露数和巡目） */
export function threatOf(view: PlayerView, seat: Seat): number {
  const p = view.players[seat];
  const turns = p.river.length;
  const melds = p.melds.length;
  let t = 0.02 + turns * 0.028 + melds * 0.14;
  if (melds >= 3) t += 0.15;
  if (p.handCount <= 4) t += 0.2;
  return Math.min(0.92, t);
}

/** 某张牌对某个对手的危险度 0..1 */
export function dangerOf(view: PlayerView, kind: Kind, seat: Seat): number {
  const p = view.players[seat];
  const discarded = new Set(p.river.map((r) => kindOf(r.id)));
  const seen = view.visible[kind];
  let d: number;
  if (isHonorKind(kind)) {
    d = seen >= 3 ? 0.04 : seen === 2 ? 0.25 : 0.5;
  } else {
    const r = rankOf(kind);
    d = r === 1 || r === 9 ? 0.55 : r === 2 || r === 8 ? 0.75 : 1;
    const suji = (r - 3 >= 1 && discarded.has(kind - 3)) || (r + 3 <= 9 && discarded.has(kind + 3));
    if (suji) d *= 0.6;
    if (seen >= 3) d *= 0.5;
  }
  // 现物（没有振听规则，现物不绝对安全，但大概率不在听牌上）
  if (discarded.has(kind)) d *= 0.25;
  return d;
}

export function totalDanger(view: PlayerView, kind: Kind): number {
  let sum = 0;
  for (const p of view.players) {
    if (p.seat === view.seat) continue;
    sum += threatOf(view, p.seat) * dangerOf(view, kind, p.seat);
  }
  return sum;
}

export function maxThreat(view: PlayerView): number {
  let m = 0;
  for (const p of view.players) if (p.seat !== view.seat) m = Math.max(m, threatOf(view, p.seat));
  return m;
}

// ---------------------------------------------------------------------------- 出牌

export function chooseDiscard(view: PlayerView, prof: BotProfile, rng: Rng = Math.random): Kind {
  const counts = countKinds(view.hand);
  const remaining = remainingFromVisible(view.visible);
  const qidui = view.rules.qidui && view.melds.length === 0;
  const opts = analyzeDiscards(counts, view.melds.length, remaining, qidui, { deep: prof.deep });
  const best = opts[0];

  if (prof.randomDiscard > 0 && rng() < prof.randomDiscard) {
    return opts[Math.floor(rng() * opts.length)].kind;
  }
  if (prof.shantenOnly) {
    const same = opts.filter((o) => o.shanten === best.shanten);
    return same[Math.floor(rng() * same.length)].kind;
  }

  if (best.shanten >= prof.foldShanten && maxThreat(view) >= prof.foldThreat) {
    const scored = opts.map((o) => ({ o, d: totalDanger(view, o.kind) }));
    scored.sort((a, b) => a.d - b.d || compareOptions(a.o, b.o));
    return scored[0].o.kind;
  }

  const close = opts.filter((o) => o.shanten === best.shanten && o.total >= best.total * (1 - prof.windKeep));
  if (prof.windKeep > 0) {
    // 南西北对子、刻子能成刻 +1 花：进张差不多时留着
    const nonWindPair = close.find((o) => !(isHonorKind(o.kind) && counts[o.kind] >= 2));
    if (nonWindPair) return nonWindPair.kind;
  }
  if (prof.sloppy > 0 && close.length > 1 && rng() < prof.sloppy) {
    const near = close.filter((o) => o.total >= best.total - 2);
    if (near.length > 1) return near[1].kind;
  }
  if (prof.safeTie) {
    const ties = opts.filter(
      (o) => o.shanten === best.shanten && o.total === best.total && Math.abs((o.avgNext ?? 0) - (best.avgNext ?? 0)) < 0.5,
    );
    if (ties.length > 1) {
      ties.sort((x, y) => totalDanger(view, x.kind) - totalDanger(view, y.kind));
      return ties[0].kind;
    }
  }
  return best.kind;
}

export function botTurn(view: PlayerView, opts: TurnOptions, level: BotLevel | BotProfile, rng: Rng = Math.random): TurnAction {
  const prof = typeof level === 'string' ? PROFILES[level] : level;
  if (opts.tsumo) return { type: 'tsumo' };

  const counts = countKinds(view.hand);
  const called = view.melds.length;
  const qidui = view.rules.qidui && called === 0;
  if (opts.angang.length || opts.jiagang.length) {
    const before = calcShanten(counts, called, qidui);
    for (const k of opts.angang) {
      const c = counts.slice();
      c[k] -= 4;
      const ok = prof.call === 'random' ? rng() < 0.7 : calcShanten(c, called + 1, false) <= before;
      if (ok) return { type: 'angang', kind: k };
    }
    for (const k of opts.jiagang) {
      const c = counts.slice();
      c[k] -= 1;
      const ok = prof.call === 'random' ? rng() < 0.7 : calcShanten(c, called, false) <= before;
      if (ok) return { type: 'jiagang', kind: k };
    }
  }
  const kind = chooseDiscard(view, prof, rng);
  return { type: 'discard', tile: pickTileOfKind(view, kind) };
}

// ---------------------------------------------------------------------------- 吃碰杠胡

export function botClaim(
  view: PlayerView,
  tile: TileId,
  opt: ClaimOptions,
  level: BotLevel | BotProfile,
  rng: Rng = Math.random,
): ClaimAction {
  const prof = typeof level === 'string' ? PROFILES[level] : level;
  if (opt.hu) return { type: 'hu' };

  if (prof.call === 'random') {
    if (opt.gang && rng() < 0.7) return { type: 'gang' };
    if (opt.peng && rng() < 0.5) return { type: 'peng' };
    if (opt.chi.length && rng() < 0.4) return { type: 'chi', kinds: opt.chi[Math.floor(rng() * opt.chi.length)] };
    return { type: 'pass' };
  }

  const counts = countKinds(view.hand);
  const remaining = remainingFromVisible(view.visible);
  const qidui = view.rules.qidui && view.melds.length === 0;
  const a = analyzeClaim(counts, view.melds.length, kindOf(tile), opt, remaining, qidui);
  if (prof.callMore && a.recommend.type === 'pass') {
    const better = a.advices
      .filter((x) => x.shanten === a.base.shanten && x.total > a.base.total * 1.3)
      .sort((x, y) => y.total - x.total)[0];
    if (better) return better.action;
  }
  return a.recommend;
}
