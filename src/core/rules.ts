export type DealerRule = 'dealerWinStays' | 'rotateOnWin' | 'winnerDeals';

/** 房规（可在设置里调整） */
export interface Rules {
  /** 允许七对胡牌 */
  qidui: boolean;
  /** 七对额外加花 */
  qiduiBonus: number;
  /** 清一色加花（0 = 不计） */
  qingyiseBonus: number;
  /** 碰碰胡加花（0 = 不计） */
  pengpengBonus: number;
  /** 一炮多响；关闭时按出牌顺序最近的一家截胡 */
  multiRon: boolean;
  /** 抢杠胡（加杠时别家可胡这张） */
  robKong: boolean;
  /** 庄家规则 */
  dealerRule: DealerRule;
  /** 总局数，0 = 不限 */
  totalRounds: number;
}

export const DEFAULT_RULES: Rules = {
  qidui: false,
  qiduiBonus: 0,
  qingyiseBonus: 0,
  pengpengBonus: 0,
  multiRon: false,
  robKong: false,
  dealerRule: 'dealerWinStays',
  totalRounds: 0,
};

export const DEALER_RULE_LABEL: Record<DealerRule, string> = {
  dealerWinStays: '庄胡/荒庄连庄，闲胡下家坐庄',
  rotateOnWin: '有人胡就轮到下家，荒庄连庄',
  winnerDeals: '谁胡谁坐庄，荒庄连庄',
};
