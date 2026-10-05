/**
 * 对局 store：持有引擎实例，驱动机器人行动，向界面提供快照与提示
 */
import { create } from 'zustand';
import { botClaim, botTurn } from '../core/ai';
import { analyzeDiscards, remainingFromVisible } from '../core/analysis';
import { MahjongGame, visibleCountsOf, type GameState } from '../core/game';
import {
  buildClaimHint,
  buildTurnHint,
  buildWaitHint,
  gradeDiscard,
  type DiscardRecord,
  type Hint,
} from '../core/hint';
import { DEFAULT_RULES, type Rules } from '../core/rules';
import { countKinds, kindOf, type Kind, type TileId } from '../core/tiles';
import { SEATS, type BotLevel, type ClaimAction, type Seat } from '../core/types';
import { setSoundEnabled, sfx } from '../ui/sound';

export const HUMAN: Seat = 0;
export const BOT_NAMES = ['小安', '老庆', '阿皖'];

export type Speed = 'slow' | 'normal' | 'fast';

export interface Settings {
  hintEnabled: boolean;
  /** 手牌上显示进张数 */
  tileBadges: boolean;
  speed: Speed;
  sound: boolean;
  /** 下家、对家、上家的难度 */
  levels: BotLevel[];
  rules: Rules;
  /** 点一下选中、再点一下打出（防误触） */
  confirmDiscard: boolean;
}

export interface SessionStats {
  decisions: number;
  best: number;
  good: number;
  loss: number;
  back: number;
  /** 累计损失的进张数 */
  lost: number;
  rounds: number;
  wins: number;
  dealIns: number;
}

export interface Effect {
  id: number;
  seat: Seat;
  text: string;
  variant: 'call' | 'win' | 'flower';
}

const DEFAULT_SETTINGS: Settings = {
  hintEnabled: true,
  tileBadges: true,
  speed: 'normal',
  sound: true,
  levels: ['normal', 'normal', 'normal'],
  rules: DEFAULT_RULES,
  confirmDiscard: false,
};

const EMPTY_STATS: SessionStats = {
  decisions: 0,
  best: 0,
  good: 0,
  loss: 0,
  back: 0,
  lost: 0,
  rounds: 0,
  wins: 0,
  dealIns: 0,
};

const SETTINGS_KEY = 'anqing-mj-settings-v1';
const STATS_KEY = 'anqing-mj-stats-v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    if (typeof fallback === 'object' && fallback && !Array.isArray(fallback)) {
      const merged = { ...fallback, ...v };
      if ('rules' in (fallback as object)) (merged as Settings).rules = { ...DEFAULT_RULES, ...v.rules };
      return merged;
    }
    return v;
  } catch {
    return fallback;
  }
}

function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

const DELAYS: Record<Speed, { turn: number; claim: number; afterCall: number; result: number }> = {
  slow: { turn: 1100, claim: 600, afterCall: 1100, result: 1600 },
  normal: { turn: 650, claim: 380, afterCall: 800, result: 1300 },
  fast: { turn: 280, claim: 160, afterCall: 450, result: 900 },
};

export type Screen = 'home' | 'game' | 'drill';

interface Store {
  screen: Screen;
  settings: Settings;
  view: GameState | null;
  hint: Hint | null;
  records: DiscardRecord[];
  lastRecord: DiscardRecord | null;
  stats: SessionStats;
  effects: Effect[];
  showResult: boolean;
  selected: TileId | null;
  /** 鼠标悬停的牌种（手牌与提示面板联动） */
  hoverKind: Kind | null;
  panel: null | 'settings' | 'rules' | 'menu';
  /** 可以悔牌（回到自己上一次操作之前） */
  canUndo: boolean;

  setScreen(s: Screen): void;
  setPanel(p: Store['panel']): void;
  updateSettings(p: Partial<Settings>): void;
  updateRules(p: Partial<Rules>): void;
  toggleHint(): void;
  resetStats(): void;

  startGame(): void;
  nextRound(): void;
  restartRound(): void;
  quitGame(): void;

  select(tile: TileId | null): void;
  setHover(k: Kind | null): void;
  discard(tile: TileId): void;
  tsumo(): void;
  kong(type: 'angang' | 'jiagang', kind: Kind): void;
  claim(a: ClaimAction): void;
  removeEffect(id: number): void;
  undo(): void;
}

interface UndoPoint {
  state: GameState;
  records: DiscardRecord[];
  lastRecord: DiscardRecord | null;
  stats: SessionStats;
}

let game: MahjongGame | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let lastEventId = 0;
let effectSeq = 0;
let undoPoint: UndoPoint | null = null;
const cloneState = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

export const useGame = create<Store>((set, get) => {
  const settings = load(SETTINGS_KEY, DEFAULT_SETTINGS);
  setSoundEnabled(settings.sound);

  const delay = () => DELAYS[get().settings.speed];

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = (fn: () => void, ms: number) => {
    clearTimer();
    const g = generation;
    timer = setTimeout(() => {
      timer = null;
      if (g === generation) fn();
    }, ms);
  };

  /** 处理新事件：音效 + 吃碰杠胡特效 */
  const processEvents = () => {
    if (!game) return;
    const fresh = game.s.events.filter((e) => e.id > lastEventId);
    if (!fresh.length) return;
    lastEventId = fresh[fresh.length - 1].id;
    const effects: Effect[] = [];
    for (const e of fresh) {
      switch (e.type) {
        case 'discard':
          sfx.discard();
          break;
        case 'draw':
          if (e.seat === HUMAN) sfx.draw();
          break;
        case 'flower':
          // 起手补花不放特效和音效
          if (game.s.turnCount > 0) {
            effects.push({ id: ++effectSeq, seat: e.seat, text: '补花', variant: 'flower' });
            sfx.flower();
          }
          break;
        case 'call':
          effects.push({
            id: ++effectSeq,
            seat: e.seat,
            text: e.call === 'chi' ? '吃' : e.call === 'peng' ? '碰' : '杠',
            variant: 'call',
          });
          sfx.call();
          break;
        case 'win':
          for (const seat of e.seats)
            effects.push({ id: ++effectSeq, seat, text: e.zimo ? '自摸' : '胡', variant: 'win' });
          if (e.seats.includes(HUMAN)) sfx.win();
          else sfx.lose();
          break;
      }
    }
    if (effects.length) set((st) => ({ effects: [...st.effects, ...effects].slice(-6) }));
  };

  const refreshHint = () => {
    if (!game || !get().settings.hintEnabled) {
      set({ hint: null });
      return;
    }
    const s = game.s;
    const d = s.decision;
    if (s.phase !== 'playing' || !d) {
      set({ hint: null });
      return;
    }
    if (d.type === 'turn' && d.seat === HUMAN) set({ hint: buildTurnHint(s, HUMAN, d.options) });
    else if (d.type === 'claim' && d.options[HUMAN] && !d.responses[HUMAN]) set({ hint: buildClaimHint(s, HUMAN) });
    else set({ hint: buildWaitHint(s, HUMAN) });
  };

  const sync = () => {
    if (!game) return;
    set({ view: game.snapshot() });
    processEvents();
    refreshHint();
  };

  const onRoundEnd = () => {
    if (!game) return;
    const res = game.s.result!;
    const st = get().stats;
    const stats: SessionStats = {
      ...st,
      rounds: st.rounds + 1,
      wins: st.wins + (res.wins.some((w) => w.seat === HUMAN) ? 1 : 0),
      dealIns: st.dealIns + (res.wins.some((w) => w.from === HUMAN) ? 1 : 0),
    };
    save(STATS_KEY, stats);
    set({ stats });
    schedule(() => set({ showResult: true }), delay().result);
  };

  /** 推进对局：轮到机器人就排程，轮到玩家就停下等待 */
  const advance = () => {
    if (!game) return;
    sync();
    const s = game.s;
    if (s.phase === 'roundEnd') {
      onRoundEnd();
      return;
    }
    const d = s.decision;
    if (!d) return;
    if (d.type === 'turn') {
      const p = s.players[d.seat];
      if (p.isHuman) return;
      const lastCall = s.events[s.events.length - 1];
      const wait = lastCall?.type === 'call' && lastCall.seat === d.seat ? delay().afterCall : delay().turn;
      schedule(() => {
        if (!game) return;
        const dd = game.s.decision;
        if (!dd || dd.type !== 'turn' || dd.seat !== d.seat) return;
        game.act(d.seat, botTurn(game.view(d.seat), dd.options, p.level));
        advance();
      }, wait);
      return;
    }
    // 吃碰杠胡的回应：机器人立即决定；玩家有选项则等待
    const humanPending = !!d.options[HUMAN] && !d.responses[HUMAN];
    const botsPending = SEATS.filter((q) => q !== HUMAN && d.options[q] && !d.responses[q]);
    if (!botsPending.length) return; // 只剩玩家要决定
    schedule(() => {
      if (!game || game.s.decision !== d) return;
      for (const q of botsPending) {
        const p = game.s.players[q];
        const a = d.robKong ? ({ type: 'hu' } as ClaimAction) : botClaim(game.view(q), d.tile, d.options[q]!, p.level);
        game.claim(q, a);
        if (game.s.decision !== d) break;
      }
      advance();
    }, humanPending ? 0 : delay().claim);
  };

  const human = () => game?.s.players[HUMAN];

  /** 玩家每次操作前存一个还原点 */
  const savePoint = () => {
    if (!game) return;
    const { records, lastRecord, stats } = get();
    undoPoint = { state: cloneState(game.s), records, lastRecord, stats };
    set({ canUndo: true });
  };

  const resetUndo = () => {
    undoPoint = null;
    set({ canUndo: false });
  };

  return {
    screen: 'home',
    settings,
    view: null,
    hint: null,
    records: [],
    lastRecord: null,
    stats: load(STATS_KEY, EMPTY_STATS),
    effects: [],
    showResult: false,
    selected: null,
    hoverKind: null,
    panel: null,
    canUndo: false,

    setScreen: (screen) => set({ screen }),
    setPanel: (panel) => set({ panel }),

    updateSettings: (p) => {
      const settings = { ...get().settings, ...p };
      save(SETTINGS_KEY, settings);
      setSoundEnabled(settings.sound);
      set({ settings });
      if (game) {
        // 难度即时生效
        settings.levels.forEach((lv, i) => (game!.s.players[i + 1].level = lv));
        if ('hintEnabled' in p) refreshHint();
        set({ view: game.snapshot() });
      }
    },

    updateRules: (p) => {
      const rules = { ...get().settings.rules, ...p };
      get().updateSettings({ rules });
    },

    toggleHint: () => get().updateSettings({ hintEnabled: !get().settings.hintEnabled }),

    resetStats: () => {
      save(STATS_KEY, EMPTY_STATS);
      set({ stats: EMPTY_STATS });
    },

    startGame: () => {
      generation++;
      clearTimer();
      const { settings } = get();
      game = new MahjongGame(
        [
          { name: '我', isHuman: true, level: 'normal' },
          ...settings.levels.map((level, i) => ({ name: BOT_NAMES[i], isHuman: false, level })),
        ],
        { ...settings.rules },
        { dealer: Math.floor(Math.random() * 4) as Seat },
      );
      lastEventId = 0;
      resetUndo();
      game.startRound();
      set({ screen: 'game', records: [], lastRecord: null, effects: [], showResult: false, selected: null, panel: null });
      advance();
    },

    nextRound: () => {
      if (!game) return;
      generation++;
      clearTimer();
      game.s.rules = { ...get().settings.rules };
      lastEventId = 0;
      resetUndo();
      game.nextRound();
      set({ records: [], lastRecord: null, effects: [], showResult: false, selected: null });
      advance();
    },

    restartRound: () => {
      if (!game) return;
      generation++;
      clearTimer();
      lastEventId = 0;
      resetUndo();
      game.restartRound();
      set({ records: [], lastRecord: null, effects: [], showResult: false, selected: null, panel: null });
      advance();
    },

    quitGame: () => {
      generation++;
      clearTimer();
      game = null;
      resetUndo();
      set({ screen: 'home', view: null, hint: null, showResult: false, panel: null, effects: [] });
    },

    select: (tile) => set({ selected: tile }),
    setHover: (k) => {
      if (get().hoverKind !== k) set({ hoverKind: k });
    },

    discard: (tile) => {
      if (!game) return;
      const s = game.s;
      const d = s.decision;
      if (s.phase !== 'playing' || !d || d.type !== 'turn' || d.seat !== HUMAN) return;
      const p = human()!;
      if (!p.hand.includes(tile)) return;

      savePoint();
      // 记录这一手的牌效评价（提示关闭时也记录，便于复盘）
      const hint = get().hint;
      const counts = countKinds(p.hand);
      const options =
        hint?.type === 'turn'
          ? hint.options
          : analyzeDiscards(
              counts,
              p.melds.length,
              remainingFromVisible(visibleCountsOf(s, HUMAN)),
              s.rules.qidui && p.melds.length === 0,
            );
      const g = gradeDiscard(options, kindOf(tile));
      const rec: DiscardRecord = {
        ...g,
        round: s.roundNo,
        turn: p.river.length + 1,
        hand: p.hand.map(kindOf).sort((a, b) => a - b),
      };
      const st = get().stats;
      const stats: SessionStats = {
        ...st,
        decisions: st.decisions + 1,
        [g.grade]: st[g.grade] + 1,
        lost: st.lost + (g.grade === 'back' ? 0 : Math.max(0, g.bestTotal - g.chosenTotal)),
      };
      save(STATS_KEY, stats);
      set((st2) => ({ records: [...st2.records, rec], lastRecord: rec, stats, selected: null }));

      game.act(HUMAN, { type: 'discard', tile });
      advance();
    },

    tsumo: () => {
      const d = game?.s.decision;
      if (!game || !d || d.type !== 'turn' || d.seat !== HUMAN || !d.options.tsumo) return;
      game.act(HUMAN, { type: 'tsumo' });
      advance();
    },

    kong: (type, kind) => {
      const d = game?.s.decision;
      if (!game || !d || d.type !== 'turn' || d.seat !== HUMAN) return;
      savePoint();
      game.act(HUMAN, { type, kind });
      set({ selected: null });
      advance();
    },

    claim: (a) => {
      const d = game?.s.decision;
      if (!game || !d || d.type !== 'claim' || !d.options[HUMAN] || d.responses[HUMAN]) return;
      savePoint();
      game.claim(HUMAN, a);
      advance();
    },

    removeEffect: (id) => set((st) => ({ effects: st.effects.filter((e) => e.id !== id) })),

    undo: () => {
      if (!game || !undoPoint) return;
      generation++;
      clearTimer();
      const p = undoPoint;
      game.s = cloneState(p.state);
      lastEventId = game.s.eventSeq;
      // 统计一并回退（包括这次操作导致的局结束）
      const stats = p.stats;
      save(STATS_KEY, stats);
      undoPoint = null;
      set({
        records: p.records,
        lastRecord: p.lastRecord,
        stats,
        canUndo: false,
        showResult: false,
        effects: [],
        selected: null,
        panel: null,
      });
      advance();
    },
  };
});

export const isGameOver = () => game?.isGameOver ?? false;
