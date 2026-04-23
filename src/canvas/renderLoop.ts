/**
 * Canvas Render Loop — Synthesia-style falling notes + piano keyboard
 *
 * Fixed:
 * - Accepts explicit displayW/displayH (CSS pixels) instead of canvas.width/height
 *   to avoid DevicePixelRatio confusion
 * - Keyboard height increased to 28% for mobile legibility
 * - Note bars taller (24px) with proportional width (takes full key width)
 * - Black key position algorithm fixed
 * - Note name label logic fixed
 */

import { GameState, KeyboardRange, isBlackKey, AUDIO_CONSTANTS, NOTE_NAMES } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────
export const KEYBOARD_HEIGHT_RATIO = 0.28; // 28% of display height
const NOTE_H = 24;                         // fall bar height in px
const LOOK_AHEAD_SEC = 4;                  // how many seconds of notes to show ahead

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
    bg: '#0d0d1a',
    laneA: 'rgba(255,255,255,0.0)',
    laneB: 'rgba(255,255,255,0.025)',
    laneLine: 'rgba(255,255,255,0.07)',
    waitLine: 'rgba(255,80,80,0.7)',
    noteDefault: '#6c63ff',
    noteWaiting: '#ff6b6b',
    noteGlow: 'rgba(108,99,255,0.5)',
    noteWaitingGlow: 'rgba(255,107,107,0.7)',
    keyWhite: '#e8e8f5',
    keyWhiteActive: '#a8a0ff',
    keyWhiteLabel: '#444466',
    keyBlack: '#18182e',
    keyBlackActive: '#5a52cc',
    keyBorder: 'rgba(0,0,0,0.25)',
    scanLine: 'rgba(255,255,255,0.012)',
} as const;

// ─── Key geometry ─────────────────────────────────────────────────────────────

interface KeyGeo {
    midi: number;
    x: number;
    w: number;
    h: number;
    isBlack: boolean;
}

export function buildKeys(range: KeyboardRange, displayW: number, displayH: number): {
    keys: KeyGeo[];
    kbTop: number;
    whiteW: number;
} {
    const kbTop = displayH * (1 - KEYBOARD_HEIGHT_RATIO);
    const kbH = displayH * KEYBOARD_HEIGHT_RATIO;
    const whiteW = displayW / range.whiteKeyCount;
    const blackW = whiteW * 0.58;
    const blackH = kbH * 0.62;

    const whites: KeyGeo[] = [];
    let wi = 0;

    // First pass: white keys
    for (let m = range.minMidi; m <= range.maxMidi; m++) {
        if (!isBlackKey(m)) {
            whites.push({ midi: m, x: wi * whiteW, w: whiteW, h: kbH, isBlack: false });
            wi++;
        }
    }

    // Second pass: black keys — positioned relative to adjacent white keys
    const blacks: KeyGeo[] = [];
    wi = 0;
    for (let m = range.minMidi; m <= range.maxMidi; m++) {
        if (!isBlackKey(m)) {
            wi++;
        } else {
            // Black key centered over the right edge of the previous white key
            const x = wi * whiteW - blackW / 2;
            blacks.push({ midi: m, x, w: blackW, h: blackH, isBlack: true });
        }
    }

    return { keys: [...whites, ...blacks], kbTop, whiteW };
}

// ─── Main render function ─────────────────────────────────────────────────────

export function renderFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,   // kept for API compatibility
    gameState: GameState,
    range: KeyboardRange,
    pulseTick: number,
    displayW: number,            // CSS display width
    displayH: number,            // CSS display height
) {
    void canvas; // not used directly; we use displayW/H
    const W = displayW;
    const H = displayH;
    const { keys, kbTop, whiteW } = buildKeys(range, W, H);
    const fallH = kbTop; // height of the falling zone

    // ── Background ────────────────────────────────────────────────────────────
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // ── CRT scanlines ─────────────────────────────────────────────────────────
    ctx.fillStyle = C.scanLine;
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

    // ── Lane backgrounds ──────────────────────────────────────────────────────
    const whiteKeys = keys.filter(k => !k.isBlack);
    whiteKeys.forEach((k, i) => {
        ctx.fillStyle = i % 2 === 0 ? C.laneA : C.laneB;
        ctx.fillRect(k.x, 0, k.w, fallH);
        ctx.strokeStyle = C.laneLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(k.x, 0);
        ctx.lineTo(k.x, fallH);
        ctx.stroke();
    });
    // Right-most border
    ctx.strokeStyle = C.laneLine;
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W, fallH);
    ctx.stroke();

    // ── Wait line ─────────────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = C.waitLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.shadowColor = C.waitLine;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, fallH - 2);
    ctx.lineTo(W, fallH - 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── Falling note bars ─────────────────────────────────────────────────────
    const currentTarget = gameState.notes[gameState.currentNoteIndex];
    const pulse = 0.5 + 0.5 * Math.sin(pulseTick * 0.12);

    // Fall speed expressed in px/sec (notes that are LOOK_AHEAD_SEC away start at y=0)
    const speed = fallH / LOOK_AHEAD_SEC;

    for (const note of gameState.notes) {
        if (note.played) continue;

        const key = keys.find(k => k.midi === note.midi);
        if (!key) continue;

        // y position: 0 = just entered screen top, fallH = at keyboard
        const y = note.y;

        // Skip if fully off-screen (above top or below keyboard)
        if (y < -NOTE_H * 2) continue;
        if (y > fallH + NOTE_H) continue;

        const isTarget = currentTarget && note.id === currentTarget.id;
        const isWaiting = isTarget && gameState.waitingForNote;

        const color = isWaiting ? C.noteWaiting : C.noteDefault;
        const glow = isWaiting ? C.noteWaitingGlow : C.noteGlow;
        const glowSz = isWaiting ? 10 + pulse * 10 : 5;

        // Use full key width minus small gaps for white, proportional for black
        const nx = key.x + 1;
        const nw = key.w - 2;
        const ny = Math.round(y);
        const nh = NOTE_H;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = glowSz;

        const grad = ctx.createLinearGradient(nx, ny, nx, ny + nh);
        grad.addColorStop(0, color);
        grad.addColorStop(1, glow);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(nx, ny, nw, nh, 5);
        ctx.fill();

        // Waiting pulse border
        if (isWaiting) {
            const alpha = 0.35 + pulse * 0.55;
            ctx.strokeStyle = `rgba(255,107,107,${alpha})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(nx - 2, ny - 2, nw + 4, nh + 4, 7);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── Piano keyboard ────────────────────────────────────────────────────────
    const activeSet = new Set<number>(
        gameState.waitingForNote && currentTarget ? [currentTarget.midi] : []
    );

    // Top separator line
    ctx.fillStyle = 'rgba(108,99,255,0.4)';
    ctx.fillRect(0, kbTop - 2, W, 2);

    // White keys
    for (const k of keys) {
        if (k.isBlack) continue;
        const active = activeSet.has(k.midi);

        if (active) {
            // Active: violet gradient
            const g = ctx.createLinearGradient(k.x, kbTop, k.x, kbTop + k.h);
            g.addColorStop(0, '#9d98ff');
            g.addColorStop(0.5, C.keyWhiteActive);
            g.addColorStop(1, '#d0cfff');
            ctx.fillStyle = g;
            ctx.shadowColor = C.noteDefault;
            ctx.shadowBlur = 12;
        } else {
            // Normal: ivory gradient for 3D look
            const g = ctx.createLinearGradient(k.x, kbTop, k.x, kbTop + k.h);
            g.addColorStop(0, '#f5f5fa');
            g.addColorStop(0.7, C.keyWhite);
            g.addColorStop(1, '#d8d8e8');
            ctx.fillStyle = g;
            ctx.shadowBlur = 0;
        }

        // Fill with rounded bottom
        ctx.beginPath();
        ctx.roundRect(k.x + 1, kbTop, k.w - 2, k.h, [0, 0, 4, 4]);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = C.keyBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(k.x + 1, kbTop, k.w - 2, k.h, [0, 0, 4, 4]);
        ctx.stroke();

        // Label: note name + octave
        const noteName = NOTE_NAMES[k.midi % 12];
        if (!noteName.includes('#') && k.w > 14) {
            const octave = Math.floor(k.midi / 12) - 1;
            const label = noteName === 'C' ? `C${octave}` : noteName;
            ctx.fillStyle = active ? '#fff' : C.keyWhiteLabel;
            ctx.font = `${Math.max(9, Math.min(k.w * 0.32, 13))}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, k.x + k.w / 2, kbTop + k.h - 4);
        }
    }

    // Black keys (drawn on top)
    for (const k of keys) {
        if (!k.isBlack) continue;
        const active = activeSet.has(k.midi);

        if (active) {
            const g = ctx.createLinearGradient(k.x, kbTop, k.x, kbTop + k.h);
            g.addColorStop(0, C.keyBlackActive);
            g.addColorStop(1, '#2a2860');
            ctx.fillStyle = g;
            ctx.shadowColor = C.noteDefault;
            ctx.shadowBlur = 10;
        } else {
            const g = ctx.createLinearGradient(k.x, kbTop, k.x, kbTop + k.h);
            g.addColorStop(0, '#28283e');
            g.addColorStop(1, C.keyBlack);
            ctx.fillStyle = g;
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.roundRect(k.x, kbTop, k.w, k.h, [0, 0, 4, 4]);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Subtle highlight on top edge
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(k.x + 1, kbTop);
        ctx.lineTo(k.x + k.w - 1, kbTop);
        ctx.stroke();

        // Border
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(k.x, kbTop, k.w, k.h, [0, 0, 4, 4]);
        ctx.stroke();
    }

    // ── Top vignette ──────────────────────────────────────────────────────────
    const vig = ctx.createLinearGradient(0, 0, 0, fallH);
    vig.addColorStop(0, 'rgba(13,13,26,0.65)');
    vig.addColorStop(0.12, 'rgba(13,13,26,0)');
    vig.addColorStop(1, 'rgba(13,13,26,0)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, fallH);
}
