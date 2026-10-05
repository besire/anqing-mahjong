import { createPortal } from 'react-dom';
import { kindOf } from '../../core/tiles';
import { HUMAN, useGame } from '../../store/gameStore';
import { MiniTiles } from '../Tile';

/** 吃碰杠胡的大字特效；自己的补花用不缩放的通知。 */
export function Effects() {
  const effects = useGame((st) => st.effects);
  const remove = useGame((st) => st.removeEffect);
  return (
    <>
      {effects.map((e) => e.variant === 'flower' && e.seat === HUMAN && e.tiles ? createPortal(
        <div
          className="flower-notice"
          role="status"
          onAnimationEnd={(ev) => ev.target === ev.currentTarget && remove(e.id)}
        >
          <b>{e.text}</b>
          <MiniTiles kinds={e.tiles.map(kindOf)} size="small" />
          <span>已自动补牌 · 点击头像旁的「花」查看</span>
        </div>,
        document.body,
        String(e.id),
      ) : (
        <div
          key={e.id}
          className={`fx fx-${e.variant} fx-seat-${e.seat}`}
          onAnimationEnd={(ev) => ev.target === ev.currentTarget && remove(e.id)}
        >
          {e.variant !== 'flower' && <div className="fx-ring" />}
          <span className="fx-text">{e.text}</span>
        </div>
      ))}
    </>
  );
}
