import type { GameState } from '../../core/game';
import { SEATS } from '../../core/types';

const WINDS = ['东', '南', '西', '北'];
const ROT = [0, -90, 180, 90];

export function CenterBox({ s }: { s: GameState }) {
  const active = s.phase === 'playing' ? (s.decision?.type === 'claim' ? s.decision.from : s.turn) : null;
  return (
    <div className="center-box">
      <div className="cb-core">
        <div className="cb-round">
          第 {s.roundNo} 局{s.rules.totalRounds > 0 ? ` / ${s.rules.totalRounds}` : ''}
        </div>
        <div className="cb-wall">
          <span>余</span>
          <b>{s.wall.length}</b>
        </div>
        <div className="cb-streak">{s.dealerStreak > 0 ? `连庄 ×${s.dealerStreak}` : '\u00a0'}</div>
      </div>
      {SEATS.map((seat) => {
        const wind = WINDS[(seat - s.dealer + 4) % 4];
        const score = s.scores[seat];
        return (
          <div key={seat} className={`cb-edge cb-edge-${seat}`} style={{ transform: `rotate(${ROT[seat]}deg)` }}>
            <div className={`cb-turn ${active === seat ? 'on' : ''}`} />
            <div className="cb-label">
              <span className={`cb-wind ${seat === s.dealer ? 'dealer' : ''}`}>{wind}</span>
              <span className={`cb-score ${score > 0 ? 'pos' : score < 0 ? 'neg' : ''}`}>
                {score > 0 ? `+${score}` : score}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
