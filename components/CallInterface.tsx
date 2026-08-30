"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useWebRTCCall } from '@/hooks/use-webrtc-call';
import { triggerHaptic } from '@/lib/haptics';

interface CallInterfaceProps {
  socket: Socket;
  peer: any;
  type: 'audio' | 'video';
  isCaller: boolean;
  isAccepted?: boolean;
  initialOffer?: any;
  callId?: string;
  onEnd: (duration?: number, wasConnected?: boolean) => void;
}

const PASTEL_AVATAR_BGS = ['#FFF3CD', '#E0F2FE', '#FCE7F3', '#FEF9C3', '#EDE9FE', '#DCFCE7'];

function getDeterministicAvatarBg(key: string): string {
  if (!key) return PASTEL_AVATAR_BGS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PASTEL_AVATAR_BGS.length;
  return PASTEL_AVATAR_BGS[index];
}

export default function CallInterface({
  socket,
  peer,
  type: initialType,
  isCaller,
  isAccepted,
  initialOffer,
  callId,
  onEnd,
}: CallInterfaceProps) {
  const [currentCallType, setCurrentCallType] = useState<'audio' | 'video'>(initialType);

  const {
    callStatus,
    localStream,
    remoteStream,
    isMuted,
    isCamOff,
    toggleMute,
    toggleCamera,
    switchCamera,
    handleEnd,
    duration,
  } = useWebRTCCall({
    socket,
    peer,
    type: currentCallType,
    isCaller,
    isAccepted,
    initialOffer,
    callId,
    onEnd: (dur, wasConnected) => onEnd(dur, wasConnected),
  });

  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fullScreenVideoRef = useRef<HTMLVideoElement>(null);
  const localPipVideoRef = useRef<HTMLVideoElement>(null);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(
    typeof window !== 'undefined'
      ? (() => {
          const el = document.createElement('audio');
          el.autoplay = true;
          el.setAttribute('playsinline', '');
          return el;
        })()
      : null
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // 30-Second Ringing Timeout (Caller side)
  useEffect(() => {
    let timeoutTimer: NodeJS.Timeout | null = null;
    if (callStatus === 'ringing' && isCaller) {
      timeoutTimer = setTimeout(() => {
        const target = peer.email?.toLowerCase().trim();
        socket.emit('call_timeout', { to: target, toUserId: peer.id });
        handleEnd();
      }, 30000);
    }
    return () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }, [callStatus, isCaller, peer.email, peer.id, socket, handleEnd]);

  // Haptics on Ringing
  useEffect(() => {
    if (callStatus === 'ringing') {
      try {
        if (typeof window !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      } catch {}
    }
  }, [callStatus]);

  // Wire video streams
  useEffect(() => {
    if (currentCallType !== 'video') return;
    const videoEl = fullScreenVideoRef.current;
    if (!videoEl) return;

    const streamToShow = callStatus === 'active' ? remoteStream : localStream;
    if (streamToShow) {
      if (videoEl.srcObject !== streamToShow) {
        videoEl.srcObject = streamToShow;
      }
      videoEl.muted = true;
      videoEl.play().catch((e) => console.warn('Full-screen video play error:', e));
    }
  }, [currentCallType, callStatus, remoteStream, localStream]);

  // Wire small floating PiP video stream
  useEffect(() => {
    if (currentCallType !== 'video' || callStatus !== 'active') return;
    const pipEl = localPipVideoRef.current;
    if (!pipEl || !localStream) return;

    if (pipEl.srcObject !== localStream) {
      pipEl.srcObject = localStream;
    }
    pipEl.muted = true;
    pipEl.play().catch((e) => console.warn('PiP video play error:', e));
  }, [currentCallType, callStatus, localStream]);

  // Wire remote audio stream
  useEffect(() => {
    if (!remoteStream) return;
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    if (audioEl.srcObject !== remoteStream) {
      audioEl.srcObject = remoteStream;
    }
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn('Remote audio play error:', e);
        const retryPlay = () => {
          audioEl.play().catch(() => {});
          document.removeEventListener('click', retryPlay);
          document.removeEventListener('touchstart', retryPlay);
        };
        document.addEventListener('click', retryPlay, { once: true });
        document.addEventListener('touchstart', retryPlay, { once: true });
      });
    }
  }, [remoteStream]);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSwitchCamera = async () => {
    triggerHaptic('light');
    await switchCamera();
  };

  const toggleSpeaker = async () => {
    triggerHaptic('light');
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);
    if (typeof (audioEl as any).setSinkId !== 'undefined') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
        if (audioOutputs.length > 0) {
          if (nextState) {
            const speaker =
              audioOutputs.find(
                (d) =>
                  d.label.toLowerCase().includes('speaker') ||
                  d.label.toLowerCase().includes('loudspeaker')
              ) || audioOutputs[audioOutputs.length - 1];
            if (speaker) await (audioEl as any).setSinkId(speaker.deviceId);
          } else {
            const earpiece =
              audioOutputs.find(
                (d) =>
                  d.label.toLowerCase().includes('earpiece') ||
                  d.label.toLowerCase().includes('receiver')
              ) || audioOutputs[0];
            if (earpiece) await (audioEl as any).setSinkId(earpiece.deviceId);
          }
        }
      } catch {
        console.log('Audio output routing not supported on this device');
      }
    }
  };

  const handleVideoToggle = () => {
    triggerHaptic('light');
    if (currentCallType === 'audio') {
      setCurrentCallType('video');
      showToast('Switched to Video Mode');
    } else {
      toggleCamera();
    }
  };

  const callerDisplayName = peer.username || peer.name || 'User';
  const avatarKey = peer.id || peer.username || callerDisplayName;
  const avatarBg = getDeterministicAvatarBg(avatarKey);

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col justify-between bg-[#141111] p-4 sm:p-5 pt-12 pb-6 overflow-hidden select-none font-sans">
      
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          {toastMessage}
        </div>
      )}

      {/* ── 1. UPPER WHITE CONTAINER (ROUNDED ALL AROUND) ── */}
      <div className="w-full flex-1 bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_15px_45px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between p-5 min-h-0">
        
        {/* Top Floating Bar inside White Card */}
        <div className="w-full flex items-center justify-between z-20 shrink-0">
          {/* Borderless Back Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              handleEnd();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 active:scale-90 transition-all cursor-pointer shadow-xs border-0 outline-none"
            title="End / Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Center Call Mode Indicator */}
          <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium shadow-2xs">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="tracking-wide text-[11px] font-semibold uppercase">
              {currentCallType === 'video' ? 'Video Call' : 'Voice Call'}
            </span>
          </div>

          {/* Top-Right: Camera Flip in Video Mode or Empty Spacer in Audio */}
          {currentCallType === 'video' ? (
            <button
              onClick={handleSwitchCamera}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 active:scale-90 transition-all cursor-pointer shadow-xs border-0 outline-none"
              title="Flip camera"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          ) : (
            <div className="w-10 h-10" />
          )}
        </div>

        {/* ── VOICE CALL CENTER DISPLAY (DP of user, Name, Status) ── */}
        {currentCallType === 'audio' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center my-auto w-full z-10 animate-in zoom-in-95 duration-300">
            {/* User DP / Avatar */}
            <div className="relative mb-5">
              <div
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden flex items-center justify-center text-3xl font-bold text-zinc-900 shadow-xl border-4 border-white relative z-10"
                style={{ backgroundColor: avatarBg }}
              >
                {peer.image && peer.image.length > 5 ? (
                  <img
                    src={peer.image}
                    alt={callerDisplayName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span>{callerDisplayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>

            {/* Caller Name */}
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight truncate max-w-[85%]">
              {callerDisplayName}
            </h2>

            {/* Status / Active Timer */}
            <div className="mt-3 px-4 py-1.5 rounded-full bg-zinc-100 text-zinc-800 text-[13px] font-bold shadow-2xs">
              {callStatus === 'active'
                ? formatDuration(duration)
                : callStatus === 'ringing'
                ? 'Ringing...'
                : callStatus === 'reconnecting'
                ? 'Reconnecting...'
                : 'Connecting...'}
            </div>
          </div>
        )}

        {/* ── VIDEO CALL VIDEO DISPLAY (Remote screen in white box) ── */}
        {currentCallType === 'video' && (
          <div className="absolute inset-0 w-full h-full rounded-[32px] sm:rounded-[36px] overflow-hidden bg-black flex items-center justify-center">
            {/* Full Remote / Local Video Feed */}
            <video
              ref={fullScreenVideoRef}
              autoPlay
              playsInline
              muted
              controls={false}
              disablePictureInPicture
              poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
              className={`w-full h-full object-cover ${callStatus !== 'active' ? 'mirror' : ''}`}
            />

            {/* Remote Camera Off Fallback */}
            {callStatus === 'active' && isCamOff && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-zinc-900/90 pointer-events-none">
                <div
                  className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold text-zinc-900 shadow-xl border-2 border-white/20 mb-3"
                  style={{ backgroundColor: avatarBg }}
                >
                  {peer.image && peer.image.length > 5 ? (
                    <img src={peer.image} className="w-full h-full object-cover" alt="caller" />
                  ) : (
                    <span>{callerDisplayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-xs text-zinc-300 font-medium">Camera is turned off</span>
              </div>
            )}

            {/* Floating Local Camera PiP (Self view in bottom-right) */}
            {callStatus === 'active' && (
              <div className="absolute bottom-4 right-4 w-24 h-36 sm:w-28 sm:h-40 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/80 bg-zinc-900 z-20">
                <video
                  ref={localPipVideoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  disablePictureInPicture
                  className="w-full h-full object-cover mirror"
                />
              </div>
            )}

            {/* Bottom-Left Partner Name & Timer Overlay on Video */}
            <div className="absolute bottom-4 left-4 z-20 bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15 text-white flex items-center gap-2">
              <span className="text-xs font-bold truncate max-w-[120px]">{callerDisplayName}</span>
              <span className="text-zinc-400 text-xs">•</span>
              <span className="text-xs font-semibold text-zinc-200">
                {callStatus === 'active'
                  ? formatDuration(duration)
                  : callStatus === 'ringing'
                  ? 'Ringing...'
                  : 'Connecting...'}
              </span>
            </div>
          </div>
        )}

        {/* Bottom subtle visualizer / spacer inside white card */}
        <div className="w-full h-1 shrink-0" />
      </div>

      {/* ── 2. BOTTOM DARK ZINC CONTAINER (ROUNDED ALL AROUND) ── */}
      <div className="w-full bg-[#141111] border border-zinc-800/80 rounded-[32px] sm:rounded-[36px] py-4 px-6 mt-4 shadow-[0_10px_35px_rgba(0,0,0,0.5)] flex items-center justify-around shrink-0">
        
        {/* 1. Mic Enable / Disable (Mute / Unmute) */}
        <button
          onClick={() => {
            triggerHaptic('light');
            toggleMute();
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border-0 outline-none ${
            isMuted
              ? 'bg-zinc-800 text-red-400 ring-2 ring-red-500/40'
              : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          }`}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMuted ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>

        {/* 2. Speaker Output Toggle */}
        <button
          onClick={toggleSpeaker}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border-0 outline-none ${
            isSpeakerOn
              ? 'bg-white text-zinc-900 shadow-lg'
              : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          }`}
          title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {isSpeakerOn ? (
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            ) : (
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            )}
          </svg>
        </button>

        {/* 3. Video / Camera Enable Button */}
        <button
          onClick={handleVideoToggle}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border-0 outline-none ${
            currentCallType === 'video' && isCamOff
              ? 'bg-zinc-800 text-red-400 ring-2 ring-red-500/40'
              : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          }`}
          title={
            currentCallType === 'audio'
              ? 'Switch to Video Call'
              : isCamOff
              ? 'Turn Camera On'
              : 'Turn Camera Off'
          }
        >
          {currentCallType === 'video' && isCamOff ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m4 0h5a2 2 0 0 1 2 2v3m6-2v8l-6-4 6-4Z" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
          )}
        </button>

        {/* 4. End Call Button */}
        <button
          onClick={() => {
            triggerHaptic('heavy');
            handleEnd();
          }}
          className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 active:scale-90 text-white transition-all shadow-[0_6px_20px_rgba(239,68,68,0.45)] cursor-pointer border-0 outline-none"
          title="End Call"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>

      </div>
    </div>
  );
}
