import type { GameState } from '../../core/game';
import { kindOf, sortTiles, type TileId } from '../../core/tiles';
import type { Seat } from '../../core/types';
import { riverOffset, type TableLayout } from '../layout';
import { Tile } from '../Tile';
import { MeldGroup } from './Melds';
import { River } from './River';

/** 以桌面中心为原点、按座位旋转的坐标系：0 下 1 右 2 上 3 左 */
const ROTATE = [0, -90, 180, 90];

export function SeatArea({ s, seat, winTile, L }: { s: GameState; seat: Seat; winTile: TileId | null; L: TableLayout }) {
  const p = s.players[seat];
  const lastTile = s.lastDiscard?.seat === seat ? s.lastDiscard.tile : null;
  const ended = s.phase === 'roundEnd';
  const revealHand = ended ? (s.result?.hands[seat] ?? p.hand) : null;
  const isTurn = s.decision?.type === 'turn' && s.decision.seat === seat;
  const drawn = isTurn ? p.drawn : null;
  const river = riverOffset(L, seat);

  return (
    <div className={`anchor anchor-${seat}`} style={{ transform: `rotate(${ROTATE[seat]}deg)` }}>
      <River
        tiles={p.river}
        lastTile={lastTile}
        winTile={winTile && s.result?.wins.some((w) => w.from === seat) ? winTile : null}
        cols={river.cols}
        style={{ left: river.left, top: river.top }}
      />
      {seat !== 0 && (
        <div className="opp-row" style={{ top: L.handDist[seat] }}>
          <div className="opp-hand">
            {revealHand
              ? sortTiles(revealHand).map((t) => <Tile key={t} kind={kindOf(t)} size="opp" />)
              : p.hand.filter((t) => t !== drawn).map((t) => <Tile key={t} size="opp" back />)}
            {!revealHand && drawn !== null && <Tile key="drawn" size="opp" back className="opp-drawn" />}
          </div>
          {p.melds.length > 0 && (
            <div className="opp-melds">
              {p.melds.map((m, i) => (
                <MeldGroup key={i} meld={m} owner={seat} size="opp" reveal={ended} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
