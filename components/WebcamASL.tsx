'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

  // ── Conversational ChatCore Logs ──────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<{ id: string; text: string; timestamp: string }[]>([
    { id: '1', text: 'Welcome to your real-time ASL ChatCore translation hub! Enable your camera on the top right to start signing directly into conversational messages.', timestamp: 'System' }
  ]);
  const [isCameraCollapsed, setIsCameraCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to the bottom when new message arrives
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sentence.trim()) return;
    const newMsg = {
      id: Date.now().toString(),
      text: sentence.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMsg]);
    setSentence('');
    setLastAdded(null);
  };

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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

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
    }, 'image/jpeg', 0.8);
  }, []);

  // ── Prediction loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isCameraActive) {
      intervalRef.current = setInterval(() => {
        if (!isPredicting.current) captureAndPredict();
      }, 80); // ~12 FPS
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
    const cooldown = prediction === lastAdded ? 2000 : 1500;
    if (
      stability >= 0.7 &&
      confidence >= 0.65 &&
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

  // ── Speech Synthesis & Copy Utilities ─────────────────────────────────────
  const [copied, setCopied] = useState(false);

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
    <div className="w-full h-full flex flex-col min-h-0 select-none bg-transparent relative">
      {/* Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--dm-border);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--dm-text-muted);
        }
      `}} />

      {/* ── Offline Exception Overlay ── */}
      {backendError && (
        <div
          className="mx-6 lg:mx-8 mt-4 px-5 py-4 rounded-2xl flex items-start gap-3.5 text-xs flex-shrink-0 animate-in fade-in slide-in-from-top-2 duration-300 z-50"
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

      {/* ── Floating Picture-in-Picture Webcam HUD ── */}
      <div 
        className="absolute top-4 right-4 z-40 transition-all duration-500 ease-out select-none"
        style={{ pointerEvents: 'auto' }}
      >
        {isCameraCollapsed ? (
          <button
            onClick={() => setIsCameraCollapsed(false)}
            className="px-4 py-2.5 rounded-full text-[10px] font-mono uppercase tracking-widest bg-black/85 text-white border border-white/10 shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            🎥 Expand Camera Stream
          </button>
        ) : (
          <div 
            className="w-64 md:w-72 bg-black/85 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col transition-all duration-500 animate-in zoom-in-95 duration-300"
          >
            {/* Header / Controls */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  {isCameraActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isCameraActive ? 'bg-emerald-500' : 'bg-zinc-500'}`}></span>
                </span>
                <span className="text-[9px] font-mono tracking-widest text-zinc-300 font-bold uppercase">
                  {isCameraActive ? 'Live Predictor' : 'Feed Standby'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isCameraActive && (
                  <button
                    onClick={stopCamera}
                    className="text-[8px] font-mono tracking-widest text-red-400 hover:text-red-300 uppercase cursor-pointer"
                  >
                    Off
                  </button>
                )}
                <button
                  onClick={() => setIsCameraCollapsed(true)}
                  className="text-[9px] font-mono text-zinc-400 hover:text-white uppercase cursor-pointer"
                >
                  Minimize
                </button>
              </div>
            </div>

            {/* Video Box */}
            <div className="aspect-video w-full relative bg-zinc-950 flex flex-col items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{
                  transform: 'scaleX(-1)',
                  display: isCameraActive ? 'block' : 'none',
                }}
              />
              <canvas ref={canvasRef} className="hidden" />

              {!isCameraActive && (
                <div className="flex flex-col items-center gap-2 text-center p-4">
                  <button
                    onClick={startCamera}
                    disabled={isBackendChecking}
                    className="px-4 py-2 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    {isBackendChecking ? 'CONNECTING...' : 'Start Camera'}
                  </button>
                </div>
              )}

              {/* Local Hardware error */}
              {camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 bg-zinc-950/95 z-20">
                  <span className="text-red-400 text-[8px] font-mono uppercase tracking-wider">Error</span>
                  <span className="text-zinc-500 text-[8px] text-center line-clamp-2">{camError}</span>
                  <button
                    onClick={() => { setCamError(null); startCamera(); }}
                    className="text-[8px] font-mono uppercase px-2.5 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 mt-1 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Diagnostics Telemetry HUD (Only shown if active) */}
            {isCameraActive && (
              <div className="p-4 border-t border-white/5 bg-zinc-900/40 flex flex-col gap-3">
                {/* Real-time guess letter bubble */}
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Prediction:</span>
                  <div className="flex items-center gap-2">
                    <span 
                      className="text-lg font-black tracking-tight"
                      style={{ color, fontFamily: 'monospace' }}
                    >
                      {displayChar}
                    </span>
                    {result && (
                      <span className="text-[9px] font-mono opacity-65" style={{ color }}>
                        {(conf * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Stability Progress bar */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[7.5px] font-mono text-zinc-500 uppercase tracking-widest">
                    <span>Consensus Stability:</span>
                    <span>{Math.round(stability * 100)}%</span>
                  </div>
                  <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${stability * 100}%`, background: color }}
                    />
                  </div>
                </div>

                {/* Alternative predictions list */}
                {result?.top3 && (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-widest">Alternatives:</span>
                    <div className="flex items-center gap-3">
                      {result.top3.slice(1, 3).map((item, i) => (
                        <div key={item.label} className="flex items-center gap-1 text-[9px] font-mono text-zinc-400">
                          <span className="font-bold uppercase text-zinc-500">{LABEL_DISPLAY[item.label] ?? item.label}:</span>
                          <span>{(item.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Center Chat History Board ── */}
      <div 
        className="flex-grow flex-1 overflow-y-auto p-6 md:p-12 space-y-6 min-h-0 custom-scrollbar z-10"
      >
        {chatMessages.map((msg) => {
          const isSystem = msg.timestamp === 'System';
          return (
            <div 
              key={msg.id} 
              className={`flex ${isSystem ? 'justify-center' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              {isSystem ? (
                <div className="max-w-[80%] text-center px-6 py-4 rounded-3xl backdrop-blur-sm border" style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border)' }}>
                  <p className="text-[11px] leading-relaxed text-zinc-500 font-light tracking-wide">
                    {msg.text}
                  </p>
                </div>
              ) : (
                <div 
                  className="max-w-[70%] rounded-3xl rounded-tl-none px-5 py-3 shadow-sm border group relative transition-all animate-in fade-in duration-350" 
                  style={{ 
                    background: 'var(--dm-bg-hover)', 
                    borderColor: 'var(--dm-border)',
                    color: 'var(--dm-text-primary)'
                  }}
                >
                  <p className="text-[13px] leading-relaxed font-light tracking-tight pr-8">{msg.text}</p>
                  
                  {/* Subtle actions panel appearing on message hover */}
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2">
                    {/* Speak message button */}
                    <button
                      onClick={() => {
                        const utterance = new SpeechSynthesisUtterance(msg.text);
                        window.speechSynthesis.speak(utterance);
                      }}
                      title="Speak message"
                      className="text-zinc-500 hover:text-indigo-400 cursor-pointer transition-colors p-0.5 bg-transparent border-none"
                    >
                      🔊
                    </button>
                    {/* Copy message button */}
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.text)}
                      title="Copy message"
                      className="text-zinc-500 hover:text-emerald-400 cursor-pointer transition-colors p-0.5 bg-transparent border-none"
                    >
                      📋
                    </button>
                  </div>

                  <span className="text-[7.5px] font-mono opacity-30 mt-1 block text-right select-none">{msg.timestamp}</span>
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* ── Compilation Input Panel (The Vibe Input Row) ── */}
      <div className="p-6 md:p-12 pt-0 bg-transparent relative z-20 flex-shrink-0">
        <div className="max-w-4xl mx-auto w-full">
          <form onSubmit={handleSendMessage} className="relative group">
            
            {/* The live compiling input field */}
            <input
              type="text"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder={isCameraActive ? "Sign in camera view or type to compose message..." : "Standby. Enable camera to start ASL compilation..."}
              className="w-full h-14 md:h-18 pl-24 pr-44 rounded-full focus:outline-none transition-all text-xs md:text-sm font-light shadow-lg pr-48"
              style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-primary)' }}
            />

            {/* Left aligned utility buttons inside input box */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-30">
              {/* Backspace Icon Button */}
              <button
                type="button"
                onClick={() => setSentence(s => s.slice(0, -1))}
                disabled={!sentence}
                title="Backspace"
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/20 active:scale-95 disabled:opacity-30 transition-all cursor-pointer bg-transparent border-none p-0 text-sm"
              >
                ⌫
              </button>
              {/* Clear Icon Button */}
              <button
                type="button"
                onClick={() => { setSentence(''); setLastAdded(null); }}
                disabled={!sentence}
                title="Clear buffer"
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 active:scale-95 disabled:opacity-30 transition-all cursor-pointer bg-transparent border-none p-0 text-sm"
              >
                🗑️
              </button>
            </div>

            {/* Right aligned action buttons inside input box */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-30">
              
              {/* Speak Audio Button */}
              <button
                type="button"
                onClick={speakSentence}
                disabled={!sentence}
                title="Speak Out"
                className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800/25 active:scale-95 disabled:opacity-30 transition-all cursor-pointer bg-transparent border-none text-sm"
              >
                🔊
              </button>

              {/* Copy Clipboard Button */}
              <button
                type="button"
                onClick={copySentence}
                disabled={!sentence}
                title="Copy Text"
                className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800/25 active:scale-95 disabled:opacity-30 transition-all cursor-pointer bg-transparent border-none text-sm"
              >
                {copied ? '✅' : '📋'}
              </button>

              {/* Send / Push to Chat Button */}
              <button
                type="submit"
                disabled={!sentence.trim()}
                title="Send Message"
                className="w-8 h-8 md:w-9 md:h-9 bg-white text-black hover:bg-zinc-200 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:scale-100 shadow-md cursor-pointer ml-1"
              >
                <svg className="w-4 h-4 md:w-4.5 md:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>

          </form>
        </div>
      </div>

    </div>
  );
}
