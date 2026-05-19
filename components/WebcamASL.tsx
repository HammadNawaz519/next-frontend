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
  // Advanced Interactive Scanning System States
  const [cropRatio, setCropRatio] = useState<number>(1.0);
  const [filterMode, setFilterMode] = useState<'normal' | 'boost' | 'high_contrast' | 'ai_studio'>('ai_studio');
  const [scannerTelemetry, setScannerTelemetry] = useState<{
    brightness: number;
    latencyMs: number;
    quality: 'optimal' | 'low_light' | 'overexposed';
  }>({ brightness: 120, latencyMs: 0, quality: 'optimal' });
  const [aiPredictions, setAiPredictions] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const segmenterRef = useRef<any>(null);

  // Load AI Segmentation Model
  useEffect(() => {
    let isMounted = true;
    const loadModel = async () => {
      try {
        await import('@tensorflow/tfjs-backend-webgl');
        const tf = await import('@tensorflow/tfjs-core');
        await tf.ready();
        const bodySeg = await import('@tensorflow-models/body-segmentation');
        const model = bodySeg.SupportedModels.MediaPipeSelfieSegmentation;
        const segmenterConfig: any = { runtime: 'tfjs', modelType: 'general' };
        const segmenter = await bodySeg.createSegmenter(model, segmenterConfig);
        if (isMounted) segmenterRef.current = segmenter;
      } catch (err) {
        console.error("Failed to load AI Segmenter", err);
      }
    };
    loadModel();
    return () => { isMounted = false; };
  }, []);


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

    const startTime = performance.now();
    isPredicting.current = true;

    // Dynamic Region of Interest (ROI) Cropping with Zoom Support:
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    // Uses the custom cropRatio set by the user (ranging from 0.35 to 0.75)
    const cropSize = Math.min(vWidth, vHeight) * cropRatio;
    const sx = (vWidth - cropSize) / 2;
    const sy = (vHeight - cropSize) / 2;

    canvas.width = 224;
    canvas.height = 224;

    // Clear canvas
    ctx.clearRect(0, 0, 224, 224);

    // Apply Real-Time Hardware-Accelerated Canvas Preprocessing Filters
    if (filterMode === 'boost') {
      ctx.filter = 'contrast(1.22) saturate(1.15) brightness(1.04) contrast(1.1)';
    } else if (filterMode === 'high_contrast') {
      ctx.filter = 'contrast(1.4) brightness(1.08) saturate(1.05)';
    } else {
      ctx.filter = 'none';
    }

    if (filterMode === 'ai_studio' && segmenterRef.current) {
      // Create offscreen canvas for processing
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 224;
      tempCanvas.height = 224;
      const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (tCtx) {
        tCtx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 224, 224);
        try {
          const segmentation = await segmenterRef.current.segmentPeople(tempCanvas);
          const bodySeg = await import('@tensorflow-models/body-segmentation');
          // Dark Studio Background
          ctx.fillStyle = '#09090b'; // zinc-950
          ctx.fillRect(0, 0, 224, 224);
          
          const coloredPartImage = await bodySeg.toBinaryMask(segmentation, {r: 255, g: 255, b: 255, a: 255}, {r: 0, g: 0, b: 0, a: 0});
          
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = 224;
          maskCanvas.height = 224;
          const maskCtx = maskCanvas.getContext('2d');
          if (maskCtx) {
            maskCtx.putImageData(coloredPartImage, 0, 0);
            
            // Isolate the person
            const isolatedCanvas = document.createElement('canvas');
            isolatedCanvas.width = 224;
            isolatedCanvas.height = 224;
            const isolatedCtx = isolatedCanvas.getContext('2d');
            if (isolatedCtx) {
              isolatedCtx.drawImage(maskCanvas, 0, 0);
              isolatedCtx.globalCompositeOperation = 'source-in';
              isolatedCtx.drawImage(tempCanvas, 0, 0);
              
              // Draw to main context
              ctx.globalCompositeOperation = 'source-over';
              ctx.fillStyle = '#09090b'; // Dark studio background
              ctx.fillRect(0, 0, 224, 224);
              ctx.drawImage(isolatedCanvas, 0, 0);
            }
          }
        } catch (e) {
          ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 224, 224);
        }
      }
    } else {
      // Draw the cropped center square onto the canvas normally
      ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 224, 224);
    }

    // Reset filter for any future canvas drawings
    ctx.filter = 'none';

    // ── Pre-Processing & Telemetry Extraction ──
    // Extract pixel buffer to calculate real-time lighting telemetry
    let avgBrightness = 120;
    try {
      const imgData = ctx.getImageData(0, 0, 224, 224);
      const data = imgData.data;
      let totalBrightness = 0;
      // Sample pixels to calculate average luma (ITU-R BT.601 formula)
      for (let i = 0; i < data.length; i += 40) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalBrightness += luma;
      }
      avgBrightness = Math.round(totalBrightness / (data.length / 40));
    } catch (e) {
      // Ignore security/origin exceptions on canvas
    }

    const latencyMs = parseFloat((performance.now() - startTime).toFixed(1));
    const quality = avgBrightness < 65 ? 'low_light' : avgBrightness > 220 ? 'overexposed' : 'optimal';
    
    // Update telemetry state
    setScannerTelemetry({ brightness: avgBrightness, latencyMs, quality });

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
  }, [cropRatio, filterMode]);


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

  // ── Smart AI Sentence Autocomplete Prediction Hook ──────────────────────────
  useEffect(() => {
    if (!sentence || sentence.trim().length === 0) {
      setAiPredictions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/predict-sentence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sentence }),
        });
        if (res.ok) {
          const data = await res.json();
          setAiPredictions(data.predictions || []);
        }
      } catch (err) {
        console.error('[ASL Sentence Predict error]', err);
      }
    }, 250); // 250ms premium debounce

    return () => clearTimeout(delayDebounce);
  }, [sentence]);

  const applyAiPrediction = (predictionText: string) => {
    setSentence(predictionText);
  };

  const speakText = () => {
    const textToSpeak = aiResponse ? aiResponse.replace('The user is saying: ', '') : sentence;
    if (!textToSpeak) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in your browser.");
    }
  };

  // ── Ask AI: Interpret compiled ASL sentence ──────────────────────────────
  const askGroqAI = async () => {
    if (!sentence.trim()) return;
    setIsAiThinking(true);
    setAiResponse('');
    const groqKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
    if (!groqKey) {
      setAiResponse('⚠ Missing NEXT_PUBLIC_GROQ_API_KEY in your .env.local file.');
      setIsAiThinking(false);
      return;
    }
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a deaf people advisor. The user is deaf or hard of hearing and spells out messages letter by letter or word by word using ASL gestures. Your job is to interpret their disjointed words or letters into a proper, coherent sentence.
Output ONLY the final interpreted sentence starting with 'The user is saying: '. Do not add any other commentary.`,
            },
            {
              role: 'user',
              content: sentence.trim(),
            },
          ],
          temperature: 0.6,
          max_tokens: 120,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        setAiResponse(reply || 'No response received.');
      } else {
        const errorText = await res.text();
        console.error("Groq AI Error:", res.status, errorText);
        setAiResponse(`AI error (${res.status}): ${errorText.substring(0, 50)}...`);
      }
    } catch (err: any) {
      console.error("Groq AI Exception:", err);
      setAiResponse(`Connection failed: ${err.message}`);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Auto-trigger AI Interpretation after 2 seconds of no typing
  useEffect(() => {
    if (!sentence || sentence.trim().length === 0) {
      setAiResponse('');
      return;
    }
    const timeout = setTimeout(() => {
      askGroqAI();
    }, 2000);
    return () => clearTimeout(timeout);
  }, [sentence]);

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
      <div className="flex-grow flex-1 min-h-0 w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-4 md:py-5 flex flex-col justify-between">
        
        {/* The 3-Column Side-by-Side HUD */}
        <div className="flex-grow flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
          
          {/* Left Column (5/12ths ~ 40% width): Camera & Output Document */}
          <div className="lg:col-span-5 flex flex-col gap-5 min-h-0 h-full">
            
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
                  {/* Toggle AI Studio */}
                  <button
                    onClick={() => setFilterMode(prev => prev === 'ai_studio' ? 'boost' : 'ai_studio')}
                    className={`absolute z-30 px-3.5 py-1.5 rounded-full text-[9px] font-mono uppercase tracking-widest backdrop-blur-md transition-all active:scale-95 shadow-lg shadow-black/20 cursor-pointer animate-in fade-in duration-300 ${filterMode === 'ai_studio' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-black/60 text-zinc-400 border border-white/10 hover:bg-white/10'}`}
                    style={{ top: '4%', left: '4%' }}
                  >
                    {filterMode === 'ai_studio' ? '✦ AI STUDIO ON' : 'AI STUDIO OFF'}
                  </button>

                  {/* Terminate camera */}
                  <button
                    onClick={stopCamera}
                    className="absolute z-30 px-3.5 py-1.5 rounded-full text-[9px] font-mono uppercase tracking-widest backdrop-blur-md bg-black/60 text-red-400 border border-red-500/25 transition-all hover:bg-red-500/20 active:scale-95 shadow-lg shadow-black/20 cursor-pointer animate-in fade-in duration-300"
                    style={{ top: '4%', right: '4%' }}
                  >
                    Turn Off
                  </button>

                  {/* High-Tech Crop Zone Indicator (Region of Interest) */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 select-none animate-in fade-in zoom-in-95 duration-500">
                    <div 
                      className="relative border border-dashed border-indigo-500/40 rounded-[2.5rem] bg-indigo-500/5 shadow-[0_0_40px_rgba(99,102,241,0.08)] flex flex-col items-center justify-center backdrop-blur-[0.5px] transition-all duration-300"
                      style={{
                        width: '92%',
                        height: '92%',
                      }}
                    >
                      {/* Corner Brackets */}
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-2xl -mt-1 -ml-1" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-2xl -mt-1 -mr-1" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-2xl -mb-1 -ml-1" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-2xl -mb-1 -mr-1" />
                      
                      {/* Live scanning line effect */}
                      <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent top-1/2 animate-[scan_2.5s_ease-in-out_infinite]" />
                      
                      {/* Sub-label */}
                      <span className="text-[9px] font-mono tracking-widest text-indigo-300 font-extrabold bg-zinc-950/85 px-4 py-2 rounded-full border border-indigo-500/35 shadow-lg select-none">
                        ASL REAL-TIME OPTICAL FEED
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

              {/* AI Advisor Response */}
              {(isAiThinking || aiResponse) && (
                <div className="mb-3 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 animate-in fade-in zoom-in duration-300">
                  <p className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest mb-1">✦ Advisor AI</p>
                  <p className="text-sm font-medium text-zinc-300">
                    {isAiThinking ? 'Interpreting...' : aiResponse}
                  </p>
                </div>
              )}

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
                    onClick={speakText}
                    disabled={!sentence && !aiResponse}
                    className="py-1.5 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold transition-all active:scale-95 disabled:opacity-30 flex items-center gap-1.5 cursor-pointer border bg-[var(--dm-bg-input)]"
                    style={{ 
                      color: 'var(--dm-text-secondary)', 
                      borderColor: 'var(--dm-border)',
                    }}
                    onMouseEnter={e => { if (sentence || aiResponse) { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#3b82f6'; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--dm-border)'; e.currentTarget.style.color = 'var(--dm-text-secondary)'; }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.898a9 9 0 010 12.728M5 10v4a2 2 0 002 2h3l4 4V4L10 8H7a2 2 0 00-2 2z" /></svg>
                    Speak
                  </button>

                </div>
              </div>
            </div>
          </div>

          {/* Middle Column (3/12ths ~ 25% width): AI Telemetry & Predictions */}
          <div className="lg:col-span-3 flex flex-col gap-5 min-h-0 h-full">
            
            {/* AI Diagnostics HUD - Height Increased significantly, pushing others down */}
            <div
              className="flex-[2.8] min-h-[240px] rounded-[2rem] p-5 flex flex-col items-center justify-center gap-4 border relative overflow-hidden"
              style={{ 
                background: 'var(--dm-bg-sidebar)', 
                borderColor: 'var(--dm-border)',
              }}
            >
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
                  {result.top3.map((item, i) => {
                    return (
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
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5 opacity-30">
                  {[1, 2, 3].map((idx) => {
                    return (
                      <div key={idx} className="flex items-center gap-2.5">
                        <span className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] font-mono font-bold bg-zinc-900 text-zinc-600 border border-zinc-800">
                          0{idx}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 w-10">—</span>
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-900" />
                        <span className="text-[9px] font-mono w-8 text-right text-zinc-600">0%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Right Column (4/12ths ~ 33.3% width): Smart AI Panel */}
          <div className="lg:col-span-4 flex flex-col gap-5 min-h-0 h-full">
            <div 
              className="flex-grow flex-1 rounded-[2rem] p-5 border flex flex-col"
              style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border)' }}
            >
              <div className="flex flex-col gap-3.5 min-h-0 h-full">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </span>
                  <div>
                    <h4 className="text-[10px] font-mono tracking-widest text-indigo-300 uppercase font-extrabold">ASL AI Interpreter</h4>
                    <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">AI understands what you are trying to say</p>
                  </div>
                </div>

                {/* AI Response Panel */}
                {(aiResponse || isAiThinking) && (
                  <div
                    className="rounded-2xl p-4 border animate-in fade-in slide-in-from-bottom-2 duration-500"
                    style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.2)' }}
                  >
                    <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-indigo-400 mb-2">✦ AI Response</p>
                    {isAiThinking ? (
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        <span className="text-[9px] font-mono text-indigo-300 ml-1">Interpreting your signs...</span>
                      </div>
                    ) : (
                      <p className="text-[11px] font-sans leading-relaxed" style={{ color: 'var(--dm-text-primary)' }}>
                        {aiResponse}
                      </p>
                    )}
                  </div>
                )}

                {/* Divider */}
                {aiPredictions.length > 0 && (
                  <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-500">Predicted Phrases</p>
                )}

                {/* Suggestions List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {aiPredictions.length > 0 ? (
                    <div className="space-y-2">
                      {aiPredictions.map((pred, i) => (
                        <button
                          key={i}
                          onClick={() => applyAiPrediction(pred)}
                          className="w-full text-left p-3 rounded-2xl border transition-all duration-300 active:scale-[0.98] flex flex-col gap-1.5 cursor-pointer bg-[var(--dm-bg-input)] hover:border-indigo-500/40 text-zinc-200"
                          style={{ borderColor: 'var(--dm-border)' }}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-bold border border-indigo-500/20">
                              SUGGESTION 0{i + 1}
                            </span>
                            <span className="text-[8px] font-mono text-zinc-500">✦ AI MATCH</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold leading-snug break-words">
                            {pred}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    !aiResponse && !isAiThinking && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-3 mt-6">
                        <div className="w-10 h-10 rounded-full bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-2.5">
                          <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Awaiting Input...</p>
                        <p className="text-[8px] font-mono text-zinc-600 mt-1 uppercase max-w-[160px] leading-relaxed">
                          Sign letters to compile text, then click <span className="text-indigo-400">✦ Ask AI</span> for interpretation
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
