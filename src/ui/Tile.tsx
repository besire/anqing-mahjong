import { memo, type CSSProperties, type ReactNode } from 'react';
import { kindImage, kindName, type Kind } from '../core/tiles';

export type TileSize = 'hand' | 'river' | 'meld' | 'opp' | 'small' | 'mini' | 'result' | 'drill';
export type TileMark = 'best' | 'good' | 'bad' | 'last' | 'win' | 'selected' | 'focus';

export interface TileProps {
  kind?: Kind | null;
  size: TileSize;
  back?: boolean;
  dim?: boolean;
  /** 横放（被叫的那张） */
  sideways?: boolean;
  mark?: TileMark | null;
  badge?: ReactNode;
  badgeTone?: 'best' | 'good' | 'bad' | 'plain';
  className?: string;
  style?: CSSProperties;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export const Tile = memo(function Tile(p: TileProps) {
  const showFace = !p.back && p.kind !== null && p.kind !== undefined;
  const cls = [
    'tile',
    `t-${p.size}`,
    p.back ? 'is-back' : '',
    p.dim ? 'is-dim' : '',
    p.sideways ? 'is-side' : '',
    p.mark ? `mk-${p.mark}` : '',
    p.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      style={p.style}
      title={showFace ? kindName(p.kind!) : undefined}
      onPointerDown={p.onPointerDown}
      onPointerUp={p.onPointerUp}
      onPointerEnter={p.onPointerEnter}
      onPointerLeave={p.onPointerLeave}
    >
      <div className="tile-body">{showFace && <img src={kindImage(p.kind!)} alt={kindName(p.kind!)} draggable={false} />}</div>
      {p.badge !== undefined && p.badge !== null && <div className={`tile-badge tb-${p.badgeTone ?? 'plain'}`}>{p.badge}</div>}
    </div>
  );
});

/** 行内小牌（提示文字中使用） */
export function MiniTiles({ kinds, size = 'mini' }: { kinds: Kind[]; size?: TileSize }) {
  return (
    <span className="mini-tiles">
      {kinds.map((k, i) => (
        <Tile key={i} kind={k} size={size} />
      ))}
    </span>
  );
}
