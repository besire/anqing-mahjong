/** 全屏 + 横屏锁定（Android Chrome 等支持；iPhone Safari 不支持网页全屏，可"添加到主屏幕"） */
export function canFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && !!document.fullscreenEnabled;
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export async function enterFullscreen(landscape = true) {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (landscape) {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.('landscape').catch(() => undefined);
    }
  } catch {
    /* 用户拒绝或不支持 */
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

/** 是否是从主屏幕图标启动（PWA） */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
