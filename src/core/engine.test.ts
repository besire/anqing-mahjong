import { describe, expect, it } from 'vitest';
import { MahjongGame, type PlayerConfig } from './game';
import { DEFAULT_RULES, type Rules } from './rules';
import { isFlower, kindOf, parseKinds, TOTAL_TILES, type TileId } from './tiles';
import { SEATS, type MeldType, type Seat } from './types';

const configs: PlayerConfig[] = SEATS.map((i) => ({ name: `p${i}`, isHuman: i === 0, level: 'normal' }));

function takeIds(text: string, used: Set<number>): TileId[] {
  return parseKinds(text).map((k) => {
    for (let id = k * 4; id < k * 4 + 4; id++) {
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new Error(`no more copies in ${text}`);
  });
}

interface Spec {
  /** 四家门内手牌；不足的部分用其他牌补齐 */
  hands: string[];
  melds?: { seat: Seat; type: MeldType; text: string; from?: Seat }[];
  /** 接下来从牌头摸到的牌 */
  front?: string;
  /** 从牌尾补到的牌（按摸到的顺序） */
  back?: string;
  rules?: Partial<Rules>;
}

/** 构造一个指定的局面，0 号是庄家并轮到他行动 */
function setup(spec: Spec) {
  const g = new MahjongGame(configs, { ...DEFAULT_RULES, ...spec.rules }, { dealer: 0 });
  g.startRound(1);
  const used = new Set<number>();
  const melds = (spec.melds ?? []).map((m) => {
    const tiles = takeIds(m.text, used);
    return { seat: m.seat, meld: { type: m.type, kind: kindOf(tiles[0]), tiles, from: m.from, claimed: m.from !== undefined ? tiles[tiles.length - 1] : undefined } };
  });
  const handIds = spec.hands.map((h) => takeIds(h, used));
  const frontIds = takeIds(spec.front ?? '', used);
  const backIds = takeIds(spec.back ?? '', used);
  const rest = Array.from({ length: TOTAL_TILES }, (_, i) => i).filter((i) => !used.has(i) && !isFlower(i));
  for (let i = 0; i < 4; i++) {
    const nMelds = melds.filter((m) => m.seat === i).length;
    const need = (i === 0 ? 14 : 13) - nMelds * 3 - handIds[i].length;
    handIds[i].push(...rest.splice(0, need));
  }
  const flowers = Array.from({ length: TOTAL_TILES }, (_, i) => i).filter((i) => !used.has(i) && isFlower(i));
  g.s.wall = [...frontIds, ...rest, ...flowers, ...backIds.slice().reverse()];
  g.s.players.forEach((p, i) => {
    p.hand = handIds[i];
    p.melds = melds.filter((m) => m.seat === i).map((m) => m.meld);
    p.flowers = [];
    p.river = [];
    p.drawn = null;
  });
  (g as unknown as { beginTurn(seat: number, afterCall: boolean): void }).beginTurn(0, false);
  return g;
}

/** 让其他人一律"过"、轮到谁就摸切，直到轮到 seat 行动 */
function runUntilTurn(g: MahjongGame, seat: Seat) {
  const s = g.s;
  for (let i = 0; i < 50; i++) {
    const d = s.decision;
    if (!d || s.phase !== 'playing') return;
    if (d.type === 'turn' && d.seat === seat) return;
    if (d.type === 'claim') {
      for (const q of SEATS) if (d.options[q] && !d.responses[q]) g.claim(q, { type: 'pass' });
    } else {
      const p = s.players[d.seat];
      g.act(d.seat, { type: 'discard', tile: p.drawn ?? p.hand[p.hand.length - 1] });
    }
  }
}

function tileOf(g: MahjongGame, seat: Seat, text: string): TileId {
  const k = parseKinds(text)[0];
  return g.s.players[seat].hand.find((t) => kindOf(t) === k)!;
}

describe('engine special flows', () => {
  it('暗杠后补牌自摸 = 杠上开花', () => {
    const g = setup({ hands: ['1111m234m567m89m55p', '', '', ''], back: '7m' });
    const d = g.s.decision!;
    expect(d.type === 'turn' && d.options.angang).toEqual([0]);
    g.act(0, { type: 'angang', kind: 0 });
    const d2 = g.s.decision!;
    expect(d2.type === 'turn' && d2.options.tsumo).toBe(true);
    expect(g.s.replacementDraw).toBe(true);
    g.act(0, { type: 'tsumo' });
    const w = g.s.result!.wins[0];
    expect(w.gangkai).toBe(true);
    expect(w.items.map((i) => i.name)).toEqual(['底花', '自摸', '杠上开花', '杠 ×1']);
    expect(w.total).toBe(4);
    expect(g.s.result!.deltas).toEqual([12, -4, -4, -4]);
  });

  it('摸到花、补牌后自摸也算杠开', () => {
    // 0 号打北后听 3p；1/2/3 号摸切；0 号从牌头摸到"东"（花），从牌尾补到 3p
    const g = setup({ hands: ['234m567m789m55p12p北', '', '', ''], front: '9s9s9s东', back: '3p' });
    g.act(0, { type: 'discard', tile: tileOf(g, 0, '北') });
    runUntilTurn(g, 0);
    const d = g.s.decision!;
    expect(d.type === 'turn' && d.options.tsumo).toBe(true);
    expect(g.s.players[0].flowers.length).toBe(1);
    g.act(0, { type: 'tsumo' });
    const w = g.s.result!.wins[0];
    expect(w.gangkai).toBe(true);
    expect(w.items.map((i) => i.name)).toEqual(['底花', '花牌 ×1', '自摸', '杠上开花']);
    expect(w.total).toBe(4);
  });

  it('抢杠胡：加杠者一人付', () => {
    const g = setup({
      hands: ['5p123m456m78s北北', '46p123m456s789s南南', '', ''],
      melds: [{ seat: 0, type: 'peng', text: '555p', from: 2 }],
      rules: { robKong: true },
    });
    const d = g.s.decision!;
    expect(d.type === 'turn' && d.options.jiagang).toEqual([13]);
    g.act(0, { type: 'jiagang', kind: 13 });
    const c = g.s.decision!;
    expect(c.type === 'claim' && c.robKong && c.options[1]?.hu).toBe(true);
    g.claim(1, { type: 'hu' });
    const r = g.s.result!;
    expect(r.wins[0]).toMatchObject({ seat: 1, from: 0, robKong: true, zimo: false });
    expect(r.deltas[0]).toBe(-r.wins[0].total);
    expect(r.deltas[1]).toBe(r.wins[0].total);
  });

  it('不开抢杠时加杠直接补牌', () => {
    const g = setup({
      hands: ['5p123m456m78s北北', '46p123m456s789s南南', '', ''],
      melds: [{ seat: 0, type: 'peng', text: '555p', from: 2 }],
      back: '9s',
    });
    g.act(0, { type: 'jiagang', kind: 13 });
    const p0 = g.s.players[0];
    expect(p0.melds[0].type).toBe('jiagang');
    expect(p0.melds[0].tiles.length).toBe(4);
    expect(kindOf(p0.drawn!)).toBe(26);
  });

  it('明杠别人打的牌后从牌尾补牌', () => {
    const g = setup({ hands: ['9s123m456m789m12p55s', '999s1p2p3p4p5p6p7p8p', '', ''], back: '3p' });
    g.act(0, { type: 'discard', tile: tileOf(g, 0, '9s') });
    const d = g.s.decision!;
    expect(d.type === 'claim' && d.options[1]?.gang).toBe(true);
    g.claim(1, { type: 'gang' });
    if (g.s.decision?.type === 'claim') {
      const dd = g.s.decision;
      for (const q of SEATS) if (dd.options[q] && !dd.responses[q]) g.claim(q, { type: 'pass' });
    }
    const p1 = g.s.players[1];
    expect(p1.melds[0].type).toBe('minggang');
    expect(p1.melds[0].tiles.length).toBe(4);
    expect(kindOf(p1.drawn!)).toBe(11);
    expect(g.s.replacementDraw).toBe(true);
    expect(g.s.players[0].river[0].claimed).toBe(true);
  });

  it('点炮由放炮者付；碰的南西北刻子算花', () => {
    const g = setup({
      hands: ['3m北', '12m456p789s55s', '', ''],
      melds: [{ seat: 1, type: 'peng', text: '南南南', from: 2 }],
    });
    g.act(0, { type: 'discard', tile: tileOf(g, 0, '3m') });
    const d = g.s.decision!;
    expect(d.type === 'claim' && d.options[1]?.hu).toBe(true);
    for (const q of SEATS) if (d.type === 'claim' && d.options[q] && !d.responses[q]) g.claim(q, q === 1 ? { type: 'hu' } : { type: 'pass' });
    const r = g.s.result!;
    const w = r.wins[0];
    expect(w.items.map((i) => i.name)).toEqual(['底花', '南刻']);
    expect(r.deltas).toEqual([-2, 2, 0, 0]);
  });

  it('牌摸完荒庄，庄家连庄', () => {
    const g = setup({ hands: ['', '', '', ''] });
    g.s.wall = [];
    g.act(0, { type: 'discard', tile: g.s.players[0].hand[0] });
    runUntilTurn(g, 0);
    expect(g.s.phase).toBe('roundEnd');
    expect(g.s.result!.type).toBe('draw');
    expect(g.s.result!.nextDealer).toBe(0);
  });
});
