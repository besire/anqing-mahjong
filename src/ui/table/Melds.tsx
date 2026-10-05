import { kindOf, type Kind } from '../../core/tiles';
import type { Meld, Seat } from '../../core/types';
import { Tile, type TileSize } from '../Tile';

interface MeldTile {
  kind: Kind;
  sideways: boolean;
  back: boolean;
}

/** 被叫的牌横放：上家的放左边，对家的放中间，下家的放右边 */
export function meldTiles(m: Meld, owner: Seat, reveal: boolean): MeldTile[] {
  if (m.type === 'angang') {
    if (!reveal) return [0, 1, 2, 3].map(() => ({ kind: m.kind, sideways: false, back: true }));
    return m.tiles.map((t, i) => ({ kind: kindOf(t), sideways: false, back: i === 0 || i === 3 }));
  }
  const others = m.tiles
    .filter((t) => t !== m.claimed)
    .map(kindOf)
    .sort((a, b) => a - b)
    .map((kind) => ({ kind, sideways: false, back: false }));
  if (m.claimed === undefined || m.from === undefined) return others;
  const rel = (m.from - owner + 4) % 4;
  const pos = rel === 3 ? 0 : rel === 2 ? 1 : others.length;
  others.splice(pos, 0, { kind: kindOf(m.claimed), sideways: true, back: false });
  return others;
}

export function MeldGroup({ meld, owner, size, reveal }: { meld: Meld; owner: Seat; size: TileSize; reveal: boolean }) {
  return (
    <div className={`meld meld-${meld.type}`}>
      {meldTiles(meld, owner, reveal).map((t, i) => (
        <Tile key={i} kind={t.kind} size={size} sideways={t.sideways} back={t.back} />
      ))}
    </div>
  );
}
