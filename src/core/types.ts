import type { Kind, TileId } from './tiles';

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: Seat[] = [0, 1, 2, 3];
export const nextSeat = (s: Seat, n = 1): Seat => (((s + n) % 4) + 4) % 4 as Seat;

export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  easy: '新手',
  normal: '中级',
  hard: '高手',
};

export type MeldType = 'chi' | 'peng' | 'minggang' | 'angang' | 'jiagang';
export const isGangType = (t: MeldType) => t === 'minggang' || t === 'angang' || t === 'jiagang';

export interface Meld {
  type: MeldType;
  /** 刻/杠为该牌种；吃为最小的那张 */
  kind: Kind;
  tiles: TileId[];
  /** 被吃/碰/杠的来源座位 */
  from?: Seat;
  /** 被叫的那张牌 */
  claimed?: TileId;
}

export interface RiverTile {
  id: TileId;
  /** 被别人吃碰杠拿走 */
  claimed: boolean;
  /** 摸切（打的是刚摸到的牌） */
  tsumogiri: boolean;
}

export interface PlayerState {
  seat: Seat;
  name: string;
  isHuman: boolean;
  level: BotLevel;
  hand: TileId[];
  melds: Meld[];
  flowers: TileId[];
  river: RiverTile[];
  /** 刚摸到、还在手里的牌（显示在最右边） */
  drawn: TileId | null;
}

export type TurnAction =
  | { type: 'discard'; tile: TileId }
  | { type: 'tsumo' }
  | { type: 'angang'; kind: Kind }
  | { type: 'jiagang'; kind: Kind };

export type ClaimAction =
  | { type: 'pass' }
  | { type: 'hu' }
  | { type: 'gang' }
  | { type: 'peng' }
  | { type: 'chi'; kinds: [Kind, Kind] };

export interface TurnOptions {
  tsumo: boolean;
  angang: Kind[];
  jiagang: Kind[];
  /** 吃/碰之后的出牌：只能打牌 */
  afterCall: boolean;
}

export interface ClaimOptions {
  hu: boolean;
  gang: boolean;
  peng: boolean;
  /** 可用来吃的两张手牌牌种 */
  chi: [Kind, Kind][];
}

export type Decision =
  | { type: 'turn'; seat: Seat; options: TurnOptions }
  | {
      type: 'claim';
      from: Seat;
      tile: TileId;
      /** 抢杠：只能选胡/过 */
      robKong: boolean;
      options: (ClaimOptions | null)[];
      responses: (ClaimAction | null)[];
    };

export interface ScoreItem {
  name: string;
  value: number;
}

export interface WinInfo {
  seat: Seat;
  /** 点炮者；自摸为 null */
  from: Seat | null;
  winTile: TileId;
  zimo: boolean;
  gangkai: boolean;
  robKong: boolean;
  items: ScoreItem[];
  total: number;
  /** 胡牌时的手牌（不含胡的那张） */
  hand: TileId[];
  melds: Meld[];
  flowers: TileId[];
}

export interface RoundResult {
  type: 'win' | 'draw';
  wins: WinInfo[];
  deltas: number[];
  /** 本局结束时各家手牌（亮牌） */
  hands: TileId[][];
  nextDealer: Seat;
}

export type GameEvent =
  | { id: number; type: 'deal' }
  | { id: number; type: 'draw'; seat: Seat; tile: TileId; replacement: boolean }
  | { id: number; type: 'flower'; seat: Seat; tile: TileId }
  | { id: number; type: 'discard'; seat: Seat; tile: TileId; tsumogiri: boolean }
  | {
      id: number;
      type: 'call';
      seat: Seat;
      call: 'chi' | 'peng' | 'minggang' | 'angang' | 'jiagang';
      tiles: TileId[];
      from?: Seat;
    }
  | { id: number; type: 'win'; seats: Seat[]; zimo: boolean; from: Seat | null }
  | { id: number; type: 'exhausted' };

export type GameEventInput = GameEvent extends infer E ? (E extends { id: number } ? Omit<E, 'id'> : never) : never;
