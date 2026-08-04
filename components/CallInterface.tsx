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

// Ultra-reliable Online STUN & TURN Servers for seamless connection through firewalls & poor networks
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
  { urls: ['stun:global.relay.metered.ca:80', 'stun:global.relay.metered.ca:443'] },
  {
    urls: [
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turn:global.relay.metered.ca:443?transport=tcp',
      'turns:global.relay.metered.ca:443?transport=tcp'
    ],
    username: '3fe6f0a72ac7f100111cacfe',
    credential: 'k8LmNASFj+JSwE0D'
  },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:80?transport=tcp',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all'
};

export default function CallInterface({ socket, peer, type, isCaller, isAccepted, initialOffer, onEnd }: CallInterfaceProps) {
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'active' | 'ended'>(isCaller ? 'ringing' : 'connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasEnded = useRef(false);
  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingSignalsRef = useRef<any[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

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
        playRing();
        ringInterval = setInterval(playRing, 3000);
      } catch {
        console.warn("Audio API not supported or blocked");
      }
    }

    return () => {
      if (ringInterval) clearInterval(ringInterval);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [callStatus]);

  // Duration timer
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

  // Drain Queued ICE Candidates safely
  const drainIceCandidates = async (pc: RTCPeerConnection) => {
    while (candidateQueueRef.current.length > 0) {
      const candidate = candidateQueueRef.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[CallEngine] Queued ICE Candidate error:', e);
        }
      }
    }
  };

  // Unified WebRTC Signal Handler with bulletproof queueing
  const handleSignalRef = useRef<any>(null);

  const handleSignal = async (signal: any) => {
    if (!pcRef.current) {
      pendingSignalsRef.current.push(signal);
      return;
    }
    const pc = pcRef.current;
    const target = peer.email?.toLowerCase().trim();

    try {
      // 1. RECEIVE OFFER
      if (signal.type === 'offer' || (signal.sdp && signal.sdp.type === 'offer')) {
        const sdpInit = signal.sdp || signal;
        await pc.setRemoteDescription(new RTCSessionDescription(sdpInit));
        await drainIceCandidates(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc_signal', {
          to: target,
          toUserId: peer.id,
          signal: { type: 'answer', sdp: answer.sdp }
        });
        return;
      }

      // 2. RECEIVE ANSWER
      if (signal.type === 'answer' || (signal.sdp && signal.sdp.type === 'answer')) {
        const sdpInit = signal.sdp || signal;
        await pc.setRemoteDescription(new RTCSessionDescription(sdpInit));
        await drainIceCandidates(pc);
        return;
      }

      // 3. ICE CANDIDATE
      if (signal.candidate || signal.sdpMid !== undefined) {
        const candidateInit = signal.candidate || signal;
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch(e => console.warn('[CallEngine] Add ICE error:', e));
        } else {
          candidateQueueRef.current.push(candidateInit);
        }
      }
    } catch (e) {
      console.error("[CallEngine] WebRTC Signaling Error:", e);
    }
  };

  useEffect(() => {
    handleSignalRef.current = handleSignal;
  });

  useEffect(() => {
    if (!socket) return;
    const handleSignalWrapper = (data: any) => {
      if (handleSignalRef.current) handleSignalRef.current(data);
    };
    const handleCallEnded = () => handleEnd();

    socket.on('webrtc_signal', handleSignalWrapper);
    socket.on('call_ended', handleCallEnded);

    return () => {
      socket.off('webrtc_signal', handleSignalWrapper);
      socket.off('call_ended', handleCallEnded);
    };
  }, [socket]);

  // Acceptance Transition (For Caller)
  useEffect(() => {
    if (isAccepted && callStatus === 'ringing') {
      setCallStatus('connecting');
    }
  }, [isAccepted, callStatus]);

  // Media & Connection Initialization
  useEffect(() => {
    let isMounted = true;
    const target = peer.email?.toLowerCase().trim();
    let initTimer: NodeJS.Timeout;

    const initCall = async () => {
      try {
        let stream: MediaStream | null = null;
        // Adaptive media constraints to ensure fast acquisition & resilience on poor internet
        const mediaConstraints: MediaStreamConstraints = {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: type === 'video' ? {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          } : false
        };

        let retries = 3;
        while (retries > 0) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            break;
          } catch {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
              break;
            } catch (err) {
              retries--;
              if (retries === 0) throw err;
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
        if (!stream) throw new Error("Stream could not be acquired.");
        if (!isMounted) return;

        localStreamRef.current = stream;
        setLocalStream(stream);

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream!);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('webrtc_signal', {
              to: target,
              toUserId: peer.id,
              signal: { candidate: event.candidate }
            });
          }
        };

        pc.ontrack = (event) => {
          const incomingStream = event.streams[0] ?? new MediaStream([event.track]);
          setRemoteStream(incomingStream);
          setCallStatus('active');
        };

        // ICE Connection State Monitoring with Automatic Restart on bad internet drops
        pc.oniceconnectionstatechange = () => {
          console.log("[CallEngine] ICE state:", pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setCallStatus('active');
          } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            pc.restartIce();
          }
        };

        pc.onconnectionstatechange = () => {
          console.log("[CallEngine] Connection state:", pc.connectionState);
          if (pc.connectionState === 'connected') setCallStatus('active');
          if (pc.connectionState === 'failed') pc.restartIce();
        };

        // Process any signals received before PeerConnection was fully constructed
        while (pendingSignalsRef.current.length > 0) {
          const pendingSignal = pendingSignalsRef.current.shift();
          if (pendingSignal && handleSignalRef.current) {
            await handleSignalRef.current(pendingSignal);
          }
        }

        // If caller, create & send SDP offer immediately upon init (matching AdminCamViewer pipeline)
        if (isCaller) {
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: type === 'video'
            });
            await pc.setLocalDescription(offer);
            socket.emit('webrtc_signal', {
              to: target,
              toUserId: peer.id,
              signal: { type: 'offer', sdp: offer.sdp }
            });
          } catch (e) {
            console.error("[CallEngine] Initial offer error:", e);
          }
        } else if (initialOffer) {
          handleSignal(initialOffer);
        }
      } catch (err) {
        console.error("[CallEngine] Media initialization error:", err);
        handleEnd();
      }
    };

    initTimer = setTimeout(() => { initCall(); }, 150);

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
      cleanup();
    };
  }, [isCaller]);

  // Handle re-sending offer when caller receives explicit call acceptance
  useEffect(() => {
    if (isCaller && isAccepted && pcRef.current && localStreamRef.current && socket) {
      const target = peer.email?.toLowerCase().trim();
      if (!target) return;
      
      const createOffer = async () => {
        try {
          const pc = pcRef.current!;
          // Only create new offer if not already connected or signaling
          if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: type === 'video'
            });
            await pc.setLocalDescription(offer);
            socket.emit('webrtc_signal', {
              to: target,
              toUserId: peer.id,
              signal: { type: 'offer', sdp: offer.sdp }
            });
          }
        } catch (e) {
          console.error("[CallEngine] Offer creation error:", e);
        }
      };
      
      createOffer();
    }
  }, [isAccepted, isCaller, peer.email, peer.id, socket, type]);

  // Wire local stream → video element
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video || !localStream) return;
    if (video.srcObject !== localStream) {
      video.srcObject = localStream;
      video.play().catch(e => console.warn('Local video play:', e));
    }
  }, [localStream]);

  // Wire remote stream → video/audio element
  useEffect(() => {
    if (!remoteStream) return;
    if (type === 'video' && remoteVideoRef.current) {
      const videoEl = remoteVideoRef.current;
      if (videoEl.srcObject !== remoteStream) {
        videoEl.srcObject = remoteStream;
        videoEl.play().catch(() => {
          const retryPlay = () => {
            videoEl.play().catch(() => {});
            document.removeEventListener('click', retryPlay);
            document.removeEventListener('touchstart', retryPlay);
          };
          document.addEventListener('click', retryPlay, { once: true });
          document.addEventListener('touchstart', retryPlay, { once: true });
        });
      }
    } else if (type === 'audio' && remoteAudioRef.current) {
      const audioEl = remoteAudioRef.current;
      if (audioEl.srcObject !== remoteStream) {
        audioEl.srcObject = remoteStream;
        audioEl.play().catch(e => console.warn('Remote audio play:', e));
      }
    }
  }, [remoteStream, type]);

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEnd = () => {
    if (hasEnded.current) return;
    hasEnded.current = true;
    socket.emit('end_call', { to: peer.email?.toLowerCase().trim(), toUserId: peer.id });
    cleanup();
    onEnd(durationRef.current, callStatus === 'active' || durationRef.current > 0);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current && type === 'video') {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOff(!videoTrack.enabled);
      }
    }
  };

  const toggleSpeaker = async () => {
    const targetAudio = type === 'video' ? remoteVideoRef.current : remoteAudioRef.current;
    if (!targetAudio) return;
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);
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
      } catch {
        console.log('Audio routing not supported');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500 overflow-hidden font-sans" style={{ background: '#000000', color: '#ffffff' }}>
      {/* Remote video/audio */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        controls={false}
        className={`absolute inset-0 w-full h-full object-cover ${type !== 'video' ? 'hidden' : ''}`}
        style={{ background: '#000000' }}
      />
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Main UI Layer */}
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center" style={{ background: '#000000' }}>

        {/* Timer (video only) */}
        {type === 'video' && callStatus === 'active' && (
          <div className="absolute top-[calc(1.5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 px-4 py-2 backdrop-blur-xl rounded-full shadow-lg flex items-center gap-3" style={{ background: 'var(--dm-bg-sidebar)', border: '1px solid var(--dm-border)' }}>
            <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-white rounded-full animate-pulse" />
            <span className="text-xs font-semibold tracking-wider" style={{ color: 'var(--dm-text-primary)' }}>{formatDuration(duration)}</span>
          </div>
        )}

        {/* Center Content (Audio Call or Ringing/Connecting) */}
        {(type === 'audio' || callStatus !== 'active') && (
          <div className="flex flex-col items-center gap-6 text-center animate-in zoom-in duration-700">
            <div className="relative">
              {callStatus === 'ringing' && (
                <>
                  <div className="absolute inset-0 rounded-full animate-ping [animation-duration:2s]" style={{ background: 'var(--dm-bg-active)' }} />
                  <div className="absolute -inset-6 rounded-full animate-pulse [animation-duration:3s]" style={{ background: 'var(--dm-bg-input)', opacity: 0.5 }} />
                </>
              )}
              <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 shadow-2xl flex items-center justify-center text-4xl font-bold" style={{ borderColor: 'var(--dm-border)', background: 'var(--dm-bg-sidebar)', color: 'var(--dm-text-primary)' }}>
                {peer.image ? <img src={peer.image} className="w-full h-full object-cover" alt="peer" /> : <img src="/Avatar.avif" className="w-full h-full object-cover" alt="avatar" />}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--dm-text-primary)' }}>{peer.name}</h2>
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

        {/* Local Video (PiP) */}
        {type === 'video' && (
          <div className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 md:top-[calc(1.5rem+env(safe-area-inset-top,0px))] md:right-6 w-24 h-32 md:w-32 md:h-44 rounded-2xl md:rounded-3xl overflow-hidden shadow-xl z-20 group hover:scale-105 transition-transform duration-300" style={{ border: '2px solid var(--dm-border)', background: 'var(--dm-bg-sidebar)' }}>
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
          </div>
        )}

        {/* Action Bar */}
        <div className="absolute bottom-4 md:bottom-5 left-1/2 -translate-x-1/2 w-fit min-w-[290px] md:min-w-[340px] max-w-[90vw] z-40">
          <div className="w-full flex items-center justify-between px-5 md:px-7 py-3 md:py-4 rounded-[2rem] md:rounded-full shadow-2xl border" style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border)' }}>

            <button
              onClick={toggleSpeaker}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105"
              style={{
                background: isSpeakerOn ? 'var(--dm-bg-active)' : 'var(--dm-bg-input)',
                color: isSpeakerOn ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)',
                border: '1px solid var(--dm-border)',
                cursor: 'pointer'
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
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105"
              style={{
                background: isMuted ? 'var(--dm-bg-active)' : 'var(--dm-bg-input)',
                color: isMuted ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)',
                border: '1px solid var(--dm-border)',
                cursor: 'pointer'
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {type === 'video' && (
              <button
                onClick={toggleCamera}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{
                  background: isCamOff ? 'var(--dm-bg-active)' : 'var(--dm-bg-input)',
                  color: isCamOff ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)',
                  border: '1px solid var(--dm-border)',
                  cursor: 'pointer'
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}

            <button
              onClick={handleEnd}
              className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 transition-all active:scale-90"
              style={{ background: 'var(--dm-text-primary)', color: 'var(--dm-bg-main)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`.mirror { transform: scaleX(-1); }`}</style>
    </div>
  );
}
