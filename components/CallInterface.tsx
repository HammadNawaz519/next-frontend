"use client";

import React, { useEffect, useRef, useState } from 'react';
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
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasEnded = useRef(false);

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
    if (!pcRef.current) {
      console.log("Signal received but PC not ready, retrying in 100ms...");
      setTimeout(() => handleSignal(signal), 100);
      return;
    }

    try {
      if (signal.sdp) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socket.emit('webrtc_signal', { to: peer.email, signal: { sdp: answer } });
        }
      } else if (signal.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
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
    const initCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video'
        });
        if (!isMounted) return;
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
          ]
        });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          console.log("Remote track received:", event.track.kind);
          const remoteStream = event.streams[0];
          if (remoteVideoRef.current && type === 'video') {
            remoteVideoRef.current.srcObject = remoteStream;
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

    initCall();
    return () => { isMounted = false; cleanup(); };
  }, [isCaller]);

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    socket.off('webrtc_signal');
    socket.off('call_ended');
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500 overflow-hidden font-sans" style={{ background: 'rgba(0,0,0,0.3)' }}>
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
          <div className="flex flex-col items-center gap-6 text-center animate-in zoom-in duration-700">
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

        {/* Action Bar (The Vibe) */}
        <div className="absolute bottom-10 md:bottom-12 flex items-center gap-4 md:gap-6 px-6 md:px-8 py-3 md:py-4 backdrop-blur-2xl rounded-full shadow-2xl z-30" style={{ background: 'var(--dm-bg-sidebar)', border: '1px solid var(--dm-border)' }}>

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

        {/* Footer info */}
        <p className="absolute bottom-4 text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--dm-text-muted)' }}>

        </p>
      </div>

      <style jsx>{`
        .mirror { transform: scaleX(-1); }
      `}</style>
    </div>
  );
}
