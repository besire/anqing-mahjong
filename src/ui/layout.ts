import type { CSSProperties } from 'react';

/** 牌桌布局（设计坐标，整体按窗口等比缩放） */
export interface TableLayout {
  mobile: boolean;
  W: number;
  H: number;
  /** 中央信息框的中心 */
  cx: number;
  cy: number;
  /** 中央信息框边长 */
  box: number;
  /** 牌河离中央框的距离 */
  riverGap: number;
  riverTileW: number;
  /** 各座位牌河每行张数（0 下 1 右 2 上 3 左） */
  riverCols: number[];
  /** 风车式排列：牌河从中央框的角开始，避免宽牌河互相碰撞 */
  pinwheel: boolean;
  /** 对手手牌离中心的距离 */
  handDist: number[];
}

export const DESKTOP_LAYOUT: TableLayout = {
  mobile: false,
  W: 1200,
  H: 900,
  cx: 600,
  cy: 410,
  box: 236,
  riverGap: 10,
  riverTileW: 36,
  riverCols: [6, 6, 6, 6],
  pinwheel: false,
  handDist: [0, 492, 346, 492],
};

/** 手机横屏：更宽的画布（约 2.17:1），手牌更大 */
export const MOBILE_LAYOUT: TableLayout = {
  mobile: true,
  W: 1560,
  H: 720,
  cx: 780,
  cy: 270,
  box: 176,
  riverGap: 6,
  riverTileW: 38,
  riverCols: [9, 6, 9, 6],
  pinwheel: true,
  handDist: [0, 470, 216, 470],
};

export const PANEL_W = 390;

export function tableStyle(L: TableLayout): CSSProperties {
  return {
    width: L.W,
    height: L.H,
    ['--cx' as string]: `${L.cx}px`,
    ['--cy' as string]: `${L.cy}px`,
    ['--box' as string]: `${L.box}px`,
  };
}

export function riverOffset(L: TableLayout, seat: number) {
  const cols = L.riverCols[seat];
  const left = L.pinwheel ? -L.box / 2 : -(cols * (L.riverTileW + 1) - 1) / 2;
  return { cols, left, top: L.box / 2 + L.riverGap };
}
