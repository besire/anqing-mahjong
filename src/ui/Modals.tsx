import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DEALER_RULE_LABEL, type DealerRule } from '../core/rules';
import { BOT_LEVEL_LABEL, type BotLevel } from '../core/types';
import { BOT_NAMES, useGame, type Speed } from '../store/gameStore';
import { canFullscreen, enterFullscreen, exitFullscreen, isFullscreen } from './fullscreen';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  // 渲染到 body：不随牌桌缩放，手机上文字也保持可读
  return createPortal(
    <div className="modal-mask" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <header className="modal-head">
          <span>{title}</span>
          <button className="hp-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value} />;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-ctrl">{children}</div>
    </div>
  );
}

const LEVELS: [BotLevel, string][] = (['easy', 'normal', 'hard'] as BotLevel[]).map((l) => [l, BOT_LEVEL_LABEL[l]]);
const SEAT_NAMES = ['下家', '对家', '上家'];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useGame((st) => st.settings);
  const { updateSettings, updateRules, resetStats } = useGame.getState();
  const r = settings.rules;
  const setLevel = (i: number, lv: BotLevel) => {
    const levels = settings.levels.slice();
    levels[i] = lv;
    updateSettings({ levels });
  };
  return (
    <Modal title="设置" onClose={onClose} wide>
      <div className="set-cols">
        <section>
          <h4>对手</h4>
          <Row label="一键设置">
            <Seg<BotLevel | 'mix'>
              value={settings.levels.every((l) => l === settings.levels[0]) ? settings.levels[0] : 'mix'}
              options={[...LEVELS, ['mix', '混合']]}
              onChange={(v) => updateSettings({ levels: v === 'mix' ? ['easy', 'normal', 'hard'] : [v, v, v] })}
            />
          </Row>
          {SEAT_NAMES.map((name, i) => (
            <Row key={i} label={`${name} · ${BOT_NAMES[i]}`}>
              <Seg value={settings.levels[i]} options={LEVELS} onChange={(v) => setLevel(i, v)} />
            </Row>
          ))}
          <Row label="出牌速度">
            <Seg<Speed>
              value={settings.speed}
              options={[
                ['slow', '慢'],
                ['normal', '中'],
                ['fast', '快'],
              ]}
              onChange={(speed) => updateSettings({ speed })}
            />
          </Row>

          <h4>提示与操作</h4>
          <Row label="何切提示" hint="快捷键 H">
            <Switch value={settings.hintEnabled} onChange={(hintEnabled) => updateSettings({ hintEnabled })} />
          </Row>
          <Row label="手牌显示进张数" hint="提示开启时">
            <Switch value={settings.tileBadges} onChange={(tileBadges) => updateSettings({ tileBadges })} />
          </Row>
          <Row label="点两次出牌" hint="防误触；触屏默认开启">
            <Switch value={settings.confirmDiscard} onChange={(confirmDiscard) => updateSettings({ confirmDiscard })} />
          </Row>
          <Row label="音效">
            <Switch value={settings.sound} onChange={(sound) => updateSettings({ sound })} />
          </Row>
          <Row label="练习统计">
            <button className="btn small ghost" onClick={resetStats}>
              清空
            </button>
          </Row>
        </section>

        <section>
          <h4>房规（下一局生效）</h4>
          <Row label="七对" hint="门清七个对子可胡">
            <Switch value={r.qidui} onChange={(qidui) => updateRules({ qidui })} />
          </Row>
          {r.qidui && (
            <Row label="七对加花">
              <Seg value={r.qiduiBonus} options={[[0, '不加'], [2, '+2'], [5, '+5'], [10, '+10']]} onChange={(qiduiBonus) => updateRules({ qiduiBonus })} />
            </Row>
          )}
          <Row label="清一色加花">
            <Seg value={r.qingyiseBonus} options={[[0, '不计'], [5, '+5'], [10, '+10'], [20, '+20']]} onChange={(qingyiseBonus) => updateRules({ qingyiseBonus })} />
          </Row>
          <Row label="碰碰胡加花">
            <Seg value={r.pengpengBonus} options={[[0, '不计'], [2, '+2'], [5, '+5'], [10, '+10']]} onChange={(pengpengBonus) => updateRules({ pengpengBonus })} />
          </Row>
          <Row label="一炮多响" hint="关闭时按出牌顺序截胡">
            <Switch value={r.multiRon} onChange={(multiRon) => updateRules({ multiRon })} />
          </Row>
          <Row label="抢杠胡" hint="加杠时可胡那张牌">
            <Switch value={r.robKong} onChange={(robKong) => updateRules({ robKong })} />
          </Row>
          <Row label="庄家">
            <select value={r.dealerRule} onChange={(e) => updateRules({ dealerRule: e.target.value as DealerRule })}>
              {(Object.keys(DEALER_RULE_LABEL) as DealerRule[]).map((k) => (
                <option key={k} value={k}>
                  {DEALER_RULE_LABEL[k]}
                </option>
              ))}
            </select>
          </Row>
          <Row label="局数">
            <Seg value={r.totalRounds} options={[[0, '不限'], [4, '4 局'], [8, '8 局'], [16, '16 局']]} onChange={(totalRounds) => updateRules({ totalRounds })} />
          </Row>
        </section>
      </div>
    </Modal>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="安庆麻将规则" onClose={onClose} wide>
      <div className="rules-text">
        <h4>牌</h4>
        <p>
          万、条、筒各 1–9 × 4，南、西、北 × 4，共 120 张可打的牌；
          <b>白、中、发、东</b> 共 16 张是<b>花牌</b>，摸到就亮出并从牌尾补一张，每张 +1 花。
        </p>
        <h4>胡牌</h4>
        <p>牌型能胡就行（4 组面子 + 1 对将），没有番种要求，可以吃（只吃上家）、碰、杠。七对可在房规中开启。</p>
        <h4>算花</h4>
        <ul>
          <li>底花 1</li>
          <li>每张花牌 +1</li>
          <li>自摸 +1</li>
          <li>每个杠 +1（明杠、暗杠一样）</li>
          <li>南、西、北刻子各 +1（碰的、杠的也算）</li>
          <li>杠上开花 +1（补花后摸到自摸牌也算杠开）</li>
          <li>清一色等特殊牌型按房规加花（默认不计）</li>
        </ul>
        <h4>结算</h4>
        <p>点炮：放炮者一人付总花数。自摸：其余三家各付总花数。</p>
        <h4>庄家</h4>
        <p>房规自定（设置中可选），荒庄（牌摸完无人胡）时庄家连庄。</p>
        <h4>关于牌效提示</h4>
        <p>
          向听数 = 离听牌还差几步；进张 = 能让向听数减少的牌还剩多少张（按你视角看不到的牌计算）。
          何切推荐优先选择向听最小、进张最多的打法；进张相同时用"两步前瞻"（≈ 后面的数字）比较下一步的平均进张。
        </p>
      </div>
    </Modal>
  );
}

export function MenuModal({ onClose }: { onClose: () => void }) {
  const { restartRound, quitGame, setPanel } = useGame.getState();
  const [fs, setFs] = useState(isFullscreen);
  useEffect(() => {
    const on = () => setFs(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return (
    <Modal title="菜单" onClose={onClose}>
      <div className="menu-list">
        <button className="btn primary" onClick={onClose}>
          继续对局
        </button>
        {canFullscreen() && (
          <button className="btn ghost" onClick={() => (fs ? exitFullscreen() : enterFullscreen(true))}>
            {fs ? '退出全屏' : '全屏（横屏）'}
          </button>
        )}
        <button className="btn ghost" onClick={restartRound}>
          重打本局（同一副牌）
        </button>
        <button className="btn ghost" onClick={() => setPanel('settings')}>
          设置
        </button>
        <button className="btn ghost" onClick={() => setPanel('rules')}>
          规则说明
        </button>
        <button className="btn ghost danger" onClick={quitGame}>
          返回首页
        </button>
      </div>
    </Modal>
  );
}
