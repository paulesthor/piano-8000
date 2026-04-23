/**
 * App.tsx — Phase router
 *
 * Phases: calibration → load → game → complete
 */

import React, { useState } from 'react';
import { CalibrationScreen } from './components/CalibrationScreen';
import { LoadScreen } from './components/LoadScreen';
import { GameScreen } from './components/GameScreen';
import { CompleteScreen } from './components/CompleteScreen';
import { AppPhase, CalibrationResult } from './types';
import { ParsedSong } from './midi/parseMidi';

export const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('calibration');
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [song, setSong] = useState<ParsedSong | null>(null);
  const [finalScore, setFinalScore] = useState(0);

  // Capture score from GameScreen before transitioning to complete
  const [scoreCapture, setScoreCapture] = useState(0);

  function handleCalibrationComplete(result: CalibrationResult | null) {
    setCalibration(result);
    setPhase('load');
  }

  function handleSongLoaded(s: ParsedSong) {
    setSong(s);
    setPhase('game');
  }

  function handleGameComplete() {
    setPhase('complete');
  }

  function handleReplay() {
    setPhase('game');
  }

  function handleBackToLoad() {
    setSong(null);
    setPhase('load');
  }

  return (
    <div className="app">
      {phase === 'calibration' && (
        <CalibrationScreen onCalibrationComplete={handleCalibrationComplete} />
      )}
      {phase === 'load' && (
        <LoadScreen calibration={calibration} onSongLoaded={handleSongLoaded} />
      )}
      {phase === 'game' && song && (
        <GameScreen
          song={song}
          calibration={calibration}
          onComplete={handleGameComplete}
          onBack={handleBackToLoad}
        />
      )}
      {phase === 'complete' && song && (
        <CompleteScreen
          song={song}
          score={scoreCapture}
          calibration={calibration}
          onReplay={handleReplay}
          onBack={handleBackToLoad}
        />
      )}
    </div>
  );
};
