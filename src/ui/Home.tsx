import { BOT_LEVEL_LABEL, type BotLevel } from '../core/types';
import { useGame } from '../store/gameStore';
import { RulesModal, SettingsModal } from './Modals';
import { isIOS, isStandalone } from './fullscreen';
import { Tile } from './Tile';

const DECOR = [0, 13, 22, 27, 4, 16, 29, 8];

export function Home() {
  const settings = useGame((st) => st.settings);
  const stats = useGame((st) => st.stats);
  const panel = useGame((st) => st.panel);
  const { startGame, setScreen, setPanel, updateSettings } = useGame.getState();
  const levelValue = settings.levels.every((l) => l === settings.levels[0]) ? settings.levels[0] : 'mix';
  const rate = stats.decisions ? Math.round((stats.best / stats.decisions) * 100) : null;

  return (
    <>
      <div className="home responsive-page">
        <div className="home-decor">
          {DECOR.map((k, i) => (
            <Tile key={i} kind={k} size="drill" className={`decor decor-${i}`} />
          ))}
        </div>
        <div className="home-title">
          <h1>安庆麻将</h1>
          <p>牌效练习场 · 单人四人房</p>
        </div>

        <div className="home-card">
          <div className="home-row">
            <span className="home-label">对手难度</span>
            <div className="seg big">
              {(['easy', 'normal', 'hard', 'mix'] as (BotLevel | 'mix')[]).map((lv) => (
                <button
                  key={lv}
                  className={levelValue === lv ? 'on' : ''}
                  onClick={() => updateSettings({ levels: lv === 'mix' ? ['easy', 'normal', 'hard'] : [lv, lv, lv] })}
                >
                  {lv === 'mix' ? '混合' : BOT_LEVEL_LABEL[lv]}
                </button>
              ))}
            </div>
          </div>
          <div className="home-row">
            <span className="home-label">何切提示</span>
            <div className="seg big">
              <button className={settings.hintEnabled ? 'on' : ''} onClick={() => updateSettings({ hintEnabled: true })}>
                开启
              </button>
              <button className={!settings.hintEnabled ? 'on' : ''} onClick={() => updateSettings({ hintEnabled: false })}>
                关闭（盲打）
              </button>
            </div>
          </div>
          <button className="btn primary huge" onClick={startGame}>
            开始对局
          </button>
          <div className="home-btns">
            <button className="btn ghost" onClick={() => setScreen('drill')}>
              何切练习
            </button>
            <button className="btn ghost" onClick={() => setPanel('settings')}>
              设置 / 房规
            </button>
            <button className="btn ghost" onClick={() => setPanel('rules')}>
              规则说明
            </button>
          </div>
        </div>

        <div className="home-stats">
          <div>
            <b>{stats.rounds}</b>
            <span>已打局数</span>
          </div>
          <div>
            <b>{stats.wins}</b>
            <span>胡牌</span>
          </div>
          <div>
            <b>{stats.dealIns}</b>
            <span>放炮</span>
          </div>
          <div>
            <b>{rate === null ? '—' : `${rate}%`}</b>
            <span>何切最优率</span>
          </div>
        </div>
        <div className="home-foot">
          底花 1 · 花牌/自摸/杠/南西北刻 各 +1 · 点炮一家付 · 自摸三家付
          {isIOS() && !isStandalone() && <span className="install-tip">Safari：分享 → 添加到主屏幕，横屏时可获得更大画面</span>}
        </div>
      </div>
      {panel === 'settings' && <SettingsModal onClose={() => setPanel(null)} />}
      {panel === 'rules' && <RulesModal onClose={() => setPanel(null)} />}
    </>
  );
}
