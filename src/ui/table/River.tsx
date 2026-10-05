import type { CSSProperties } from 'react';
import { kindOf, type TileId } from '../../core/tiles';
import type { RiverTile } from '../../core/types';
import { Tile } from '../Tile';

/** 牌河：每行 cols 张，排满若干行后最后一行不再换行 */
export function River({
  tiles,
  lastTile,
  winTile,
  cols = 6,
  style,
}: {
  tiles: RiverTile[];
  lastTile: TileId | null;
  winTile: TileId | null;
  cols?: number;
  style?: CSSProperties;
}) {
  const visible = tiles.filter((t) => !t.claimed);
  const maxRows = cols >= 9 ? 3 : 4;
  const rows: RiverTile[][] = [];
  for (let r = 0; r < maxRows; r++) {
    const start = r * cols;
    rows.push(r === maxRows - 1 ? visible.slice(start) : visible.slice(start, start + cols));
  }
  return (
    <div className="river" style={style}>
      {rows.map((row, r) =>
        row.length ? (
          <div className="river-row" key={r}>
            {row.map((t) => (
              <Tile
                key={t.id}
                kind={kindOf(t.id)}
                size="river"
                dim={t.tsumogiri}
                mark={t.id === winTile ? 'win' : t.id === lastTile ? 'last' : null}
                className={t.id === lastTile ? 'just-discarded' : undefined}
              />
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}
