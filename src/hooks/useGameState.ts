/**
 * useGameState — Wait Mode game logic hook.
 *
 * Manages the timeline of notes, pauses when waiting for the player,
 * and advances only when the correct note is detected.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameNote, GameState, KeyboardRange, AUDIO_CONSTANTS } from '../types';

export interface UseGameStateReturn {
    gameState: GameState;
    isComplete: boolean;
    startGame: (notes: GameNote[], range: KeyboardRange) => void;
    resetGame: () => void;
    /** Called every animation frame with the current audio check function */
    tickFrame: (
        checkNoteMatch: (targetMidi: number) => boolean,
        canvasHeight: number,
        keyboardHeight: number,
    ) => void;
}

const INITIAL_STATE: GameState = {
    notes: [],
    currentNoteIndex: 0,
    waitingForNote: false,
    songTimeSec: 0,
    lastWallTime: 0,
    score: 0,
};

export function useGameState(): UseGameStateReturn {
    const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
    const [isComplete, setIsComplete] = useState(false);

    // Mutable ref mirror so tickFrame (rAF cb) always sees the latest state
    const stateRef = useRef<GameState>(INITIAL_STATE);
    const isRunningRef = useRef(false);

    // Store notes array separately to avoid stale closures in tickFrame
    const notesRef = useRef<GameNote[]>([]);

    const startGame = useCallback((notes: GameNote[], _range: KeyboardRange) => {
        const freshNotes = notes.map(n => ({ ...n, played: false, y: -AUDIO_CONSTANTS.NOTE_BAR_HEIGHT }));
        notesRef.current = freshNotes;
        const initial: GameState = {
            notes: freshNotes,
            currentNoteIndex: 0,
            waitingForNote: false,
            songTimeSec: 0,
            lastWallTime: performance.now() / 1000,
            score: 0,
        };
        stateRef.current = initial;
        setGameState(initial);
        setIsComplete(false);
        isRunningRef.current = true;
    }, []);

    const resetGame = useCallback(() => {
        isRunningRef.current = false;
        stateRef.current = INITIAL_STATE;
        setGameState(INITIAL_STATE);
        setIsComplete(false);
    }, []);

    /**
     * Called every animation frame by the canvas render loop.
     * Mutates stateRef for performance, then pushes to React state every N frames.
     */
    const tickFrame = useCallback((
        checkNoteMatch: (targetMidi: number) => boolean,
        canvasHeight: number,
        keyboardHeight: number,
    ) => {
        if (!isRunningRef.current) return;

        const s = stateRef.current;
        const notes = notesRef.current;

        if (s.currentNoteIndex >= notes.length) {
            setIsComplete(true);
            isRunningRef.current = false;
            return;
        }

        const now = performance.now() / 1000;
        const fallZoneHeight = canvasHeight - keyboardHeight;
        const speed = AUDIO_CONSTANTS.NOTE_FALL_SPEED_PX_PER_SEC;

        // The current target note
        const targetNote = notes[s.currentNoteIndex];

        let newSongTime = s.songTimeSec;
        let newWaiting = s.waitingForNote;
        let newNoteIndex = s.currentNoteIndex;
        let newScore = s.score;

        // ── When waiting: check for correct note hit ──────────────────────────
        if (s.waitingForNote) {
            if (checkNoteMatch(targetNote.midi)) {
                // Correct note detected! Mark as played and advance.
                notes[s.currentNoteIndex] = { ...targetNote, played: true };
                newNoteIndex = s.currentNoteIndex + 1;
                newWaiting = false;
                newScore = s.score + 1;
                // Resume timeline from current song position
                newSongTime = targetNote.startSec + targetNote.durationSec;
            }
        } else {
            // ── Advance song time normally ─────────────────────────────────────
            const elapsed = now - s.lastWallTime;
            newSongTime = s.songTimeSec + elapsed;

            // Check if the next note's "start" has arrived
            if (newSongTime >= targetNote.startSec) {
                // Stop timeline and wait for player
                newWaiting = true;
                newSongTime = targetNote.startSec; // freeze at note start
            }
        }

        // ── Update Y positions for all notes ─────────────────────────────────
        // A note's y when songTime === its startSec is at the top (y=0).
        // It falls to y = fallZoneHeight when that time arrives.
        for (const note of notes) {
            if (note.played) {
                note.y = fallZoneHeight + 100; // off screen below
                continue;
            }
            // How many seconds until this note must be at the bottom?
            const timeUntilBottom = note.startSec - newSongTime;
            // Convert to pixel offset from bottom of fall zone
            note.y = fallZoneHeight - (timeUntilBottom <= 0 ? 0 : timeUntilBottom * speed);
        }

        const next: GameState = {
            notes: [...notes],
            currentNoteIndex: newNoteIndex,
            waitingForNote: newWaiting,
            songTimeSec: newSongTime,
            lastWallTime: now,
            score: newScore,
        };

        stateRef.current = next;
        // Push to React state (triggers re-render for HUD, etc.)
        setGameState(next);
    }, []);

    return { gameState, isComplete, startGame, resetGame, tickFrame };
}
