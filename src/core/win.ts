/**
 * 胡牌判定与算花
 *
 * 加花规则：
 *   底花 1；每张花牌 +1；自摸 +1；每个杠 +1（明杠暗杠一样）；
 *   南、西、北刻子（含碰、杠）各 +1；杠上开花 +1（补花后摸到胡牌也算）；
 *   清一色 / 碰碰胡 / 七对 按房规加花（默认不计）。
 * 结算：点炮由放炮者一人付总花数；自摸三家各付总花数。
 */
import type { Rules } from './rules';
import { calcShanten } from './shanten';
import { countFromKinds, isHonorKind, kindName, PLAY_KINDS, suitOf, type Kind } from './tiles';
import { isGangType, type MeldType, type ScoreItem } from './types';

export interface DecompMeld {
  type: 'seq' | 'tri';
  kind: Kind;
}

export type WinDecomp =
  | { qidui: false; pair: Kind; melds: DecompMeld[] }
  | { qidui: true; pairs: Kind[] };

function decomposeMelds(c: number[], from: number, acc: DecompMeld[], out: DecompMeld[][]) {
  let i = from;
  while (i < PLAY_KINDS && c[i] === 0) i++;
  if (i >= PLAY_KINDS) {
    out.push([...acc]);
    return;
  }
  if (c[i] >= 3) {
    c[i] -= 3;
    acc.push({ type: 'tri', kind: i });
    decomposeMelds(c, i, acc, out);
    acc.pop();
    c[i] += 3;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    acc.push({ type: 'seq', kind: i });
    decomposeMelds(c, i, acc, out);
    acc.pop();
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
}

/** 门内牌（含胡的那张，3n+2 张）的所有胡牌拆法 */
export function winDecompositions(counts: number[], rules: Pick<Rules, 'qidui'>, called: number): WinDecomp[] {
  const c = counts.slice(0, PLAY_KINDS);
  const total = c.reduce((a, b) => a + b, 0);
  if (total % 3 !== 2) return [];
  const out: WinDecomp[] = [];
  for (let p = 0; p < PLAY_KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const res: DecompMeld[][] = [];
    decomposeMelds(c, 0, [], res);
    for (const melds of res) out.push({ qidui: false, pair: p, melds });
    c[p] += 2;
  }
  if (rules.qidui && called === 0 && total === 14) {
    const pairs: Kind[] = [];
    let ok = true;
    for (let k = 0; k < PLAY_KINDS; k++) {
      if (c[k] === 0) continue;
      if (c[k] % 2 !== 0) {
        ok = false;
        break;
      }
      for (let n = 0; n < c[k] / 2; n++) pairs.push(k);
    }
    if (ok) out.push({ qidui: true, pairs });
  }
  return out;
}

export function isWinningCounts(counts: number[], called: number, qidui: boolean): boolean {
  return calcShanten(counts, called, qidui) === -1;
}

export interface WinInput {
  /** 门内牌种（含胡的那张） */
  concealed: Kind[];
  melds: { type: MeldType; kind: Kind }[];
  flowers: number;
  zimo: boolean;
  gangkai: boolean;
}

export interface ScoreResult {
  items: ScoreItem[];
  total: number;
  decomp: WinDecomp;
}

export function scoreWin(input: WinInput, rules: Rules): ScoreResult | null {
  const counts = countFromKinds(input.concealed);
  const decomps = winDecompositions(counts, rules, input.melds.length);
  if (!decomps.length) return null;

  const allKinds = [
    ...input.concealed,
    ...input.melds.flatMap((m) => (m.type === 'chi' ? [m.kind, m.kind + 1, m.kind + 2] : [m.kind, m.kind, m.kind])),
  ];
  const isQingyise = allKinds.every((k) => !isHonorKind(k)) && new Set(allKinds.map(suitOf)).size === 1;

  let best: ScoreResult | null = null;
  for (const d of decomps) {
    const items: ScoreItem[] = [{ name: '底花', value: 1 }];
    if (input.flowers > 0) items.push({ name: `花牌 ×${input.flowers}`, value: input.flowers });
    if (input.zimo) items.push({ name: '自摸', value: 1 });
    if (input.gangkai) items.push({ name: '杠上开花', value: 1 });
    const gangs = input.melds.filter((m) => isGangType(m.type)).length;
    if (gangs > 0) items.push({ name: `杠 ×${gangs}`, value: gangs });

    const windTriplets: Kind[] = input.melds.filter((m) => m.type !== 'chi' && isHonorKind(m.kind)).map((m) => m.kind);
    if (!d.qidui) {
      for (const m of d.melds) if (m.type === 'tri' && isHonorKind(m.kind)) windTriplets.push(m.kind);
    }
    windTriplets.sort((a, b) => a - b);
    for (const k of windTriplets) items.push({ name: `${kindName(k)[0]}刻`, value: 1 });

    if (rules.qingyiseBonus > 0 && isQingyise) items.push({ name: '清一色', value: rules.qingyiseBonus });
    if (d.qidui && rules.qiduiBonus > 0) items.push({ name: '七对', value: rules.qiduiBonus });
    if (
      !d.qidui &&
      rules.pengpengBonus > 0 &&
      input.melds.every((m) => m.type !== 'chi') &&
      d.melds.every((m) => m.type === 'tri')
    ) {
      items.push({ name: '碰碰胡', value: rules.pengpengBonus });
    }
    const total = items.reduce((a, b) => a + b.value, 0);
    if (!best || total > best.total) best = { items, total, decomp: d };
  }
  return best;
}
