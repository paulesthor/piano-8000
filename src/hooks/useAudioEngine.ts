/**
 * useAudioEngine — Core hook for pitch detection and calibration.
 *
 * Features:
 * - Opens microphone stream via getUserMedia
 * - Applies a Web Audio API Low-Pass Filter to cut high analog harmonics
 * - Uses pitchy's PitchDetector on an AnalyserNode buffer
 * - Calibration: measures reference note, stores cent offset
 * - Note validation: applies cent offset + ±40 cent tolerance window
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { PitchDetector } from 'pitchy';
import {
    AUDIO_CONSTANTS,
    CalibrationResult,
    calcCentOffset,
    freqToMidi,
    midiToFreq,
    midiToName,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioEngineState {
    isListening: boolean;
    currentHz: number | null;
    currentMidi: number | null;
    currentNoteName: string | null;
    clarity: number;
    calibration: CalibrationResult | null;
}

export interface UseAudioEngineReturn extends AudioEngineState {
    startListening: () => Promise<void>;
    stopListening: () => void;
    startCalibration: (referenceHz?: number) => void;
    stopCalibration: () => CalibrationResult | null;
    /** Check if the currently detected pitch matches a target MIDI note */
    checkNoteMatch: (targetMidi: number) => boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAudioEngine(): UseAudioEngineReturn {
    // ── Refs (no re-render on change) ──────────────────────────────────────────
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const detectorRef = useRef<PitchDetector<Float32Array> | null>(null);
    const rafRef = useRef<number>(0);
    const isActiveRef = useRef(false);

    // Calibration accumulator
    const calibSamplesRef = useRef<number[]>([]);
    const isCalibRef = useRef(false);
    const calibRefHzRef = useRef(440); // reference Hz for calibration

    // Stored calibration result
    const calibrationRef = useRef<CalibrationResult | null>(null);

    // ── Reactive state (triggers re-render) ────────────────────────────────────
    const [state, setState] = useState<AudioEngineState>({
        isListening: false,
        currentHz: null,
        currentMidi: null,
        currentNoteName: null,
        clarity: 0,
        calibration: null,
    });

    // ── Cleanup on unmount ─────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            stopListeningInternal();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Internal stop ──────────────────────────────────────────────────────────
    function stopListeningInternal() {
        isActiveRef.current = false;
        cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
        analyserRef.current = null;
        detectorRef.current = null;
    }

    // ── Audio processing loop ──────────────────────────────────────────────────
    function processPitch() {
        if (!isActiveRef.current) return;

        const analyser = analyserRef.current;
        const detector = detectorRef.current;
        if (!analyser || !detector) {
            rafRef.current = requestAnimationFrame(processPitch);
            return;
        }

        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);

        // pitchy pitch detection
        const [pitch, clarity] = detector.findPitch(buffer, audioCtxRef.current!.sampleRate);

        if (clarity > AUDIO_CONSTANTS.CLARITY_THRESHOLD && pitch > 50 && pitch < 4200) {
            const midi = freqToMidi(pitch);
            const noteName = midiToName(Math.round(midi));

            // Accumulate calibration samples
            if (isCalibRef.current) {
                calibSamplesRef.current.push(pitch);
            }

            setState(prev => ({
                ...prev,
                currentHz: pitch,
                currentMidi: midi,
                currentNoteName: noteName,
                clarity,
                calibration: calibrationRef.current,
            }));
        } else {
            setState(prev => ({
                ...prev,
                currentHz: null,
                currentMidi: null,
                currentNoteName: null,
                clarity,
            }));
        }

        rafRef.current = requestAnimationFrame(processPitch);
    }

    // ── Start listening ────────────────────────────────────────────────────────
    const startListening = useCallback(async () => {
        if (isActiveRef.current) return;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false, // disable processing that could affect pitch
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 44100,
            },
        });

        const ctx = new AudioContext({ sampleRate: 44100 });
        const source = ctx.createMediaStreamSource(stream);

        // ── Low-Pass Filter: cut high harmonics from analog synths ──────────────
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = AUDIO_CONSTANTS.LPF_CUTOFF_HZ;
        lpf.Q.value = AUDIO_CONSTANTS.LPF_Q;

        // ── Analyser for pitchy ──────────────────────────────────────────────────
        const analyser = ctx.createAnalyser();
        analyser.fftSize = AUDIO_CONSTANTS.FFT_SIZE;
        analyser.smoothingTimeConstant = 0.0; // no smoothing — we want raw frames

        // Pipeline: mic → LPF → analyser
        source.connect(lpf);
        lpf.connect(analyser);
        // Note: we do NOT connect to ctx.destination to avoid feedback

        // PitchDetector works on Float32 buffers matching the analyser fftSize
        const detector = PitchDetector.forFloat32Array(analyser.fftSize);

        streamRef.current = stream;
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        detectorRef.current = detector;
        isActiveRef.current = true;

        setState(prev => ({ ...prev, isListening: true }));
        rafRef.current = requestAnimationFrame(processPitch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Stop listening ─────────────────────────────────────────────────────────
    const stopListening = useCallback(() => {
        stopListeningInternal();
        setState(prev => ({
            ...prev,
            isListening: false,
            currentHz: null,
            currentMidi: null,
            currentNoteName: null,
            clarity: 0,
        }));
    }, []);

    // ── Calibration ────────────────────────────────────────────────────────────

    /**
     * Begin accumulating pitch samples for calibration.
     * @param referenceHz — the expected frequency (default A4 = 440 Hz)
     */
    const startCalibration = useCallback((referenceHz: number = AUDIO_CONSTANTS.A4_HZ) => {
        calibSamplesRef.current = [];
        calibRefHzRef.current = referenceHz;
        isCalibRef.current = true;
    }, []);

    /**
     * Stop accumulating and compute the calibration result.
     * Returns the CalibrationResult or null if not enough samples.
     */
    const stopCalibration = useCallback((): CalibrationResult | null => {
        isCalibRef.current = false;
        const samples = calibSamplesRef.current;

        if (samples.length < 10) return null;

        // Median (robust against outliers) as the measured frequency
        const sorted = [...samples].sort((a, b) => a - b);
        const measuredHz = sorted[Math.floor(sorted.length / 2)];

        const referenceHz = calibRefHzRef.current;
        const centOffset = calcCentOffset(measuredHz, referenceHz);

        const result: CalibrationResult = { measuredHz, referenceHz, centOffset };
        calibrationRef.current = result;

        setState(prev => ({ ...prev, calibration: result }));
        return result;
    }, []);

    // ── Note match check ───────────────────────────────────────────────────────

    /**
     * Returns true if the currently detected pitch matches targetMidi,
     * accounting for the synth's calibration cent offset and the tolerance window.
     */
    const checkNoteMatch = useCallback((targetMidi: number): boolean => {
        const { currentHz } = state;
        if (currentHz === null) return false;

        const calibration = calibrationRef.current;
        const offset = calibration?.centOffset ?? 0;

        // Adjust detected frequency by the inverse of the calibration offset
        // (i.e., compensate for the synth's tuning drift)
        const correctedHz = currentHz / Math.pow(2, offset / 1200);

        // Convert corrected Hz to MIDI float (unused directly, kept for debug reference)
        void freqToMidi(correctedHz);

        // Distance in cents from the target note
        const targetHz = midiToFreq(targetMidi);
        const distanceCents = Math.abs(1200 * Math.log2(correctedHz / targetHz));

        return distanceCents <= AUDIO_CONSTANTS.NOTE_TOLERANCE_CENTS;
    }, [state]);

    return {
        ...state,
        startListening,
        stopListening,
        startCalibration,
        stopCalibration,
        checkNoteMatch,
    };
}
