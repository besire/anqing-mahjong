/**
 * 提示系统：把分析结果组织成"何切推荐 + 解析"给界面展示
 */
import {
  analyzeClaim,
  analyzeDiscards,
  analyzeWaiting,
  bestShape,
  BLOCK_LABEL,
  remainingFromVisible,
  shantenText,
  type ClaimAnalysis,
  type DiscardOption,
  type HandShape,
} from './analysis';
import { visibleCountsOf, type GameState } from './game';
import { calcShanten, type Ukeire } from './shanten';
import { countKinds, isHonorKind, isTerminalKind, kindOf, kindName, PLAY_KINDS, rankOf, type Kind } from './tiles';
import type { Meld, Seat, TurnOptions } from './types';
import { scoreWin } from './win';
import type { Rules } from './rules';

export type Seg = string | { tile: Kind } | { tiles: Kind[] };
export type Tone = 'info' | 'good' | 'warn' | 'value' | 'muted';

export interface HintLine {
  tone: Tone;
  segs: Seg[];
}

export interface WaitValue {
  kind: Kind;
  count: number;
  ron: number;
  tsumo: number;
}

export interface TurnHint {
  type: 'turn';
  canTsumo: boolean;
  tsumoTotal?: number;
  options: DiscardOption[];
  /** 与最优等价的打法（同向听同进张） */
  bestKinds: Kind[];
  shapeAfter: HandShape;
  waitValues: WaitValue[];
  lines: HintLine[];
}

export interface WaitHint {
  type: 'wait';
  ukeire: Ukeire;
  shape: HandShape;
  waitValues: WaitValue[];
  lines: HintLine[];
}

export interface ClaimHint {
  type: 'claim';
  analysis: ClaimAnalysis;
  huTotal?: number;
  lines: HintLine[];
}

export type Hint = TurnHint | WaitHint | ClaimHint;

const meldInputs = (melds: Meld[]) => melds.map((m) => ({ type: m.type, kind: m.kind }));

function kindsOfCounts(c: number[]): Kind[] {
  const out: Kind[] = [];
  for (let k = 0; k < PLAY_KINDS; k++) for (let i = 0; i < c[k]; i++) out.push(k);
  return out;
}

/** 听牌时每张胡牌的价值 */
function waitValues(
  counts13: number[],
  melds: Meld[],
  flowers: number,
  rules: Rules,
  waits: { kind: Kind; count: number }[],
): WaitValue[] {
  return waits.map((w) => {
    const concealed = [...kindsOfCounts(counts13), w.kind];
    const base = { concealed, melds: meldInputs(melds), flowers, gangkai: false };
    const ron = scoreWin({ ...base, zimo: false }, rules)?.total ?? 0;
    const tsumo = scoreWin({ ...base, zimo: true }, rules)?.total ?? 0;
    return { kind: w.kind, count: w.count, ron, tsumo };
  });
}

function sameSuitNeighbors(c: number[], k: Kind): number {
  if (isHonorKind(k)) return 0;
  const r = rankOf(k);
  let n = 0;
  for (const d of [-2, -1, 1, 2]) {
    const rr = r + d;
    if (rr >= 1 && rr <= 9) n += c[k + d];
  }
  return n;
}

/** 解释"为什么打这张"：看它在 14 张最佳拆分里属于哪一块 */
function roleLine(counts14: number[], k: Kind, shape14: HandShape): HintLine {
  const c = counts14[k];
  if (isHonorKind(k)) {
    if (c === 1)
      return { tone: 'info', segs: [{ tile: k }, ' 是孤立的字牌，只能等同一张成对、成刻，用处最小，优先打出。'] };
    return { tone: 'info', segs: ['拆掉 ', { tiles: [k, k] }, ' 对子：字牌对子只能等 2 张，其他搭子更有前途。'] };
  }
  if (c >= 3) {
    return {
      tone: 'info',
      segs: [`手里有 ${c} 张 `, { tile: k }, '：拆掉一张，留下的对子做雀头/搭子，换来更多进张。'],
    };
  }
  const blk =
    shape14.blocks.find((b) => b.type === 'guzhang' && b.kinds.includes(k)) ??
    shape14.blocks.find((b) => b.kinds.includes(k));
  if (!blk || blk.type === 'guzhang') {
    if (c === 1 && sameSuitNeighbors(counts14, k) === 0) {
      if (isTerminalKind(k))
        return { tone: 'info', segs: [{ tile: k }, ' 是孤立的幺九牌，只能和相邻两张搭配，连接能力最差。'] };
      return { tone: 'info', segs: [{ tile: k }, ' 是孤张，附近没有能搭配的牌。'] };
    }
    return {
      tone: 'info',
      segs: [{ tile: k }, ' 在最佳拆分里是多余的牌：它能组成的搭子都不如现有的搭子。'],
    };
  }
  const label = BLOCK_LABEL[blk.type];
  if (blk.type === 'liangmian' || blk.type === 'kanzhang' || blk.type === 'bianzhang' || blk.type === 'duizi') {
    if (shape14.blockCount > 4) {
      return {
        tone: 'info',
        segs: [
          `面子+搭子共 ${shape14.blockCount} 块，超过需要的 4 块，拆掉最弱的${label}搭子 `,
          { tiles: blk.kinds },
          '。',
        ],
      };
    }
    return { tone: 'info', segs: ['拆 ', { tiles: blk.kinds }, ` ${label}：保留的其余搭子进张更多。`] };
  }
  if (blk.type === 'quetou') {
    return { tone: 'info', segs: ['拆雀头 ', { tiles: blk.kinds }, '：其他牌也能做雀头，换来更多进张。'] };
  }
  return {
    tone: 'info',
    segs: ['从 ', { tiles: blk.kinds }, ` 的${label}里打出多余的 `, { tile: k }, '，复合形状保留的有效牌更多。'],
  };
}

function tilesLine(prefix: string, kinds: Kind[], suffix = ''): Seg[] {
  return [prefix, { tiles: kinds }, suffix];
}

/** 轮到自己出牌时的提示 */
export function buildTurnHint(s: GameState, seat: Seat, opts: TurnOptions): TurnHint {
  const p = s.players[seat];
  const counts = countKinds(p.hand);
  const called = p.melds.length;
  const visible = visibleCountsOf(s, seat);
  const remaining = remainingFromVisible(visible);
  const qidui = s.rules.qidui && called === 0;
  const options = analyzeDiscards(counts, called, remaining, qidui, { deep: true });
  const best = options[0];
  const bestKinds = options
    .filter((o) => o.shanten === best.shanten && o.total === best.total)
    .map((o) => o.kind);
  const lines: HintLine[] = [];

  let tsumoTotal: number | undefined;
  if (opts.tsumo) {
    tsumoTotal = scoreWin(
      {
        concealed: p.hand.map(kindOf),
        melds: meldInputs(p.melds),
        flowers: p.flowers.length,
        zimo: true,
        gangkai: s.replacementDraw,
      },
      s.rules,
    )?.total;
    lines.push({
      tone: 'good',
      segs: [`可以自摸！共 ${tsumoTotal} 花，三家各付 ${tsumoTotal}，合计 +${(tsumoTotal ?? 0) * 3}。`],
    });
  }

  const c13 = counts.slice();
  c13[best.kind]--;
  const shapeAfter = bestShape(c13, called);
  const shapeBefore = bestShape(counts, called);

  lines.push({
    tone: 'good',
    segs: [
      '推荐打 ',
      { tile: best.kind },
      ...(bestKinds.length > 1 ? ['（', { tiles: bestKinds.filter((k) => k !== best.kind) }, ' 同等）'] : []),
      `：打后${shantenText(best.shanten)}，进张 ${best.total} 张 / ${best.waits.length} 种。`,
    ],
  });
  lines.push(roleLine(counts, best.kind, shapeBefore));

  // 同进张时比较两步前瞻
  const tie = options.find(
    (o) => o.kind !== best.kind && o.shanten === best.shanten && o.total === best.total && o.avgNext !== undefined,
  );
  if (tie && best.avgNext !== undefined && best.avgNext - (tie.avgNext ?? 0) >= 0.3) {
    lines.push({
      tone: 'info',
      segs: [
        '与 ',
        { tile: tie.kind },
        ` 进张相同，但打 `,
        { tile: best.kind },
        ` 后形状更好：下一步平均进张 ${best.avgNext.toFixed(1)} 张 vs ${tie.avgNext!.toFixed(1)} 张。`,
      ],
    });
  }

  const second = options.find((o) => o.shanten !== best.shanten || o.total !== best.total);
  const backwards = options.filter((o) => o.shanten > best.shanten).map((o) => o.kind);
  if (second && second.shanten > best.shanten) {
    lines.push({
      tone: 'warn',
      segs: [bestKinds.length > 1 ? '除了上面这几张，打其他牌都会退向听。' : '打其他任何牌都会退向听。'],
    });
  } else {
    if (second) {
      lines.push({
        tone: 'muted',
        segs: ['次选 ', { tile: second.kind }, `：进张 ${second.total} 张（少 ${best.total - second.total} 张）。`],
      });
    }
    if (backwards.length && backwards.length <= 8) {
      lines.push({ tone: 'warn', segs: tilesLine('打这些会退向听：', backwards) });
    }
  }

  let wv: WaitValue[] = [];
  if (best.shanten === 0) {
    wv = waitValues(c13, p.melds, p.flowers.length, s.rules, best.waits);
    const left = best.waits.reduce((a, w) => a + w.count, 0);
    lines.push({
      tone: 'good',
      segs: [`打 `, { tile: best.kind }, ' 听 ', { tiles: best.waits.map((w) => w.kind) }, `，还剩 ${left} 张。`],
    });
    if (left === 0) lines.push({ tone: 'warn', segs: ['注意：听的牌已经全部现身，是空听！考虑改听。'] });
  }

  // 杠的建议
  for (const k of opts.angang) {
    const cc = counts.slice();
    cc[k] -= 4;
    const after = calcShanten(cc, called + 1, false);
    const ok = after <= best.shanten;
    lines.push({
      tone: ok ? 'value' : 'warn',
      segs: ['可暗杠 ', { tile: k }, ok ? '：+1 花并补一张，牌效不受影响，建议杠。' : '：但杠后会退向听，慎重。'],
    });
  }
  for (const k of opts.jiagang) {
    lines.push({ tone: 'value', segs: ['可加杠 ', { tile: k }, '：+1 花并补一张。'] });
  }

  // 价值提示：南西北
  for (let k = 27; k < 30; k++) {
    if (counts[k] === 2 && !bestKinds.includes(k)) {
      lines.push({ tone: 'value', segs: [{ tiles: [k, k] }, ` 是对子：碰出或摸成刻子 +1 花。`] });
    }
    if (counts[k] >= 3) lines.push({ tone: 'value', segs: [{ tile: k }, ` 刻子已成，胡牌时 +1 花。`] });
  }

  return { type: 'turn', canTsumo: opts.tsumo, tsumoTotal, options, bestKinds, shapeAfter, waitValues: wv, lines };
}

/** 等别人出牌时的提示（13 张状态） */
export function buildWaitHint(s: GameState, seat: Seat): WaitHint {
  const p = s.players[seat];
  const counts = countKinds(p.hand);
  const called = p.melds.length;
  const remaining = remainingFromVisible(visibleCountsOf(s, seat));
  const qidui = s.rules.qidui && called === 0;
  const ukeire = analyzeWaiting(counts, called, remaining, qidui);
  const shape = bestShape(counts, called);
  const lines: HintLine[] = [];
  let wv: WaitValue[] = [];
  if (ukeire.shanten === 0) {
    wv = waitValues(counts, p.melds, p.flowers.length, s.rules, ukeire.waits);
    lines.push({
      tone: 'good',
      segs: ['听牌：', { tiles: ukeire.waits.map((w) => w.kind) }, `，还剩 ${ukeire.total} 张。`],
    });
    if (ukeire.total === 0) lines.push({ tone: 'warn', segs: ['听的牌已全部现身（空听），下次摸牌考虑改听。'] });
  } else {
    lines.push({
      tone: 'info',
      segs: [`${shantenText(ukeire.shanten)}，进张 ${ukeire.total} 张：`, { tiles: ukeire.waits.map((w) => w.kind) }],
    });
  }
  return { type: 'wait', ukeire, shape, waitValues: wv, lines };
}

const CALL_NAME: Record<string, string> = { peng: '碰', gang: '杠', chi: '吃', hu: '胡', pass: '过' };

/** 别人打出牌、自己可以吃碰杠胡时的提示 */
export function buildClaimHint(s: GameState, seat: Seat): ClaimHint | null {
  const d = s.decision;
  if (!d || d.type !== 'claim') return null;
  const opt = d.options[seat];
  if (!opt) return null;
  const p = s.players[seat];
  const counts = countKinds(p.hand);
  const called = p.melds.length;
  const remaining = remainingFromVisible(visibleCountsOf(s, seat));
  const qidui = s.rules.qidui && called === 0;
  const kind = kindOf(d.tile);
  const analysis = analyzeClaim(counts, called, kind, opt, remaining, qidui);
  const lines: HintLine[] = [];
  let huTotal: number | undefined;

  if (opt.hu) {
    huTotal = scoreWin(
      {
        concealed: [...p.hand.map(kindOf), kind],
        melds: meldInputs(p.melds),
        flowers: p.flowers.length,
        zimo: false,
        gangkai: false,
      },
      s.rules,
    )?.total;
    lines.push({
      tone: 'good',
      segs: [`可以胡 `, { tile: kind }, `！点炮共 ${huTotal} 花，由放炮者支付。`],
    });
    lines.push({
      tone: 'muted',
      segs: [
        `若过胡改等自摸：每家付 ${(huTotal ?? 0) + 1} 花（合计 ${((huTotal ?? 0) + 1) * 3}），但要冒别人先胡的风险，一般直接胡。`,
      ],
    });
    return { type: 'claim', analysis, huTotal, lines };
  }

  lines.push({
    tone: 'muted',
    segs: [`不叫：${shantenText(analysis.base.shanten)}，进张 ${analysis.base.total} 张。`],
  });
  for (const a of analysis.advices) {
    const label =
      a.action.type === 'chi'
        ? ['吃（用 ', { tiles: a.action.kinds } as Seg, '）']
        : [CALL_NAME[a.action.type]];
    lines.push({
      tone: 'info',
      segs: [
        ...label,
        `后：${shantenText(a.shanten)}`,
        ...(a.discard !== undefined ? ['，打 ', { tile: a.discard } as Seg] : []),
        `，进张 ${a.total} 张。`,
      ],
    });
  }
  const rec = analysis.recommend;
  lines.push({
    tone: rec.type === 'pass' ? 'warn' : 'good',
    segs: [
      `建议：${rec.type === 'chi' ? '吃' : CALL_NAME[rec.type]}`,
      ...(rec.type === 'chi' ? ['（', { tiles: rec.kinds } as Seg, '）'] : []),
      '。',
      analysis.reason,
    ],
  });
  return { type: 'claim', analysis, lines };
}

// ---------------------------------------------------------------------------- 打牌评价

export type Grade = 'best' | 'good' | 'loss' | 'back';

export const GRADE_LABEL: Record<Grade, string> = {
  best: '最优',
  good: '次优',
  loss: '损失进张',
  back: '退向听',
};

export interface DiscardRecord {
  round: number;
  turn: number;
  hand: Kind[];
  chosen: Kind;
  bestKinds: Kind[];
  chosenShanten: number;
  bestShanten: number;
  chosenTotal: number;
  bestTotal: number;
  grade: Grade;
}

export function gradeDiscard(options: DiscardOption[], chosen: Kind): Omit<DiscardRecord, 'round' | 'turn' | 'hand'> {
  const best = options[0];
  const ch = options.find((o) => o.kind === chosen)!;
  const bestKinds = options.filter((o) => o.shanten === best.shanten && o.total === best.total).map((o) => o.kind);
  let grade: Grade;
  if (ch.shanten > best.shanten) grade = 'back';
  else if (ch.total >= best.total) grade = 'best';
  else if (ch.total >= best.total * 0.85) grade = 'good';
  else grade = 'loss';
  return {
    chosen,
    bestKinds,
    chosenShanten: ch.shanten,
    bestShanten: best.shanten,
    chosenTotal: ch.total,
    bestTotal: best.total,
    grade,
  };
}

/** 用于练习模式的快速分析（无牌河信息） */
export function quickOptions(counts: number[], called: number, qidui: boolean, deep = true): DiscardOption[] {
  return analyzeDiscards(counts, called, remainingFromVisible(counts), qidui, { deep });
}

export function describeKinds(kinds: Kind[]): string {
  return kinds.map(kindName).join('、');
}
