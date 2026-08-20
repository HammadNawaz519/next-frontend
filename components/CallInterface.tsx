"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useWebRTCCall } from '@/hooks/use-webrtc-call';

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

export default function CallInterface({
  socket,
  peer,
  type,
  isCaller,
  isAccepted,
  initialOffer,
  callId,
  onEnd,
}: CallInterfaceProps) {
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
    type,
    isCaller,
    isAccepted,
    initialOffer,
    callId,
    onEnd: (dur, wasConnected) => onEnd(dur, wasConnected),
  });

  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fullScreenVideoRef = useRef<HTMLVideoElement>(null);
  const localPipVideoRef = useRef<HTMLVideoElement>(null);
  // *** FIX Bug 9: Create audio element imperatively so it always exists when stream arrives ***
  // If we rely on the JSX <audio> ref, it may be null when the first ontrack fires (race condition)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(
    typeof window !== 'undefined' ? (() => {
      const el = document.createElement('audio');
      el.autoplay = true;
      // playsInline is not on HTMLAudioElement type but is valid HTML — set via attribute
      el.setAttribute('playsinline', '');
      return el;
    })() : null
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
        console.log('[CallEngine] Ringing timed out after 30s');
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

  // Wire full-screen video stream:
  // 1. When calling / ringing / connecting: Show own camera (localStream) in full screen
  // 2. When call is connected (active): Show remote partner video (remoteStream) in full screen
  useEffect(() => {
    if (type !== 'video') return;
    const videoEl = fullScreenVideoRef.current;
    if (!videoEl) return;

    const streamToShow = callStatus === 'active' ? remoteStream : localStream;
    if (streamToShow) {
      if (videoEl.srcObject !== streamToShow) {
        videoEl.srcObject = streamToShow;
      }
      videoEl.muted = true;
      videoEl.play().catch(e => console.warn('Full-screen video play error:', e));
    }
  }, [type, callStatus, remoteStream, localStream]);

  // Wire small floating PiP video stream (shows localStream when active video call is connected)
  useEffect(() => {
    if (type !== 'video' || callStatus !== 'active') return;
    const pipEl = localPipVideoRef.current;
    if (!pipEl || !localStream) return;

    if (pipEl.srcObject !== localStream) {
      pipEl.srcObject = localStream;
    }
    pipEl.muted = true;
    pipEl.play().catch(e => console.warn('PiP video play error:', e));
  }, [type, callStatus, localStream]);

  // Wire remote audio stream to dedicated audio element (ensures uninterrupted voice)
  // Works even if remoteAudioRef was created imperatively above
  useEffect(() => {
    if (!remoteStream) return;
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    if (audioEl.srcObject !== remoteStream) {
      audioEl.srcObject = remoteStream;
    }
    // Ensure it plays — browsers may have autoplay policy
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        console.warn('Remote audio play error:', e);
        // Retry on user interaction
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
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSwitchCamera = async () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    await switchCamera();
  };

  const toggleSpeaker = async () => {
    // *** FIX Bug 9 (speaker): Always use remoteAudioRef — it reliably contains the remote audio ***
    // For video calls the <video> element is muted, so audio always flows through the audio element.
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);
    if (typeof (audioEl as any).setSinkId !== 'undefined') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        if (audioOutputs.length > 0) {
          if (nextState) {
            const speaker = audioOutputs.find(d =>
              d.label.toLowerCase().includes('speaker') ||
              d.label.toLowerCase().includes('loudspeaker')
            ) || audioOutputs[audioOutputs.length - 1];
            if (speaker) await (audioEl as any).setSinkId(speaker.deviceId);
          } else {
            const earpiece = audioOutputs.find(d =>
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

  const callerDisplayName = peer.name || peer.username || peer.email?.split('@')[0] || 'User';

  return (
    <div
      className="fixed inset-0 z-[1500] flex flex-col justify-between overflow-hidden select-none font-sans text-white"
      style={{
        background: '#000000',
        color: '#ffffff',
      }}
    >
      {/* Background Video Layer for Video Calls:
          - During ringing / connecting: Shows your local camera full-screen with mirror effect
          - Once active: Shows remote video full-screen
      */}
      {type === 'video' && (
        <video
          ref={fullScreenVideoRef}
          autoPlay
          playsInline
          muted
          controls={false}
          disablePictureInPicture
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          className={`absolute inset-0 w-full h-full object-cover z-0 ${callStatus !== 'active' ? 'mirror' : ''}`}
          style={{ background: '#000000' }}
        />
      )}
      {/* Hidden audio element for remote audio — used as srcObject target for all call types.
          For video calls the <video> element is always muted (avoids echo), audio flows here.
          This element was created imperatively in remoteAudioRef to avoid null-on-mount race. */}
      {/* No JSX <audio> needed — element is created imperatively in the ref initializer above */}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          {toastMessage}
        </div>
      )}

      {/* ─── 1. TOP HEADER (Back Button + Caller Info + Flip Camera Button) ──── */}
      <div className="relative z-20 w-full pt-[calc(14px+env(safe-area-inset-top,0px))] px-5 pb-3 flex items-center justify-between pointer-events-auto">
        {/* Top-Left: Back Button */}
        <button
          onClick={handleEnd}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1c2830]/80 hover:bg-[#253540] active:scale-90 text-white transition-all cursor-pointer shadow-lg backdrop-blur-md border border-white/10"
          title="Back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Center: Caller Information */}
        <div className="flex flex-col items-center text-center max-w-[65%] px-2">
          <h2 className="text-lg md:text-xl font-bold text-white tracking-tight truncate max-w-full drop-shadow-md">
            {callerDisplayName}
          </h2>

          <div className="flex items-center justify-center gap-1.5 mt-0.5 text-xs text-zinc-400 font-medium">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="tracking-wide">End-to-end encrypted</span>
          </div>

          <p className="text-xs md:text-sm font-semibold text-zinc-300 mt-1">
            {callStatus === 'active'
              ? formatDuration(duration)
              : callStatus === 'ringing'
              ? 'Ringing...'
              : callStatus === 'reconnecting'
              ? 'Reconnecting...'
              : 'Connecting...'}
          </p>
        </div>

        {/* Top-Right: Camera Flip Button in Video Mode, or Empty Spacer in Audio */}
        {type === 'video' ? (
          <button
            onClick={handleSwitchCamera}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1c2830]/80 hover:bg-[#253540] active:scale-90 text-white transition-all cursor-pointer shadow-lg backdrop-blur-md border border-white/10"
            title="Flip camera"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        ) : (
          <div className="w-11 h-11" />
        )}
      </div>

      {/* ─── 2. CENTER SECTION ─────────────────────────────────────────────── */}
      {/* Audio Call: Compact Small Profile Picture */}
      {type === 'audio' && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 my-auto z-10 w-full animate-in zoom-in-95 duration-500">
          <div className="relative w-32 h-32 md:w-36 md:h-36 rounded-full overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.85)] border-2 border-white/10 bg-[#162026] flex items-center justify-center">
            {callStatus === 'ringing' && (
              <>
                <div className="absolute inset-0 rounded-full animate-ping opacity-25 bg-emerald-500 [animation-duration:2.5s]" />
                <div className="absolute -inset-3 rounded-full animate-pulse opacity-20 bg-emerald-400 [animation-duration:3s]" />
              </>
            )}
            {peer.image && peer.image.length > 5 ? (
              <img src={peer.image} className="w-full h-full object-cover" alt="caller" referrerPolicy="no-referrer" />
            ) : (
              <img src="/Avatar.avif" className="w-full h-full object-cover" alt="avatar" />
            )}
          </div>
        </div>
      )}

      {/* Video Call: Avatar fallback only if active connected call has remote camera turned off */}
      {type === 'video' && callStatus === 'active' && isCamOff && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
          <div className="w-28 h-28 rounded-full overflow-hidden shadow-2xl border-2 border-white/15 bg-[#162026]">
            {peer.image && peer.image.length > 5 ? (
              <img src={peer.image} className="w-full h-full object-cover" alt="caller" referrerPolicy="no-referrer" />
            ) : (
              <img src="/Avatar.avif" className="w-full h-full object-cover" alt="avatar" />
            )}
          </div>
          <span className="text-xs text-zinc-400 font-medium mt-3">Camera is turned off</span>
        </div>
      )}

      {/* Video Call Local Floating Preview (PiP): ONLY shown when call is ACTIVE / connected */}
      {type === 'video' && callStatus === 'active' && (
        <div className="absolute top-[calc(4.5rem+env(safe-area-inset-top,0px))] right-4 w-24 h-36 sm:w-28 sm:h-40 rounded-2xl overflow-hidden shadow-[0_15px_35px_rgba(0,0,0,0.7)] border-2 border-white/20 bg-[#162026] z-20 pointer-events-auto animate-in zoom-in-95 duration-300">
          <video
            ref={localPipVideoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            disablePictureInPicture
            poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            className="w-full h-full object-cover mirror"
          />
        </div>
      )}

      {/* ─── 3. BOTTOM CONTROLS (Lowered closer to bottom) ─────────────────── */}
      <div className="w-full px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-0 flex flex-col items-center z-30 pointer-events-auto">
        {type === 'video' ? (
          /* ── VIDEO CALL: Single-Row Toolbar (Video, Mic, Speaker, End) ── */
          <div
            className="w-auto max-w-[94vw] rounded-full px-6 py-3 bg-[#162026]/95 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex items-center gap-5 sm:gap-6"
            style={{ background: 'rgba(22, 32, 38, 0.95)' }}
          >
            {/* 1. Video Turn On / Off */}
            <button
              onClick={toggleCamera}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
                isCamOff
                  ? 'bg-red-500/25 text-red-400 border border-red-500/30'
                  : 'bg-[#2a3942] hover:bg-[#344752] text-white'
              }`}
              title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isCamOff ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m4 0h5a2 2 0 0 1 2 2v3m6-2v8l-6-4 6-4Z" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 8-6 4 6 4V8Z" />
                  <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                </svg>
              )}
            </button>

            {/* 2. Mic Mute / Unmute */}
            <button
              onClick={toggleMute}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
                isMuted
                  ? 'bg-white text-[#111b21] shadow-lg'
                  : 'bg-[#2a3942] hover:bg-[#344752] text-white'
              }`}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="2" y1="2" x2="22" y2="22" />
                  <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                  <path d="M5 10v2a7 7 0 0 0 12 5" />
                  <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </button>

            {/* 3. Speaker On / Off */}
            <button
              onClick={toggleSpeaker}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
                isSpeakerOn
                  ? 'bg-white text-[#111b21] shadow-lg'
                  : 'bg-[#2a3942] hover:bg-[#344752] text-white'
              }`}
              title={isSpeakerOn ? "Speaker on" : "Speaker off"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {isSpeakerOn ? (
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                ) : (
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                )}
              </svg>
            </button>

            {/* 4. End Call Button */}
            <button
              onClick={handleEnd}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center bg-[#ea394b] hover:bg-[#d92d40] active:scale-90 text-white transition-all shadow-[0_8px_25px_rgba(234,57,75,0.55)] cursor-pointer"
              title="End Call"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          </div>
        ) : (
          /* ── AUDIO CALL: Spacious, Well-Distanced 3x2 Control Panel ───────── */
          <div
            className="w-full max-w-[430px] rounded-[36px] px-6 py-6 sm:px-8 sm:py-7 bg-[#162026]/95 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.85)]"
            style={{ background: 'rgba(22, 32, 38, 0.95)' }}
          >
            <div className="grid grid-cols-3 gap-y-7 gap-x-6 sm:gap-x-8 place-items-center">

              {/* 1. SPEAKER BUTTON */}
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={toggleSpeaker}
                  className={`w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
                    isSpeakerOn
                      ? 'bg-white text-[#111b21] shadow-lg'
                      : 'bg-[#2a3942] hover:bg-[#344752] text-white'
                  }`}
                  title={isSpeakerOn ? "Speaker on" : "Speaker off"}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {isSpeakerOn ? (
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    ) : (
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    )}
                  </svg>
                </button>
                <span className="text-xs font-medium text-white/90 tracking-wide">Speaker</span>
              </div>

              {/* 2. VIDEO UPGRADE BUTTON */}
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={() => showToast("Upgrade to video call")}
                  className="w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full flex items-center justify-center bg-[#2a3942] hover:bg-[#344752] active:scale-90 text-white transition-all cursor-pointer shadow-md"
                  title="Video"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 8-6 4 6 4V8Z" />
                    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                  </svg>
                </button>
                <span className="text-xs font-medium text-white/90 tracking-wide">Video</span>
              </div>

              {/* 3. MUTE BUTTON */}
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={toggleMute}
                  className={`w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
                    isMuted
                      ? 'bg-white text-[#111b21] shadow-lg'
                      : 'bg-[#2a3942] hover:bg-[#344752] text-white'
                  }`}
                  title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isMuted ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="2" y1="2" x2="22" y2="22" />
                      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                      <path d="M5 10v2a7 7 0 0 0 12 5" />
                      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  ) : (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  )}
                </button>
                <span className="text-xs font-medium text-white/90 tracking-wide">Mute</span>
              </div>

              {/* 4. MORE BUTTON */}
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={() => setShowMoreOptions(prev => !prev)}
                  className="w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full flex items-center justify-center bg-[#2a3942] hover:bg-[#344752] active:scale-90 text-white transition-all cursor-pointer shadow-md"
                  title="More options"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                <span className="text-xs font-medium text-white/90 tracking-wide">More</span>
              </div>

              {/* 5. SPEAKERPHONE STATUS INDICATOR */}
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={toggleSpeaker}
                  className={`w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
                    isSpeakerOn
                      ? 'bg-white text-[#111b21] shadow-lg'
                      : 'bg-[#2a3942] hover:bg-[#344752] text-white'
                  }`}
                  title="Speaker Output"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                </button>
                <span className="text-xs font-medium text-white/90 tracking-wide">Audio</span>
              </div>

              {/* 6. END CALL BUTTON */}
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={handleEnd}
                  className="w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full flex items-center justify-center bg-[#ea394b] hover:bg-[#d92d40] active:scale-90 text-white transition-all shadow-[0_8px_25px_rgba(234,57,75,0.55)] cursor-pointer"
                  title="End Call"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                  </svg>
                </button>
                <span className="text-xs font-semibold text-white tracking-wide">End</span>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ─── MORE OPTIONS MODAL ────────────────────────────────────────────── */}
      {showMoreOptions && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowMoreOptions(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-5 bg-[#182229] border border-white/10 shadow-2xl space-y-3 animate-in slide-in-from-bottom-6 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white tracking-tight">Call Options</h3>
              <button
                onClick={() => setShowMoreOptions(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => {
                  toggleSpeaker();
                  setShowMoreOptions(false);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-between text-xs font-medium text-white transition-all"
              >
                <span>Speakerphone Output</span>
                <span className="text-zinc-400 font-bold">{isSpeakerOn ? 'On' : 'Off'}</span>
              </button>

              <button
                onClick={() => {
                  toggleMute();
                  setShowMoreOptions(false);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-between text-xs font-medium text-white transition-all"
              >
                <span>Mute Microphone</span>
                <span className="text-zinc-400 font-bold">{isMuted ? 'Muted' : 'Unmuted'}</span>
              </button>

              <button
                onClick={() => {
                  handleSwitchCamera();
                  setShowMoreOptions(false);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-between text-xs font-medium text-white transition-all"
              >
                <span>Switch Camera (Front/Back)</span>
                <span className="text-zinc-400 font-bold">Flip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mirror { transform: scaleX(-1); }
        video::-webkit-media-controls,
        video::-webkit-media-controls-start-playback-button,
        video::-webkit-media-controls-play-button,
        video::-webkit-media-controls-overlay-play-button,
        video::-webkit-media-controls-enclosure,
        video::-webkit-media-controls-panel {
          display: none !important;
          -webkit-appearance: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
    </div>
  );
}
