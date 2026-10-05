/**
 * 安庆麻将对局引擎（纯逻辑，无 UI）
 *
 * 流程由 decision 驱动：
 *   - { type: 'turn' }  某家摸牌（或吃碰）后需要行动：打牌 / 自摸 / 暗杠 / 加杠
 *   - { type: 'claim' } 有人打出牌（或加杠）后，其余可以吃碰杠胡的人逐个回应
 * 调用方（store）负责：轮到机器人时调用 AI，轮到玩家时等待界面输入。
 */
import { createRng, randomSeed, shuffle } from './rng';
import type { Rules } from './rules';
import { calcShanten } from './shanten';
import {
  countKinds,
  isFlower,
  isSuitKind,
  kindOf,
  NUM_KINDS,
  sortTiles,
  TOTAL_TILES,
  type Kind,
  type TileId,
} from './tiles';
import {
  nextSeat,
  SEATS,
  type BotLevel,
  type ClaimAction,
  type ClaimOptions,
  type Decision,
  type GameEvent,
  type GameEventInput,
  type Meld,
  type PlayerState,
  type RiverTile,
  type RoundResult,
  type Seat,
  type TurnAction,
  type TurnOptions,
  type WinInfo,
} from './types';
import { scoreWin } from './win';

export interface PlayerConfig {
  name: string;
  isHuman: boolean;
  level: BotLevel;
}

export interface GameState {
  rules: Rules;
  players: PlayerState[];
  /** 牌墙：从头摸牌，从尾补牌（杠、补花） */
  wall: TileId[];
  dealer: Seat;
  /** 第几局（从 1 开始） */
  roundNo: number;
  /** 连庄次数 */
  dealerStreak: number;
  scores: number[];
  /** 本局开始时的分数（重打本局用） */
  roundStartScores: number[];
  turn: Seat;
  /** 本局已打出的牌数 */
  turnCount: number;
  decision: Decision | null;
  /** 当前回合手里的新牌是补来的（杠后/补花后），自摸即杠上开花 */
  replacementDraw: boolean;
  pendingKong: { seat: Seat; kind: Kind; tile: TileId } | null;
  lastDiscard: { seat: Seat; tile: TileId } | null;
  result: RoundResult | null;
  phase: 'idle' | 'playing' | 'roundEnd';
  events: GameEvent[];
  eventSeq: number;
  seed: number;
}

/** 某个座位能看到的信息（给 AI / 提示用，不含他人暗牌） */
export interface PlayerView {
  seat: Seat;
  hand: TileId[];
  drawn: TileId | null;
  melds: Meld[];
  /** 自己视角可见的各牌种张数（自己手牌 + 所有牌河 + 明露副露） */
  visible: number[];
  wallRemaining: number;
  turnCount: number;
  dealer: Seat;
  rules: Rules;
  players: {
    seat: Seat;
    melds: Meld[];
    river: RiverTile[];
    handCount: number;
    flowers: number;
  }[];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** 从某个座位的视角，各牌种已经能看到的张数（自己手牌 + 所有牌河 + 明露的副露） */
export function visibleCountsOf(s: Pick<GameState, 'players'>, seat: Seat): number[] {
  const c = new Array(NUM_KINDS).fill(0);
  for (const p of s.players) {
    for (const r of p.river) if (!r.claimed) c[kindOf(r.id)]++;
    for (const m of p.melds) {
      if (m.type === 'angang' && p.seat !== seat) continue;
      for (const t of m.tiles) c[kindOf(t)]++;
    }
  }
  for (const t of s.players[seat].hand) c[kindOf(t)]++;
  return c;
}

function newPlayer(seat: Seat, c: PlayerConfig): PlayerState {
  return {
    seat,
    name: c.name,
    isHuman: c.isHuman,
    level: c.level,
    hand: [],
    melds: [],
    flowers: [],
    river: [],
    drawn: null,
  };
}

export class MahjongGame {
  s: GameState;
  private rng: () => number = Math.random;

  constructor(configs: PlayerConfig[], rules: Rules, opts: { dealer?: Seat } = {}) {
    this.s = {
      rules,
      players: configs.map((c, i) => newPlayer(i as Seat, c)),
      wall: [],
      dealer: opts.dealer ?? 0,
      roundNo: 0,
      dealerStreak: 0,
      scores: [0, 0, 0, 0],
      roundStartScores: [0, 0, 0, 0],
      turn: 0,
      turnCount: 0,
      decision: null,
      replacementDraw: false,
      pendingKong: null,
      lastDiscard: null,
      result: null,
      phase: 'idle',
      events: [],
      eventSeq: 0,
      seed: 0,
    };
  }

  // ------------------------------------------------------------------ 局的开始/结束

  startRound(seed: number = randomSeed()) {
    const s = this.s;
    s.seed = seed;
    this.rng = createRng(seed);
    s.roundNo++;
    s.roundStartScores = s.scores.slice();
    s.wall = shuffle(
      Array.from({ length: TOTAL_TILES }, (_, i) => i),
      this.rng,
    );
    for (const p of s.players) {
      p.hand = [];
      p.melds = [];
      p.flowers = [];
      p.river = [];
      p.drawn = null;
    }
    s.turn = s.dealer;
    s.turnCount = 0;
    s.decision = null;
    s.replacementDraw = false;
    s.pendingKong = null;
    s.lastDiscard = null;
    s.result = null;
    s.phase = 'playing';
    s.events = [];

    // 发牌：庄家 14 张，其余 13 张
    for (let r = 0; r < 13; r++) {
      for (let i = 0; i < 4; i++) s.players[nextSeat(s.dealer, i)].hand.push(s.wall.shift()!);
    }
    s.players[s.dealer].hand.push(s.wall.shift()!);
    this.emit({ type: 'deal' });

    // 起手补花：从庄家开始依次补，补到的还是花继续补
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < 4; i++) {
        const p = s.players[nextSeat(s.dealer, i)];
        const flowers = p.hand.filter(isFlower);
        if (!flowers.length) continue;
        changed = true;
        p.hand = p.hand.filter((t) => !isFlower(t));
        for (const f of flowers) {
          p.flowers.push(f);
          this.emit({ type: 'flower', seat: p.seat, tile: f });
          p.hand.push(s.wall.pop()!);
        }
      }
    }
    const dealer = s.players[s.dealer];
    dealer.drawn = dealer.hand[dealer.hand.length - 1];
    this.beginTurn(s.dealer, false);
  }

  /** 用同一副牌重打本局（分数回滚） */
  restartRound() {
    const s = this.s;
    s.scores = s.roundStartScores.slice();
    s.roundNo--;
    this.startRound(s.seed);
  }

  nextRound(seed?: number) {
    const s = this.s;
    if (s.result) {
      s.dealerStreak = s.result.nextDealer === s.dealer ? s.dealerStreak + 1 : 0;
      s.dealer = s.result.nextDealer;
    }
    this.startRound(seed);
  }

  get isGameOver(): boolean {
    const s = this.s;
    return s.phase === 'roundEnd' && s.rules.totalRounds > 0 && s.roundNo >= s.rules.totalRounds;
  }

  // ------------------------------------------------------------------ 行动

  /** 轮到自己时的行动 */
  act(seat: Seat, a: TurnAction) {
    const s = this.s;
    const d = s.decision;
    if (s.phase !== 'playing' || !d || d.type !== 'turn' || d.seat !== seat) {
      throw new Error(`seat ${seat} cannot act now`);
    }
    const p = s.players[seat];
    switch (a.type) {
      case 'discard': {
        const idx = p.hand.indexOf(a.tile);
        if (idx < 0) throw new Error('tile not in hand');
        p.hand.splice(idx, 1);
        const tsumogiri = p.drawn === a.tile;
        p.drawn = null;
        p.river.push({ id: a.tile, claimed: false, tsumogiri });
        s.turnCount++;
        s.lastDiscard = { seat, tile: a.tile };
        s.replacementDraw = false;
        this.emit({ type: 'discard', seat, tile: a.tile, tsumogiri });
        this.afterDiscard(seat, a.tile);
        return;
      }
      case 'tsumo': {
        if (!d.options.tsumo) throw new Error('cannot tsumo');
        const winTile = p.drawn ?? p.hand[p.hand.length - 1];
        this.finishWins([
          { seat, from: null, winTile, zimo: true, gangkai: s.replacementDraw, robKong: false },
        ]);
        return;
      }
      case 'angang': {
        if (!d.options.angang.includes(a.kind)) throw new Error('cannot angang');
        const tiles = p.hand.filter((t) => kindOf(t) === a.kind);
        p.hand = p.hand.filter((t) => kindOf(t) !== a.kind);
        p.drawn = null;
        p.melds.push({ type: 'angang', kind: a.kind, tiles });
        this.emit({ type: 'call', seat, call: 'angang', tiles: tiles.slice() });
        this.drawFor(seat, true);
        return;
      }
      case 'jiagang': {
        if (!d.options.jiagang.includes(a.kind)) throw new Error('cannot jiagang');
        const tile = p.hand.find((t) => kindOf(t) === a.kind)!;
        if (s.rules.robKong) {
          const options = this.robKongOptions(seat, tile);
          if (options.some(Boolean)) {
            s.pendingKong = { seat, kind: a.kind, tile };
            s.decision = {
              type: 'claim',
              from: seat,
              tile,
              robKong: true,
              options,
              responses: [null, null, null, null],
            };
            return;
          }
        }
        this.completeJiagang(seat, a.kind, tile);
        return;
      }
    }
  }

  /** 对别人打出的牌（或加杠的牌）做回应 */
  claim(seat: Seat, a: ClaimAction) {
    const s = this.s;
    const d = s.decision;
    if (s.phase !== 'playing' || !d || d.type !== 'claim') throw new Error('no claim pending');
    const opt = d.options[seat];
    if (!opt || d.responses[seat]) throw new Error(`seat ${seat} cannot respond`);
    const ok =
      a.type === 'pass' ||
      (a.type === 'hu' && opt.hu) ||
      (!d.robKong && a.type === 'gang' && opt.gang) ||
      (!d.robKong && a.type === 'peng' && opt.peng) ||
      (!d.robKong &&
        a.type === 'chi' &&
        opt.chi.some(([x, y]) => x === a.kinds[0] && y === a.kinds[1]));
    if (!ok) throw new Error(`invalid claim ${a.type}`);
    d.responses[seat] = a;
    if (d.options.every((o, i) => !o || d.responses[i])) this.resolveClaims();
  }

  // ------------------------------------------------------------------ 内部流程

  private emit(e: GameEventInput) {
    this.s.events.push({ ...e, id: ++this.s.eventSeq } as GameEvent);
  }

  private beginTurn(seat: Seat, afterCall: boolean) {
    const s = this.s;
    const p = s.players[seat];
    s.turn = seat;
    const counts = countKinds(p.hand);
    const canKong = !afterCall && s.wall.length > 0;
    const options: TurnOptions = {
      afterCall,
      tsumo: !afterCall && calcShanten(counts, p.melds.length, s.rules.qidui) === -1,
      angang: canKong ? counts.flatMap((c, k) => (c === 4 ? [k] : [])) : [],
      jiagang: canKong
        ? p.melds.filter((m) => m.type === 'peng' && counts[m.kind] > 0).map((m) => m.kind)
        : [],
    };
    s.decision = { type: 'turn', seat, options };
  }

  /** 摸牌（fromBack = 从牌尾补牌）。摸到花就补，直到摸到正常牌；牌墙摸完则荒庄。 */
  private drawFor(seat: Seat, fromBack: boolean) {
    const s = this.s;
    const p = s.players[seat];
    let replacement = fromBack;
    for (;;) {
      if (s.wall.length === 0) {
        this.finishExhausted();
        return;
      }
      const t = fromBack ? s.wall.pop()! : s.wall.shift()!;
      if (isFlower(t)) {
        p.flowers.push(t);
        this.emit({ type: 'flower', seat, tile: t });
        fromBack = true;
        replacement = true;
        continue;
      }
      p.hand.push(t);
      p.drawn = t;
      s.replacementDraw = replacement;
      this.emit({ type: 'draw', seat, tile: t, replacement });
      this.beginTurn(seat, false);
      return;
    }
  }

  private claimOptionsFor(q: Seat, from: Seat, tile: TileId): ClaimOptions | null {
    const s = this.s;
    const p = s.players[q];
    const k = kindOf(tile);
    const counts = countKinds(p.hand);
    const opt: ClaimOptions = { hu: false, gang: false, peng: false, chi: [] };
    counts[k]++;
    opt.hu = calcShanten(counts, p.melds.length, s.rules.qidui) === -1;
    counts[k]--;
    if (counts[k] >= 3 && s.wall.length > 0) opt.gang = true;
    if (counts[k] >= 2) opt.peng = true;
    if (q === nextSeat(from) && isSuitKind(k)) {
      const r = k % 9;
      if (r >= 2 && counts[k - 2] && counts[k - 1]) opt.chi.push([k - 2, k - 1]);
      if (r >= 1 && r <= 7 && counts[k - 1] && counts[k + 1]) opt.chi.push([k - 1, k + 1]);
      if (r <= 6 && counts[k + 1] && counts[k + 2]) opt.chi.push([k + 1, k + 2]);
    }
    return opt.hu || opt.gang || opt.peng || opt.chi.length ? opt : null;
  }

  private afterDiscard(from: Seat, tile: TileId) {
    const s = this.s;
    const options: (ClaimOptions | null)[] = [null, null, null, null];
    for (let i = 1; i < 4; i++) {
      const q = nextSeat(from, i);
      options[q] = this.claimOptionsFor(q, from, tile);
    }
    if (!options.some(Boolean)) {
      this.drawFor(nextSeat(from), false);
      return;
    }
    s.decision = { type: 'claim', from, tile, robKong: false, options, responses: [null, null, null, null] };
  }

  private robKongOptions(from: Seat, tile: TileId): (ClaimOptions | null)[] {
    const s = this.s;
    const k = kindOf(tile);
    return SEATS.map((q) => {
      if (q === from) return null;
      const p = s.players[q];
      const counts = countKinds(p.hand);
      counts[k]++;
      const hu = calcShanten(counts, p.melds.length, s.rules.qidui) === -1;
      return hu ? { hu: true, gang: false, peng: false, chi: [] } : null;
    });
  }

  private completeJiagang(seat: Seat, kind: Kind, tile: TileId) {
    const p = this.s.players[seat];
    p.hand.splice(p.hand.indexOf(tile), 1);
    p.drawn = null;
    const meld = p.melds.find((m) => m.type === 'peng' && m.kind === kind)!;
    meld.type = 'jiagang';
    meld.tiles.push(tile);
    this.emit({ type: 'call', seat, call: 'jiagang', tiles: meld.tiles.slice(), from: meld.from });
    this.drawFor(seat, true);
  }

  private resolveClaims() {
    const s = this.s;
    const d = s.decision;
    if (!d || d.type !== 'claim') return;
    const order = [1, 2, 3].map((i) => nextSeat(d.from, i));
    const huSeats = order.filter((q) => d.responses[q]?.type === 'hu');

    if (huSeats.length) {
      const winners = s.rules.multiRon ? huSeats : [huSeats[0]];
      if (d.robKong) {
        const p = s.players[d.from];
        p.hand.splice(p.hand.indexOf(d.tile), 1);
        p.drawn = null;
        s.pendingKong = null;
      }
      this.finishWins(
        winners.map((q) => ({
          seat: q,
          from: d.from,
          winTile: d.tile,
          zimo: false,
          gangkai: false,
          robKong: d.robKong,
        })),
      );
      return;
    }

    if (d.robKong) {
      const pk = s.pendingKong!;
      s.pendingKong = null;
      this.completeJiagang(pk.seat, pk.kind, pk.tile);
      return;
    }

    for (const q of order) {
      const r = d.responses[q];
      if (r?.type === 'gang' || r?.type === 'peng') {
        this.doPengGang(q, d.from, d.tile, r.type);
        return;
      }
    }
    const r = d.responses[order[0]];
    if (r?.type === 'chi') {
      this.doChi(order[0], d.from, d.tile, r.kinds);
      return;
    }
    this.drawFor(nextSeat(d.from), false);
  }

  private takeFromHand(p: PlayerState, kind: Kind, n: number): TileId[] {
    const taken: TileId[] = [];
    for (let i = p.hand.length - 1; i >= 0 && taken.length < n; i--) {
      if (kindOf(p.hand[i]) === kind) taken.push(...p.hand.splice(i, 1));
    }
    if (taken.length !== n) throw new Error('not enough tiles');
    return taken;
  }

  private markClaimed(from: Seat) {
    const river = this.s.players[from].river;
    river[river.length - 1].claimed = true;
    this.s.lastDiscard = null;
  }

  private doPengGang(q: Seat, from: Seat, tile: TileId, type: 'peng' | 'gang') {
    const s = this.s;
    const p = s.players[q];
    const k = kindOf(tile);
    const taken = this.takeFromHand(p, k, type === 'peng' ? 2 : 3);
    this.markClaimed(from);
    const meld: Meld = {
      type: type === 'peng' ? 'peng' : 'minggang',
      kind: k,
      tiles: [...taken, tile],
      from,
      claimed: tile,
    };
    p.melds.push(meld);
    p.drawn = null;
    s.replacementDraw = false;
    this.emit({ type: 'call', seat: q, call: meld.type, tiles: meld.tiles.slice(), from });
    if (type === 'peng') this.beginTurn(q, true);
    else this.drawFor(q, true);
  }

  private doChi(q: Seat, from: Seat, tile: TileId, kinds: [Kind, Kind]) {
    const s = this.s;
    const p = s.players[q];
    const taken = [this.takeFromHand(p, kinds[0], 1)[0], this.takeFromHand(p, kinds[1], 1)[0]];
    this.markClaimed(from);
    const tiles = [...taken, tile].sort((a, b) => kindOf(a) - kindOf(b));
    p.melds.push({ type: 'chi', kind: kindOf(tiles[0]), tiles, from, claimed: tile });
    p.drawn = null;
    s.replacementDraw = false;
    this.emit({ type: 'call', seat: q, call: 'chi', tiles: tiles.slice(), from });
    this.beginTurn(q, true);
  }

  private finishWins(
    list: { seat: Seat; from: Seat | null; winTile: TileId; zimo: boolean; gangkai: boolean; robKong: boolean }[],
  ) {
    const s = this.s;
    const deltas = [0, 0, 0, 0];
    const wins: WinInfo[] = [];
    for (const w of list) {
      const p = s.players[w.seat];
      const handKinds = p.hand.map(kindOf);
      const concealed = w.zimo ? handKinds : [...handKinds, kindOf(w.winTile)];
      const res = scoreWin(
        {
          concealed,
          melds: p.melds.map((m) => ({ type: m.type, kind: m.kind })),
          flowers: p.flowers.length,
          zimo: w.zimo,
          gangkai: w.gangkai,
        },
        s.rules,
      );
      if (!res) throw new Error('declared win is not a winning hand');
      const hand = p.hand.slice();
      if (w.zimo) hand.splice(hand.indexOf(w.winTile), 1);
      wins.push({
        ...w,
        items: res.items,
        total: res.total,
        hand: sortTiles(hand),
        melds: clone(p.melds),
        flowers: p.flowers.slice(),
      });
      if (w.zimo) {
        for (const o of SEATS) {
          if (o === w.seat) continue;
          deltas[o] -= res.total;
          deltas[w.seat] += res.total;
        }
      } else {
        deltas[w.from!] -= res.total;
        deltas[w.seat] += res.total;
      }
    }
    this.endRound('win', wins, deltas);
    this.emit({ type: 'win', seats: list.map((w) => w.seat), zimo: list[0].zimo, from: list[0].from });
  }

  private finishExhausted() {
    this.endRound('draw', [], [0, 0, 0, 0]);
    this.emit({ type: 'exhausted' });
  }

  private endRound(type: 'win' | 'draw', wins: WinInfo[], deltas: number[]) {
    const s = this.s;
    for (const i of SEATS) s.scores[i] += deltas[i];
    s.result = {
      type,
      wins,
      deltas,
      hands: s.players.map((p) => sortTiles(p.hand)),
      nextDealer: this.computeNextDealer(wins),
    };
    s.decision = null;
    s.phase = 'roundEnd';
  }

  private computeNextDealer(wins: WinInfo[]): Seat {
    const s = this.s;
    if (!wins.length) return s.dealer; // 荒庄连庄
    switch (s.rules.dealerRule) {
      case 'dealerWinStays':
        return wins.some((w) => w.seat === s.dealer) ? s.dealer : nextSeat(s.dealer);
      case 'rotateOnWin':
        return nextSeat(s.dealer);
      case 'winnerDeals':
        return wins[0].seat;
    }
  }

  // ------------------------------------------------------------------ 视角

  visibleCounts(seat: Seat): number[] {
    return visibleCountsOf(this.s, seat);
  }

  view(seat: Seat): PlayerView {
    const s = this.s;
    const me = s.players[seat];
    return {
      seat,
      hand: me.hand.slice(),
      drawn: me.drawn,
      melds: me.melds,
      visible: this.visibleCounts(seat),
      wallRemaining: s.wall.length,
      turnCount: s.turnCount,
      dealer: s.dealer,
      rules: s.rules,
      players: s.players.map((p) => ({
        seat: p.seat,
        melds: p.seat === seat ? p.melds : p.melds.map((m) => (m.type === 'angang' ? { ...m, tiles: [] } : m)),
        river: p.river,
        handCount: p.hand.length,
        flowers: p.flowers.length,
      })),
    };
  }

  /** 给 UI 用的深拷贝快照 */
  snapshot(): GameState {
    return clone(this.s);
  }
}
