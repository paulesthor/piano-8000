/**
 * GameScreen — the main game canvas + HUD.
 *
 * Orchestrates:
 * - Canvas resize observer (landscape aware)
 * - 60fps rAF render loop
 * - Audio engine for note detection
 * - Wait Mode game state
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { renderFrame, KEYBOARD_HEIGHT_RATIO } from '../canvas/renderLoop';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useGameState } from '../hooks/useGameState';
import { ParsedSong } from '../midi/parseMidi';
import { CalibrationResult } from '../types';

interface Props {
    song: ParsedSong;
    calibration: CalibrationResult | null;
    onComplete: () => void;
    onBack: () => void;
}

export const GameScreen: React.FC<Props> = ({ song, calibration: _calibration, onComplete, onBack }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const pulseRef = useRef(0);
    const hasStartedRef = useRef(false);

    const audio = useAudioEngine();
    const { gameState, isComplete, startGame, tickFrame } = useGameState();

    const [micError, setMicError] = useState<string | null>(null);
    const [started, setStarted] = useState(false);

    // ── Start game ─────────────────────────────────────────────────────────────
    const handleStart = useCallback(async () => {
        try {
            await audio.startListening();
        } catch {
            setMicError('Microphone access required for note detection. Please allow mic access.');
            return;
        }
        startGame(song.notes, song.range);
        setStarted(true);
        hasStartedRef.current = true;
    }, [audio, startGame, song]);

    // ── Canvas resize ──────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ro = new ResizeObserver(() => {
            canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        });
        ro.observe(canvas);
        return () => ro.disconnect();
    }, []);

    // ── Main rAF loop ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!started) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Scale for devicePixelRatio
        const dpr = window.devicePixelRatio || 1;

        function loop() {
            const displayW = canvas!.offsetWidth;
            const displayH = canvas!.offsetHeight;
            const keyboardH = displayH * KEYBOARD_HEIGHT_RATIO;

            pulseRef.current++;

            // Game tick
            tickFrame(audio.checkNoteMatch, displayH, keyboardH);

            // Render
            ctx!.save();
            renderFrame(ctx!, canvas!, gameState, song.range, pulseRef.current);
            ctx!.restore();

            rafRef.current = requestAnimationFrame(loop);
        }

        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
        // We intentionally only re-subscribe when started changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [started]);

    // ── Completion ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isComplete) {
            cancelAnimationFrame(rafRef.current);
            audio.stopListening();
            onComplete();
        }
    }, [isComplete, audio, onComplete]);

    // ── Cleanup on unmount ─────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current);
            audio.stopListening();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="screen game-screen">
            {/* HUD top bar */}
            <div className="game-hud">
                <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
                <div className="hud-center">
                    <span className="song-title">{song.title}</span>
                    {gameState.waitingForNote && (
                        <span className="wait-badge">⏸ WAITING FOR NOTE</span>
                    )}
                </div>
                <div className="hud-right">
                    <div className="pitch-indicator">
                        {audio.currentHz ? (
                            <>
                                <span className="pi-note">{audio.currentNoteName}</span>
                                <span className="pi-hz">{audio.currentHz.toFixed(0)}Hz</span>
                            </>
                        ) : (
                            <span className="pi-silent">—</span>
                        )}
                    </div>
                    <div className="score-badge">
                        ✓ {gameState.score}
                    </div>
                </div>
            </div>

            {/* Canvas fill */}
            <canvas ref={canvasRef} className="game-canvas" />

            {/* Start overlay */}
            {!started && (
                <div className="start-overlay">
                    <div className="start-card">
                        <h2>{song.title}</h2>
                        <p>{song.notes.length} notes · {Math.ceil(song.totalDurationSec)}s</p>
                        <p className="start-hint">
                            🎹 The song will <strong>pause</strong> on each note and wait for you to play it correctly.
                        </p>
                        {micError && <div className="error-banner">{micError}</div>}
                        <button className="btn btn-primary btn-large" onClick={handleStart}>
                            ▶ Start
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
