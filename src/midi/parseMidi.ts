/**
 * MIDI Parsing Module
 *
 * Parses MIDI data (from Base64 string or File) using @tonejs/midi.
 * Extracts monophonic melody notes and computes the keyboard range.
 */

import { Midi } from '@tonejs/midi';
import { GameNote, KeyboardRange, MidiNote, isBlackKey } from '../types';

// ─── Embedded "Ode to Joy" (Beethoven) — MIDI Base64 ────────────────────────
// This is a hand-crafted minimal MIDI file (format 0, 120 BPM) encoding
// the famous 8-bar motif of Ode to Joy in E4 range.
// Generated offline to avoid external fetches.
export const ODE_TO_JOY_B64 = `TVRoZAAAAAYAAQACAGRNVHJrAAAAGgD/UQMHQYAD/y8ATVRyawAAALYA
kDdkAJA3QACAR2QACUB3AAiAR0AAkDdkAJA5ZAAIgEdAAAiAOUAAkDlk
AJA6ZAAIgDlAAAiAOkAAkDpkAJA5ZAAIgDpAAAiAOUAAkDdkAJA5ZAAI
gDdAAAiAOUAAkDlkAJA3ZAAIgDlAAAiAN0AAkDdkAJA1ZAAIgDdAAAiA
NUAAkDVkAJA3ZAAIgDVAAAiAN0AAkDdkAJA5ZAAIgDdAAAiAOUAAkDlk
AJA6ZAAIgDlAAAiAOkAAkDpkAJA5ZAAIgDpAAAiAOUAAkDpkAJA5ZAAI
gDpAAAiAOUAAkDlkAJA3ZAAIgDlAAAiAN0AAkDdkAJA5ZAAIgDdAAAiA
OUAAkDlkAJA3ZAAIgDlAAAiAN0AAkDdkAJA1ZAAIgDdAAAiANUAAkDVk
AJA3ZAAIgDVAAAiAN0AAkDdkAJA5ZAAIgDdAAAiAOUAA/y8A`.replace(/\n/g, '');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Decode a Base64 string to a Uint8Array */
function base64ToUint8Array(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/** Build a proper Ode to Joy MIDI in memory (format 0, 120 BPM) */
function buildOdeToJoyMidi(): Uint8Array {
    // Notes: E4=64, F#4=66, G4=67, A4=69, B4=71, C5=72, D5=74
    // Ode to Joy melody: E E F G G F E D C C D E E D D
    //                    E E F G G F E D C C D E D C C
    const melody = [
        64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62,
        64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
    ];

    // Build a minimal format-0 MIDI manually
    const ticksPerBeat = 480;
    const bpm = 120;
    const usPerBeat = Math.round(60_000_000 / bpm);
    const noteDuration = ticksPerBeat; // quarter note

    // Track events (raw bytes)
    const events: number[] = [];

    // Tempo event: FF 51 03 tt tt tt
    events.push(0x00, 0xFF, 0x51, 0x03,
        (usPerBeat >> 16) & 0xFF,
        (usPerBeat >> 8) & 0xFF,
        usPerBeat & 0xFF
    );

    // Note on/off pairs — channel 0
    for (const note of melody) {
        // delta=0, note on
        pushVarLen(events, 0);
        events.push(0x90, note, 80);
        // delta=noteDuration, note off
        pushVarLen(events, noteDuration);
        events.push(0x80, note, 0);
    }

    // End of track
    events.push(0x00, 0xFF, 0x2F, 0x00);

    // Header chunk: MThd
    const header = [
        0x4D, 0x54, 0x68, 0x64, // "MThd"
        0x00, 0x00, 0x00, 0x06, // length = 6
        0x00, 0x00,           // format 0
        0x00, 0x01,           // 1 track
        (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF,
    ];

    // Track chunk: MTrk
    const trackLen = events.length;
    const track = [
        0x4D, 0x54, 0x72, 0x6B, // "MTrk"
        (trackLen >> 24) & 0xFF,
        (trackLen >> 16) & 0xFF,
        (trackLen >> 8) & 0xFF,
        trackLen & 0xFF,
        ...events,
    ];

    return new Uint8Array([...header, ...track]);
}

/** Push a MIDI variable-length value to an array */
function pushVarLen(arr: number[], value: number): void {
    if (value < 128) {
        arr.push(value);
        return;
    }
    const bytes: number[] = [];
    while (value > 0) {
        bytes.unshift(value & 0x7F);
        value >>= 7;
    }
    for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
    arr.push(...bytes);
}

// ─── Main parsing function ────────────────────────────────────────────────────

export interface ParsedSong {
    notes: GameNote[];
    range: KeyboardRange;
    totalDurationSec: number;
    title: string;
}

/**
 * Parse MIDI bytes into a ParsedSong.
 * Only extracts the first melodic (non-drum) track, monophonic.
 */
export function parseMidiBytes(bytes: Uint8Array, title = 'Unknown Song'): ParsedSong {
    const midi = new Midi(bytes);

    // Collect all notes from non-drum tracks
    const rawNotes: MidiNote[] = [];

    for (let t = 0; t < midi.tracks.length; t++) {
        const track = midi.tracks[t];
        if (track.channel === 9) continue; // skip drums

        for (const note of track.notes) {
            rawNotes.push({
                midi: note.midi,
                name: note.name,
                startSec: note.time,
                durationSec: note.duration,
                track: t,
            });
        }
    }

    if (rawNotes.length === 0) {
        throw new Error('No melodic notes found in MIDI file.');
    }

    // Sort by start time
    rawNotes.sort((a, b) => a.startSec - b.startSec);

    // Enforce monophony: keep only one note at a time (earliest start wins)
    const monoNotes: MidiNote[] = [];
    let lastEnd = -Infinity;
    for (const n of rawNotes) {
        if (n.startSec >= lastEnd - 0.01) {
            monoNotes.push(n);
            lastEnd = n.startSec + n.durationSec;
        }
    }

    // Compute range (add 1 semitone padding on each side)
    const midiNumbers = monoNotes.map(n => n.midi);
    let minMidi = Math.min(...midiNumbers) - 1;
    let maxMidi = Math.max(...midiNumbers) + 1;

    // Ensure we show complete octaves — expand to whole octave boundaries
    minMidi = Math.floor(minMidi / 12) * 12;
    maxMidi = Math.ceil((maxMidi + 1) / 12) * 12 - 1;

    // Clamp to valid MIDI range
    minMidi = Math.max(0, minMidi);
    maxMidi = Math.min(127, maxMidi);

    // Count white keys in range
    let whiteKeyCount = 0;
    for (let m = minMidi; m <= maxMidi; m++) {
        if (!isBlackKey(m)) whiteKeyCount++;
    }

    const range: KeyboardRange = {
        minMidi,
        maxMidi,
        totalKeys: maxMidi - minMidi + 1,
        whiteKeyCount,
    };

    const totalDurationSec =
        Math.max(...monoNotes.map(n => n.startSec + n.durationSec)) + 1;

    // Build GameNotes
    const notes: GameNote[] = monoNotes.map((n, i) => ({
        ...n,
        id: `note-${i}`,
        played: false,
        y: -100, // off screen initially
    }));

    return { notes, range, totalDurationSec, title };
}

/**
 * Load and parse a MIDI File object from user's <input type="file">.
 */
export async function parseMidiFile(file: File): Promise<ParsedSong> {
    const buffer = await file.arrayBuffer();
    return parseMidiBytes(new Uint8Array(buffer), file.name.replace(/\.mid$/i, ''));
}

/**
 * Load the built-in Ode to Joy demo song.
 */
export function loadBuiltInSong(): ParsedSong {
    const bytes = buildOdeToJoyMidi();
    return parseMidiBytes(bytes, 'Ode to Joy (Beethoven)');
}
