import { describe, expect, it } from 'vitest';
import { analyzeClaim, analyzeDiscards, bestShape, remainingFromVisible } from './analysis';
import { botClaim, botTurn } from './ai';
import { MahjongGame, type PlayerConfig } from './game';
import { createRng } from './rng';
import { DEFAULT_RULES, type Rules } from './rules';
import { calcShanten, calcUkeire, shantenRegular } from './shanten';
import { countFromKinds, isFlower, kindOf, parseKinds, PLAY_KINDS, TOTAL_TILES } from './tiles';
import { SEATS, type BotLevel } from './types';
import { scoreWin, winDecompositions } from './win';

const C = (s: string) => countFromKinds(parseKinds(s));

/** 朴素的向听实现，用来交叉验证带缓存的快速版本 */
function naiveShanten(counts: number[], called: number): number {
  const c = counts.slice(0, PLAY_KINDS);
  let best = 8;
  const isSuit = (k: number) => k < 27;
  const dfs = (i: number, m: number, t: number, h: number) => {
    while (i < PLAY_KINDS && c[i] === 0) i++;
    if (i >= PLAY_KINDS) {
      let mm = m + called;
      let tt = t;
      if (mm > 4) mm = 4;
      if (mm + tt > 4) tt = 4 - mm;
      best = Math.min(best, 8 - 2 * mm - tt - h);
      return;
    }
    const r = i % 9;
    if (c[i] >= 3) {
      c[i] -= 3;
      dfs(i, m + 1, t, h);
      c[i] += 3;
    }
    if (isSuit(i) && r <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      dfs(i, m + 1, t, h);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!h) dfs(i, m, t, 1);
      dfs(i, m, t + 1, h);
      c[i] += 2;
    }
    if (isSuit(i) && r <= 7 && c[i + 1]) {
      c[i]--; c[i + 1]--;
      dfs(i, m, t + 1, h);
      c[i]++; c[i + 1]++;
    }
    if (isSuit(i) && r <= 6 && c[i + 2]) {
      c[i]--; c[i + 2]--;
      dfs(i, m, t + 1, h);
      c[i]++; c[i + 2]++;
    }
    c[i]--;
    dfs(i, m, t, h);
    c[i]++;
  };
  dfs(0, 0, 0, 0);
  return best;
}

describe('shanten', () => {
  it('known hands', () => {
    expect(calcShanten(C('123m456m789m123p55p'), 0)).toBe(-1);
    expect(calcShanten(C('123m456m789m123p5p'), 0)).toBe(0);
    expect(calcShanten(C('123m456m789m12p5s9s'), 0)).toBe(1);
    expect(calcShanten(C('147m258p369s南西北1s'), 0)).toBe(7);
    expect(calcShanten(C('南南南西西西北北'), 2)).toBe(-1);
    expect(calcShanten(C('南南南西西北北'), 2)).toBe(0); // 对碰听西/北
    expect(calcShanten(C('1m'), 4)).toBe(0); // 单骑
    expect(calcShanten(C('11m'), 4)).toBe(-1);
  });

  it('matches naive implementation on random hands', () => {
    const rng = createRng(42);
    for (let n = 0; n < 3000; n++) {
      const wall = Array.from({ length: 120 }, (_, i) => i);
      for (let i = wall.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [wall[i], wall[j]] = [wall[j], wall[i]];
      }
      const called = Math.floor(rng() * 3);
      const size = 13 - called * 3 + (n % 2);
      const counts = new Array(34).fill(0);
      for (const t of wall.slice(0, size)) counts[kindOf(t)]++;
      expect(shantenRegular(counts, called)).toBe(naiveShanten(counts, called));
    }
  });

  it('seven pairs only when enabled', () => {
    const c = C('11223344m5566p南南');
    expect(calcShanten(c, 0, false)).toBeGreaterThan(-1);
    expect(calcShanten(c, 0, true)).toBe(-1);
    expect(calcShanten(C('1111m2233p5566s南'), 0, true)).toBe(0); // 四张算两对
  });

  it('ukeire', () => {
    const remaining = new Array(30).fill(4);
    const u = calcUkeire(C('123m456m789m23p55s'), 0, remaining);
    expect(u.shanten).toBe(0);
    expect(u.waits.map((w) => w.kind)).toEqual(parseKinds('14p'));
    expect(u.total).toBe(8);
  });
});

describe('win & score', () => {
  const R: Rules = { ...DEFAULT_RULES };
  it('basic ron', () => {
    const r = scoreWin({ concealed: parseKinds('123m456m789p123s55s'), melds: [], flowers: 0, zimo: false, gangkai: false }, R)!;
    expect(r.total).toBe(1);
  });

  it('zimo + flowers + gang + wind triplets', () => {
    const r = scoreWin(
      {
        concealed: parseKinds('123m南南南55p'),
        melds: [
          { type: 'angang', kind: 28 },
          { type: 'peng', kind: 29 },
        ],
        flowers: 3,
        zimo: true,
        gangkai: false,
      },
      R,
    )!;
    // 底1 + 花3 + 自摸1 + 杠1 + 南西北刻3
    expect(r.total).toBe(9);
  });

  it('gangkai', () => {
    const r = scoreWin(
      { concealed: parseKinds('123m456m789p55s'), melds: [{ type: 'minggang', kind: 24 }], flowers: 0, zimo: true, gangkai: true },
      R,
    )!;
    expect(r.total).toBe(4);
  });

  it('not a win', () => {
    expect(scoreWin({ concealed: parseKinds('123m456m789p124s55s'), melds: [], flowers: 0, zimo: false, gangkai: false }, R)).toBeNull();
  });

  it('special patterns are configurable', () => {
    const input = { concealed: parseKinds('11123456789999m'), melds: [], flowers: 0, zimo: false, gangkai: false };
    expect(scoreWin(input, R)!.total).toBe(1);
    expect(scoreWin(input, { ...R, qingyiseBonus: 5 })!.total).toBe(6);
    const pp = { concealed: parseKinds('111m222p南南南55s'), melds: [{ type: 'peng' as const, kind: 8 }], flowers: 0, zimo: false, gangkai: false };
    expect(scoreWin(pp, { ...R, pengpengBonus: 3 })!.total).toBe(1 + 1 + 3);
  });

  it('decompositions', () => {
    expect(winDecompositions(C('111222333m南南南北北'), R, 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe('analysis', () => {
  it('discards isolated honor first', () => {
    const counts = C('123m456p78s24s55m9p北');
    const remaining = remainingFromVisible(counts);
    const opts = analyzeDiscards(counts, 0, remaining, false, { deep: true });
    expect(opts[0].kind).toBe(29); // 北
    expect(opts[0].shanten).toBe(1);
  });

  it('shape blocks reach the same shanten', () => {
    const counts = C('123m456p78s24s55m9p北');
    expect(bestShape(counts, 0).shanten).toBe(calcShanten(counts, 0));
  });

  it('peng advice', () => {
    const counts = C('123m456p78s南南55m北');
    const a = analyzeClaim(counts, 0, 27, { hu: false, gang: false, peng: true, chi: [] }, new Array(30).fill(3), false);
    expect(a.recommend.type).toBe('peng');
  });
});

describe('engine', () => {
  const levels: BotLevel[] = ['easy', 'normal', 'hard'];

  function checkInvariants(g: MahjongGame) {
    const s = g.s;
    let total = s.wall.length;
    for (const p of s.players) {
      total += p.hand.length + p.flowers.length + p.river.filter((r) => !r.claimed).length;
      total += p.melds.reduce((a, m) => a + m.tiles.length, 0);
      expect(p.hand.some(isFlower)).toBe(false);
      const size = p.hand.length + p.melds.length * 3;
      const d = s.decision;
      const active = (d?.type === 'turn' && d.seat === p.seat) || s.pendingKong?.seat === p.seat;
      expect(size).toBe(active ? 14 : 13);
    }
    expect(total).toBe(TOTAL_TILES);
  }

  function playRound(g: MahjongGame, rng: () => number) {
    let steps = 0;
    while (g.s.phase === 'playing') {
      const d = g.s.decision!;
      if (d.type === 'turn') {
        const p = g.s.players[d.seat];
        g.act(d.seat, botTurn(g.view(d.seat), d.options, p.level, rng));
      } else {
        for (const q of SEATS) {
          const o = d.options[q];
          if (!o || d.responses[q]) continue;
          const a = d.robKong ? { type: 'hu' as const } : botClaim(g.view(q), d.tile, o, g.s.players[q].level, rng);
          g.claim(q, a);
          if (g.s.decision !== d) break;
        }
      }
      if (g.s.phase === 'playing') checkInvariants(g);
      if (++steps > 3000) throw new Error('round did not terminate');
    }
  }

  it('bots play many rounds consistently', { timeout: 120_000 }, () => {
    const rng = createRng(7);
    let wins = 0;
    let draws = 0;
    for (let game = 0; game < 12; game++) {
      const configs: PlayerConfig[] = SEATS.map((i) => ({
        name: `bot${i}`,
        isHuman: false,
        level: levels[(game + i) % 3],
      }));
      const rules: Rules = {
        ...DEFAULT_RULES,
        qidui: game % 2 === 0,
        robKong: game % 3 === 0,
        multiRon: game % 4 === 0,
        dealerRule: (['dealerWinStays', 'rotateOnWin', 'winnerDeals'] as const)[game % 3],
      };
      const g = new MahjongGame(configs, rules);
      for (let r = 0; r < 10; r++) {
        if (r === 0) g.startRound(1000 + game * 100 + r);
        else g.nextRound(1000 + game * 100 + r);
        playRound(g, rng);
        const res = g.s.result!;
        expect(res).toBeTruthy();
        expect(res.deltas.reduce((a, b) => a + b, 0)).toBe(0);
        if (res.type === 'win') {
          wins++;
          for (const w of res.wins) expect(w.total).toBeGreaterThanOrEqual(1);
        } else draws++;
      }
      expect(g.s.scores.reduce((a, b) => a + b, 0)).toBe(0);
    }
    console.log(`wins=${wins} draws=${draws}`);
    expect(wins).toBeGreaterThan(draws);
  });

  it('restart replays the same deal', () => {
    const configs: PlayerConfig[] = SEATS.map((i) => ({ name: `p${i}`, isHuman: i === 0, level: 'normal' }));
    const g = new MahjongGame(configs, DEFAULT_RULES);
    g.startRound(123);
    const hand = g.s.players[0].hand.slice();
    g.restartRound();
    expect(g.s.players[0].hand).toEqual(hand);
    expect(g.s.roundNo).toBe(1);
  });
});
