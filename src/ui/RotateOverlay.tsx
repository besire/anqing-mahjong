import { useGame } from '../store/gameStore';
import { canFullscreen, enterFullscreen } from './fullscreen';

/** 手机竖屏时提示横过来（牌桌只做了横屏布局，和雀魂一样） */
export function RotateOverlay() {
  const quitGame = useGame((st) => st.quitGame);
  return (
    <div className="rotate-overlay">
      <div className="ro-phone">
        <div className="ro-screen" />
      </div>
      <div className="ro-text">请把手机横过来</div>
      <div className="ro-sub">牌桌为横屏设计，横屏时牌更大、更好点</div>
      <div className="ro-actions">
        {canFullscreen() && (
          <button className="btn primary" onClick={() => enterFullscreen(true)}>
            全屏并横屏
          </button>
        )}
        <button className="btn ghost" onClick={quitGame}>
          返回首页
        </button>
      </div>
    </div>
  );
}
