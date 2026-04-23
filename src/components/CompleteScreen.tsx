/**
 * CompleteScreen — shown when the player finishes the song.
 */
import React from 'react';
import { ParsedSong } from '../midi/parseMidi';
import { CalibrationResult } from '../types';

interface Props {
    song: ParsedSong;
    score: number;
    calibration: CalibrationResult | null;
    onReplay: () => void;
    onBack: () => void;
}

export const CompleteScreen: React.FC<Props> = ({
    song, score, calibration, onReplay, onBack
}) => {
    const accuracy = Math.round((score / song.notes.length) * 100);

    return (
        <div className="screen complete-screen">
            <div className="complete-card">
                <div className="complete-icon">{accuracy === 100 ? '🏆' : accuracy >= 80 ? '⭐' : '🎵'}</div>
                <h1>Song Complete!</h1>
                <h2>{song.title}</h2>

                <div className="score-grid">
                    <div className="score-cell">
                        <label>Notes Played</label>
                        <span className="value-display">{score} / {song.notes.length}</span>
                    </div>
                    <div className="score-cell primary">
                        <label>Accuracy</label>
                        <span className="value-display">{accuracy}%</span>
                    </div>
                    {calibration && (
                        <div className="score-cell">
                            <label>Synth Offset</label>
                            <span className="value-display">{calibration.centOffset > 0 ? '+' : ''}{calibration.centOffset.toFixed(1)}¢</span>
                        </div>
                    )}
                </div>

                <div className="complete-actions">
                    <button className="btn btn-primary" onClick={onReplay}>🔄 Play Again</button>
                    <button className="btn btn-ghost" onClick={onBack}>🎼 Choose Song</button>
                </div>
            </div>
        </div>
    );
};
