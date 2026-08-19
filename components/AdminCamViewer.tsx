'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
const ADMIN_EMAILS = ['hammadnawz519@gmail.com', 'hammadnawaz519@gmail.com'];

// Fallback RTC config — used only if dynamic TURN credential fetch fails
const FALLBACK_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.relay.metered.ca:80', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
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
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all'
};

// Fetch dynamic TURN credentials from secure API route
async function fetchRtcConfig(): Promise<RTCConfiguration> {
  try {
    const res = await fetch('/api/turn-credentials', { credentials: 'include' });
    if (!res.ok) throw new Error(`TURN API ${res.status}`);
    const data = await res.json();
    return {
      iceServers: data.iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
    };
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

export default function AdminCamViewer({ userEmail, username, isOpen, onOpenChange, onCamUsersCount }: AdminCamViewerProps) {
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail.toLowerCase().trim());

  const [camUsers, setCamUsers] = useState<CamUser[]>([]);
  const [viewingUser, setViewingUser] = useState<CamUser | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  useEffect(() => {
    onCamUsersCount?.(camUsers.length);
  }, [camUsers.length, onCamUsersCount]);

  // ── Refresh user list immediately when admin opens the panel ──────────────
  useEffect(() => {
    if (isOpen && isAdmin && socketRef.current?.connected) {
      socketRef.current.emit('cam_get_users');
    }
  }, [isOpen, isAdmin]);

  // ── Proactive Camera/Mic Permission Request for Capacitor (Android) ────────
  useEffect(() => {
    if (!userEmail) return;
    const requestPermissions = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (err) {
        console.warn('[AdaptiveCam] Permission request failed:', err);
      }
    };
    const timer = setTimeout(requestPermissions, 1500);
    return () => clearTimeout(timer);
  }, [userEmail]);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const viewingSocketIdRef = useRef<string | null>(null);
  const facingModeRef = useRef<'user' | 'environment'>('user');

  // Queues & Remote Description Flags for WebRTC Stability
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
      // 1. TARGET RECEIVES OFFER FROM ADMIN
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

        if (stream) {
          stream.getTracks().forEach(track => {
            try {
              pc.addTrack(track, stream);
            } catch (e) {
              console.warn('Track add error:', e);
            }
          });
        }

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

        // Drain queued ICE candidates
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

      // 2. ADMIN RECEIVES ANSWER FROM TARGET
      if (signal.type === 'answer') {
        if (pcRef.current && pcRef.current.signalingState === 'have-local-offer') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
          // Drain queued ICE candidates
          while (iceCandidateQueue.current.length > 0) {
            const candidate = iceCandidateQueue.current.shift();
            if (candidate && candidate.candidate) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            }
          }
        }
        return;
      }

      // 3. ICE CANDIDATE SIGNAL
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

      // ── Remove users who disconnect / go offline ──────────────────────────
      socket.on('cam_user_offline', ({ socketId }: { socketId: string }) => {
        setCamUsers(prev => {
          const filtered = prev.filter(u => u.socketId !== socketId);
          // If currently viewing this user, stop
          if (viewingSocketIdRef.current === socketId) {
            stopViewing();
          }
          return filtered;
        });
        // Refresh the list from server so socketIds stay fresh
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
        const newTrack = stream.getVideoTracks()[0];

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

    // Modern WebRTC Transceivers for audio & video reception
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.addTransceiver('video', { direction: 'recvonly' });

    // Connection Timeout Guard (allows ample time for multi-city TURN relays)
    const timeoutId = setTimeout(() => {
      setStreamStatus(current => current === 'connecting' ? 'error' : current);
    }, 25000);

    const receivedStream = new MediaStream();

    pc.ontrack = (e) => {
      clearTimeout(timeoutId);
      console.log('ontrack received track:', e.track.kind);
      
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
        receivedStream.addTrack(e.track);
        setRemoteStream(receivedStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = receivedStream;
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
        const targetSid = (user.socketId === 'admin-self-socket' && socketRef.current) ? socketRef.current.id : user.socketId;
        const candData = {
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex,
        };
        socketRef.current.emit('cam_signal', {
          targetSocketId: targetSid,
          targetEmail: user.email ? user.email.toLowerCase().trim() : undefined,
          signal: candData,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('pc connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        clearTimeout(timeoutId);
        setStreamStatus('live');
      } else if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('pc iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearTimeout(timeoutId);
        setStreamStatus('live');
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        pc.restartIce();
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const targetSid = (user.socketId === 'admin-self-socket' && socketRef.current) ? socketRef.current.id : user.socketId;

      socketRef.current?.emit('cam_signal', {
        targetSocketId: targetSid,
        targetEmail: user.email ? user.email.toLowerCase().trim() : undefined,
        signal: { type: offer.type, sdp: offer.sdp },
      });
    } catch (e) {
      console.error('Create offer error:', e);
      clearTimeout(timeoutId);
      setStreamStatus('error');
    }
  }, [stopViewing]);

  const flipTargetCamera = useCallback(() => {
    if (!viewingUser || !socketRef.current) return;
    const targetSid = (viewingUser.socketId === 'admin-self-socket' && socketRef.current) ? socketRef.current.id : viewingUser.socketId;
    socketRef.current.emit('cam_flip_camera', {
      targetSocketId: targetSid,
      targetEmail: viewingUser.email,
    });
  }, [viewingUser]);

  if (!isAdmin) return null;
  const activeCount = camUsers.length;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col md:flex-row bg-black select-none"
          style={{ background: '#000000', fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* LEFT USER LIST PANEL */}
          <div
            className={`w-full md:w-[320px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r overflow-hidden h-full ${
              viewingUser ? 'hidden md:flex' : 'flex'
            }`}
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#070709' }}
          >
            <div
              className="px-6 pt-[calc(18px+env(safe-area-inset-top,0px))] pb-4 flex items-center justify-between border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#0c0c0f' }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <p className="text-white font-bold text-base tracking-tight">Cam Monitor</p>
                </div>
                <p className="text-xs mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {activeCount} active {activeCount === 1 ? 'user' : 'users'} online
                </p>
              </div>
              <button
                onClick={() => { onOpenChange(false); stopViewing(); }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all bg-white/10 hover:bg-white/20 active:scale-90 text-white cursor-pointer"
                title="Close Cam Monitor"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

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
                  const isViewing = viewingUser?.socketId === user.socketId || (viewingUser?.email && viewingUser.email.toLowerCase().trim() === user.email.toLowerCase().trim());
                  return (
                    <button
                      key={user.socketId || user.email}
                      onClick={() => isViewing ? stopViewing() : startViewing(user)}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all text-left cursor-pointer active:scale-98 shadow-sm"
                      style={{
                        background: isViewing ? 'rgba(244,63,94,0.18)' : 'rgba(255,255,255,0.06)',
                        border: `1.5px solid ${isViewing ? '#f43f5e' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black uppercase tracking-wider"
                        style={{
                          background: isViewing ? '#f43f5e' : 'rgba(255,255,255,0.15)',
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
                      <div
                        className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase flex items-center gap-1.5 flex-shrink-0"
                        style={{
                          background: isViewing ? '#f43f5e' : 'rgba(16,185,129,0.15)',
                          color: isViewing ? '#ffffff' : '#34d399',
                          border: `1px solid ${isViewing ? '#f43f5e' : 'rgba(16,185,129,0.3)'}`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: isViewing ? '#ffffff' : '#10b981' }} />
                        {isViewing ? 'LIVE' : 'VIEW'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT VIDEO DISPLAY SCREEN — PURE BLACK NO ICON */}
          <div
            className={`flex-1 flex flex-col items-center justify-center relative w-full h-full bg-black ${
              !viewingUser ? 'hidden md:flex' : 'flex'
            }`}
            style={{ background: '#000000' }}
          >
            {!viewingUser ? (
              <div className="flex flex-col items-center gap-4 text-center px-6">
                <p className="text-sm font-medium text-white/30">
                  Select a user from the list to view live camera
                </p>
              </div>
            ) : (
              <>
                {/* TOP CONTROL OVERLAY */}
                <div
                  className="absolute left-4 right-4 z-30 flex items-center justify-between pointer-events-none"
                  style={{ top: 'calc(18px + env(safe-area-inset-top, 12px))' }}
                >
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

                  <div
                    className="flex items-center gap-2 px-4 py-2 rounded-full shadow-xl"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                    <span className="text-xs font-bold text-white tracking-wide truncate max-w-[150px]">
                      {viewingUser.username || viewingUser.email?.split('@')[0]}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pointer-events-auto">
                    <button
                      onClick={() => setIsAudioMuted(prev => !prev)}
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all active:scale-90 shadow-2xl cursor-pointer"
                      style={{
                        background: isAudioMuted ? 'rgba(244,63,94,0.25)' : 'rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(16px)',
                        border: `1px solid ${isAudioMuted ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.25)'}`
                      }}
                      title={isAudioMuted ? "Unmute Client Audio" : "Mute Client Audio"}
                    >
                      {isAudioMuted ? (
                        <svg width="20" height="20" fill="none" stroke="#f43f5e" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      )}
                    </button>

                    <button
                      onClick={flipTargetCamera}
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all active:scale-90 shadow-2xl cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.25)' }}
                      title="Flip Phone Camera (Front / Back)"
                    >
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* MAIN VIDEO STREAM CONTAINER */}
                <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden relative">
                  <video
                    ref={setVideoRef}
                    autoPlay
                    playsInline
                    muted={isAudioMuted}
                    className="w-full h-full object-cover md:object-contain bg-black"
                    style={{ background: '#000000' }}
                  />

                  {streamStatus === 'connecting' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                      <div className="flex flex-col items-center gap-3">
                        <div
                          className="w-10 h-10 border-3 rounded-full animate-spin"
                          style={{ borderColor: 'rgba(255,255,255,0.15)', borderTopColor: '#f43f5e' }}
                        />
                        <p className="text-xs font-medium text-white/60">Connecting stream...</p>
                      </div>
                    </div>
                  )}

                  {streamStatus === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
                      <div className="flex flex-col items-center gap-3 text-center px-6">
                        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <p className="text-xs font-semibold text-white/80">Camera stream lost or disconnected</p>
                        <button
                          onClick={() => startViewing(viewingUser)}
                          className="px-4 py-2 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold active:scale-95 transition-all shadow-lg cursor-pointer"
                        >
                          Retry Connection
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* BOTTOM FLOATING BAR — ONLY RECONNECT STREAM BUTTON */}
                <div
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center px-5 py-3 rounded-full shadow-2xl"
                  style={{
                    background: 'rgba(15,15,18,0.92)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <button
                    onClick={() => startViewing(viewingUser)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold text-white transition-all active:scale-90 cursor-pointer shadow-lg"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Reconnect Stream</span>
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
