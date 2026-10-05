import { it } from 'vitest';
import { botClaim, botTurn, PROFILES, type BotProfile } from '../src/core/ai';
import { MahjongGame } from '../src/core/game';
import { createRng } from '../src/core/rng';
import { DEFAULT_RULES } from '../src/core/rules';
import { SEATS } from '../src/core/types';

function duel(a: BotProfile, b: BotProfile, games: number) {
  const rng = createRng(5);
  let sumA = 0, nA = 0, rounds = 0, winsA = 0, winsB = 0, dealA = 0, dealB = 0, turns = 0;
  for (let g = 0; g < games; g++) {
    for (const swap of [false, true]) {
      const lineup = SEATS.map((i) => ((i % 2 === 0) !== swap ? a : b));
      const isA = SEATS.map((i) => (i % 2 === 0) !== swap);
      const game = new MahjongGame(lineup.map((_, i) => ({ name: 'b' + i, isHuman: false, level: 'normal' as const })), DEFAULT_RULES);
      for (let r = 0; r < 8; r++) {
        r === 0 ? game.startRound(g * 1000 + r) : game.nextRound(g * 1000 + r);
        while (game.s.phase === 'playing') {
          const d = game.s.decision!;
          if (d.type === 'turn') game.act(d.seat, botTurn(game.view(d.seat), d.options, lineup[d.seat], rng));
          else for (const q of SEATS) {
            const o = d.options[q];
            if (!o || d.responses[q]) continue;
            game.claim(q, botClaim(game.view(q), d.tile, o, lineup[q], rng));
            if (game.s.decision !== d) break;
          }
        }
        const res = game.s.result!;
        rounds++; turns += game.s.turnCount;
        for (const w of res.wins) {
          if (isA[w.seat]) winsA++; else winsB++;
          if (w.from !== null) { if (isA[w.from]) dealA++; else dealB++; }
        }
        SEATS.forEach((i) => { if (isA[i]) { sumA += res.deltas[i]; nA++; } });
      }
    }
  }
  return { avgA: +(sumA / nA).toFixed(3), winsA, winsB, dealA, dealB, rounds, avgDiscards: +(turns / rounds).toFixed(1) };
}

it('duels', { timeout: 900_000 }, () => {
  const N = Number(process.env.SIM_GAMES ?? 60);
  const n = PROFILES.normal;
  const variants: Record<string, BotProfile> = {
    easy: PROFILES.easy,
    hard: PROFILES.hard,
  };
  for (const [name, v] of Object.entries(variants)) console.log(name.padEnd(14), JSON.stringify(duel(v, n, N)));
});
