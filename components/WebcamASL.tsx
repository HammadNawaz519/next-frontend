'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { askAI, saveTranslationHistory, getTranslationHistory } from '@/app/dashboard/actions';

type PredictionResult = {
  prediction: string;
  confidence: number;
  stability: number;
  raw: string;
  raw_conf: number;
  top3: { label: string; confidence: number }[];
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

// Map prediction labels to display-friendly names
const LABEL_DISPLAY: Record<string, string> = {
  nothing: '—',
  space: 'Space',
  del: 'Delete',
};

const getColor = (conf: number) => {
  if (conf >= 0.85) return '#10b981'; // Emerald Green
  if (conf >= 0.65) return '#f59e0b'; // Amber Yellow
  return '#ef4444'; // Rose Red
};

interface WebcamASLProps {
  isCallActive?: boolean;
}

export default function WebcamASL({ isCallActive = false }: WebcamASLProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPredicting = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [result, setResult] = useState<PredictionResult | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null); // null = checking
  const [sentence, setSentence] = useState<string>('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const lastAddedAt = useRef<number>(0);
  
  // Translation state
  const [targetLang, setTargetLang] = useState<string>('en');
  const [translatedSentence, setTranslatedSentence] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [history, setHistory] = useState<any[]>([]);


  // ── Check backend health on mount ─────────────────────────────────────────
  const checkBackend = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        setBackendOnline(true);
        setBackendError(null);
      } else {
        setBackendOnline(false);
        setBackendError('Backend returned an error. Check server.py is running.');
      }
    } catch {
      setBackendOnline(false);
      setBackendError(`Cannot reach Flask backend at ${BACKEND_URL}. Check if your Python server is running.`);
    }
  }, []);

  useEffect(() => {
    checkBackend();
    // Re-check every 10 seconds if offline
    const healthTimer = setInterval(() => {
      if (!backendOnline) checkBackend();
    }, 10000);
    return () => clearInterval(healthTimer);
  }, [checkBackend, backendOnline]);

  // ── Camera control ────────────────────────────────────────────────────────
  const startCamera = async () => {
    if (!backendOnline) {
      await checkBackend();
      if (!backendOnline) return; // still offline, don't start
    }
    setCamError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsCameraActive(true);
            fetch(`${BACKEND_URL}/reset`, { method: 'POST' }).catch(() => {});
          }).catch(() => {
            setCamError('Could not start video playback.');
          });
        };
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setCamError('Camera permission denied. Please allow access in browser settings.');
      } else if (err?.name === 'NotFoundError') {
        setCamError('No camera found. Please connect a webcam.');
      } else {
        setCamError('Could not access webcam: ' + (err?.message || 'Unknown error'));
      }
    }
  };

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setResult(null);
    isPredicting.current = false;
  }, []);

  // Automatically release camera lock if a video call starts
  useEffect(() => {
    if (isCallActive && isCameraActive) {
      stopCamera();
    }
  }, [isCallActive, isCameraActive, stopCamera]);

  // ── Capture + predict ─────────────────────────────────────────────────────
  const captureAndPredict = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || isPredicting.current) return;
    if (video.videoWidth === 0 || video.readyState < 2 || video.paused) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    isPredicting.current = true;

    // Region of Interest (ROI) Cropping:
    // Crop a square region from the center of the video frame.
    // This perfectly centers the hand, matching the dataset used to train the ASL CNN model.
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const cropSize = Math.min(vWidth, vHeight) * 0.55;
    const sx = (vWidth - cropSize) / 2;
    const sy = (vHeight - cropSize) / 2;

    // Set canvas dimensions to 224x224 (efficientnetv2s_asl exact input dimensions)
    canvas.width = 224;
    canvas.height = 224;

    // Draw the cropped center square onto the canvas
    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 224, 224);

    canvas.toBlob(async (blob) => {
      if (!blob) { isPredicting.current = false; return; }
      const form = new FormData();
      form.append('image', blob, 'frame.jpg');
      try {
        const res = await fetch(`${BACKEND_URL}/predict`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data: PredictionResult = await res.json();
          setResult(data);
          setBackendError(null);
        } else {
          setBackendError(`Backend error: ${res.status}`);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setBackendError('Lost connection to backend. Is server.py still running?');
          setBackendOnline(false);
        }
      } finally {
        isPredicting.current = false;
      }
    }, 'image/jpeg', 0.92);
  }, []);


  // ── Prediction loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isCameraActive) {
      intervalRef.current = setInterval(() => {
        if (!isPredicting.current) captureAndPredict();
      }, 60); // ~16 FPS for maximum responsiveness
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isCameraActive, captureAndPredict]);

  // ── Auto-append letter to sentence ───────────────────────────────────────
  useEffect(() => {
    if (!result || !isCameraActive) return;
    const { prediction, stability, confidence } = result;
    const now = Date.now();
    const cooldown = prediction === lastAdded ? 1200 : 800;
    if (
      stability >= 0.5 &&
      confidence >= 0.45 &&
      prediction !== 'nothing' &&
      now - lastAddedAt.current > cooldown
    ) {
      if (prediction === 'del') {
        setSentence(s => s.slice(0, -1));
      } else if (prediction === 'space') {
        setSentence(s => s + ' ');
      } else {
        setSentence(s => s + prediction);
      }
      setLastAdded(prediction);
      lastAddedAt.current = now;
    }
  }, [result, isCameraActive, lastAdded]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Speech Synthesis, Recognition & Copy Utilities ────────────────────────
  const [copied, setCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser doesn't support Speech Recognition. Please try Google Chrome.");
      return;
    }
    
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSentence(prev => prev ? prev + ' ' + transcript : transcript);
    };
    
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => setIsListening(false);
    
    recognitionRef.current = recognition;
    recognition.start();
  };

  const speakSentence = () => {
    if (!sentence) return;
    const utterance = new SpeechSynthesisUtterance(sentence);
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(
      v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft'))
    );
    if (premiumVoice) utterance.voice = premiumVoice;
    window.speechSynthesis.speak(utterance);
  };

  const copySentence = () => {
    if (!sentence) return;
    navigator.clipboard.writeText(sentence);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Display computations ──────────────────────────────────────────────────
  const displayChar = result ? (LABEL_DISPLAY[result.prediction] ? result.prediction === 'del' ? '⌫' : '␣' : result.prediction) : '?';
  const conf = result?.confidence ?? 0;
  const stability = result?.stability ?? 0;
  const color = result ? getColor(conf) : '#6366f1';

  const isBackendChecking = backendOnline === null;

  return (
    <div className="w-full h-full flex flex-col min-h-0 select-none bg-transparent">
      {/* ── Minimal Premium Styles ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0.2; }
          50% { top: 90%; opacity: 0.8; }
        }
      `}} />

      {/* ── Offline Exception Overlay ── */}
      {backendError && (
        <div
          className="mx-6 lg:mx-8 mt-4 px-5 py-4 rounded-2xl flex items-start gap-3.5 text-xs flex-shrink-0 animate-in fade-in slide-in-from-top-2 duration-300"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: '#ef4444' }}
        >
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="font-mono uppercase tracking-wider text-[10px] font-bold">System Connection Interrupted</p>
            <p className="text-[11px] opacity-80 mt-0.5">{backendError}</p>
            <button
              onClick={checkBackend}
              className="mt-2 text-[10px] font-mono uppercase tracking-widest font-bold underline underline-offset-2 opacity-80 hover:opacity-100 cursor-pointer"
            >
              Force Retry Connection →
            </button>
          </div>
        </div>
      )}

      {/* ── Centered Workspace aligned with Chat Area sizing ── */}
      <div className="flex-grow flex-1 min-h-0 w-full max-w-5xl mx-auto p-4 md:p-5 flex flex-col justify-between">
        
        {/* The 2-Column Side-by-Side HUD */}
        <div className="flex-grow flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
          
          {/* Left Column (3/5ths): Camera & Output Document */}
          <div className="lg:col-span-3 flex flex-col gap-5 min-h-0 h-full">
            
            {/* Camera Frame */}
            <div
              className="flex-[2.8] min-h-[240px] w-full relative bg-zinc-950 rounded-[2rem] overflow-hidden transition-all duration-500 shadow-sm flex flex-col items-center justify-center border animate-in fade-in duration-500"
              style={{ 
                borderColor: 'var(--dm-border)',
                background: 'var(--dm-bg-sidebar)',
              }}
            >
              {/* Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover z-0"
                style={{
                  transform: 'scaleX(-1)',
                  display: isCameraActive ? 'block' : 'none',
                }}
              />

              {/* Hidden capture canvas */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Clean Camera HUD Overlay */}
              {isCameraActive && (
                <>
                  {/* Minimalist Camera status pill */}
                  <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full backdrop-blur-md bg-black/40 text-[9px] font-mono tracking-widest text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 font-bold">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    CAMERA LINK ACTIVE
                  </div>

                  {/* Terminate camera */}
                  <button
                    onClick={stopCamera}
                    className="absolute top-4 right-4 z-30 px-3.5 py-1.5 rounded-full text-[9px] font-mono uppercase tracking-widest backdrop-blur-md bg-black/60 text-red-400 border border-red-500/25 transition-all hover:bg-red-500/20 active:scale-95 shadow-lg shadow-black/20 cursor-pointer animate-in fade-in duration-300"
                  >
                    Turn Off
                  </button>

                  {/* High-Tech Crop Zone Indicator (Region of Interest) */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 select-none animate-in fade-in zoom-in-95 duration-500">
                    <div className="w-[180px] h-[180px] md:w-[220px] md:h-[220px] relative border-2 border-dashed border-indigo-500/40 rounded-[2.5rem] bg-indigo-500/5 shadow-[0_0_40px_rgba(99,102,241,0.12)] flex flex-col items-center justify-center backdrop-blur-[1px] transition-all duration-300">
                      {/* Corner Brackets */}
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-2xl -mt-1 -ml-1" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-2xl -mt-1 -mr-1" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-2xl -mb-1 -ml-1" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-2xl -mb-1 -mr-1" />
                      
                      {/* Live scanning line effect */}
                      <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent top-1/2 animate-[scan_2.5s_ease-in-out_infinite]" />
                      
                      {/* Sub-label */}
                      <span className="text-[9px] font-mono tracking-widest text-indigo-200 font-extrabold bg-zinc-950/85 px-3.5 py-1.5 rounded-full border border-indigo-500/35 shadow-lg select-none">
                        PLACE HAND HERE
                      </span>
                    </div>
                  </div>

                  {/* Clean watermark bottom-right */}
                  <div className="absolute bottom-4 right-4 z-20 text-[8px] font-mono tracking-[0.2em] text-zinc-400 opacity-60 pointer-events-none uppercase">
                    ASL PREDICTOR CORE
                  </div>
                </>
              )}

              {/* Local Hardware error overlay */}
              {camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-zinc-950/95 z-20 border border-red-500/20 animate-in fade-in duration-300">
                  <svg className="w-8 h-8 text-red-500 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-red-400 text-xs font-mono tracking-wide text-center uppercase">Hardware Exception</p>
                  <p className="text-zinc-500 text-[10px] text-center max-w-[220px]">{camError}</p>
                  <button
                    onClick={() => { setCamError(null); startCamera(); }}
                    className="text-[9px] font-mono uppercase tracking-widest font-bold px-4 py-2 rounded-full mt-2 transition-all active:scale-95 cursor-pointer"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                  >
                    Restart Interface
                  </button>
                </div>
              )}

              {/* Standby screen */}
              {!isCameraActive && !camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center z-10" style={{ background: 'var(--dm-bg-sidebar)' }}>
                  {!backendOnline && !isBackendChecking ? (
                    <>
                      <div className="w-11 h-11 rounded-full flex items-center justify-center bg-red-950/15 border border-red-900/30 animate-pulse">
                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </div>
                      <p className="text-red-400 text-[10px] font-mono tracking-widest uppercase">System Initialization Blocked</p>
                      <p className="text-zinc-500 text-[11px] max-w-[200px]">Flask backend must be active to initiate optical translation.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-full flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 shadow-inner" style={{ background: 'var(--dm-bg-input)', borderColor: 'var(--dm-border)' }}>
                        <svg className="w-6 h-6 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      </div>
                      <button
                        onClick={startCamera}
                        disabled={isBackendChecking}
                        className="px-6 py-3 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg cursor-pointer"
                      >
                        {isBackendChecking ? 'INITIALIZING TERMINAL...' : '▶ Start Translation Feed'}
                      </button>
                      <p className="text-zinc-600 text-[9px] font-mono uppercase tracking-widest mt-1">
                        Camera translation standby
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Compiled Output Workspace Document */}
            <div 
              className="flex-1 min-h-[160px] w-full rounded-[2rem] p-5 border flex flex-col justify-between"
              style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border)' }}
            >
              {/* Header Info */}
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <p className="text-[8px] font-mono font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--dm-text-secondary)' }}>
                  ✦ Compiled Output Terminal
                </p>
                {copied && (
                  <span className="text-[7px] font-mono font-bold text-emerald-500 uppercase tracking-widest animate-pulse">
                    COPIED TO CLIPBOARD
                  </span>
                )}
              </div>
              
              {/* Text Area */}
              <div className="flex-grow overflow-y-auto pr-1 flex items-start justify-start min-h-0 my-2">
                <p
                  className="text-[14px] font-bold tracking-wider leading-relaxed transition-all break-all select-text"
                  style={{ color: 'var(--dm-text-heading)', fontFamily: 'monospace' }}
                >
                  {sentence ? (
                    <>
                      {sentence}
                      <span 
                        className="inline-block w-2.5 h-3.5 ml-1.5 bg-current opacity-85 align-middle animate-[cursor-blink_1s_step-start_infinite]"
                        style={{ background: 'var(--dm-text-primary)' }}
                      />
                    </>
                  ) : (
                    <span className="text-[10px] font-normal font-sans italic" style={{ color: 'var(--dm-text-muted)' }}>
                      Optical buffer empty. Perform signs in camera view to compile characters…
                    </span>
                  )}
                </p>
              </div>

              {/* Sleek Action Toolbar - Small & Beautiful (No Emojis) */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t flex-shrink-0" style={{ borderColor: 'var(--dm-border)' }}>
                <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-wider">
                  Optic Buffer: {sentence.length} chars
                </span>
                
                <div className="flex items-center gap-2">
                  {/* Backspace Button */}
                  <button
                    onClick={() => setSentence(s => s.slice(0, -1))}
                    disabled={!sentence}
                    className="py-1.5 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold transition-all active:scale-95 disabled:opacity-30 flex items-center gap-1.5 cursor-pointer border bg-[var(--dm-bg-input)]"
                    style={{ 
                      color: 'var(--dm-text-secondary)', 
                      borderColor: 'var(--dm-border)',
                    }}
                    onMouseEnter={e => { if (sentence) { e.currentTarget.style.borderColor = 'var(--dm-thumb)'; e.currentTarget.style.color = 'var(--dm-text-primary)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--dm-border)'; e.currentTarget.style.color = 'var(--dm-text-secondary)'; }}
                  >
                    Backspace
                  </button>

                  {/* Clear Button */}
                  <button
                    onClick={() => { setSentence(''); setLastAdded(null); }}
                    disabled={!sentence}
                    className="py-1.5 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold transition-all active:scale-95 disabled:opacity-30 flex items-center gap-1.5 cursor-pointer border bg-[var(--dm-bg-input)]"
                    style={{ 
                      color: 'var(--dm-text-secondary)', 
                      borderColor: 'var(--dm-border)',
                    }}
                    onMouseEnter={e => { if (sentence) { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--dm-border)'; e.currentTarget.style.color = 'var(--dm-text-secondary)'; }}
                  >
                    Clear
                  </button>

                  {/* Copy Button */}
                  <button
                    onClick={copySentence}
                    disabled={!sentence}
                    className="py-1.5 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold transition-all active:scale-95 disabled:opacity-30 flex items-center gap-1.5 cursor-pointer border bg-[var(--dm-bg-input)]"
                    style={{ 
                      color: 'var(--dm-text-secondary)', 
                      borderColor: 'var(--dm-border)',
                    }}
                    onMouseEnter={e => { if (sentence) { e.currentTarget.style.borderColor = 'var(--dm-thumb)'; e.currentTarget.style.color = 'var(--dm-text-primary)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--dm-border)'; e.currentTarget.style.color = 'var(--dm-text-secondary)'; }}
                  >
                    Copy
                  </button>

                  {/* Speak Button */}
                  <button
                    onClick={speakSentence}
                    disabled={!sentence}
                    className="py-1.5 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold transition-all active:scale-95 disabled:opacity-30 flex items-center gap-1.5 cursor-pointer border bg-[var(--dm-bg-input)]"
                    style={{ 
                      color: 'var(--dm-text-secondary)', 
                      borderColor: 'var(--dm-border)',
                    }}
                    onMouseEnter={e => { if (sentence) { e.currentTarget.style.borderColor = 'var(--dm-thumb)'; e.currentTarget.style.color = 'var(--dm-text-primary)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--dm-border)'; e.currentTarget.style.color = 'var(--dm-text-secondary)'; }}
                  >
                    Speak
                  </button>

                  {/* Listen Button */}
                  <button
                    onClick={startListening}
                    className={`py-1.5 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${isListening ? 'animate-pulse' : ''} bg-[var(--dm-bg-input)]`}
                    style={{ 
                      color: isListening ? '#10b981' : 'var(--dm-text-secondary)', 
                      borderColor: isListening ? '#10b981' : 'var(--dm-border)',
                    }}
                    onMouseEnter={e => { if (!isListening) { e.currentTarget.style.borderColor = 'var(--dm-thumb)'; e.currentTarget.style.color = 'var(--dm-text-primary)'; } }}
                    onMouseLeave={e => { if (!isListening) { e.currentTarget.style.borderColor = 'var(--dm-border)'; e.currentTarget.style.color = 'var(--dm-text-secondary)'; } }}
                  >
                    {isListening ? 'Listening...' : 'Listen'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (2/5ths): AI Telemetry & Predictions */}
          <div className="lg:col-span-2 flex flex-col gap-5 min-h-0 h-full">
            
            {/* AI Diagnostics HUD - Height Increased significantly, pushing others down */}
            <div
              className="flex-[2.8] min-h-[240px] rounded-[2rem] p-5 flex flex-col items-center justify-center gap-4 border relative overflow-hidden"
              style={{ 
                background: 'var(--dm-bg-sidebar)', 
                borderColor: 'var(--dm-border)',
              }}
            >
              {/* AI Status badge */}
              <div
                className="absolute top-4 right-4 text-[8px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full transition-all duration-300 pointer-events-none"
                style={{
                  background: isBackendChecking
                    ? 'rgba(107,114,128,0.06)'
                    : backendOnline
                    ? 'rgba(16,185,129,0.08)'
                    : 'rgba(239,68,68,0.08)',
                  color: isBackendChecking ? '#9ca3af' : backendOnline ? '#10b981' : '#ef4444',
                  border: `1px solid ${isBackendChecking ? 'rgba(107,114,128,0.15)' : backendOnline ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}
              >
                {isBackendChecking ? 'CONNECTING...' : backendOnline ? 'AI ACTIVE' : 'AI OFFLINE'}
              </div>

              <div className="text-[8px] font-mono tracking-[0.25em] text-zinc-400 opacity-60 uppercase absolute top-5 left-6 pointer-events-none">
                Capture Matrix
              </div>

              {/* Clean AI Telemetry Display */}
              <div className="flex flex-col items-center gap-1.5 mt-2">
                <div 
                  className="w-20 h-20 rounded-full border flex items-center justify-center text-3xl font-black shadow-inner transition-all duration-300"
                  style={{ 
                    borderColor: isCameraActive ? color : 'var(--dm-border)',
                    color: isCameraActive ? color : 'var(--dm-text-muted)',
                    background: 'var(--dm-bg-input)',
                    fontFamily: 'monospace',
                    boxShadow: isCameraActive ? `inset 0 0 12px ${color}15, 0 4px 12px rgba(0,0,0,0.05)` : 'none'
                  }}
                >
                  {displayChar}
                </div>

                {result && (
                  <div className="flex flex-col items-center gap-0.5 mt-1">
                    <span 
                      className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] px-2 rounded-full" 
                      style={{ 
                        background: `${color}12`,
                        color: color,
                        border: `1px solid ${color}20`
                      }}
                    >
                      {conf >= 0.85 ? '✦ Stable Consensus' : conf >= 0.65 ? '◆ Nominal Quality' : '◇ Scanning...'}
                    </span>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mt-1">
                      Confidence: <span className="font-bold" style={{ color }}>{(conf * 100).toFixed(1)}%</span>
                    </span>


                  </div>
                )}

                {!result && isCameraActive && (
                  <p className="text-[9px] font-mono uppercase tracking-widest animate-pulse mt-2.5" style={{ color: 'var(--dm-text-muted)' }}>
                    Awaiting sign...
                  </p>
                )}
                {!isCameraActive && (
                  <p className="text-[9px] font-mono uppercase tracking-widest mt-2.5" style={{ color: 'var(--dm-text-muted)' }}>
                    Feed Standby
                  </p>
                )}
              </div>
            </div>

            {/* Clean Top Output Matrices Data List */}
            <div className="flex-1 min-h-[160px] rounded-[2rem] p-5 border flex flex-col justify-center" style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border)' }}>
              <p className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--dm-text-secondary)' }}>
                Top Predicted Outputs
              </p>
              {result?.top3 ? (
                <div className="space-y-2.5">
                  {result.top3.map((item, i) => (
                    <div key={item.label} className="flex items-center gap-2.5">
                      <span
                        className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] font-mono font-bold"
                        style={{
                          background: i === 0 ? `${color}12` : 'var(--dm-bg-input)',
                          color: i === 0 ? color : 'var(--dm-text-muted)',
                          border: `1px solid ${i === 0 ? `${color}20` : 'var(--dm-border)'}`
                        }}
                      >
                        0{i + 1}
                      </span>
                      <span className="text-[10px] font-mono font-semibold w-10 truncate" style={{ color: i === 0 ? 'var(--dm-text-heading)' : 'var(--dm-text-secondary)' }}>
                        {LABEL_DISPLAY[item.label] ?? item.label}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden relative" style={{ background: 'var(--dm-bg-input)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${item.confidence * 100}%`, 
                            background: i === 0 ? color : 'var(--dm-text-muted)',
                          }}
                        />
                      </div>
                      <span className="text-[9px] font-mono w-8 text-right" style={{ color: 'var(--dm-text-muted)' }}>
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5 opacity-30">
                  {[1, 2, 3].map((idx) => (
                    <div key={idx} className="flex items-center gap-2.5">
                      <span className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] font-mono font-bold bg-zinc-900 text-zinc-600 border border-zinc-800">
                        0{idx}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 w-10">—</span>
                      <div className="flex-1 h-1.5 rounded-full bg-zinc-900" />
                      <span className="text-[9px] font-mono w-8 text-right text-zinc-600">0%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
