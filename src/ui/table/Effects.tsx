import { useGame } from '../../store/gameStore';

/** 吃碰杠胡的大字特效 */
export function Effects() {
  const effects = useGame((st) => st.effects);
  const remove = useGame((st) => st.removeEffect);
  return (
    <>
      {effects.map((e) => (
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
