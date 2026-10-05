import { createPortal } from 'react-dom';
import { shantenText } from '../core/analysis';
import type { GameState } from '../core/game';
import { kindOf } from '../core/tiles';
import type { ClaimAction } from '../core/types';
import { useGame } from '../store/gameStore';
import { HintPanel } from './HintPanel';
import { MiniTiles } from './Tile';

const ACTION_NAME: Record<ClaimAction['type'], string> = { hu: '胡', gang: '杠', peng: '碰', chi: '吃', pass: '过' };

/**
 * 窄屏/手机上的简要提示条：一句话说清"打哪张、几向听、进张多少"，点开看完整解析。
 * 触屏上先点选一张牌时，这里会显示打这张的评价（相当于出牌前预览）。
 */
export function HintStrip({ onOpen }: { onOpen: () => void }) {
  const hint = useGame((st) => st.hint);
  const selected = useGame((st) => st.selected);
  if (!hint) return null;

  let tone = 'info';
  let body: React.ReactNode;
  if (hint.type === 'turn') {
    const best = hint.options[0];
    const sel = selected !== null ? hint.options.find((o) => o.kind === kindOf(selected)) : undefined;
    if (sel) {
      const isBest = hint.bestKinds.includes(sel.kind);
      const back = sel.shanten > best.shanten;
      tone = isBest ? 'good' : back ? 'bad' : 'warn';
      body = (
        <>
          打 <MiniTiles kinds={[sel.kind]} />
          {back ? ' 会退向听' : ` 进张 ${sel.total}`}
          {isBest ? ' · 最优 ✓' : (
            <>
              {' '}· 最优 <MiniTiles kinds={hint.bestKinds.slice(0, 2)} /> {best.total}
            </>
          )}
        </>
      );
    } else if (hint.canTsumo) {
      tone = 'good';
      body = <>可以自摸！{hint.tsumoTotal} 花 × 3 家</>;
    } else {
      tone = 'good';
      body = (
        <>
          {shantenText(best.shanten)} · 打 <MiniTiles kinds={hint.bestKinds.slice(0, 3)} /> · 进张 {best.total}
        </>
      );
    }
  } else if (hint.type === 'wait') {
    const u = hint.ukeire;
    body =
      u.shanten === 0 ? (
        <>
          听 <MiniTiles kinds={u.waits.slice(0, 4).map((w) => w.kind)} />
          {u.waits.length > 4 ? '…' : ''} 剩 {u.total} 张
        </>
      ) : (
        <>
          {shantenText(u.shanten)} · 进张 {u.total} 张
        </>
      );
  } else {
    const rec = hint.analysis.recommend;
    tone = rec.type === 'pass' ? 'warn' : 'good';
    body = (
      <>
        建议：{ACTION_NAME[rec.type]}
        {rec.type === 'chi' && <MiniTiles kinds={rec.kinds} />}
        {hint.huTotal !== undefined && ` · ${hint.huTotal} 花`}
      </>
    );
  }

  return (
    <button className={`hint-strip hs-${tone}`} onClick={onOpen}>
      <span className="hs-body">{body}</span>
      <span className="hs-more">解析 ›</span>
    </button>
  );
}

/** 抽屉式完整提示面板（不随牌桌缩放，文字保持可读大小） */
export function HintDrawer({ s, onClose }: { s: GameState; onClose: () => void }) {
  return createPortal(
    <div className="drawer-mask" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <HintPanel s={s} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}
