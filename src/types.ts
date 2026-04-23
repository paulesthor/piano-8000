/**
 * Core TypeScript types for the Piano Wait Mode app.
 */

/** Application phase / screen */
export type AppPhase = 'calibration' | 'load' | 'game' | 'complete';

/** Calibration result stored globally */
export interface CalibrationResult {
    /** Measured frequency of the reference note */
    measuredHz: number;
    /** Reference standard frequency (A4 = 440, C4 = 261.63) */
    referenceHz: number;
    /** Cent offset: positive = sharp, negative = flat */
    centOffset: number;
}

/**
 * A single MIDI note loaded from the file.
 * startTick and durationTick are in MIDI ticks.
 */
export interface MidiNote {
    /** MIDI note number (0–127) */
    midi: number;
    /** Scientific note name e.g. "A4" */
    name: string;
    /** Start time in seconds */
    startSec: number;
    /** Duration in seconds */
    durationSec: number;
    /** Track / channel index */
    track: number;
}

/**
 * A game note — enriched MidiNote with rendering state.
 */
export interface GameNote extends MidiNote {
    /** Unique id for React keys */
    id: string;
    /** Has this note been played correctly? */
    played: boolean;
    /** Current Y position on canvas (0 = top, canvasH = keyboard top) */
    y: number;
}

/** The dynamic keyboard viewport derived from the song's MIDI range */
export interface KeyboardRange {
    minMidi: number;
    maxMidi: number;
    /** Total number of keys (white + black) displayed */
    totalKeys: number;
    whiteKeyCount: number;
}

/** Active game state passed to the render loop */
export interface GameState {
    notes: GameNote[];
    /** Index of the next note the player must hit */
    currentNoteIndex: number;
    /** Is the game paused waiting for a correct note? */
    waitingForNote: boolean;
    /** Current estimated song time in seconds (frozen while waiting) */
    songTimeSec: number;
    /** Wall-clock time when songTimeSec was last updated */
    lastWallTime: number;
    /** Score (notes played correctly) */
    score: number;
}

/** Constants for audio processing */
export const AUDIO_CONSTANTS = {
    /** Web Audio FFT size for pitch detection */
    FFT_SIZE: 4096,
    /** Low-pass filter cutoff frequency in Hz — cuts analog harmonics */
    LPF_CUTOFF_HZ: 2000,
    /** LPF Q factor */
    LPF_Q: 0.7,
    /** Pitch detection clarity threshold (0–1) */
    CLARITY_THRESHOLD: 0.85,
    /** Tolerance window in cents for note validation */
    NOTE_TOLERANCE_CENTS: 40,
    /** A4 reference frequency */
    A4_HZ: 440,
    /** MIDI number of A4 */
    A4_MIDI: 69,
    /** Minimum duration (ms) to hold calibration measurement */
    CALIBRATION_DURATION_MS: 2000,
    /** Falling speed: pixels per second at full speed */
    NOTE_FALL_SPEED_PX_PER_SEC: 200,
    /** Height (px) of a falling note bar */
    NOTE_BAR_HEIGHT: 18,
} as const;

/** Convert MIDI note number to frequency in Hz */
export function midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convert frequency to MIDI note number (float) */
export function freqToMidi(freq: number): number {
    return 69 + 12 * Math.log2(freq / 440);
}

/** Convert cents to frequency ratio */
export function centsToRatio(cents: number): number {
    return Math.pow(2, cents / 1200);
}

/**
 * Calculate cent offset between two frequencies.
 * Positive = measured is sharp vs reference.
 */
export function calcCentOffset(measuredHz: number, referenceHz: number): number {
    return 1200 * Math.log2(measuredHz / referenceHz);
}

/** Note names (chromatic) */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Get scientific note name from MIDI number */
export function midiToName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const note = NOTE_NAMES[midi % 12];
    return `${note}${octave}`;
}

/** Is a MIDI note a black key? */
export function isBlackKey(midi: number): boolean {
    const pos = midi % 12;
    return [1, 3, 6, 8, 10].includes(pos);
}
