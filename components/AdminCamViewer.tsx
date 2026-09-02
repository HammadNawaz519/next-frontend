'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ChevronLeft,
  RotateCw,
  Users,
} from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
const ADMIN_EMAILS = [
  'hammadnawaz519@gmail.com'
];

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

let cachedAdminRtcConfig: RTCConfiguration | null = null;
let adminRtcConfigFetchedAt = 0;
const ADMIN_RTC_CONFIG_TTL = 60 * 60 * 1000;

async function fetchRtcConfig(): Promise<RTCConfiguration> {
  if (cachedAdminRtcConfig && Date.now() - adminRtcConfigFetchedAt < ADMIN_RTC_CONFIG_TTL) {
    return cachedAdminRtcConfig;
  }

  try {
    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
    let res: Response | null = await fetch(`${serverUrl}/api/turn-credentials`).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('/api/turn-credentials', { credentials: 'include' }).catch(() => null);
    }
    if (!res || !res.ok) throw new Error(`TURN API unavailable`);
    const data = await res.json();
    if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      cachedAdminRtcConfig = {
        iceServers: [
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
              'stun:stun.relay.metered.ca:80',
            ]
          },
          ...data.iceServers,
        ],
        iceCandidatePoolSize: 0,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all',
      };
      adminRtcConfigFetchedAt = Date.now();
      return cachedAdminRtcConfig;
    }
    return FALLBACK_RTC_CONFIG;
  } catch (err) {
    console.warn('[AdminCamViewer] [TURN] Fetch fallback used:', err);
    return FALLBACK_RTC_CONFIG;
  }
}

interface CamUser {
  email: string;
  username: string;
  socketId: string;
  connectedAt?: number;
}

interface AdminCamViewerProps {
  userEmail: string;
  username: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCamUsersCount?: (count: number) => void;
}

const PASTEL_AVATAR_BGS = ['#FFF3CD', '#E0F2FE', '#FCE7F3', '#FEF9C3', '#EDE9FE', '#DCFCE7'];
function getPastelAvatarBg(key: string): string {
  if (!key) return PASTEL_AVATAR_BGS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return PASTEL_AVATAR_BGS[Math.abs(hash) % PASTEL_AVATAR_BGS.length];
}

// FIX 1: Helper to reliably play a video element, respecting mute state
function safePlayVideo(videoEl: HTMLVideoElement | null, stream: MediaStream | null, muted: boolean) {
  if (!videoEl || !stream) return;
  if (videoEl.srcObject !== stream) {
    videoEl.srcObject = stream;
  }
  videoEl.muted = muted;
  videoEl.play().catch(() => {
    // Browser blocked autoplay — force muted and retry once
    videoEl.muted = true;
    videoEl.play().catch(() => { });
  });
}

export default function AdminCamViewer({
  userEmail,
  username,
  isOpen,
  onOpenChange,
  onCamUsersCount,
}: AdminCamViewerProps) {
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail.toLowerCase().trim());

  const [camUsers, setCamUsers] = useState<CamUser[]>([]);
  const [viewingUser, setViewingUser] = useState<CamUser | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  const connectionGenerationRef = useRef(0);
  const viewingUserRef = useRef<CamUser | null>(null);
  const viewingSocketIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  // FIX 2: Persistent MediaStream accumulator ref instead of stale closure local var
  const accumulatedStreamRef = useRef<MediaStream | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNegotiatingRef = useRef(false);
  // FIX 3: Track current mute state in a ref so async callbacks can read it
  const isAudioMutedRef = useRef(false);

  useEffect(() => {
    viewingUserRef.current = viewingUser;
  }, [viewingUser]);

  useEffect(() => {
    isAudioMutedRef.current = isAudioMuted;
  }, [isAudioMuted]);

  useEffect(() => {
    onCamUsersCount?.(camUsers.length);
  }, [camUsers.length, onCamUsersCount]);

  // Duration timer when streaming
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (streamStatus === 'live') {
      timer = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [streamStatus]);

  // FIX 4: Single source of truth — sync remoteStream to video element here only.
  // Removed the duplicate useEffect that was fighting this one.
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      safePlayVideo(remoteVideoRef.current, remoteStream, isAudioMutedRef.current);
    }
  }, [remoteStream]);

  // FIX 5: setVideoRef no longer depends on remoteStream (avoids re-mount loop).
  // It only wires up the element; the useEffect above handles stream assignment.
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    remoteVideoRef.current = node;
    if (node && remoteStream) {
      safePlayVideo(node, remoteStream, isAudioMutedRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dedupeAndSortCamUsers = useCallback((users: CamUser[], adminEmail: string): CamUser[] => {
    const map = new Map<string, CamUser>();
    const cleanAdmin = (adminEmail || '').toLowerCase().trim();

    users.forEach(u => {
      if (!u) return;
      const key = (u.email ? u.email.toLowerCase().trim() : u.socketId) || '';
      if (!key) return;

      if (key === cleanAdmin || ADMIN_EMAILS.includes(key) || (u.username && u.username.toLowerCase().includes('admin'))) {
        return;
      }

      map.set(key, {
        ...u,
        email: u.email ? u.email.toLowerCase().trim() : key,
        username: u.username || (u as any).name || 'User'
      });
    });

    const uniqueList = Array.from(map.values());
    return uniqueList.sort((a, b) => a.username.localeCompare(b.username));
  }, []);

  const closeViewerPeerConnection = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onsignalingstatechange = null;
        pcRef.current.close();
      } catch (err) {
        console.warn('[AdminCamViewer] [WebRTC] Error closing PC:', err);
      }
      pcRef.current = null;
    }

    // FIX 6: Also clear the accumulated stream ref on close
    accumulatedStreamRef.current = null;
    iceCandidateQueue.current = [];
    isNegotiatingRef.current = false;
  }, []);

  const stopViewing = useCallback(() => {
    if (socketRef.current?.connected && viewingUserRef.current) {
      socketRef.current.emit('cam_stop_viewing', {
        targetSocketId: viewingUserRef.current.socketId,
        targetEmail: viewingUserRef.current.email,
      });
    }

    connectionGenerationRef.current += 1;
    closeViewerPeerConnection();

    setRemoteStream(null);
    setViewingUser(null);
    viewingUserRef.current = null;
    setStreamStatus('idle');
    setDuration(0);
    viewingSocketIdRef.current = null;
  }, [closeViewerPeerConnection]);

  const handleIncomingSignal = useCallback(async (
    fromSocketId: string,
    fromEmail: string | undefined,
    signal: any
  ) => {
    const pc = pcRef.current;
    if (!pc) return;

    const currentTarget = viewingUserRef.current;
    if (!currentTarget) return;

    const matchesSocket = fromSocketId === currentTarget.socketId || fromSocketId === viewingSocketIdRef.current;
    const matchesEmail = fromEmail && currentTarget.email && fromEmail.toLowerCase().trim() === currentTarget.email.toLowerCase().trim();

    if (!matchesSocket && !matchesEmail) {
      console.warn('[AdminCamViewer] [Signaling] Signal from unexpected peer ignored:', fromSocketId);
      return;
    }

    if (fromSocketId && fromSocketId !== viewingSocketIdRef.current) {
      viewingSocketIdRef.current = fromSocketId;
    }

    try {
      if (signal.type === 'cam_error') {
        console.warn('[AdminCamViewer] Remote cam error:', signal.reason);
        setStreamStatus('error');
        return;
      }

      if (signal.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));

          while (iceCandidateQueue.current.length > 0) {
            const cand = iceCandidateQueue.current.shift();
            if (cand && cand.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {
                console.warn('[AdminCamViewer] [ICE] Queued candidate error:', e);
              });
            }
          }
        }
        return;
      }

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
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch(e => {
              console.warn('[AdminCamViewer] [ICE] Candidate add error:', e);
            });
          } else {
            iceCandidateQueue.current.push(candidateInit);
          }
        }
      }
    } catch (err) {
      console.warn('[AdminCamViewer] [Signaling] Error handling signal:', err);
    }
  }, []);

  const startViewing = useCallback(async (user: CamUser) => {
    const currentGen = ++connectionGenerationRef.current;

    closeViewerPeerConnection();
    setViewingUser(user);
    viewingUserRef.current = user;
    viewingSocketIdRef.current = user.socketId;
    setStreamStatus('connecting');
    setRemoteStream(null);

    // FIX 7: Reset the accumulated stream ref for this new connection
    accumulatedStreamRef.current = new MediaStream();

    try {
      const rtcConfig = await fetchRtcConfig();
      if (currentGen !== connectionGenerationRef.current) return;

      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;
      iceCandidateQueue.current = [];
      isNegotiatingRef.current = false;

      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (currentGen !== connectionGenerationRef.current) return;

        let streamToUse: MediaStream | null = null;

        if (event.streams && event.streams[0]) {
          // FIX 8: Prefer the stream directly from the event (most reliable path)
          streamToUse = event.streams[0];
        } else {
          // Fallback: accumulate tracks manually into our persistent ref
          const acc = accumulatedStreamRef.current;
          if (acc && !acc.getTrackById(event.track.id)) {
            acc.addTrack(event.track);
          }
          streamToUse = acc;
        }

        if (streamToUse) {
          setRemoteStream(streamToUse);

          // FIX 9: Directly drive the video element here too — don't wait for React re-render
          if (remoteVideoRef.current) {
            safePlayVideo(remoteVideoRef.current, streamToUse, isAudioMutedRef.current);
          }

          // FIX 10: Belt-and-suspenders: retry play after a short delay to handle
          // cases where the video element isn't mounted yet when ontrack fires
          setTimeout(() => {
            if (currentGen !== connectionGenerationRef.current) return;
            if (remoteVideoRef.current && streamToUse) {
              safePlayVideo(remoteVideoRef.current, streamToUse, isAudioMutedRef.current);
            }
          }, 300);
        }

        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setStreamStatus('live');
      };

      pc.onicecandidate = (event) => {
        if (currentGen !== connectionGenerationRef.current) return;
        if (event.candidate && socketRef.current?.connected) {
          socketRef.current.emit('cam_signal', {
            targetSocketId: viewingSocketIdRef.current || user.socketId,
            targetEmail: user.email,
            signal: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (currentGen !== connectionGenerationRef.current) return;
        const state = pc.connectionState;

        if (state === 'connected') {
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          setStreamStatus('live');
        } else if (state === 'failed') {
          if (typeof (pc as any).restartIce === 'function') {
            try { (pc as any).restartIce(); } catch { }
          } else {
            setStreamStatus('error');
          }
        } else if (state === 'disconnected') {
          setTimeout(() => {
            if (currentGen === connectionGenerationRef.current && pcRef.current?.connectionState === 'disconnected') {
              setStreamStatus('error');
            }
          }, 6000);
        } else if (state === 'closed') {
          setStreamStatus('idle');
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (currentGen !== connectionGenerationRef.current) return;
        if (pc.iceConnectionState === 'failed') {
          if (typeof (pc as any).restartIce === 'function') {
            try { (pc as any).restartIce(); } catch { }
          }
        }
      };

      connectionTimeoutRef.current = setTimeout(() => {
        if (currentGen === connectionGenerationRef.current) {
          setStreamStatus(prev => (prev === 'connecting' ? 'error' : prev));
        }
      }, 25000);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      if (currentGen !== connectionGenerationRef.current) return;
      await pc.setLocalDescription(offer);

      if (currentGen !== connectionGenerationRef.current) return;
      if (socketRef.current?.connected) {
        socketRef.current.emit('cam_signal', {
          targetSocketId: viewingSocketIdRef.current || user.socketId,
          targetEmail: user.email,
          signal: { type: offer.type, sdp: offer.sdp },
        });
      }
    } catch (err) {
      console.warn('[AdminCamViewer] [WebRTC] Error starting view:', err);
      if (currentGen === connectionGenerationRef.current) {
        setStreamStatus('error');
      }
    }
  }, [closeViewerPeerConnection]);

  const flipRemoteCamera = useCallback(() => {
    const target = viewingUserRef.current;
    if (!socketRef.current?.connected || !target) return;
    triggerHaptic('medium');
    socketRef.current.emit('cam_flip_camera', {
      targetSocketId: viewingSocketIdRef.current || target.socketId,
      targetEmail: target.email,
    });
  }, []);

  const toggleAudioMute = useCallback(() => {
    triggerHaptic('light');
    setIsAudioMuted(prev => {
      const next = !prev;
      isAudioMutedRef.current = next;
      // FIX 11: Apply mute directly to element; don't rely on React re-render
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = next;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!userEmail || !isAdmin) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const cleanEmail = userEmail.toLowerCase().trim();
    const cleanUsername = username || 'Admin';

    const onConnect = () => {
      socket.emit('identify', { email: cleanEmail });
      socket.emit('cam_user_online', { email: cleanEmail, username: cleanUsername });
      socket.emit('cam_get_users');
    };

    socket.on('connect', onConnect);
    if (socket.connected) onConnect();

    const refreshInterval = setInterval(() => {
      if (socket.connected && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        socket.emit('cam_get_users');
      }
    }, 5000);

    socket.on('cam_users_list', (list: CamUser[]) => {
      setCamUsers(dedupeAndSortCamUsers(list, userEmail));

      const currentTarget = viewingUserRef.current;
      if (currentTarget) {
        const matching = list.find(
          u => u.email && currentTarget.email && u.email.toLowerCase().trim() === currentTarget.email.toLowerCase().trim()
        );
        if (matching && matching.socketId !== viewingSocketIdRef.current) {
          viewingSocketIdRef.current = matching.socketId;
          setViewingUser(prev => prev ? { ...prev, socketId: matching.socketId } : null);
        }
      }
    });

    socket.on('cam_user_online_event', (user: CamUser) => {
      setCamUsers(prev => dedupeAndSortCamUsers([...prev, user], userEmail));
      const currentTarget = viewingUserRef.current;
      if (currentTarget && user.email && currentTarget.email && user.email.toLowerCase().trim() === currentTarget.email.toLowerCase().trim()) {
        viewingSocketIdRef.current = user.socketId;
        setViewingUser(prev => prev ? { ...prev, socketId: user.socketId } : null);
      }
    });

    socket.on('cam_user_offline', ({ socketId }: { socketId: string }) => {
      setCamUsers(prev => prev.filter(u => u.socketId !== socketId));

      // FIX 12: Use ref directly instead of closure-captured stopViewing to avoid stale state
      if (viewingSocketIdRef.current === socketId) {
        stopViewing();
      }
    });

    socket.on('cam_signal', ({ fromSocketId, fromEmail, signal }) => {
      handleIncomingSignal(fromSocketId, fromEmail, signal);
    });

    return () => {
      clearInterval(refreshInterval);
      socket.off('connect', onConnect);
      socket.disconnect();
      // FIX 13: Increment generation on cleanup to cancel any in-flight startViewing
      connectionGenerationRef.current += 1;
      closeViewerPeerConnection();
    };
  }, [userEmail, isAdmin, username, dedupeAndSortCamUsers, handleIncomingSignal, stopViewing, closeViewerPeerConnection]);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isAdmin || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1600] bg-[#141111] flex flex-col justify-between overflow-hidden text-white animate-in fade-in duration-200 select-none font-sans">
      {!viewingUser ? (
        <div className="flex flex-col h-full w-full bg-[#141111] overflow-hidden">
          <div className="w-full bg-[#141111] pt-14 pb-4 px-6 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenChange(false);
                }}
                className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-90 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 bg-transparent"
                title="Back"
              >
                <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
              </button>

              <h1 className="text-[24px] font-black text-white tracking-tight leading-tight">
                Online Clients
              </h1>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (socketRef.current?.connected) {
                  socketRef.current.emit('cam_get_users');
                }
              }}
              className="p-2 text-zinc-400 hover:text-white active:scale-90 transition-all cursor-pointer outline-none border-0 ring-0 bg-transparent"
              title="Refresh user list"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>

          <div className="w-full flex-1 bg-white rounded-t-[32px] px-4 pt-4 pb-6 flex flex-col relative shadow-[0_-8px_30px_rgba(0,0,0,0.15)] overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pt-1">
              {camUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center text-zinc-400">
                  <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
                    <Users className="w-7 h-7 text-zinc-300" />
                  </div>
                  <span className="text-[15px] font-bold text-zinc-700">No Online Users</span>
                  <span className="text-xs text-zinc-400 mt-1 max-w-xs">
                    Users will appear here in real-time when online.
                  </span>
                </div>
              ) : (
                camUsers.map((user) => {
                  const avatarBg = getPastelAvatarBg(user.email || user.username || user.socketId);

                  return (
                    <div
                      key={user.socketId || user.email}
                      onClick={() => {
                        triggerHaptic('medium');
                        startViewing(user);
                      }}
                      className="w-full p-3.5 rounded-2xl bg-zinc-50 hover:bg-zinc-100/90 active:scale-[0.99] border border-zinc-100 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-800 text-lg font-bold shrink-0 relative shadow-xs"
                          style={{ backgroundColor: avatarBg }}
                        >
                          {user.username.charAt(0).toUpperCase()}
                          <span className="w-3 h-3 bg-emerald-500 rounded-full absolute bottom-0 right-0 ring-2 ring-white" />
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span className="text-[15px] font-bold text-zinc-900 truncate">
                            {user.username}
                          </span>
                          <span className="text-xs text-zinc-400 truncate font-medium mt-0.5">
                            {user.email || user.socketId}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('medium');
                          startViewing(user);
                        }}
                        className="px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0"
                      >
                        <span>Watch Cam</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-[1600] flex flex-col justify-between bg-[#141111] p-4 sm:p-5 pt-12 pb-6 overflow-hidden select-none font-sans">
          <div className="w-full flex-1 bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_15px_45px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between p-5 min-h-0">
            <div className="w-full flex items-center justify-between z-20 shrink-0">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  stopViewing();
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 active:scale-90 transition-all cursor-pointer shadow-xs border-0 outline-none"
                title="End / Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium shadow-2xs">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="tracking-wide text-[11px] font-semibold uppercase">
                  Live Cam Feed
                </span>
              </div>

              <button
                onClick={flipRemoteCamera}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 active:scale-90 transition-all cursor-pointer shadow-xs border-0 outline-none"
                title="Flip camera"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            <div className="absolute inset-0 w-full h-full rounded-[32px] sm:rounded-[36px] overflow-hidden bg-black flex items-center justify-center">
              <video
                ref={setVideoRef}
                autoPlay
                playsInline
                muted={isAudioMuted}
                controls={false}
                disablePictureInPicture
                className={`w-full h-full object-cover transition-opacity duration-300 ${streamStatus === 'live' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
              />

              {streamStatus !== 'live' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/90 z-10">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center text-zinc-900 text-3xl font-black mb-4 relative shadow-2xl animate-pulse"
                    style={{ backgroundColor: getPastelAvatarBg(viewingUser.email || viewingUser.username) }}
                  >
                    {viewingUser.username.charAt(0).toUpperCase()}
                  </div>

                  <h3 className="text-lg font-bold text-white mb-1">
                    {streamStatus === 'connecting' ? `Connecting to ${viewingUser.username}...` : 'Stream Offline'}
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-xs">
                    {streamStatus === 'connecting'
                      ? 'Negotiating WebRTC stream with remote camera.'
                      : 'Target client camera is not accessible or offline.'}
                  </p>

                  {streamStatus === 'error' && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        startViewing(viewingUser);
                      }}
                      className="mt-5 px-6 py-2.5 rounded-full bg-[#9D4EDD] hover:bg-[#8A38CC] text-white text-xs font-bold cursor-pointer transition-all active:scale-95 shadow-md flex items-center gap-2"
                    >
                      <RotateCw className="w-4 h-4" />
                      <span>Try Reconnecting</span>
                    </button>
                  )}
                </div>
              )}

              <div className="absolute bottom-4 left-4 z-20 bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15 text-white flex items-center gap-2">
                <span className="text-xs font-bold truncate max-w-[120px]">{viewingUser.username}</span>
                <span className="text-zinc-400 text-xs">•</span>
                <span className="text-xs font-semibold text-zinc-200">
                  {streamStatus === 'live'
                    ? formatDuration(duration)
                    : streamStatus === 'connecting'
                      ? 'Connecting...'
                      : 'Offline'}
                </span>
              </div>
            </div>

            <div className="w-full h-1 shrink-0" />
          </div>

          <div className="w-full bg-[#141111] border border-zinc-800/80 rounded-[32px] sm:rounded-[36px] py-4 px-6 mt-4 shadow-[0_10px_35px_rgba(0,0,0,0.5)] flex items-center justify-around shrink-0">
            <button
              type="button"
              onClick={toggleAudioMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border-0 outline-none ${isAudioMuted
                  ? 'bg-zinc-800 text-red-400 ring-2 ring-red-500/40'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              title={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isAudioMuted ? (
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

            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                startViewing(viewingUser);
              }}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 active:scale-90 text-white transition-all cursor-pointer shadow-md border-0 outline-none"
              title="Reconnect Stream"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('heavy');
                stopViewing();
              }}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 active:scale-90 text-white transition-all shadow-[0_6px_20px_rgba(239,68,68,0.45)] cursor-pointer border-0 outline-none"
              title="Disconnect"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}