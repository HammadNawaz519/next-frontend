'use client';

/**
 * useWebRTCCall — React hook that wraps WebRTCEngine for use in existing components.
 * 
 * Provides the same state/stream interface that CallInterface.tsx already consumes,
 * so the existing UI renders identically — only the underlying logic changes.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { WebRTCEngine, CallState, CallPeer, CallStats } from '@/lib/webrtc-engine';

interface UseWebRTCCallOptions {
  socket: Socket | null;
  peer: CallPeer;
  type: 'audio' | 'video';
  isCaller: boolean;
  isAccepted?: boolean;
  initialOffer?: any;
  callId?: string;
  onEnd?: (duration: number, wasConnected: boolean) => void;
}

interface UseWebRTCCallReturn {
  // State
  callStatus: 'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended';
  engineState: CallState;

  // Streams
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;

  // Controls
  isMuted: boolean;
  isCamOff: boolean;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => Promise<void>;
  handleEnd: () => void;

  // Timer
  duration: number;

  // Stats
  stats: CallStats | null;
}

// Map engine states to the status strings the existing UI expects
function mapStateToStatus(state: CallState): 'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended' {
  switch (state) {
    case 'idle':
    case 'outgoing':
    case 'ringing':
      return 'ringing';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'active';
    case 'reconnecting':
      return 'reconnecting';
    case 'ending':
    case 'ended':
    case 'rejected':
    case 'busy':
    case 'failed':
    case 'timeout':
      return 'ended';
    default:
      return 'connecting';
  }
}

export function useWebRTCCall({
  socket,
  peer,
  type,
  isCaller,
  isAccepted,
  initialOffer,
  callId,
  onEnd,
}: UseWebRTCCallOptions): UseWebRTCCallReturn {
  const engineRef = useRef<WebRTCEngine | null>(null);
  const hasEnded = useRef(false);
  const durationRef = useRef(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended'>(
    isCaller ? 'ringing' : 'connecting'
  );
  const [engineState, setEngineState] = useState<CallState>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [stats, setStats] = useState<CallStats | null>(null);

  // ── Initialize engine and start/accept call ────────────────────────────

  // *** FIX: Both refs declared here so the initCall closure and the isAccepted
  // watcher effect below share the SAME ref objects. hasAccepted must be before
  // the useEffect that references it inside the async initCall closure.
  const pendingAccepted = useRef(false);
  const hasAccepted = useRef(false);

  useEffect(() => {
    if (!socket || typeof window === 'undefined') return;

    const engine = new WebRTCEngine();
    engineRef.current = engine;

    // Subscribe to engine events
    engine.on('stateChange', (newState: CallState) => {
      setEngineState(newState);
      const mappedStatus = mapStateToStatus(newState);
      setCallStatus(mappedStatus);

      // Start duration timer when connected
      if (newState === 'connected' && !durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          durationRef.current += 1;
          setDuration(durationRef.current);
        }, 1000);
      }

      // Stop timer and trigger onEnd when call ends
      if (
        (newState === 'ended' || newState === 'rejected' || newState === 'busy' ||
         newState === 'failed' || newState === 'timeout') && !hasEnded.current
      ) {
        hasEnded.current = true;
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
        const wasConnected = durationRef.current > 0;
        onEnd?.(durationRef.current, wasConnected);
      }
    });

    engine.on('localStream', (stream: MediaStream) => {
      setLocalStream(new MediaStream(stream.getTracks()));
    });

    engine.on('remoteStream', (stream: MediaStream) => {
      setRemoteStream(new MediaStream(stream.getTracks()));
    });

    engine.on('stats', (s: CallStats) => {
      setStats(s);
    });

    engine.on('error', (msg: string) => {
      console.error('[useWebRTCCall] Error:', msg);
    });

    // Start or accept the call
    const initCall = async () => {
      try {
        if (isCaller) {
          await engine.startCall(peer, type, socket as any, callId);
          // *** FIX: Drain any call_accepted that arrived before init completed ***
          if (pendingAccepted.current && !hasAccepted.current) {
            hasAccepted.current = true;
            pendingAccepted.current = false;
            console.log('[useWebRTCCall] Draining pending call_accepted after engine init');
            engine.onCallAccepted();
          }
        } else {
          await engine.acceptCall(
            peer,
            type,
            socket as any,
            callId || `call-${Date.now()}`,
            initialOffer
          );
        }
      } catch (err) {
        console.error('[useWebRTCCall] Init error:', err);
      }
    };

    // Small delay to ensure component is fully mounted
    const initTimer = setTimeout(initCall, 100);

    return () => {
      clearTimeout(initTimer);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isCaller]);

  // ── Handle caller-side acceptance (remote peer accepted the call) ──────
  // Guard with hasAccepted ref so onCallAccepted() fires EXACTLY ONCE per call.
  // Without this, any parent re-render while isAccepted=true would re-trigger it.
  // (hasAccepted ref is declared above, before the init useEffect)

  useEffect(() => {
    if (isCaller && isAccepted && !hasAccepted.current) {
      if (engineRef.current) {
        // Engine is ready — fire immediately
        hasAccepted.current = true;
        engineRef.current.onCallAccepted();
      } else {
        // *** FIX: Engine not ready yet (within 100ms init window) — queue it ***
        // The init function above will drain pendingAccepted once startCall() completes.
        console.log('[useWebRTCCall] call_accepted arrived before engine ready — queuing');
        pendingAccepted.current = true;
      }
    }
  }, [isAccepted, isCaller]);

  // ── Controls ───────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (engineRef.current) {
      const nowMuted = engineRef.current.toggleMute();
      setIsMuted(nowMuted);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    if (engineRef.current) {
      const nowOff = await engineRef.current.toggleCamera();
      setIsCamOff(nowOff);
    }
  }, []);

  const switchCamera = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.switchCamera();
    }
  }, []);

  const handleEnd = useCallback(() => {
    if (hasEnded.current) return;
    if (engineRef.current) {
      engineRef.current.endCall();
    }
    // If engine didn't fire the event (e.g., already destroyed), trigger manually
    if (!hasEnded.current) {
      hasEnded.current = true;
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      onEnd?.(durationRef.current, durationRef.current > 0);
    }
  }, [onEnd]);

  return {
    callStatus,
    engineState,
    localStream,
    remoteStream,
    isMuted,
    isCamOff,
    toggleMute,
    toggleCamera,
    switchCamera,
    handleEnd,
    duration,
    stats,
  };
}
