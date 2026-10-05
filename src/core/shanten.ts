/**
 * 向听数 / 进张计算
 *
 * 一般型：向听 = 8 - 2×面子 - 搭子 - 雀头，且 面子+搭子 ≤ 4（含副露面子）
 * 做法：每个花色（9 种）以及字牌（南西北）分别求出所有"面子/搭子"组合的帕累托前沿，
 * 结果按牌型编码缓存；再把四组的前沿组合起来取最优。缓存后单次计算是微秒级，
 * 足够做两步前瞻（何切里的"听牌后平均进张"）。
 */
import { PLAY_KINDS } from './tiles';

/** 编码：m * 16 + t */
interface GroupOpts {
  /** 本组不含雀头的 (面子, 搭子) 前沿 */
  h0: number[];
  /** 本组恰含一个雀头的前沿 */
  h1: number[];
}

const P5 = [1, 5, 25, 125, 625, 3125, 15625, 78125, 390625];
const EMPTY: GroupOpts = { h0: [0], h1: [] };
const suitMemo = new Map<number, GroupOpts>();
const honorMemo = new Map<number, GroupOpts>();

function pareto(list: number[]): number[] {
  if (list.length <= 1) return list;
  const uniq = Array.from(new Set(list));
  const out: number[] = [];
  for (const a of uniq) {
    const am = a >> 4, at = a & 15;
    let dominated = false;
    for (const b of uniq) {
      if (b !== a && b >> 4 >= am && (b & 15) >= at) {
        dominated = true;
        break;
      }
    }
    if (!dominated) out.push(a);
  }
  return out;
}

function pushShift(dst: number[], src: number[], delta: number) {
  for (const o of src) dst.push(o + delta);
}

/** c: 长度 9 的计数（会被临时修改后复原），key = Σ c[i]·5^i */
function suitOpts(c: number[], key: number): GroupOpts {
  if (key === 0) return EMPTY;
  const cached = suitMemo.get(key);
  if (cached) return cached;
  let i = 0;
  while (c[i] === 0) i++;
  const h0: number[] = [];
  const h1: number[] = [];
  const add = (sub: GroupOpts, delta: number) => {
    pushShift(h0, sub.h0, delta);
    pushShift(h1, sub.h1, delta);
  };
  // 刻子
  if (c[i] >= 3) {
    c[i] -= 3;
    add(suitOpts(c, key - 3 * P5[i]), 16);
    c[i] += 3;
  }
  // 顺子
  if (i <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    add(suitOpts(c, key - P5[i] - P5[i + 1] - P5[i + 2]), 16);
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
  // 对子：作雀头 或 作搭子
  if (c[i] >= 2) {
    c[i] -= 2;
    const sub = suitOpts(c, key - 2 * P5[i]);
    add(sub, 1);
    pushShift(h1, sub.h0, 0);
    c[i] += 2;
  }
  // 两面/边张
  if (i <= 7 && c[i + 1] > 0) {
    c[i]--; c[i + 1]--;
    add(suitOpts(c, key - P5[i] - P5[i + 1]), 1);
    c[i]++; c[i + 1]++;
  }
  // 嵌张
  if (i <= 6 && c[i + 2] > 0) {
    c[i]--; c[i + 2]--;
    add(suitOpts(c, key - P5[i] - P5[i + 2]), 1);
    c[i]++; c[i + 2]++;
  }
  // 孤张
  c[i]--;
  add(suitOpts(c, key - P5[i]), 0);
  c[i]++;

  const res = { h0: pareto(h0), h1: pareto(h1) };
  suitMemo.set(key, res);
  return res;
}

/** 字牌：只能成刻、对 */
function honorOpts(c: number[], key: number): GroupOpts {
  if (key === 0) return EMPTY;
  const cached = honorMemo.get(key);
  if (cached) return cached;
  let i = 0;
  while (c[i] === 0) i++;
  const h0: number[] = [];
  const h1: number[] = [];
  const add = (sub: GroupOpts, delta: number) => {
    pushShift(h0, sub.h0, delta);
    pushShift(h1, sub.h1, delta);
  };
  if (c[i] >= 3) {
    c[i] -= 3;
    add(honorOpts(c, key - 3 * P5[i]), 16);
    c[i] += 3;
  }
  if (c[i] >= 2) {
    c[i] -= 2;
    const sub = honorOpts(c, key - 2 * P5[i]);
    add(sub, 1);
    pushShift(h1, sub.h0, 0);
    c[i] += 2;
  }
  c[i]--;
  add(honorOpts(c, key - P5[i]), 0);
  c[i]++;
  const res = { h0: pareto(h0), h1: pareto(h1) };
  honorMemo.set(key, res);
  return res;
}

const scratch9 = new Array(9).fill(0);
const scratch3 = new Array(3).fill(0);

function groupOf(counts: ArrayLike<number>, g: number): GroupOpts {
  if (g === 3) {
    let key = 0;
    for (let j = 0; j < 3; j++) {
      scratch3[j] = counts[27 + j];
      key += scratch3[j] * P5[j];
    }
    return honorOpts(scratch3, key);
  }
  const off = g * 9;
  let key = 0;
  for (let j = 0; j < 9; j++) {
    scratch9[j] = counts[off + j];
    key += scratch9[j] * P5[j];
  }
  return suitOpts(scratch9, key);
}

function combine(a: GroupOpts, b: GroupOpts): GroupOpts {
  const h0: number[] = [];
  const h1: number[] = [];
  for (const x of a.h0) for (const y of b.h0) h0.push(x + y);
  for (const x of a.h1) for (const y of b.h0) h1.push(x + y);
  for (const x of a.h0) for (const y of b.h1) h1.push(x + y);
  return { h0: pareto(h0), h1: pareto(h1) };
}

function evalOpt(o: number, head: number, called: number): number {
  let m = (o >> 4) + called;
  let t = o & 15;
  if (m > 4) m = 4;
  if (m + t > 4) t = 4 - m;
  return 8 - 2 * m - t - head;
}

/** 一般型向听数。counts 长度 ≥ 30，called = 副露（含杠）数 */
export function shantenRegular(counts: ArrayLike<number>, called: number): number {
  const g0 = groupOf(counts, 0);
  const g1 = groupOf(counts, 1);
  const g01 = combine(g0, g1);
  const g2 = groupOf(counts, 2);
  const g012 = combine(g01, g2);
  const g3 = groupOf(counts, 3);
  let best = 8;
  for (const x of g012.h0) {
    for (const y of g3.h0) {
      const s = evalOpt(x + y, 0, called);
      if (s < best) best = s;
    }
    for (const y of g3.h1) {
      const s = evalOpt(x + y, 1, called);
      if (s < best) best = s;
    }
  }
  for (const x of g012.h1) {
    for (const y of g3.h0) {
      const s = evalOpt(x + y, 1, called);
      if (s < best) best = s;
    }
  }
  return best;
}

/** 七对向听数（只在门清时有效；四张相同算两对） */
export function shantenQidui(counts: ArrayLike<number>): number {
  let pairs = 0;
  for (let k = 0; k < PLAY_KINDS; k++) pairs += counts[k] >> 1;
  return 6 - pairs;
}

export function calcShanten(counts: ArrayLike<number>, called: number, qidui = false): number {
  const s = shantenRegular(counts, called);
  if (qidui && called === 0) return Math.min(s, shantenQidui(counts));
  return s;
}

export interface WaitInfo {
  kind: number;
  count: number;
}

export interface Ukeire {
  shanten: number;
  total: number;
  waits: WaitInfo[];
}

/**
 * 3n+1 张手牌的进张。
 * remaining[k] = 从自己视角看还没出现的张数（4 - 可见数）
 */
export function calcUkeire(
  counts: number[],
  called: number,
  remaining: ArrayLike<number>,
  qidui = false,
): Ukeire {
  const shanten = calcShanten(counts, called, qidui);
  const waits: WaitInfo[] = [];
  let total = 0;
  for (let k = 0; k < PLAY_KINDS; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    const s2 = calcShanten(counts, called, qidui);
    counts[k]--;
    if (s2 < shanten) {
      const r = Math.max(0, remaining[k]);
      waits.push({ kind: k, count: r });
      total += r;
    }
  }
  return { shanten, total, waits };
}

/** 仅计算进张总数（内部循环用，省掉数组分配） */
export function ukeireTotal(
  counts: number[],
  called: number,
  remaining: ArrayLike<number>,
  shanten: number,
  qidui = false,
): number {
  let total = 0;
  for (let k = 0; k < PLAY_KINDS; k++) {
    if (counts[k] >= 4 || remaining[k] <= 0) continue;
    counts[k]++;
    if (calcShanten(counts, called, qidui) < shanten) total += remaining[k];
    counts[k]--;
  }
  return total;
}

export function clearShantenCache() {
  suitMemo.clear();
  honorMemo.clear();
}
