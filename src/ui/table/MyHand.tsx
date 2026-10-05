import { useRef } from 'react';
import type { GameState } from '../../core/game';
import { kindOf, sortTiles, type TileId } from '../../core/tiles';
import { HUMAN, useGame } from '../../store/gameStore';
import { Tile, type TileMark } from '../Tile';
import { MeldGroup } from './Melds';

/** 向上滑动超过这个距离（屏幕像素）直接打出 */
const SWIPE_PX = 28;

export function MyHand({ s }: { s: GameState }) {
  const hint = useGame((st) => st.hint);
  const settings = useGame((st) => st.settings);
  const selected = useGame((st) => st.selected);
  const hoverKind = useGame((st) => st.hoverKind);
  const { discard, select, setHover } = useGame.getState();
  const press = useRef<{ tile: TileId; y: number } | null>(null);

  const p = s.players[HUMAN];
  const d = s.decision;
  const myTurn = s.phase === 'playing' && d?.type === 'turn' && d.seat === HUMAN;
  const drawn = myTurn ? p.drawn : null;
  const tiles = sortTiles(p.hand.filter((t) => t !== drawn));
  const turnHint = myTurn && hint?.type === 'turn' ? hint : null;
  const showBadges = !!turnHint && settings.tileBadges;
  const best = turnHint?.options[0];

  const onDown = (t: TileId, e: React.PointerEvent<HTMLDivElement>) => {
    if (!myTurn) return;
    press.current = { tile: t, y: e.clientY };
    // 捕获指针：手指滑出这张牌再松开也能收到 pointerup
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onUp = (t: TileId, e: React.PointerEvent<HTMLDivElement>) => {
    const start = press.current;
    press.current = null;
    if (!myTurn) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // 上滑出牌
    if (start && start.tile === t && start.y - e.clientY > SWIPE_PX) {
      discard(t);
      return;
    }
    const confirm = settings.confirmDiscard || e.pointerType === 'touch' || e.pointerType === 'pen';
    if (confirm && selected !== t) {
      select(t);
      return;
    }
    discard(t);
  };

  const render = (t: TileId, extraClass?: string) => {
    const k = kindOf(t);
    let mark: TileMark | null = null;
    let badge: number | string | undefined;
    let tone: 'best' | 'good' | 'bad' | 'plain' = 'plain';
    if (turnHint && best) {
      const o = turnHint.options.find((x) => x.kind === k)!;
      if (turnHint.bestKinds.includes(k)) {
        mark = 'best';
        tone = 'best';
      } else if (o.shanten > best.shanten) tone = 'bad';
      else if (o.total >= best.total * 0.85) tone = 'good';
      if (showBadges) badge = tone === 'bad' ? '退' : o.total;
    }
    if (selected === t) mark = 'selected';
    else if (hoverKind === k && mark !== 'best' && myTurn) mark = 'focus';
    return (
      <Tile
        key={t}
        kind={k}
        size="hand"
        mark={mark}
        badge={badge}
        badgeTone={tone}
        className={[extraClass, showBadges && tone === 'bad' ? 'is-bad' : '', selected === t ? 'is-selected' : '']
          .filter(Boolean)
          .join(' ')}
        onPointerDown={(e) => onDown(t, e)}
        onPointerUp={(e) => onUp(t, e)}
        onPointerEnter={() => setHover(k)}
        onPointerLeave={() => setHover(null)}
      />
    );
  };

  return (
    <div className={`my-row ${myTurn ? 'my-turn' : ''}`}>
      <div className="my-hand">
        {tiles.map((t) => render(t))}
        {drawn !== null && render(drawn, 'drawn')}
      </div>
      {p.melds.length > 0 && (
        <div className="my-melds">
          {p.melds.map((m, i) => (
            <MeldGroup key={i} meld={m} owner={HUMAN} size="meld" reveal />
          ))}
        </div>
      )}
    </div>
  );
}
