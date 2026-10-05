import { useMemo, useState } from 'react';
import { shantenText } from '../core/analysis';
import type { GameState } from '../core/game';
import { buildTurnHint, gradeDiscard, GRADE_LABEL, type TurnHint } from '../core/hint';
import { createRng, randomSeed, shuffle } from '../core/rng';
import { DEFAULT_RULES } from '../core/rules';
import { calcShanten } from '../core/shanten';
import { countKinds, kindOf, sortTiles, type Kind, type TileId } from '../core/tiles';
import { useGame } from '../store/gameStore';
import { Lines, OptionsTable, ShapeView, WaitValues } from './hint/HintParts';
import { Tile, type TileMark } from './Tile';

type Mode = 'random' | 'flush';
const DRILL_KEY = 'anqing-mj-drill-v1';

interface DrillStats {
  answered: number;
  best: number;
  streak: number;
  bestStreak: number;
}

function loadStats(): DrillStats {
  try {
    return { answered: 0, best: 0, streak: 0, bestStreak: 0, ...JSON.parse(localStorage.getItem(DRILL_KEY) ?? '{}') };
  } catch {
    return { answered: 0, best: 0, streak: 0, bestStreak: 0 };
  }
}

/** 出题：随机手牌或清一色，向听控制在 1~3 之间（太简单或太乱的跳过） */
function makeHand(mode: Mode): TileId[] {
  const rng = createRng(randomSeed());
  for (let tries = 0; tries < 200; tries++) {
    let pool: TileId[];
    if (mode === 'flush') {
      const suit = Math.floor(rng() * 3);
      pool = Array.from({ length: 36 }, (_, i) => suit * 36 + i);
    } else {
      pool = Array.from({ length: 120 }, (_, i) => i);
    }
    const hand = shuffle(pool, rng).slice(0, 14);
    const s = calcShanten(countKinds(hand), 0, false);
    if (mode === 'flush' ? s >= 1 && s <= 2 : s >= 1 && s <= 3) return sortTiles(hand);
  }
  return sortTiles(shuffle(Array.from({ length: 120 }, (_, i) => i), rng).slice(0, 14));
}

function hintFor(hand: TileId[]): TurnHint {
  const empty = { melds: [], flowers: [], river: [], hand: [] as TileId[] };
  const fake = {
    players: [{ ...empty, hand }, empty, empty, empty],
    rules: DEFAULT_RULES,
    replacementDraw: false,
  } as unknown as GameState;
  return buildTurnHint(fake, 0, { tsumo: false, angang: [], jiagang: [], afterCall: false });
}

export function Drill() {
  const setScreen = useGame((st) => st.setScreen);
  const [mode, setMode] = useState<Mode>('random');
  const [hand, setHand] = useState<TileId[]>(() => makeHand('random'));
  const [answer, setAnswer] = useState<Kind | null>(null);
  const [stats, setStats] = useState<DrillStats>(loadStats);
  const [hover, setHover] = useState<Kind | null>(null);
  const hint = useMemo(() => hintFor(hand), [hand]);

  const next = (m = mode) => {
    setHand(makeHand(m));
    setAnswer(null);
  };

  const choose = (k: Kind) => {
    if (answer !== null) return;
    const g = gradeDiscard(hint.options, k);
    const ok = g.grade === 'best';
    const st: DrillStats = {
      answered: stats.answered + 1,
      best: stats.best + (ok ? 1 : 0),
      streak: ok ? stats.streak + 1 : 0,
      bestStreak: Math.max(stats.bestStreak, ok ? stats.streak + 1 : 0),
    };
    localStorage.setItem(DRILL_KEY, JSON.stringify(st));
    setStats(st);
    setAnswer(k);
  };

  const grade = answer !== null ? gradeDiscard(hint.options, answer) : null;
  const shanten = hint.options[0].shanten; // 打牌后的最佳向听

  return (
    <div className="responsive-page drill-page">
      <div className="drill">
        <div className="drill-top">
          <button className="tb-btn" onClick={() => setScreen('home')}>
            ← 返回
          </button>
          <div className="drill-title">何切练习</div>
          <div className="seg">
            {(
              [
                ['random', '随机手牌'],
                ['flush', '清一色'],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                className={mode === m ? 'on' : ''}
                onClick={() => {
                  setMode(m);
                  next(m);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="drill-stats">
            答题 <b>{stats.answered}</b> · 最优率 <b>{stats.answered ? Math.round((stats.best / stats.answered) * 100) : 0}%</b> · 连对{' '}
            <b>{stats.streak}</b>（最高 {stats.bestStreak}）
          </div>
        </div>

        <div className="drill-q">
          {answer === null ? (
            <>
              选一张打出 <small>（打后最佳为{shantenText(shanten)}；进张按只看到自己手牌计算）</small>
            </>
          ) : (
            <span className={`drill-grade g-${grade!.grade}`}>
              {GRADE_LABEL[grade!.grade]}
              <small>
                {grade!.grade === 'back'
                  ? `打后${shantenText(grade!.chosenShanten)}，最优打法是${shantenText(grade!.bestShanten)}（进张 ${grade!.bestTotal} 张）`
                  : `你的进张 ${grade!.chosenTotal} 张 · 最优 ${grade!.bestTotal} 张`}
              </small>
            </span>
          )}
        </div>

        <div className="drill-hand">
          {hand.map((t) => {
            const k = kindOf(t);
            let mark: TileMark | null = null;
            if (answer !== null) {
              if (hint.bestKinds.includes(k)) mark = 'best';
              else if (k === answer) mark = 'selected';
            } else if (hover === k) mark = 'focus';
            return (
              <Tile
                key={t}
                kind={k}
                size="drill"
                mark={mark}
                className={answer === null ? 'pickable' : k === answer ? 'answered' : ''}
                onPointerUp={() => choose(k)}
                onPointerEnter={() => setHover(k)}
                onPointerLeave={() => setHover(null)}
              />
            );
          })}
        </div>

        {answer !== null && (
          <div className="drill-analysis">
            <div className="da-left">
              <div className="sec-title">全部打法</div>
              <OptionsTable options={hint.options} bestKinds={hint.bestKinds} chosen={answer} hoverKind={hover} onHover={setHover} limit={8} />
            </div>
            <div className="da-right">
              <div className="sec-title">解析</div>
              <Lines lines={hint.lines} />
              <WaitValues values={hint.waitValues} />
              <ShapeView shape={hint.shapeAfter} title="推荐打法后的牌型" />
            </div>
          </div>
        )}

        <div className="drill-actions">
          {answer === null ? (
            <button className="btn ghost" onClick={() => next()}>
              跳过
            </button>
          ) : (
            <button className="btn primary" onClick={() => next()}>
              下一题
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
