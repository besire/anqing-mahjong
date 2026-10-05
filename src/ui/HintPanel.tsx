import { useState } from 'react';
import { shantenText } from '../core/analysis';
import { visibleCountsOf, type GameState } from '../core/game';
import { HUMAN, useGame } from '../store/gameStore';
import { Feedback, Lines, OptionsTable, RemainingGrid, ShapeView, WaitValues } from './hint/HintParts';

/** onClose：抽屉模式下关闭抽屉；侧栏模式下（不传）关闭提示功能 */
export function HintPanel({ s, onClose }: { s: GameState; onClose?: () => void }) {
  const hint = useGame((st) => st.hint);
  const hoverKind = useGame((st) => st.hoverKind);
  const lastRecord = useGame((st) => st.lastRecord);
  const records = useGame((st) => st.records);
  const stats = useGame((st) => st.stats);
  const { setHover, toggleHint } = useGame.getState();
  const [showRemain, setShowRemain] = useState(true);

  const roundBest = records.filter((r) => r.grade === 'best').length;
  const lost = records.reduce((a, r) => a + (r.grade === 'back' ? 0 : r.bestTotal - r.chosenTotal), 0);
  const rate = stats.decisions ? Math.round((stats.best / stats.decisions) * 100) : 0;

  return (
    <aside className="hint-panel">
      <header className="hp-head">
        <div className="hp-title">
          牌效助手<small>何切 · 解析</small>
        </div>
        <button className="hp-close" onClick={onClose ?? toggleHint} title={onClose ? '收起' : '关闭提示 (H)'}>
          ✕
        </button>
      </header>

      <div className="hp-body">
        {!hint && <div className="hp-empty">{s.phase === 'roundEnd' ? '本局结束' : '等待中…'}</div>}

        {hint?.type === 'turn' && (
          <>
            <div className="hp-status">
              <span className="hp-shanten">{shantenText(hint.options[0].shanten)}</span>
              <span className="hp-sub">最佳进张 {hint.options[0].total} 张</span>
              {hint.canTsumo && <span className="hp-tsumo">可自摸</span>}
            </div>
            <div className="sec-title">何切推荐</div>
            <OptionsTable
              options={hint.options}
              bestKinds={hint.bestKinds}
              hoverKind={hoverKind}
              onHover={setHover}
            />
            <div className="sec-title">解析</div>
            <Lines lines={hint.lines} />
            <WaitValues values={hint.waitValues} />
            <ShapeView shape={hint.shapeAfter} title="推荐打法后的牌型" />
          </>
        )}

        {hint?.type === 'wait' && (
          <>
            <div className="hp-status">
              <span className="hp-shanten">{shantenText(hint.ukeire.shanten)}</span>
              <span className="hp-sub">进张 {hint.ukeire.total} 张</span>
            </div>
            <Lines lines={hint.lines} />
            <WaitValues values={hint.waitValues} />
            <ShapeView shape={hint.shape} />
          </>
        )}

        {hint?.type === 'claim' && (
          <>
            <div className="hp-status">
              <span className="hp-shanten">{hint.huTotal !== undefined ? '可以胡！' : '叫牌判断'}</span>
            </div>
            <Lines lines={hint.lines} />
          </>
        )}

        {lastRecord && (
          <>
            <div className="sec-title">上一手</div>
            <Feedback rec={lastRecord} />
          </>
        )}

        <div className="sec-title">练习统计</div>
        <div className="hp-stats">
          <div>
            <b>
              {roundBest}/{records.length}
            </b>
            <span>本局最优</span>
          </div>
          <div>
            <b>{lost}</b>
            <span>本局损失进张</span>
          </div>
          <div>
            <b>{rate}%</b>
            <span>累计最优率</span>
          </div>
        </div>

        <div className="sec-title clickable" onClick={() => setShowRemain(!showRemain)}>
          剩余牌（自己视角未见）<small>{showRemain ? '收起 ▲' : '展开 ▼'}</small>
        </div>
        {showRemain && <RemainingGrid visible={visibleCountsOf(s, HUMAN)} />}
      </div>
    </aside>
  );
}
