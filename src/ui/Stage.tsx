import type { ReactNode } from 'react';
import { useViewport } from './useViewport';

/** 固定设计分辨率，按窗口等比缩放（类似游戏画布） */
export function Stage({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const v = useViewport();
  const scale = Math.min(v.w / width, v.h / height);
  return (
    <div className="viewport">
      <div className="stage" style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
