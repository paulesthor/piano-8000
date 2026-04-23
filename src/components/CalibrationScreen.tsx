/**
 * CalibrationScreen — Step 1 of the app flow.
 *
 * Instructs the user to play A4 on their synth, measures the incoming
 * frequency over 2 seconds, computes the cent offset, and lets them confirm.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { CalibrationResult, AUDIO_CONSTANTS } from '../types';

interface Props {
    onCalibrationComplete: (result: CalibrationResult | null) => void;
}

type CalibStep = 'intro' | 'listening' | 'reviewing' | 'done';

export const CalibrationScreen: React.FC<Props> = ({ onCalibrationComplete }) => {
    const {
        isListening,
        currentHz,
        currentNoteName,
        clarity,
        startListening,
        stopListening,
        startCalibration,
        stopCalibration,
    } = useAudioEngine();

    const [step, setStep] = useState<CalibStep>('intro');
    const [timeLeft, setTimeLeft] = useState(0);
    const [result, setResult] = useState<CalibrationResult | null>(null);
    const [micError, setMicError] = useState<string | null>(null);

    // Countdown timer during calibration measurement
    useEffect(() => {
        if (step !== 'listening') return;
        setTimeLeft(Math.ceil(AUDIO_CONSTANTS.CALIBRATION_DURATION_MS / 1000));
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    handleMeasureDone();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    async function handleStartCalibration() {
        try {
            await startListening();
            startCalibration(AUDIO_CONSTANTS.A4_HZ); // reference: A4 = 440 Hz
            setStep('listening');
        } catch {
            setMicError('Microphone access denied. Please allow mic in browser settings.');
        }
    }

    function handleMeasureDone() {
        const calib = stopCalibration();
        stopListening();
        setResult(calib);
        setStep('reviewing');
    }

    function handleConfirm() {
        onCalibrationComplete(result);
    }

    function handleSkip() {
        onCalibrationComplete(null);
    }

    // Clarity bar color
    const clarityColor = clarity > 0.9 ? '#2ecc71' : clarity > 0.7 ? '#f39c12' : '#e74c3c';

    return (
        <div className="screen calibration-screen">
            <div className="calib-card">
                {/* Header */}
                <div className="calib-header">
                    <div className="calib-icon">🎛️</div>
                    <h1>Vintage Synth Calibration</h1>
                    <p className="calib-subtitle">
                        Your analog synthesizer may have tuning drift. Let's measure it.
                    </p>
                </div>

                {/* Step: Intro */}
                {step === 'intro' && (
                    <div className="calib-step">
                        <div className="instruction-box">
                            <div className="instruction-number">1</div>
                            <p>Make sure your synthesizer is warmed up and connected to your device's microphone.</p>
                        </div>
                        <div className="instruction-box">
                            <div className="instruction-number">2</div>
                            <p>When ready, click <strong>Start</strong> and play a sustained <strong>A4</strong> note on your synth.</p>
                        </div>
                        <div className="instruction-box">
                            <div className="instruction-number">3</div>
                            <p>Hold the note for <strong>2 seconds</strong>. We'll measure the offset and compensate automatically.</p>
                        </div>
                        {micError && <div className="error-banner">{micError}</div>}
                        <div className="calib-actions">
                            <button className="btn btn-primary" onClick={handleStartCalibration}>
                                🎵 Start Calibration
                            </button>
                            <button className="btn btn-ghost" onClick={handleSkip}>
                                Skip (use standard tuning)
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Listening */}
                {step === 'listening' && (
                    <div className="calib-step calib-listening">
                        <div className="pulse-ring" />
                        <div className="listen-icon">🎹</div>
                        <h2>Listening… play A4 now</h2>

                        <div className="pitch-display">
                            {currentHz ? (
                                <>
                                    <span className="pitch-hz">{currentHz.toFixed(1)} Hz</span>
                                    <span className="pitch-note">{currentNoteName}</span>
                                </>
                            ) : (
                                <span className="pitch-hz dim">No signal detected</span>
                            )}
                        </div>

                        <div className="clarity-bar-wrap">
                            <span>Signal clarity</span>
                            <div className="clarity-bar">
                                <div
                                    className="clarity-fill"
                                    style={{ width: `${clarity * 100}%`, background: clarityColor }}
                                />
                            </div>
                            <span>{(clarity * 100).toFixed(0)}%</span>
                        </div>

                        <div className="countdown-ring">
                            <span>{timeLeft}s</span>
                        </div>
                    </div>
                )}

                {/* Step: Reviewing result */}
                {step === 'reviewing' && (
                    <div className="calib-step">
                        {result ? (
                            <>
                                <div className="result-grid">
                                    <div className="result-item">
                                        <label>Measured Frequency</label>
                                        <span className="value-display">{result.measuredHz.toFixed(2)} Hz</span>
                                    </div>
                                    <div className="result-item">
                                        <label>Standard A4</label>
                                        <span className="value-display">440.00 Hz</span>
                                    </div>
                                    <div className="result-item result-primary">
                                        <label>Tuning Offset</label>
                                        <span className={`value-display ${result.centOffset > 0 ? 'sharp' : 'flat'}`}>
                                            {result.centOffset > 0 ? '+' : ''}{result.centOffset.toFixed(1)} cents
                                        </span>
                                    </div>
                                </div>
                                <p className="result-description">
                                    {Math.abs(result.centOffset) < 5
                                        ? '✅ Your synth is nearly perfectly in tune!'
                                        : `⚠️ Your synth is ${Math.abs(result.centOffset).toFixed(0)} cents ${result.centOffset > 0 ? 'sharp' : 'flat'}. This offset will be applied globally.`}
                                </p>
                                <p className="tolerance-note">
                                    Note validation uses a <strong>±{AUDIO_CONSTANTS.NOTE_TOLERANCE_CENTS} cent</strong> tolerance window.
                                </p>
                            </>
                        ) : (
                            <div className="result-item">
                                <p>⚠️ Not enough signal detected. You can retry or skip calibration.</p>
                            </div>
                        )}
                        <div className="calib-actions">
                            <button className="btn btn-primary" onClick={handleConfirm}>
                                ✅ Apply & Continue
                            </button>
                            <button className="btn btn-ghost" onClick={() => setStep('intro')}>
                                🔄 Retry
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
