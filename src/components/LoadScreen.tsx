/**
 * LoadScreen — Step 2: choose the demo song or load a MIDI file.
 */

import React, { useRef, useState } from 'react';
import { loadBuiltInSong, parseMidiFile, ParsedSong } from '../midi/parseMidi';
import { CalibrationResult } from '../types';

interface Props {
    calibration: CalibrationResult | null;
    onSongLoaded: (song: ParsedSong) => void;
}

export const LoadScreen: React.FC<Props> = ({ calibration, onSongLoaded }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    function handleDemo() {
        try {
            const song = loadBuiltInSong();
            onSongLoaded(song);
        } catch (e) {
            setError(String(e));
        }
    }

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const song = await parseMidiFile(file);
            onSongLoaded(song);
        } catch (err) {
            setError(`Could not parse MIDI: ${String(err)}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="screen load-screen">
            <div className="load-card">
                <div className="load-header">
                    <div className="load-icon">🎼</div>
                    <h1>Choose a Song</h1>
                    <p>Select the built-in demo or load your own MIDI file.</p>
                </div>

                {/* Calibration badge */}
                {calibration ? (
                    <div className="badge badge-success">
                        🎛️ Calibrated: {calibration.centOffset > 0 ? '+' : ''}{calibration.centOffset.toFixed(1)}¢ offset applied
                    </div>
                ) : (
                    <div className="badge badge-neutral">
                        🎵 Standard tuning (A4 = 440 Hz)
                    </div>
                )}

                {/* Demo song card */}
                <button className="song-card" onClick={handleDemo}>
                    <div className="song-artwork">🎻</div>
                    <div className="song-info">
                        <strong>Ode to Joy</strong>
                        <span>Ludwig van Beethoven · 32 notes · ~30s</span>
                    </div>
                    <div className="song-badge">Demo</div>
                </button>

                {/* Divider */}
                <div className="divider"><span>or</span></div>

                {/* File upload */}
                <label className="file-upload-area" htmlFor="midi-file-input">
                    <div className="upload-icon">📂</div>
                    <strong>Load your own MIDI</strong>
                    <span>Click to browse · .mid files only</span>
                    <input
                        id="midi-file-input"
                        ref={fileRef}
                        type="file"
                        accept=".mid,.midi"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                </label>

                {loading && <div className="loading-indicator">⏳ Parsing MIDI file…</div>}
                {error && <div className="error-banner">{error}</div>}

                <p className="load-note">
                    💡 Only monophonic melodies are supported in this MVP. Polyphonic MIDIs will have their melody extracted automatically.
                </p>
            </div>
        </div>
    );
};
