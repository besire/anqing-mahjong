import { useEffect, useState } from 'react';

export interface ViewportInfo {
  w: number;
  h: number;
  /** 手机（短边 < 560）：牌桌使用紧凑的横屏布局 */
  phone: boolean;
  portrait: boolean;
  /** 没有鼠标悬停的触屏设备 */
  touch: boolean;
}

function read(): ViewportInfo {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    w,
    h,
    phone: Math.min(w, h) < 560,
    portrait: h > w,
    touch: window.matchMedia?.('(hover: none)').matches ?? false,
  };
}

export function useViewport(): ViewportInfo {
  const [v, setV] = useState(read);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setV(read()));
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return v;
}
