import { useEffect, useState } from 'react';
import type { GameState } from '../../core/game';
import { kindOf, type Kind } from '../../core/tiles';
import type { ClaimAction } from '../../core/types';
import { HUMAN, useGame } from '../../store/gameStore';
import { MiniTiles } from '../Tile';

type Btn = {
  key: string;
  label: string;
  tone: 'hu' | 'gang' | 'peng' | 'chi' | 'pass';
  onClick: () => void;
  sub?: Kind[];
  recommended?: boolean;
};

export function ActionBar({ s }: { s: GameState }) {
  const hint = useGame((st) => st.hint);
  const { claim, tsumo, kong } = useGame.getState();
  const [chiOpen, setChiOpen] = useState(false);
  const d = s.decision;

  useEffect(() => setChiOpen(false), [d]);

  const btns: Btn[] = [];
  if (s.phase === 'playing' && d?.type === 'claim' && d.options[HUMAN] && !d.responses[HUMAN]) {
    const o = d.options[HUMAN]!;
    const rec = hint?.type === 'claim' ? hint.analysis.recommend : null;
    const isRec = (a: ClaimAction) =>
      !!rec && rec.type === a.type && (a.type !== 'chi' || (rec.type === 'chi' && rec.kinds.join() === a.kinds.join()));
    const k = kindOf(d.tile);
    if (o.hu) btns.push({ key: 'hu', label: '胡', tone: 'hu', onClick: () => claim({ type: 'hu' }), recommended: isRec({ type: 'hu' }) });
    if (o.gang) btns.push({ key: 'gang', label: '杠', tone: 'gang', onClick: () => claim({ type: 'gang' }), recommended: isRec({ type: 'gang' }) });
    if (o.peng) btns.push({ key: 'peng', label: '碰', tone: 'peng', onClick: () => claim({ type: 'peng' }), recommended: isRec({ type: 'peng' }) });
    if (o.chi.length) {
      if (chiOpen && o.chi.length > 1) {
        for (const pair of o.chi) {
          const a: ClaimAction = { type: 'chi', kinds: pair };
          btns.push({
            key: `chi-${pair.join()}`,
            label: '吃',
            tone: 'chi',
            sub: [...pair, k].sort((x, y) => x - y),
            onClick: () => claim(a),
            recommended: isRec(a),
          });
        }
      } else {
        btns.push({
          key: 'chi',
          label: '吃',
          tone: 'chi',
          sub: o.chi.length === 1 ? [...o.chi[0], k].sort((x, y) => x - y) : undefined,
          onClick: () => (o.chi.length === 1 ? claim({ type: 'chi', kinds: o.chi[0] }) : setChiOpen(true)),
          recommended: rec?.type === 'chi',
        });
      }
    }
    btns.push({ key: 'pass', label: '过', tone: 'pass', onClick: () => claim({ type: 'pass' }), recommended: rec?.type === 'pass' });
  } else if (s.phase === 'playing' && d?.type === 'turn' && d.seat === HUMAN) {
    if (d.options.tsumo) btns.push({ key: 'tsumo', label: '自摸', tone: 'hu', onClick: tsumo, recommended: !!hint });
    for (const k of d.options.angang)
      btns.push({ key: `ag-${k}`, label: '暗杠', tone: 'gang', sub: [k], onClick: () => kong('angang', k) });
    for (const k of d.options.jiagang)
      btns.push({ key: `jg-${k}`, label: '加杠', tone: 'gang', sub: [k], onClick: () => kong('jiagang', k) });
  }

  // 键盘：空格 = 过，回车 = 胡/自摸
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || useGame.getState().panel) return;
      if (e.code === 'Space') {
        const pass = btns.find((b) => b.key === 'pass');
        if (pass) {
          e.preventDefault();
          pass.onClick();
        }
      } else if (e.code === 'Enter') {
        const hu = btns.find((b) => b.tone === 'hu');
        if (hu) {
          e.preventDefault();
          hu.onClick();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!btns.length) return null;
  return (
    <div className="action-bar">
      {btns.map((b) => (
        <button key={b.key} className={`act-btn act-${b.tone} ${b.recommended ? 'recommended' : ''}`} onClick={b.onClick}>
          <span className="act-label">{b.label}</span>
          {b.sub && <MiniTiles kinds={b.sub} />}
          {b.recommended && <span className="act-rec">推荐</span>}
        </button>
      ))}
    </div>
  );
}
