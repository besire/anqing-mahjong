import { createPortal } from 'react-dom';
import { shantenText } from '../core/analysis';
import type { GameState } from '../core/game';
import { GRADE_LABEL } from '../core/hint';
import { kindOf } from '../core/tiles';
import { SEATS } from '../core/types';
import { HUMAN, useGame } from '../store/gameStore';
import { MiniTiles, Tile } from './Tile';
import { MeldGroup } from './table/Melds';

export function ResultModal({ s }: { s: GameState }) {
  const records = useGame((st) => st.records);
  const canUndo = useGame((st) => st.canUndo);
  const { nextRound, restartRound, quitGame, startGame, undo } = useGame.getState();
  const r = s.result;
  if (!r) return null;
  const gameOver = s.rules.totalRounds > 0 && s.roundNo >= s.rules.totalRounds;
  const iWon = r.wins.some((w) => w.seat === HUMAN);
  const best = records.filter((x) => x.grade === 'best').length;
  const lost = records.reduce((a, x) => a + (x.grade === 'back' ? 0 : x.bestTotal - x.chosenTotal), 0);
  const mistakes = records.filter((x) => x.grade !== 'best');
  const ranking = [...SEATS].sort((a, b) => s.scores[b] - s.scores[a]);

  return createPortal(
    <div className="modal-mask result-mask">
      <div className={`result ${iWon ? 'won' : ''}`}>
        {r.type === 'draw' ? (
          <div className="res-title draw">
            荒庄<span className="res-who">牌已摸完，无人胡牌，庄家连庄</span>
          </div>
        ) : (
          r.wins.map((w) => (
            <div key={w.seat} className="res-win">
              <div className="res-title">
                {w.zimo ? (w.gangkai ? '杠上开花' : '自摸') : w.robKong ? '抢杠胡' : '胡牌'}
                <span className="res-who">
                  {s.players[w.seat].name}
                  {w.from !== null && <em> · {s.players[w.from].name} 放炮</em>}
                </span>
              </div>
              <div className="res-hand">
                <div className="res-tiles">
                  {w.hand.map((t) => (
                    <Tile key={t} kind={kindOf(t)} size="result" />
                  ))}
                  <Tile kind={kindOf(w.winTile)} size="result" mark="win" className="res-wintile" />
                </div>
                {w.melds.map((m, i) => (
                  <MeldGroup key={i} meld={m} owner={w.seat} size="small" reveal />
                ))}
                {w.flowers.length > 0 && (
                  <div className="res-flowers">
                    <MiniTiles kinds={w.flowers.map(kindOf)} />
                  </div>
                )}
              </div>
              <div className="res-items">
                {w.items.map((it, i) => (
                  <div key={i} className="res-item" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                    <span>{it.name}</span>
                    <b>+{it.value}</b>
                  </div>
                ))}
                <div className="res-total">
                  共 <b>{w.total}</b> 花
                  <small>{w.zimo ? `三家各付 ${w.total}` : `放炮者付 ${w.total}`}</small>
                </div>
              </div>
            </div>
          ))
        )}

        <div className="res-deltas">
          {SEATS.map((i) => (
            <div key={i} className={`rd ${i === HUMAN ? 'me' : ''}`}>
              <span className="rd-name">
                {s.players[i].name}
                {i === s.dealer && <i className="rd-dealer">庄</i>}
              </span>
              <span className={`rd-delta ${r.deltas[i] > 0 ? 'pos' : r.deltas[i] < 0 ? 'neg' : ''}`}>
                {r.deltas[i] > 0 ? `+${r.deltas[i]}` : r.deltas[i]}
              </span>
              <span className="rd-total">{s.scores[i]}</span>
            </div>
          ))}
        </div>

        {records.length > 0 && (
          <div className="res-review">
            <div className="res-review-head">
              本局牌效：最优 <b>{best}</b>/{records.length} 手 · 损失进张 <b>{lost}</b> 张
            </div>
            {mistakes.slice(0, 4).map((m, i) => (
              <div key={i} className={`rv rv-${m.grade}`}>
                <span className="rv-turn">第 {m.turn} 巡</span>
                <span className="rv-grade">{GRADE_LABEL[m.grade]}</span>
                打 <MiniTiles kinds={[m.chosen]} />
                {m.grade === 'back' ? `（退到${shantenText(m.chosenShanten)}）` : `（进张 ${m.chosenTotal}）`}→ 最优{' '}
                <MiniTiles kinds={m.bestKinds.slice(0, 3)} />
                {m.grade === 'back' ? `（${shantenText(m.bestShanten)}，进张 ${m.bestTotal}）` : `（进张 ${m.bestTotal}）`}
              </div>
            ))}
            {mistakes.length > 4 && <div className="rv more">…另有 {mistakes.length - 4} 手</div>}
          </div>
        )}

        {gameOver && (
          <div className="res-final">
            <div className="res-final-title">终局排名</div>
            {ranking.map((seat, i) => (
              <div key={seat} className={`rf ${seat === HUMAN ? 'me' : ''}`}>
                <span>第 {i + 1} 名</span>
                <span>{s.players[seat].name}</span>
                <b>{s.scores[seat]}</b>
              </div>
            ))}
          </div>
        )}

        <div className="res-actions">
          <button className="btn ghost" onClick={quitGame}>
            返回首页
          </button>
          {canUndo && (
            <button className="btn ghost" onClick={undo} title="回到自己最后一次操作之前">
              悔一手
            </button>
          )}
          <button className="btn ghost" onClick={restartRound} title="同一副牌重新打（分数回滚）">
            重打本局
          </button>
          {gameOver ? (
            <button className="btn primary" onClick={startGame}>
              再来一场
            </button>
          ) : (
            <button className="btn primary" onClick={nextRound}>
              下一局
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
