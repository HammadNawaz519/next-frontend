"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface CallInterfaceProps {
  socket: Socket;
  peer: any;
  type: 'audio' | 'video';
  isCaller: boolean;
  isAccepted?: boolean;
  initialOffer?: any;
  onEnd: (duration?: number, wasConnected?: boolean) => void;
}

export default function CallInterface({ socket, peer, type, isCaller, isAccepted, initialOffer, onEnd }: CallInterfaceProps) {
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'active' | 'ended'>(isCaller ? 'ringing' : 'connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false); // Default to false (earpiece preference)
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasEnded = useRef(false);
  const remoteDescriptionSetRef = useRef(false);
  const candidateQueueRef = useRef<any[]>([]);

  // ── Unified ASL Real-time Call Translation ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPredicting = useRef(false);
  const lastAddedAt = useRef<number>(0);

  const [sentence, setSentence] = useState<string>('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [currentLetter, setCurrentLetter] = useState<string>('');
  const [currentConf, setCurrentConf] = useState<number>(0);

  // ── Call Captioning (Voice-to-Text) ──
  const [myCaption, setMyCaption] = useState<string>('');
  const [peerCaption, setPeerCaption] = useState<string>('');
  const [isCaptionsOn, setIsCaptionsOn] = useState<boolean>(true);
  const areCaptionsVisible = isCaptionsOn && (!!myCaption || !!peerCaption) && callStatus === 'active';
  const clearPeerCaptionRef = useRef<NodeJS.Timeout | null>(null);
  const clearMyCaptionRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
  const LABEL_DISPLAY: Record<string, string> = {
    nothing: '—',
    space: 'Space',
    del: 'Delete',
  };

  const captureAndPredict = useCallback(async () => {
    const video = localVideoRef.current;
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
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentLetter(data.prediction);
          setCurrentConf(data.confidence);

          const now = Date.now();
          const { prediction, stability, confidence } = data;
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
        }
      } catch (err) {
        console.error("VideoCall translation error:", err);
      } finally {
        isPredicting.current = false;
      }
    }, 'image/jpeg', 0.7);
  }, [lastAdded]);

  useEffect(() => {
    let callInterval: NodeJS.Timeout | null = null;
    if (callStatus === 'active' && type === 'video') {
      callInterval = setInterval(() => {
        if (!isPredicting.current) captureAndPredict();
      }, 100); // 10 FPS is perfect for live overlays
    }
    return () => {
      if (callInterval) clearInterval(callInterval);
    };
  }, [callStatus, type, captureAndPredict]);

  // ── Speech Recognition for Live Captions ──
  useEffect(() => {
    if (callStatus === 'active' && !isMuted && isCaptionsOn) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          const transcript = finalTranscript || interimTranscript;
          if (transcript.trim()) {
            setMyCaption(transcript.trim());
            
            // Clear local caption after 4 seconds of silence
            if (clearMyCaptionRef.current) clearTimeout(clearMyCaptionRef.current);
            clearMyCaptionRef.current = setTimeout(() => setMyCaption(''), 4000);

            // Send to peer via signaling channel
            const target = peer.email?.toLowerCase().trim();
            if (target) {
              socket.emit('webrtc_signal', { to: target, signal: { caption: transcript.trim() } });
            }
          }
        };

        recognition.onerror = (e: any) => console.error("Speech recognition error:", e.error);
        
        recognition.onend = () => {
           if (callStatus === 'active' && !isMuted) {
             try { recognition.start(); } catch(e) {}
           }
        };

        speechRecognitionRef.current = recognition;
        try { recognition.start(); } catch(e) {}
      }
    } else {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
    }

    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      }
    };
  }, [callStatus, isMuted, isCaptionsOn, peer.email, socket]);

  const handleEnd = () => {
    if (hasEnded.current) return;
    hasEnded.current = true;
    
    // Explicitly notify peer to cut the call
    const target = peer.email?.toLowerCase().trim();
    if (target) {
      socket.emit('end_call', { to: target });
    }

    cleanup();
    onEnd(durationRef.current, callStatus === 'active' || durationRef.current > 0);
  };

  // Ringing Sound Effect
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let ringInterval: NodeJS.Timeout | null = null;

    if (callStatus === 'ringing') {
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

        const playRing = () => {
          if (!audioCtx) return;
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();

          oscillator.type = 'sine';
          // Classic dual-tone ringing frequency (440Hz + 480Hz)
          oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);

          gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime + 1.2);
          gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.3);

          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 1.5);
        };

        playRing(); // play first ring immediately
        ringInterval = setInterval(playRing, 3000); // repeat every 3s
      } catch (e) {
        console.error("Audio API not supported or blocked");
      }
    }

    return () => {
      if (ringInterval) clearInterval(ringInterval);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => { });
      }
    };
  }, [callStatus]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (callStatus === 'active') {
      timer = setInterval(() => {
        setDuration(prev => prev + 1);
        durationRef.current += 1;
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callStatus]);

  // 1. Unified Signal Handler
  const handleSignal = async (signal: any) => {
    if (signal.caption !== undefined) {
      setPeerCaption(signal.caption);
      if (clearPeerCaptionRef.current) clearTimeout(clearPeerCaptionRef.current);
      clearPeerCaptionRef.current = setTimeout(() => setPeerCaption(''), 4000);
      return;
    }

    if (!pcRef.current) {
      console.log("Signal received but PC not ready, retrying in 100ms...");
      setTimeout(() => handleSignal(signal), 100);
      return;
    }

    try {
      if (signal.sdp) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        remoteDescriptionSetRef.current = true;
        console.log("Remote description set successfully!");

        // Process queued candidates
        while (candidateQueueRef.current.length > 0) {
          const candidate = candidateQueueRef.current.shift();
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("Queued ICE candidate applied!");
          } catch (err) {
            console.error("Error applying queued candidate:", err);
          }
        }

        if (signal.sdp.type === 'offer') {
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socket.emit('webrtc_signal', { to: peer.email, signal: { sdp: answer } });
        }
      } else if (signal.candidate) {
        if (remoteDescriptionSetRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
          console.log("ICE candidate added immediately!");
        } else {
          console.log("Remote description not set yet, queuing candidate...");
          candidateQueueRef.current.push(signal.candidate);
        }
      }
    } catch (e) { console.error("WebRTC Signaling Error:", e); }
  };

  useEffect(() => {
    const handleCallEnded = () => handleEnd();
    socket.on('webrtc_signal', handleSignal);
    socket.on('call_ended', handleCallEnded);

    return () => {
      socket.off('webrtc_signal', handleSignal);
      socket.off('call_ended', handleCallEnded);
    };
  }, []);

  // 2. Acceptance Transition (For Caller)
  useEffect(() => {
    if (isAccepted && callStatus === 'ringing') {
      setCallStatus('connecting');
    }
  }, [isAccepted]);

  // 3. Media & Connection Initialization
  useEffect(() => {
    let isMounted = true;
    const target = peer.email?.toLowerCase().trim();
    let initTimer: NodeJS.Timeout;

    const initCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video'
        });
        if (!isMounted) return;
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(e => console.error("Local video play error:", e));
        }

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Public, high-quality, free STUN/TURN relays from OpenRelayProject (Metered.ca)
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ]
        });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          console.log("Remote track received:", event.track.kind);
          const remoteStream = event.streams[0];
          if (remoteVideoRef.current && type === 'video') {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => console.error("Remote video play error:", e));
          } else if (remoteAudioRef.current && type === 'audio') {
            remoteAudioRef.current.srcObject = remoteStream;
            // Force play if needed
            remoteAudioRef.current.play().catch(e => console.error("Audio play error:", e));
          }
          setCallStatus('active');
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            if (target) socket.emit('webrtc_signal', { to: target, signal: { candidate: event.candidate } });
          }
        };

        // If we have an initial offer (Receiver), process it immediately
        if (!isCaller && initialOffer) {
          console.log("Processing initial offer from SocialChat...");
          handleSignal(initialOffer);
        }

        // Start handshake: Receiver sends offer to Caller (if no initial offer)
        if (!isCaller && !initialOffer) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc_signal', { to: target, signal: { sdp: offer } });
        }
      } catch (err) {
        console.error("Media error:", err);
        handleEnd();
      }
    };

    // Add a 250ms delay to ensure WebcamASL has fully released the camera driver lock
    initTimer = setTimeout(() => {
      initCall();
    }, 250);

    return () => { 
      isMounted = false; 
      clearTimeout(initTimer);
      cleanup(); 
    };
  }, [isCaller]);

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    // Do NOT call socket.off('webrtc_signal') without a specific handler, 
    // as it removes ALL listeners including the parent's! The useEffect cleanup handles its own.
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current && type === 'video') {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsCamOff(!videoTrack.enabled);
    }
  };

  const toggleSpeaker = async () => {
    const targetAudio = type === 'video' ? remoteVideoRef.current : remoteAudioRef.current;
    if (!targetAudio) return;
    
    // Toggle state visually
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);

    // Attempt hardware routing if supported (setSinkId)
    if (typeof (targetAudio as any).setSinkId !== 'undefined') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        if (audioOutputs.length > 0) {
          if (nextState) {
            const speaker = audioOutputs.find(d => d.label.toLowerCase().includes('speaker')) || audioOutputs[audioOutputs.length - 1];
            if (speaker) await (targetAudio as any).setSinkId(speaker.deviceId);
          } else {
            const earpiece = audioOutputs.find(d => d.label.toLowerCase().includes('earpiece') || d.label.toLowerCase().includes('receiver')) || audioOutputs[0];
            if (earpiece) await (targetAudio as any).setSinkId(earpiece.deviceId);
          }
        }
      } catch (e) {
        console.log('Audio routing not supported by device/browser');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500 overflow-hidden font-sans" style={{ background: 'rgba(0,0,0,0.3)' }}>
      {/* Remote Audio/Video Elements */}
      {type === 'video' ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <audio ref={remoteAudioRef} autoPlay />
      )}

      {/* Main UI Layer */}
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center" style={{ background: type === 'video' ? 'rgba(0,0,0,0.5)' : 'transparent' }}>

        {/* Top Floating Status (Video Call) */}
        {type === 'video' && callStatus === 'active' && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 backdrop-blur-xl rounded-full shadow-lg flex items-center gap-3" style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)' }}>
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold tracking-wider" style={{ color: 'var(--dm-text-primary)' }}>{formatDuration(duration)}</span>
          </div>
        )}

        {/* Center Content (Audio Call or Ringing) */}
        {(type === 'audio' || callStatus !== 'active') && (
          <div className={`flex flex-col items-center gap-6 text-center animate-in zoom-in duration-700 transition-transform ${areCaptionsVisible ? '-translate-y-28 md:-translate-y-24' : ''}`}>
            <div className="relative">
              {callStatus === 'ringing' && (
                <>
                  <div className="absolute inset-0 rounded-full animate-ping [animation-duration:2s]" style={{ background: 'var(--dm-bg-input)' }} />
                  <div className="absolute -inset-6 rounded-full animate-pulse [animation-duration:3s]" style={{ background: 'var(--dm-bg-active)', opacity: 0.5 }} />
                </>
              )}
              <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 shadow-2xl flex items-center justify-center text-4xl font-bold" style={{ borderColor: 'var(--dm-bg-main)', background: 'var(--dm-bg-input)', color: 'var(--dm-text-primary)' }}>
                {peer.image ? <img src={peer.image} className="w-full h-full object-cover" /> : peer.name?.charAt(0)}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--dm-text-heading)' }}>{peer.name}</h2>
              <div className="flex items-center justify-center gap-2">
                <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest" style={{ background: 'var(--dm-bg-active)', color: 'var(--dm-text-secondary)' }}>
                  {type} Call
                </span>
                <span className="font-medium text-base" style={{ color: 'var(--dm-text-muted)' }}>
                  {callStatus === 'active' ? formatDuration(duration) : callStatus === 'ringing' ? 'Ringing...' : 'Connecting...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Local Video (PiP - Minimal Round) */}
        {type === 'video' && (
          <div className="absolute top-4 right-4 md:top-6 md:right-6 w-24 h-32 md:w-32 md:h-44 rounded-2xl md:rounded-3xl overflow-hidden shadow-xl z-20 group hover:scale-105 transition-transform duration-300" style={{ border: '2px solid var(--dm-border)', background: 'var(--dm-bg-input)' }}>
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
          </div>
        )}

        {/* ASL Live Translation Captions (Video Only) */}
        {type === 'video' && callStatus === 'active' && (
          <div className="absolute bottom-36 md:bottom-44 left-1/2 -translate-x-1/2 w-[85%] max-w-xl px-5 py-3 rounded-2xl backdrop-blur-md bg-black/60 border border-white/10 shadow-2xl flex flex-col items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-500 text-white z-30 pointer-events-auto">
            <div className="flex items-center justify-between w-full opacity-60">
              <span className="text-[7.5px] font-mono tracking-[0.2em] text-zinc-300 uppercase">
                ✦ LIVE ASL TRANSLATION CAPTIONS
              </span>
              {sentence && (
                <button
                  onClick={() => { setSentence(''); setLastAdded(null); }}
                  className="text-[7.5px] font-mono tracking-widest text-red-400 hover:text-red-300 cursor-pointer uppercase transition-colors bg-transparent border-none p-0"
                >
                  [ Clear ]
                </button>
              )}
            </div>
            <p className="text-sm md:text-base font-bold tracking-wider text-center text-white" style={{ fontFamily: 'monospace', margin: 0 }}>
              {sentence ? (
                <>
                  {sentence}
                  <span className="inline-block w-1.5 h-3.5 ml-1 bg-white align-middle animate-[cursor-blink_1s_step-start_infinite]" style={{ animation: 'cursor-blink 1s step-start infinite' }} />
                </>
              ) : (
                <span className="text-[11px] font-normal italic text-zinc-500">
                  Begin signing in camera to display live translated captions…
                </span>
              )}
            </p>
            {currentLetter && currentLetter !== 'nothing' && (
              <span className="text-[8px] font-mono mt-0.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
                CURRENT SIGN: {LABEL_DISPLAY[currentLetter] ?? currentLetter} ({(currentConf * 100).toFixed(0)}%)
              </span>
            )}
          </div>
        )}

        {/* ── BOTTOM STACK: CAPTIONS + ACTION BAR ── */}
        <div className="absolute bottom-4 md:bottom-5 left-1/2 -translate-x-1/2 w-fit min-w-[290px] md:min-w-[340px] max-w-[90vw] flex flex-col items-stretch justify-end gap-3 z-40 pointer-events-none">
          
          {/* Speech Subtitles */}
          {areCaptionsVisible && (
            <div className="w-full flex flex-col gap-2 pointer-events-auto">
              {/* Peer's Caption */}
              {peerCaption && (
                <div className="w-full px-5 py-2 md:py-2.5 rounded-2xl md:rounded-3xl backdrop-blur-2xl bg-white border border-white/50 shadow-[0_10px_40px_rgba(0,0,0,0.15)] animate-in fade-in slide-in-from-bottom-2 duration-300 text-center">
                  <span className="text-[8.5px] font-mono font-bold tracking-[0.2em] text-indigo-500 uppercase mb-0.5 block">
                    {peer.name}
                  </span>
                  <p className="text-sm md:text-[15px] font-bold text-black leading-snug">
                    {peerCaption}
                  </p>
                </div>
              )}
              
              {/* My Caption */}
              {myCaption && (
                <div className="w-full px-5 py-2 md:py-2.5 rounded-2xl md:rounded-3xl backdrop-blur-2xl bg-white border border-white/50 shadow-[0_10px_40px_rgba(0,0,0,0.15)] animate-in fade-in slide-in-from-bottom-2 duration-300 text-center">
                  <span className="text-[8.5px] font-mono font-bold tracking-[0.2em] text-emerald-600 uppercase mb-0.5 block">
                    You
                  </span>
                  <p className="text-sm md:text-[15px] font-bold text-black leading-snug">
                    {myCaption}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Bar (The Vibe) */}
          <div className="w-full flex items-center justify-between px-5 md:px-7 py-3 md:py-4 backdrop-blur-2xl rounded-[1.5rem] md:rounded-full shadow-2xl pointer-events-auto" style={{ background: 'var(--dm-bg-sidebar)', border: '1px solid var(--dm-border)' }}>
            
            {/* Captions Toggle Button */}
            <button
              onClick={() => setIsCaptionsOn(!isCaptionsOn)}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${!isCaptionsOn ? 'text-zinc-500' : 'hover:scale-105'}`}
              style={{ 
                background: !isCaptionsOn ? 'var(--dm-bg-input)' : 'var(--dm-bg-active)', 
                color: !isCaptionsOn ? 'var(--dm-text-muted)' : 'var(--dm-text-primary)',
                border: '1px solid var(--dm-border)'
              }}
              title={isCaptionsOn ? "Turn Captions Off" : "Turn Captions On"}
            >
              {isCaptionsOn ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M8 8h8m-8 4h4m-3 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h1M21 6v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              )}
            </button>

            <button
              onClick={toggleSpeaker}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105`}
              style={{ 
                background: isSpeakerOn ? 'var(--dm-bg-active)' : 'var(--dm-bg-input)', 
                color: isSpeakerOn ? 'var(--dm-text-primary)' : 'var(--dm-text-secondary)',
                border: '1px solid var(--dm-border)'
              }}
            >
              {isSpeakerOn ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>

            <button
              onClick={toggleMute}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${isMuted ? 'text-red-500' : 'hover:scale-105'}`}
              style={{ background: isMuted ? 'rgba(239,68,68,0.1)' : 'var(--dm-bg-input)', color: isMuted ? '#ef4444' : 'var(--dm-text-secondary)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {type === 'video' && (
              <button
                onClick={toggleCamera}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${isCamOff ? 'text-red-500' : 'hover:scale-105'}`}
                style={{ background: isCamOff ? 'rgba(239,68,68,0.1)' : 'var(--dm-bg-input)', color: isCamOff ? '#ef4444' : 'var(--dm-text-secondary)' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}

            <button
              onClick={handleEnd}
              className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-xl active:scale-90"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="absolute bottom-4 text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--dm-text-muted)' }}>

        </p>
      </div>

      <style jsx>{`
        .mirror { transform: scaleX(-1); }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
