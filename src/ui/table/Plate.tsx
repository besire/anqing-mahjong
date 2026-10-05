import { useState } from 'react';
import type { GameState } from '../../core/game';
import { kindOf, kindShort } from '../../core/tiles';
import { BOT_LEVEL_LABEL, type Seat } from '../../core/types';
import { Modal } from '../Modals';
import { Tile } from '../Tile';

const AVATAR_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399'];

export function Plate({ s, seat }: { s: GameState; seat: Seat }) {
  const p = s.players[seat];
  const [flowersOpen, setFlowersOpen] = useState(false);
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
            <button
              className="plate-flowers"
              onClick={() => setFlowersOpen(true)}
              aria-label={`${p.isHuman ? '我的' : p.name + '的'}花牌，共 ${p.flowers.length} 张`}
              title="查看花牌"
            >
              花 {p.flowers.length} <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </div>
      {flowersOpen && (
        <Modal title={`${p.isHuman ? '我的' : p.name + '的'}花牌 · ${p.flowers.length} 张`} onClose={() => setFlowersOpen(false)}>
          {p.flowers.length ? (
            <>
              <div className="flower-detail-tiles">
                {p.flowers.map((f) => (
                  <div className="flower-detail-tile" key={f}>
                    <Tile kind={kindOf(f)} size="result" />
                    <span>{kindShort(kindOf(f))}</span>
                  </div>
                ))}
              </div>
              <p className="flower-detail-text">这 {p.flowers.length} 张花牌在胡牌时加 {p.flowers.length} 花，底花另加 1。花牌已亮出，补来的普通牌进入手牌。</p>
            </>
          ) : (
            <p className="flower-detail-text">本局暂时没摸到花。白、中、发、东是花牌，摸到会自动亮出并补一张，每张加 1 花。</p>
          )}
        </Modal>
      )}
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
