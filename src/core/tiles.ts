/**
 * 牌的编码
 *  kind（牌种）0..33：
 *    0-8   一万..九万
 *    9-17  一筒..九筒
 *    18-26 一条..九条
 *    27 南  28 西  29 北        （可打的字牌）
 *    30 东  31 白  32 发  33 中  （花牌，摸到即补）
 *  tileId（实体牌）0..135，kind = tileId >> 2
 */
export type Kind = number;
export type TileId = number;

export const NUM_KINDS = 34;
/** 可进手的牌种数（不含花） */
export const PLAY_KINDS = 30;
export const TOTAL_TILES = 136;

export const kindOf = (id: TileId): Kind => id >> 2;
export const isFlowerKind = (k: Kind) => k >= 30;
export const isFlower = (id: TileId) => isFlowerKind(kindOf(id));
export const isHonorKind = (k: Kind) => k >= 27 && k < 30;
export const isSuitKind = (k: Kind) => k < 27;
/** 0 万 1 筒 2 条 3 字/花 */
export const suitOf = (k: Kind) => (k < 27 ? Math.floor(k / 9) : 3);
/** 数牌点数 1..9，字牌 0 */
export const rankOf = (k: Kind) => (k < 27 ? (k % 9) + 1 : 0);
export const isTerminalKind = (k: Kind) => k < 27 && (k % 9 === 0 || k % 9 === 8);

const NUM_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_CN = ['万', '筒', '条'];
const SUIT_EN = ['m', 'p', 's'];
const HONOR_CN = ['南', '西', '北', '东', '白', '发', '中'];
const IMG_HONOR = ['nan', 'xi', 'bei', 'dong', 'bai', 'fa', 'zhong'];

/** 中文全称：三万 / 七条 / 南风 / 白板 */
export function kindName(k: Kind): string {
  if (k < 27) return NUM_CN[k % 9] + SUIT_CN[suitOf(k)];
  return ['南风', '西风', '北风', '东风', '白板', '发财', '红中'][k - 27];
}

/** 简写：3m / 7s / 南 */
export function kindShort(k: Kind): string {
  if (k < 27) return `${rankOf(k)}${SUIT_EN[suitOf(k)]}`;
  return HONOR_CN[k - 27];
}

export function kindImage(k: Kind): string {
  const name = k < 27 ? `${SUIT_EN[suitOf(k)]}${rankOf(k)}` : IMG_HONOR[k - 27];
  return `${import.meta.env.BASE_URL}tiles/${name}.svg`;
}

/** 解析 "123m45p南西" 这类写法为牌种数组（用于测试/调试） */
export function parseKinds(text: string): Kind[] {
  const out: Kind[] = [];
  let pending: number[] = [];
  for (const ch of text.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') pending.push(Number(ch));
    else if ('mps'.includes(ch)) {
      const base = 'mps'.indexOf(ch) * 9;
      for (const n of pending) {
        if (n < 1 || n > 9) throw new Error(`bad rank ${n}`);
        out.push(base + n - 1);
      }
      pending = [];
    } else if (HONOR_CN.includes(ch)) out.push(27 + HONOR_CN.indexOf(ch));
    else throw new Error(`unknown char ${ch}`);
  }
  if (pending.length) throw new Error('dangling digits');
  return out;
}

export function countKinds(ids: TileId[]): number[] {
  const c = new Array(NUM_KINDS).fill(0);
  for (const id of ids) c[kindOf(id)]++;
  return c;
}

export function countFromKinds(kinds: Kind[]): number[] {
  const c = new Array(NUM_KINDS).fill(0);
  for (const k of kinds) c[k]++;
  return c;
}

/** 手牌显示排序：按牌种，再按 id */
export function sortTiles(ids: TileId[]): TileId[] {
  return [...ids].sort((a, b) => a - b);
}
