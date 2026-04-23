/**
 * useGameState — Wait Mode game logic hook.
 *
 * Timeline:
 * - Song time advances in real-time
 * - When the next note "arrives" (songTime >= note.startSec), timeline FREEZES
 * - User must play the correct note to unfreeze and advance
 *
 * Note Y positions:
 * - y = 0 when the note is LOOK_AHEAD_SEC seconds away (top of screen)
 * - y = fallH when the note is at the keyboard (songTime === note.startSec)
 * - speed = fallH / LOOK_AHEAD_SEC  (px/sec)
 */

import { useCallback, useRef, useState } from 'react';
import { GameNote, GameState, KeyboardRange, AUDIO_CONSTANTS } from '../types';

const LOOK_AHEAD_SEC = 4; // must match renderLoop.ts

export interface UseGameStateReturn {
    gameState: GameState;
    isComplete: boolean;
    startGame: (notes: GameNote[], range: KeyboardRange) => void;
    resetGame: () => void;
    tickFrame: (
        checkNoteMatch: (targetMidi: number) => boolean,
        displayHeight: number,
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

    const stateRef = useRef<GameState>(INITIAL_STATE);
    const notesRef = useRef<GameNote[]>([]);
    const isRunning = useRef(false);

    const startGame = useCallback((notes: GameNote[], _range: KeyboardRange) => {
        const fresh = notes.map(n => ({ ...n, played: false, y: -AUDIO_CONSTANTS.NOTE_BAR_HEIGHT }));
        notesRef.current = fresh;
        const init: GameState = {
            notes: fresh,
            currentNoteIndex: 0,
            waitingForNote: false,
            songTimeSec: 0,
            lastWallTime: performance.now() / 1000,
            score: 0,
        };
        stateRef.current = init;
        setGameState(init);
        setIsComplete(false);
        isRunning.current = true;
    }, []);

    const resetGame = useCallback(() => {
        isRunning.current = false;
        stateRef.current = INITIAL_STATE;
        setGameState(INITIAL_STATE);
        setIsComplete(false);
    }, []);

    const tickFrame = useCallback((
        checkNoteMatch: (targetMidi: number) => boolean,
        displayHeight: number,
        keyboardHeight: number,
    ) => {
        if (!isRunning.current) return;

        const s = stateRef.current;
        const notes = notesRef.current;

        if (s.currentNoteIndex >= notes.length) {
            isRunning.current = false;
            setIsComplete(true);
            return;
        }

        const now = performance.now() / 1000;
        const fallH = displayHeight - keyboardHeight;
        const speed = fallH / LOOK_AHEAD_SEC; // px per second

        const target = notes[s.currentNoteIndex];
        let newSongTime = s.songTimeSec;
        let newWaiting = s.waitingForNote;
        let newIdx = s.currentNoteIndex;
        let newScore = s.score;

        if (s.waitingForNote) {
            // ── FROZEN: poll for correct note ────────────────────────────────
            if (checkNoteMatch(target.midi)) {
                notes[s.currentNoteIndex] = { ...target, played: true };
                newIdx = s.currentNoteIndex + 1;
                newWaiting = false;
                newScore = s.score + 1;
                newSongTime = target.startSec + 0.05; // small advance past the note start
            }
            // songTime stays frozen, lastWallTime advances so we don't jump when unfrozen
        } else {
            // ── RUNNING: advance song time ───────────────────────────────────
            const elapsed = now - s.lastWallTime;
            newSongTime = s.songTimeSec + elapsed;

            // Has the current target arrived?
            if (newSongTime >= target.startSec) {
                newWaiting = true;
                newSongTime = target.startSec; // clamp to note start
            }
        }

        // ── Compute Y for every visible note ──────────────────────────────────
        // y = fallH + (note.startSec - songTime) * speed ... but inverted:
        //   when timeUntil = LOOK_AHEAD_SEC → y = 0   (top of screen)
        //   when timeUntil = 0             → y = fallH (at keyboard)
        for (const note of notes) {
            if (note.played) {
                note.y = fallH + 100; // push below keyboard
                continue;
            }
            const timeUntil = note.startSec - newSongTime;
            if (timeUntil > LOOK_AHEAD_SEC) {
                note.y = -(AUDIO_CONSTANTS.NOTE_BAR_HEIGHT + 4); // above screen
            } else {
                note.y = fallH - timeUntil * speed;
            }
        }

        const next: GameState = {
            notes: [...notes],
            currentNoteIndex: newIdx,
            waitingForNote: newWaiting,
            songTimeSec: newSongTime,
            lastWallTime: now,
            score: newScore,
        };

        stateRef.current = next;
        setGameState(next);
    }, []);

    return { gameState, isComplete, startGame, resetGame, tickFrame };
}
