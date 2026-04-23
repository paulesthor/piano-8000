/**
 * Canvas Render Loop
 *
 * 60fps rendering of:
 * - Falling note bars (Synthesia style) with glow effects
 * - Waiting note pulse animation
 * - Dynamic piano keyboard overlay
 * - Lane guidelines
 */

import { GameState, GameNote, KeyboardRange, isBlackKey, AUDIO_CONSTANTS } from '../types';

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
    background: '#0d0d1a',
    laneAlt: 'rgba(255,255,255,0.02)',
    guideLine: 'rgba(255,255,255,0.06)',
    waitLine: 'rgba(255,100,100,0.5)',
    noteDefault: '#6c63ff',
    noteWaiting: '#ff6b6b',
    notePlayed: '#2ecc71',
    noteGlow: 'rgba(108,99,255,0.4)',
    noteWaitingGlow: 'rgba(255,107,107,0.6)',
    pianoWhite: '#f0f0f8',
    pianoBlack: '#1a1a2e',
    pianoWhiteBorder: 'rgba(0,0,0,0.3)',
    pianoBlackBorder: '#000',
    activeKeyWhite: '#6c63ff',
    activeKeyBlack: '#4a44cc',
    keyLabelColor: 'rgba(60,60,80,0.9)',
    scanLine: 'rgba(255,255,255,0.015)',
} as const;

const KEYBOARD_HEIGHT_RATIO = 0.22; // keyboard takes 22% of canvas height

// ─── Keyboard geometry ────────────────────────────────────────────────────────

interface KeyGeometry {
    midi: number;
    x: number;
    width: number;
    height: number;
    isBlack: boolean;
}

export function buildKeyGeometry(
    range: KeyboardRange,
    canvasWidth: number,
    canvasHeight: number,
): { keys: KeyGeometry[]; keyboardTop: number; whiteKeyWidth: number } {
    const keyboardTop = canvasHeight * (1 - KEYBOARD_HEIGHT_RATIO);
    const kbHeight = canvasHeight * KEYBOARD_HEIGHT_RATIO;
    const whiteKeyWidth = canvasWidth / range.whiteKeyCount;
    const whiteKeyHeight = kbHeight;
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = kbHeight * 0.62;

    const keys: KeyGeometry[] = [];
    let whiteIndex = 0;

    for (let midi = range.minMidi; midi <= range.maxMidi; midi++) {
        if (!isBlackKey(midi)) {
            keys.push({
                midi,
                x: whiteIndex * whiteKeyWidth,
                width: whiteKeyWidth,
                height: whiteKeyHeight,
                isBlack: false,
            });
            whiteIndex++;
        }
    }

    // Second pass for black keys (drawn on top)
    whiteIndex = 0;
    for (let midi = range.minMidi; midi <= range.maxMidi; midi++) {
        if (!isBlackKey(midi)) {
            whiteIndex++;
        } else {
            // Black key sits between the previous white key and the next
            const x = (whiteIndex - 1) * whiteKeyWidth + whiteKeyWidth - blackKeyWidth / 2;
            keys.push({
                midi,
                x,
                width: blackKeyWidth,
                height: blackKeyHeight,
                isBlack: true,
            });
        }
    }

    return { keys, keyboardTop, whiteKeyWidth };
}

// ─── Main render function ─────────────────────────────────────────────────────

export function renderFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    gameState: GameState,
    range: KeyboardRange,
    pulseTick: number, // monotonic counter for animations
) {
    const W = canvas.width;
    const H = canvas.height;

    const { keys, keyboardTop, whiteKeyWidth } = buildKeyGeometry(range, W, H);
    const fallZoneH = keyboardTop;

    // ── Clear ──────────────────────────────────────────────────────────────────
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, W, H);

    // ── Scanline overlay (CRT vibe) ────────────────────────────────────────────
    ctx.fillStyle = COLORS.scanLine;
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

    // ── Lane guidelines ────────────────────────────────────────────────────────
    const whiteKeys = keys.filter(k => !k.isBlack);
    whiteKeys.forEach((key, i) => {
        if (i % 2 === 0) {
            ctx.fillStyle = COLORS.laneAlt;
            ctx.fillRect(key.x, 0, key.width, fallZoneH);
        }
        ctx.strokeStyle = COLORS.guideLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(key.x, 0);
        ctx.lineTo(key.x, fallZoneH);
        ctx.stroke();
    });

    // ── Wait line (where notes must be caught) ─────────────────────────────────
    ctx.strokeStyle = COLORS.waitLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, fallZoneH - 4);
    ctx.lineTo(W, fallZoneH - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Falling note bars ──────────────────────────────────────────────────────
    const currentTarget = gameState.notes[gameState.currentNoteIndex];
    const hitPulse = 0.5 + 0.5 * Math.sin(pulseTick * 0.15); // 0–1 oscillation

    for (const note of gameState.notes) {
        if (note.played) continue;
        // Only render notes that are on-screen
        if (note.y > fallZoneH + AUDIO_CONSTANTS.NOTE_BAR_HEIGHT) continue;
        if (note.y < -AUDIO_CONSTANTS.NOTE_BAR_HEIGHT * 4) continue;

        const keyGeo = keys.find(k => k.midi === note.midi);
        if (!keyGeo) continue;

        const isCurrentTarget = currentTarget && note.id === currentTarget.id;
        const isWaiting = isCurrentTarget && gameState.waitingForNote;

        const noteColor = isWaiting ? COLORS.noteWaiting : COLORS.noteDefault;
        const glowColor = isWaiting ? COLORS.noteWaitingGlow : COLORS.noteGlow;

        const x = keyGeo.x + 2;
        const y = note.y;
        const w = keyGeo.width - 4;
        const h = AUDIO_CONSTANTS.NOTE_BAR_HEIGHT;

        // Glow effect
        const glowSize = isWaiting ? 8 + hitPulse * 8 : 4;
        ctx.shadowColor = noteColor;
        ctx.shadowBlur = glowSize;

        // Note gradient
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, noteColor);
        gradient.addColorStop(1, glowColor);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Waiting pulse ring
        if (isWaiting) {
            const ringAlpha = 0.3 + hitPulse * 0.4;
            ctx.strokeStyle = `rgba(255,107,107,${ringAlpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 6);
            ctx.stroke();
        }
    }

    // ── Piano keyboard ─────────────────────────────────────────────────────────
    // White keys first
    const activeNotesMidi = new Set<number>(
        gameState.waitingForNote && currentTarget ? [currentTarget.midi] : [],
    );

    for (const key of keys) {
        if (key.isBlack) continue;
        const isActive = activeNotesMidi.has(key.midi);
        const pulseAlpha = isActive ? hitPulse : 0;

        // Key fill
        if (isActive) {
            const g = ctx.createLinearGradient(key.x, keyboardTop, key.x, keyboardTop + key.height);
            g.addColorStop(0, `rgba(108,99,255,${0.4 + pulseAlpha * 0.4})`);
            g.addColorStop(1, COLORS.pianoWhite);
            ctx.fillStyle = g;
        } else {
            ctx.fillStyle = COLORS.pianoWhite;
        }

        ctx.fillRect(key.x + 1, keyboardTop, key.width - 2, key.height);
        ctx.strokeStyle = COLORS.pianoWhiteBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(key.x + 1, keyboardTop, key.width - 2, key.height);

        // Note label on white keys
        if (key.width > 18) {
            const noteName = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][key.midi % 12 < 1 ? 0 :
                (key.midi % 12 <= 2 ? 1 : key.midi % 12 <= 4 ? 2 :
                    key.midi % 12 <= 5 ? 3 : key.midi % 12 <= 7 ? 4 :
                        key.midi % 12 <= 9 ? 5 : 6)];
            const octave = Math.floor(key.midi / 12) - 1;
            ctx.fillStyle = COLORS.keyLabelColor;
            ctx.font = `${Math.max(8, key.width * 0.3)}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(
                `${noteName}${octave}`,
                key.x + key.width / 2,
                keyboardTop + key.height - 6,
            );
        }
    }

    // Black keys on top
    for (const key of keys) {
        if (!key.isBlack) continue;
        const isActive = activeNotesMidi.has(key.midi);

        ctx.fillStyle = isActive ? COLORS.activeKeyBlack : COLORS.pianoBlack;
        ctx.fillRect(key.x, keyboardTop, key.width, key.height);
        ctx.strokeStyle = COLORS.pianoBlackBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(key.x, keyboardTop, key.width, key.height);

        if (isActive) {
            ctx.shadowColor = COLORS.noteDefault;
            ctx.shadowBlur = 10;
            ctx.fillStyle = 'rgba(108,99,255,0.6)';
            ctx.fillRect(key.x + 2, keyboardTop, key.width - 4, key.height - 2);
            ctx.shadowBlur = 0;
        }
    }

    // ── Gradient vignette over fall zone ──────────────────────────────────────
    const vigGrad = ctx.createLinearGradient(0, 0, 0, fallZoneH);
    vigGrad.addColorStop(0, 'rgba(13,13,26,0.7)');
    vigGrad.addColorStop(0.15, 'rgba(13,13,26,0)');
    vigGrad.addColorStop(0.85, 'rgba(13,13,26,0)');
    vigGrad.addColorStop(1, 'rgba(13,13,26,0.3)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, W, fallZoneH);
}

export { KEYBOARD_HEIGHT_RATIO };
