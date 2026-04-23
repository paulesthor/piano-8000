/**
 * GameScreen — the main game canvas + HUD.
 *
 * Key fix: the rAF render loop reads from a `gameStateRef` (mutable ref)
 * rather than from React state, so it always sees the latest values
 * without stale closure issues.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { renderFrame, KEYBOARD_HEIGHT_RATIO } from '../canvas/renderLoop';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useGameState } from '../hooks/useGameState';
import { ParsedSong } from '../midi/parseMidi';
import { CalibrationResult, GameState } from '../types';

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

    // ── Ref that the rAF loop reads directly (no stale closure) ───────────────
    const gameStateRef = useRef<GameState>({
        notes: [],
        currentNoteIndex: 0,
        waitingForNote: false,
        songTimeSec: 0,
        lastWallTime: 0,
        score: 0,
    });

    const audio = useAudioEngine();
    const { gameState, isComplete, startGame, tickFrame } = useGameState();

    // Keep the ref in sync with React state (for the render loop)
    useEffect(() => {
        gameStateRef.current = gameState;
    }, [gameState]);

    const [micError, setMicError] = useState<string | null>(null);
    const [started, setStarted] = useState(false);

    // ── Start game ─────────────────────────────────────────────────────────────
    const handleStart = useCallback(async () => {
        try {
            await audio.startListening();
        } catch {
            setMicError('Accès au microphone requis. Veuillez autoriser le micro dans le navigateur.');
            return;
        }
        startGame(song.notes, song.range);
        setStarted(true);
    }, [audio, startGame, song]);

    // ── Canvas setup: correct DPR handling ────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        function resize() {
            const dpr = window.devicePixelRatio || 1;
            const w = canvas!.offsetWidth;
            const h = canvas!.offsetHeight;
            // Only resize if dimensions actually changed to avoid thrashing
            if (canvas!.width !== Math.round(w * dpr) || canvas!.height !== Math.round(h * dpr)) {
                canvas!.width = Math.round(w * dpr);
                canvas!.height = Math.round(h * dpr);
            }
        }

        const ro = new ResizeObserver(resize);
        ro.observe(canvas);
        resize(); // initial
        return () => ro.disconnect();
    }, []);

    // ── Main rAF loop ──────────────────────────────────────────────────────────
    // Reads gameStateRef.current (always fresh) instead of gameState (stale closure)
    useEffect(() => {
        if (!started) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        function loop() {
            const dpr = window.devicePixelRatio || 1;
            // Display dimensions in CSS pixels (what the canvas CSS shows)
            const displayW = canvas!.offsetWidth;
            const displayH = canvas!.offsetHeight;
            const keyboardH = displayH * KEYBOARD_HEIGHT_RATIO;

            pulseRef.current++;

            // Tick game state (mutates the ref via stateRef inside useGameState)
            tickFrame(audio.checkNoteMatch, displayH, keyboardH);

            // Clear and reset transform for each frame
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Render using DISPLAY pixels (renderFrame uses canvas.width/height)
            // Pass the display size explicitly to avoid DPR confusion
            renderFrame(ctx!, canvas!, gameStateRef.current, song.range, pulseRef.current, displayW, displayH);

            rafRef.current = requestAnimationFrame(loop);
        }

        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
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
                        <span className="wait-badge">⏸ PLAY THE NOTE</span>
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
                            🎹 Le morceau va <strong>se mettre en pause</strong> sur chaque note et attendre que tu la joues.
                        </p>
                        {micError && <div className="error-banner">{micError}</div>}
                        <button className="btn btn-primary btn-large" onClick={handleStart}>
                            ▶ Démarrer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
