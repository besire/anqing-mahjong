import { useState } from 'react';
import { BLOCK_LABEL, shantenText, type DiscardOption, type HandShape } from '../../core/analysis';
import { GRADE_LABEL, type DiscardRecord, type HintLine, type WaitValue } from '../../core/hint';
import { PLAY_KINDS, type Kind } from '../../core/tiles';
import { MiniTiles, Tile } from '../Tile';

export function Lines({ lines }: { lines: HintLine[] }) {
  return (
    <ul className="hint-lines">
      {lines.map((l, i) => (
        <li key={i} className={`hl hl-${l.tone}`}>
          {l.segs.map((seg, j) =>
            typeof seg === 'string' ? (
              <span key={j}>{seg}</span>
            ) : 'tile' in seg ? (
              <MiniTiles key={j} kinds={[seg.tile]} />
            ) : (
              <MiniTiles key={j} kinds={seg.tiles} />
            ),
          )}
        </li>
      ))}
    </ul>
  );
}

export function OptionsTable({
  options,
  bestKinds,
  hoverKind,
  onHover,
  chosen,
  limit = 7,
}: {
  options: DiscardOption[];
  bestKinds: Kind[];
  hoverKind?: Kind | null;
  onHover?: (k: Kind | null) => void;
  chosen?: Kind | null;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const best = options[0];
  // 默认只显示不退向听的打法；退向听的收起来
  const main = options.filter((o) => o.shanten === best.shanten);
  const shown = all ? options : main.slice(0, limit);
  if (!all && chosen !== undefined && chosen !== null && !shown.some((o) => o.kind === chosen)) {
    const c = options.find((o) => o.kind === chosen);
    if (c) shown.push(c);
  }
  const maxTotal = Math.max(1, ...options.map((o) => o.total));
  return (
    <div className="opt-table">
      <div className="opt-head">
        <span>打</span>
        <span>向听</span>
        <span>进张</span>
        <span>有效牌</span>
      </div>
      {shown.map((o) => {
        const isBest = bestKinds.includes(o.kind);
        const back = o.shanten > best.shanten;
        return (
          <div
            key={o.kind}
            className={`opt-row ${isBest ? 'best' : ''} ${back ? 'back' : ''} ${hoverKind === o.kind ? 'hover' : ''} ${chosen === o.kind ? 'chosen' : ''}`}
            onPointerEnter={() => onHover?.(o.kind)}
            onPointerLeave={() => onHover?.(null)}
          >
            <span className="opt-tile">
              <Tile kind={o.kind} size="small" />
            </span>
            <span className="opt-shanten">{o.shanten <= 0 ? (o.shanten === 0 ? '听牌' : '和') : o.shanten}</span>
            <span className="opt-total">
              <b>{o.total}</b>
              <i className="opt-bar" style={{ width: `${(o.total / maxTotal) * 100}%` }} />
              {o.avgNext !== undefined && <em title="两步前瞻：摸到有效牌后，下一步的平均进张">≈{o.avgNext.toFixed(1)}</em>}
            </span>
            <span className="opt-waits">
              {(back ? [] : o.waits.slice(0, o.waits.length > 12 ? 11 : 12)).map((w) => (
                <span key={w.kind} className={`ow ${w.count === 0 ? 'dead' : ''}`}>
                  <Tile kind={w.kind} size="mini" />
                  <sub>{w.count}</sub>
                </span>
              ))}
              {back && <span className="ow-back">退向听</span>}
              {!back && o.waits.length > 12 && <span className="ow-more">+{o.waits.length - 11} 种</span>}
            </span>
          </div>
        );
      })}
      {options.length > shown.length || all ? (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? '收起' : `展开全部 ${options.length} 种打法（含退向听）`}
        </button>
      ) : null}
    </div>
  );
}

export function ShapeView({ shape, title = '牌型拆解' }: { shape: HandShape; title?: string }) {
  const order = ['shunzi', 'kezi', 'quetou', 'liangmian', 'kanzhang', 'bianzhang', 'duizi', 'guzhang'];
  const blocks = [...shape.blocks].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return (
    <div className="shape">
      <div className="sec-title">
        {title}
        <small>
          {shantenText(shape.shanten)} · 面子+搭子 {shape.blockCount} 块
        </small>
      </div>
      <div className="shape-blocks">
        {blocks.map((b, i) => (
          <div key={i} className={`blk blk-${b.type}`}>
            <MiniTiles kinds={b.kinds} />
            <span>{BLOCK_LABEL[b.type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WaitValues({ values }: { values: WaitValue[] }) {
  if (!values.length) return null;
  return (
    <div className="wait-values">
      <div className="sec-title">听牌价值</div>
      <div className="wv-grid">
        <span className="wv-h">胡</span>
        <span className="wv-h">剩</span>
        <span className="wv-h">点炮</span>
        <span className="wv-h">自摸(每家)</span>
        {values.map((v) => (
          <WaitRow key={v.kind} v={v} />
        ))}
      </div>
    </div>
  );
}

function WaitRow({ v }: { v: WaitValue }) {
  return (
    <>
      <span>
        <Tile kind={v.kind} size="mini" />
      </span>
      <span className={v.count === 0 ? 'neg' : ''}>{v.count}</span>
      <span>{v.ron} 花</span>
      <span>
        {v.tsumo} 花 <small>×3</small>
      </span>
    </>
  );
}

export function Feedback({ rec }: { rec: DiscardRecord }) {
  return (
    <div className={`feedback fb-${rec.grade}`}>
      <span className="fb-grade">{GRADE_LABEL[rec.grade]}</span>
      <span className="fb-text">
        打了 <MiniTiles kinds={[rec.chosen]} /> 进张 {rec.chosenTotal}
        {rec.grade !== 'best' && (
          <>
            {' '}
            · 最优 <MiniTiles kinds={rec.bestKinds.slice(0, 3)} /> 进张 {rec.bestTotal}
            {rec.grade === 'back' && `（${shantenText(rec.chosenShanten)}）`}
          </>
        )}
      </span>
    </div>
  );
}

export function RemainingGrid({ visible }: { visible: number[] }) {
  const rows = [
    Array.from({ length: 9 }, (_, i) => i),
    Array.from({ length: 9 }, (_, i) => i + 9),
    Array.from({ length: 9 }, (_, i) => i + 18),
    [27, 28, 29],
  ];
  return (
    <div className="remain-grid">
      {rows.map((r, i) => (
        <div key={i} className="remain-row">
          {r.map((k) => {
            const left = k < PLAY_KINDS ? Math.max(0, 4 - visible[k]) : 0;
            return (
              <span key={k} className={`rg ${left === 0 ? 'zero' : left === 1 ? 'one' : ''}`}>
                <Tile kind={k} size="mini" />
                <sub>{left}</sub>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
