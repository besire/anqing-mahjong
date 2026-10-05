import { useEffect } from 'react';
import { useGame } from '../store/gameStore';
import { unlockAudio } from './sound';
import { Drill } from './Drill';
import { GameScreen } from './GameScreen';
import { Home } from './Home';

export default function App() {
  const screen = useGame((st) => st.screen);
  useEffect(() => {
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    return () => document.removeEventListener('pointerdown', unlockAudio);
  }, []);
  if (screen === 'game') return <GameScreen />;
  if (screen === 'drill') return <Drill />;
  return <Home />;
}
