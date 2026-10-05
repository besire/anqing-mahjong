import { useEffect, useState } from 'react';
import { SEATS } from '../core/types';
import { useGame } from '../store/gameStore';
import { HintPanel } from './HintPanel';
import { HintDrawer, HintStrip } from './HintStrip';
import { DESKTOP_LAYOUT, MOBILE_LAYOUT, PANEL_W, tableStyle } from './layout';
import { MenuModal, RulesModal, SettingsModal } from './Modals';
import { ResultModal } from './ResultModal';
import { RotateOverlay } from './RotateOverlay';
import { Stage } from './Stage';
import { useViewport } from './useViewport';
import { ActionBar } from './table/ActionBar';
import { CenterBox } from './table/CenterBox';
import { Effects } from './table/Effects';
import { MyHand } from './table/MyHand';
import { Plate } from './table/Plate';
import { SeatArea } from './table/SeatArea';

export function GameScreen() {
  const s = useGame((st) => st.view);
  const hintEnabled = useGame((st) => st.settings.hintEnabled);
  const showResult = useGame((st) => st.showResult);
  const panel = useGame((st) => st.panel);
  const canUndo = useGame((st) => st.canUndo);
  const { toggleHint, setPanel, select, undo } = useGame.getState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const v = useViewport();
  const L = v.phone ? MOBILE_LAYOUT : DESKTOP_LAYOUT;
  // 手机和较窄的平板使用抽屉；桌面保留完整侧栏。
  const sidePanel = !v.phone && v.w >= 1200 && v.w / v.h >= 1.45;
  const rotate = v.phone && v.portrait;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        if (drawerOpen) setDrawerOpen(false);
        else setPanel(useGame.getState().panel ? null : 'menu');
        return;
      }
      if (useGame.getState().panel || showResult) return;
      if (e.key === 'h' || e.key === 'H') toggleHint();
      if ((e.key === 'z' || e.key === 'Z') && !e.altKey) undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleHint, setPanel, undo, drawerOpen, showResult]);

  if (!s) return null;
  const winTile = s.result?.wins.find((w) => !w.zimo)?.winTile ?? null;

  return (
    <>
      <Stage width={L.W + (hintEnabled && sidePanel ? PANEL_W : 0)} height={L.H}>
        <div
          className={`table ${L.mobile ? 'table-mobile' : ''}`}
          style={tableStyle(L)}
          onPointerDown={(e) => e.target === e.currentTarget && select(null)}
        >
          <div className="table-frame" />
          <CenterBox s={s} />
          {SEATS.map((seat) => <SeatArea key={seat} s={s} seat={seat} winTile={winTile} L={L} />)}
          {SEATS.map((seat) => <Plate key={seat} s={s} seat={seat} />)}
          <MyHand s={s} />
          <ActionBar s={s} />
          <Effects />

          <div className="top-bar">
            <button className="tb-btn" onClick={() => setPanel('menu')} title="菜单 (Esc)">☰ 菜单</button>
            <button
              className={`tb-btn hint-toggle ${hintEnabled ? 'on' : ''}`}
              onClick={() => { toggleHint(); setDrawerOpen(false); }}
              title="快捷键 H"
            >
              <span className="dot" />提示 {hintEnabled ? '开' : '关'}
            </button>
            {!L.mobile && <button className="tb-btn" onClick={() => setPanel('settings')}>⚙ 设置</button>}
            <button className="tb-btn" onClick={undo} disabled={!canUndo} title="撤销自己上一次操作（Z）">↶ 悔牌</button>
          </div>
          {hintEnabled && !sidePanel && <HintStrip onOpen={() => setDrawerOpen(true)} />}
          {L.mobile && !hintEnabled && <div className="touch-guide">点选后再点出牌 · 上滑直接打出</div>}
        </div>
        {hintEnabled && sidePanel && <HintPanel s={s} />}
      </Stage>

      {hintEnabled && !sidePanel && drawerOpen && !rotate && <HintDrawer s={s} onClose={() => setDrawerOpen(false)} />}
      {showResult && s.result && !rotate && <ResultModal s={s} />}
      {panel === 'menu' && <MenuModal onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsModal onClose={() => setPanel(null)} />}
      {panel === 'rules' && <RulesModal onClose={() => setPanel(null)} />}
      {rotate && <RotateOverlay />}
    </>
  );
}
