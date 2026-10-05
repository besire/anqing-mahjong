/**
 * 牌效分析：何切、进张、两步前瞻、吃碰建议、牌型拆解
 */
import { calcShanten, calcUkeire, ukeireTotal, type Ukeire, type WaitInfo } from './shanten';
import { isHonorKind, isTerminalKind, PLAY_KINDS, rankOf, type Kind } from './tiles';
import type { ClaimAction, ClaimOptions } from './types';

export interface DiscardOption {
  kind: Kind;
  /** 打出后的向听数 */
  shanten: number;
  /** 进张张数 */
  total: number;
  waits: WaitInfo[];
  /** 两步前瞻：摸到有效牌并最优打牌后，下一阶段的平均进张 */
  avgNext?: number;
}

export function remainingFromVisible(visible: number[]): number[] {
  const r = new Array(PLAY_KINDS).fill(0);
  for (let k = 0; k < PLAY_KINDS; k++) r[k] = Math.max(0, 4 - visible[k]);
  return r;
}

/** 同等条件下的出牌偏好：字牌 > 幺九 > 二八 > 中张（数值越小越先打） */
export function discardPreference(k: Kind): number {
  if (isHonorKind(k)) return 0;
  if (isTerminalKind(k)) return 1;
  const r = rankOf(k);
  if (r === 2 || r === 8) return 2;
  return 3;
}

export function compareOptions(a: DiscardOption, b: DiscardOption): number {
  return (
    a.shanten - b.shanten ||
    b.total - a.total ||
    (b.avgNext ?? -1) - (a.avgNext ?? -1) ||
    discardPreference(a.kind) - discardPreference(b.kind) ||
    a.kind - b.kind
  );
}

function nextStageAvg(
  c: number[],
  called: number,
  remaining: number[],
  qidui: boolean,
  s: number,
  waits: WaitInfo[],
): number {
  let sum = 0;
  let cnt = 0;
  for (const w of waits) {
    if (w.count <= 0) continue;
    c[w.kind]++;
    remaining[w.kind]--;
    let best = 0;
    for (let d = 0; d < PLAY_KINDS; d++) {
      if (!c[d]) continue;
      c[d]--;
      if (calcShanten(c, called, qidui) === s - 1) {
        const t = ukeireTotal(c, called, remaining, s - 1, qidui);
        if (t > best) best = t;
      }
      c[d]++;
    }
    c[w.kind]--;
    remaining[w.kind]++;
    sum += best * w.count;
    cnt += w.count;
  }
  return cnt ? sum / cnt : 0;
}

/**
 * 3n+2 张手牌的何切分析，返回按优劣排序的每种打法。
 * deep: 对前几名做两步前瞻（用于同进张时比较好型）
 */
export function analyzeDiscards(
  counts: number[],
  called: number,
  remainingIn: number[],
  qidui: boolean,
  opts: { deep?: boolean } = {},
): DiscardOption[] {
  const c = counts.slice(0, PLAY_KINDS);
  const remaining = remainingIn.slice(0, PLAY_KINDS);
  const res: DiscardOption[] = [];
  for (let k = 0; k < PLAY_KINDS; k++) {
    if (!c[k]) continue;
    c[k]--;
    const u = calcUkeire(c, called, remaining, qidui);
    c[k]++;
    res.push({ kind: k, shanten: u.shanten, total: u.total, waits: u.waits });
  }
  res.sort(compareOptions);
  if (opts.deep && res.length && res[0].shanten >= 1) {
    const bestS = res[0].shanten;
    const maxT = res[0].total;
    const cands = res.filter((o) => o.shanten === bestS && o.total >= maxT * 0.6).slice(0, 8);
    for (const o of cands) {
      c[o.kind]--;
      o.avgNext = nextStageAvg(c, called, remaining, qidui, o.shanten, o.waits);
      c[o.kind]++;
    }
    res.sort(compareOptions);
  }
  return res;
}

/** 3n+1 张（等牌状态）的进张 */
export function analyzeWaiting(counts: number[], called: number, remaining: number[], qidui: boolean): Ukeire {
  return calcUkeire(counts.slice(0, PLAY_KINDS), called, remaining, qidui);
}

// ---------------------------------------------------------------------------- 吃碰杠建议

export interface CallAdvice {
  action: ClaimAction;
  /** 叫牌后（最佳打法下）的向听 */
  shanten: number;
  /** 叫牌后的进张 */
  total: number;
  /** 吃/碰后建议打的牌 */
  discard?: Kind;
}

export interface ClaimAnalysis {
  /** 不叫牌时的状态 */
  base: Ukeire;
  advices: CallAdvice[];
  recommend: ClaimAction;
  /** 推荐理由（纯文本） */
  reason: string;
}

export function analyzeClaim(
  counts13: number[],
  called: number,
  kind: Kind,
  opt: ClaimOptions,
  remaining: number[],
  qidui: boolean,
): ClaimAnalysis {
  const c = counts13.slice(0, PLAY_KINDS);
  const base = calcUkeire(c.slice(), called, remaining, qidui);
  const advices: CallAdvice[] = [];

  const afterCall = (remove: Kind[], action: ClaimAction) => {
    const cc = c.slice();
    for (const k of remove) cc[k]--;
    const opts = analyzeDiscards(cc, called + 1, remaining, false);
    const best = opts[0];
    advices.push({ action, shanten: best.shanten, total: best.total, discard: best.kind });
  };

  if (opt.peng) afterCall([kind, kind], { type: 'peng' });
  for (const pair of opt.chi) afterCall(pair, { type: 'chi', kinds: pair });
  if (opt.gang) {
    const cc = c.slice();
    cc[kind] -= 3;
    const u = calcUkeire(cc, called + 1, remaining, false);
    advices.push({ action: { type: 'gang' }, shanten: u.shanten, total: u.total });
  }

  if (opt.hu) {
    return { base, advices, recommend: { type: 'hu' }, reason: '可以胡牌！' };
  }

  const sorted = [...advices].sort((a, b) => a.shanten - b.shanten || b.total - a.total);
  const best = sorted[0];
  const gang = advices.find((a) => a.action.type === 'gang');
  if (gang && gang.shanten <= base.shanten) {
    return {
      base,
      advices,
      recommend: gang.action,
      reason: `杠牌 +1 花，并从牌尾补一张；杠后仍是${shantenText(gang.shanten)}。`,
    };
  }
  if (best && best.shanten < base.shanten) {
    return {
      base,
      advices,
      recommend: best.action,
      reason: `叫牌后由${shantenText(base.shanten)}进到${shantenText(best.shanten)}，进张 ${best.total} 张。`,
    };
  }
  const peng = advices.find((a) => a.action.type === 'peng');
  if (peng && isHonorKind(kind) && peng.shanten <= base.shanten) {
    return {
      base,
      advices,
      recommend: peng.action,
      reason: `${['南', '西', '北'][kind - 27]}刻子 +1 花，且向听不变，可以碰。`,
    };
  }
  return {
    base,
    advices,
    recommend: { type: 'pass' },
    reason: best
      ? `叫牌不能减少向听（${shantenText(best.shanten)}，进张 ${best.total}），保持门内更灵活。`
      : '无需叫牌。',
  };
}

export function shantenText(s: number): string {
  if (s < 0) return '和了';
  if (s === 0) return '听牌';
  return `${['', '一', '两', '三', '四', '五', '六', '七', '八'][s] ?? s}向听`;
}

// ---------------------------------------------------------------------------- 牌型拆解

export type BlockType =
  | 'shunzi'
  | 'kezi'
  | 'quetou'
  | 'liangmian'
  | 'kanzhang'
  | 'bianzhang'
  | 'duizi'
  | 'guzhang';

export const BLOCK_LABEL: Record<BlockType, string> = {
  shunzi: '顺子',
  kezi: '刻子',
  quetou: '雀头',
  liangmian: '两面',
  kanzhang: '嵌张',
  bianzhang: '边张',
  duizi: '对子',
  guzhang: '孤张',
};

export interface Block {
  type: BlockType;
  kinds: Kind[];
}

interface Choice {
  m: number;
  t: number;
  h: number;
  q: number;
  blocks: Block[];
}

const TAATSU_Q: Partial<Record<BlockType, number>> = { liangmian: 4, duizi: 3, kanzhang: 2, bianzhang: 1 };

function groupChoices(c: number[], base: number, len: number, honor: boolean): Choice[] {
  const memo = new Map<string, Map<number, Choice>>();
  const rec = (): Map<number, Choice> => {
    const key = c.join('');
    const cached = memo.get(key);
    if (cached) return cached;
    const out = new Map<number, Choice>();
    let i = 0;
    while (i < len && c[i] === 0) i++;
    if (i >= len) {
      out.set(0, { m: 0, t: 0, h: 0, q: 0, blocks: [] });
      memo.set(key, out);
      return out;
    }
    const tryTake = (take: number[], block: Block, dm: number, dt: number, dh: number) => {
      for (const j of take) c[j]--;
      const sub = rec();
      for (const j of take) c[j]++;
      for (const ch of sub.values()) {
        if (ch.h + dh > 1) continue;
        const m = ch.m + dm;
        const t = ch.t + dt;
        const h = ch.h + dh;
        const q = ch.q + (TAATSU_Q[block.type] ?? 0) + (block.type === 'guzhang' ? 0 : 0.01);
        const code = m * 256 + t * 2 + h;
        const prev = out.get(code);
        if (!prev || q > prev.q) out.set(code, { m, t, h, q, blocks: [block, ...ch.blocks] });
      }
    };
    const k = base + i;
    if (c[i] >= 3) tryTake([i, i, i], { type: 'kezi', kinds: [k, k, k] }, 1, 0, 0);
    if (!honor && i <= len - 3 && c[i + 1] && c[i + 2])
      tryTake([i, i + 1, i + 2], { type: 'shunzi', kinds: [k, k + 1, k + 2] }, 1, 0, 0);
    if (c[i] >= 2) {
      tryTake([i, i], { type: 'quetou', kinds: [k, k] }, 0, 0, 1);
      tryTake([i, i], { type: 'duizi', kinds: [k, k] }, 0, 1, 0);
    }
    if (!honor && i <= len - 2 && c[i + 1]) {
      const r = i + 1;
      tryTake([i, i + 1], { type: r === 1 || r === 8 ? 'bianzhang' : 'liangmian', kinds: [k, k + 1] }, 0, 1, 0);
    }
    if (!honor && i <= len - 3 && c[i + 2]) tryTake([i, i + 2], { type: 'kanzhang', kinds: [k, k + 2] }, 0, 1, 0);
    tryTake([i], { type: 'guzhang', kinds: [k] }, 0, 0, 0);
    memo.set(key, out);
    return out;
  };
  return [...rec().values()];
}

export interface HandShape {
  shanten: number;
  blocks: Block[];
  /** 面子 + 搭子 总块数（超过 4 说明搭子过剩） */
  blockCount: number;
}

/** 给出一种达到最小向听的拆法（用于"牌型拆解"展示） */
export function bestShape(counts: number[], called: number): HandShape {
  const groups: Choice[][] = [];
  for (let g = 0; g < 4; g++) {
    const base = g * 9;
    const len = g === 3 ? 3 : 9;
    const off = g === 3 ? 27 : base;
    const c = counts.slice(off, off + len);
    groups.push(groupChoices(c, off, len, g === 3));
  }
  let best: { s: number; q: number; blocks: Block[]; count: number } | null = null;
  for (const a of groups[0])
    for (const b of groups[1])
      for (const d of groups[2])
        for (const e of groups[3]) {
          const h = a.h + b.h + d.h + e.h;
          if (h > 1) continue;
          let m = a.m + b.m + d.m + e.m + called;
          let t = a.t + b.t + d.t + e.t;
          const count = m + t;
          if (m > 4) m = 4;
          if (m + t > 4) t = 4 - m;
          const s = 8 - 2 * m - t - h;
          const q = a.q + b.q + d.q + e.q + h * 0.5;
          if (!best || s < best.s || (s === best.s && q > best.q)) {
            best = { s, q, blocks: [...a.blocks, ...b.blocks, ...d.blocks, ...e.blocks], count };
          }
        }
  return { shanten: best!.s, blocks: best!.blocks, blockCount: best!.count };
}
