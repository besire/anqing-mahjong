import type { GameState } from '../../core/game';
import { kindOf } from '../../core/tiles';
import { BOT_LEVEL_LABEL, type Seat } from '../../core/types';
import { Tile } from '../Tile';

const AVATAR_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399'];

export function Plate({ s, seat }: { s: GameState; seat: Seat }) {
  const p = s.players[seat];
  const active = s.phase === 'playing' && s.turn === seat;
  return (
    <div className={`plate plate-${seat} ${active ? 'active' : ''}`}>
      <div className="plate-main">
        <div className="avatar" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${AVATAR_COLORS[seat]} 60%)` }}>
          {p.name.slice(0, 1)}
          {seat === s.dealer && <span className="dealer-badge">庄</span>}
        </div>
        <div className="plate-info">
          <div className="plate-name">
            {p.name}
            {!p.isHuman && <span className={`lv lv-${p.level}`}>{BOT_LEVEL_LABEL[p.level]}</span>}
          </div>
          <div className="plate-sub">
            <span className={`plate-score ${s.scores[seat] > 0 ? 'pos' : s.scores[seat] < 0 ? 'neg' : ''}`}>
              {s.scores[seat] > 0 ? `+${s.scores[seat]}` : s.scores[seat]}
            </span>
            <span className="plate-flowers">花 {p.flowers.length}</span>
          </div>
        </div>
      </div>
      {p.flowers.length > 0 && (
        <div className="plate-flower-tiles">
          {p.flowers.map((f) => (
            <Tile key={f} kind={kindOf(f)} size="mini" />
          ))}
        </div>
      )}
    </div>
  );
}
