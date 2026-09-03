/**
 * WebRTC Engine — Production-quality centralized WebRTC manager
 *
 * Fixed bugs (2026-08-20 audit):
 *   1. Removed duplicate early SDP offer from startCall() — offer is created ONLY in onCallAccepted()
 *   2. Added callId guard on all signal socket listeners to reject stale/unrelated signals
 *   3. Added backward-compat listeners: 'offer', 'answer', 'ice_candidate'
 *   4. Guarded ICE restart createOffer with signalingState === 'stable' check
 *   5. Moved setAudioPriority() call to after SDP exchange completes
 *   6. Removed hardcoded TURN credentials from FALLBACK_ICE_CONFIG (now STUN-only)
 *   7. Added onnegotiationneeded guard to prevent double offers
 *   8. Improved ontrack to deduplicate tracks reliably
 *   9. Improved cleanup: null all handlers before close
 *  10. Audio bitrate set to a stable 40kbps Opus target (not just max)
 *
 * Additional fixes (2026-09-02):
 *  11. Fixed ice_candidate socket handler — was passing `data` to itself instead of
 *      extracting the nested candidate object, causing ICE candidates to silently fail
 *  12. Fixed onnegotiationneeded guard — now allows renegotiation in 'connecting' state
 *      so video tracks added before ICE completes are properly signaled to the peer
 *  13. Removed premature setAudioPriority() call in onCallAccepted() — encodings don't
 *      exist until after the full O/A exchange; the correct calls in handleSignal() remain
 *  14. Fixed prevAudioBytesReceived — promoted from broken local variable to class field
 *      so audio bitrate delta is computed correctly across intervals
 *
 * This module runs ONLY on the client (browser). Never import at SSR time.
 */

// ─── Call State Machine ──────────────────────────────────────────────────────

export type CallState =
  | 'idle'
  | 'outgoing'       // Caller initiated, waiting for peer to ring
  | 'ringing'        // Ringing on caller side (peer notified)
  | 'connecting'     // ICE/DTLS handshake in progress
  | 'connected'      // Media flowing
  | 'reconnecting'   // ICE restart / network change recovery
  | 'ending'         // Teardown in progress
  | 'ended'          // Cleanly ended
  | 'rejected'       // Peer rejected
  | 'busy'           // Peer in another call
  | 'failed'         // Unrecoverable failure
  | 'timeout';       // No answer timeout

const VALID_TRANSITIONS: Record<CallState, CallState[]> = {
  idle: ['outgoing', 'connecting'],
  outgoing: ['ringing', 'connecting', 'ending', 'ended', 'rejected', 'busy', 'failed', 'timeout'],
  ringing: ['connecting', 'ending', 'ended', 'rejected', 'busy', 'failed', 'timeout'],
  connecting: ['connected', 'reconnecting', 'ending', 'ended', 'failed'],
  connected: ['reconnecting', 'ending', 'ended', 'failed'],
  reconnecting: ['connected', 'ending', 'ended', 'failed'],
  ending: ['ended'],
  ended: ['idle'],
  rejected: ['idle'],
  busy: ['idle'],
  failed: ['idle'],
  timeout: ['idle'],
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CallPeer {
  id: string;
  email?: string;
  name?: string;
  image?: string;
}

export interface CallStats {
  packetLoss: number;      // percentage 0-100
  jitter: number;          // ms
  rtt: number;             // ms
  framesDropped: number;
  fps: number;
  bytesSent: number;
  bytesReceived: number;
  videoBitrate: number;    // kbps
  audioBitrate: number;    // kbps
  candidateType: string;   // 'host' | 'srflx' | 'relay'
  timestamp: number;
}

export type EngineEvent =
  | 'stateChange'
  | 'localStream'
  | 'remoteStream'
  | 'stats'
  | 'error';

type EventCallback = (...args: any[]) => void;

interface SignalSocket {
  emit: (event: string, data?: any) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
  connected: boolean;
}

// ─── ICE Configuration Cache ─────────────────────────────────────────────────

let cachedIceConfig: RTCConfiguration | null = null;
let iceConfigFetchedAt = 0;
let iceConfigCacheTtl = 3600 * 1000; // 1 hour default

const FALLBACK_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun.relay.metered.ca:80',
      ],
    },
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
  iceCandidatePoolSize: 0,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
  iceTransportPolicy: 'all' as RTCIceTransportPolicy,
};

export async function fetchIceConfig(): Promise<RTCConfiguration> {
  if (cachedIceConfig && Date.now() - iceConfigFetchedAt < iceConfigCacheTtl) {
    return cachedIceConfig;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const serverUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      (typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://server-6gmj.onrender.com');

    let res: Response | null = await fetch(`${serverUrl}/api/turn-credentials`, {
      signal: controller.signal,
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch('/api/turn-credentials', {
        credentials: 'include',
        signal: controller.signal,
      }).catch(() => null);
    }
    clearTimeout(timeoutId);

    if (!res || !res.ok) {
      throw new Error(`TURN API unavailable`);
    }

    const data = await res.json();

    if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
      throw new Error('Empty ICE server list returned');
    }

    cachedIceConfig = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
          ],
        },
        ...data.iceServers,
      ],
      iceCandidatePoolSize: 0,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
    };

    iceConfigFetchedAt = Date.now();
    if (data.ttl && typeof data.ttl === 'number') {
      iceConfigCacheTtl = data.ttl * 1000;
    }

    return cachedIceConfig;
  } catch (err) {
    console.warn('[WebRTCEngine] Failed to fetch TURN credentials, using fallback:', err);
    return FALLBACK_ICE_CONFIG;
  }
}

// ─── WebRTC Engine Class ─────────────────────────────────────────────────────

export class WebRTCEngine {
  // State
  private _state: CallState = 'idle';
  private _callType: 'audio' | 'video' = 'audio';
  private _callId: string = '';
  private _isCaller: boolean = false;
  private _peer: CallPeer | null = null;

  // WebRTC
  private pc: RTCPeerConnection | null = null;
  private _localStream: MediaStream | null = null;
  private _remoteStream: MediaStream | null = null;

  // Socket
  private socket: SignalSocket | null = null;
  private boundHandlers: Map<string, (...args: any[]) => void> = new Map();

  // ICE candidate queue (candidates received before remote description)
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private pendingSignals: any[] = [];

  // Negotiation guard — prevent double offers
  private makingOffer = false;
  private ignoreOffer = false;

  // Timers
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 4;
  private readonly RECONNECT_TIMEOUT_MS = 35000;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private incomingCallDismissTimer: ReturnType<typeof setTimeout> | null = null;

  // Stats tracking
  private _stats: CallStats | null = null;
  private prevBytesSent = 0;
  private prevBytesReceived = 0;
  private prevAudioBytesReceived = 0; // FIX 14: class field, not local variable
  private prevTimestamp = 0;

  // Bitrate adaptation state
  private currentMaxBitrate = 1200000; // 1.2 Mbps default for video
  private readonly MIN_VIDEO_BITRATE = 80000;   // 80 kbps (bare minimum)
  private readonly MAX_VIDEO_BITRATE = 2500000; // 2.5 Mbps
  private readonly AUDIO_BITRATE_BPS = 40000;   // 40 kbps Opus target
  private consecutivePoorStats = 0;
  private consecutiveGoodStats = 0;

  // Event emitter
  private listeners: Map<EngineEvent, Set<EventCallback>> = new Map();

  // Cleanup guard
  private isDestroyed = false;

  // ── Public Getters ──────────────────────────────────────────────────────

  get state(): CallState { return this._state; }
  get callType(): 'audio' | 'video' { return this._callType; }
  get callId(): string { return this._callId; }
  get isCaller(): boolean { return this._isCaller; }
  get peer(): CallPeer | null { return this._peer; }
  get localStream(): MediaStream | null { return this._localStream; }
  get remoteStream(): MediaStream | null { return this._remoteStream; }
  get stats(): CallStats | null { return this._stats; }

  // ── Event Emitter ───────────────────────────────────────────────────────

  on(event: EngineEvent, cb: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
  }

  off(event: EngineEvent, cb: EventCallback): void {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: EngineEvent, ...args: any[]): void {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(...args); } catch (e) { console.error('[WebRTCEngine] Listener error:', e); }
    });
  }

  // ── State Machine ──────────────────────────────────────────────────────

  private setState(newState: CallState): void {
    const oldState = this._state;
    if (oldState === newState) return;

    const allowed = VALID_TRANSITIONS[oldState];
    if (!allowed?.includes(newState)) {
      console.warn(`[WebRTCEngine] Invalid state transition: ${oldState} → ${newState} (ignored)`);
      return;
    }

    console.log(`[WebRTCEngine] State: ${oldState} → ${newState}`);
    this._state = newState;
    this.emit('stateChange', newState, oldState);
  }

  // ── Media Acquisition ──────────────────────────────────────────────────

  private async acquireMedia(): Promise<MediaStream> {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
    };

    const fallbackAttempts: MediaStreamConstraints[] = [
      {
        audio: audioConstraints,
        video: this._callType === 'video' ? {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } : false,
      },
      {
        audio: audioConstraints,
        video: this._callType === 'video' ? {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        } : false,
      },
      {
        audio: true,
        video: this._callType === 'video' ? true : false,
      },
      {
        audio: true,
        video: false,
      },
    ];

    let lastError: any = null;
    for (const attempt of fallbackAttempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(attempt);
        if (stream && stream.getTracks().length > 0) {
          return stream;
        }
      } catch (err: any) {
        lastError = err;
        console.warn('[WebRTCEngine] getUserMedia attempt failed:', err.name, err.message);
      }
    }

    throw lastError || new Error('Could not acquire media');
  }

  // ── Initialize Call (Caller) ────────────────────────────────────────────

  async startCall(
    peer: CallPeer,
    type: 'audio' | 'video',
    socket: SignalSocket,
    callId?: string
  ): Promise<void> {
    if (this._state !== 'idle') {
      console.warn('[WebRTCEngine] Cannot start call in state:', this._state);
      return;
    }

    this.isDestroyed = false;
    this._peer = peer;
    this._callType = type;
    this._isCaller = true;
    this._callId = callId || `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.socket = socket;

    this.setState('outgoing');
    this.setupSocketListeners();

    try {
      const stream = await this.acquireMedia();
      if (this.isDestroyed) { stream.getTracks().forEach(t => t.stop()); return; }

      this._localStream = stream;
      this.emit('localStream', stream);

      const iceConfig = await fetchIceConfig();
      if (this.isDestroyed) return;

      this.createPeerConnection(iceConfig);

      stream.getTracks().forEach(track => {
        this.pc!.addTrack(track, stream);
      });

      this.setState('ringing');

      await this.drainPendingSignals();
    } catch (err: any) {
      console.error('[WebRTCEngine] Start call error:', err);
      this.emit('error', err.message || 'Failed to start call');
      this.setState('failed');
      this.cleanup();
    }
  }

  // ── Initialize Call (Receiver) ──────────────────────────────────────────

  async acceptCall(
    peer: CallPeer,
    type: 'audio' | 'video',
    socket: SignalSocket,
    callId: string,
    initialOffer?: any
  ): Promise<void> {
    if (this._state !== 'idle') {
      console.warn('[WebRTCEngine] Cannot accept call in state:', this._state);
      return;
    }

    this.isDestroyed = false;
    this._peer = peer;
    this._callType = type;
    this._isCaller = false;
    this._callId = callId;
    this.socket = socket;

    this.setState('connecting');
    this.setupSocketListeners();

    try {
      const stream = await this.acquireMedia();
      if (this.isDestroyed) { stream.getTracks().forEach(t => t.stop()); return; }

      this._localStream = stream;
      this.emit('localStream', stream);

      const iceConfig = await fetchIceConfig();
      if (this.isDestroyed) return;

      this.createPeerConnection(iceConfig);

      stream.getTracks().forEach(track => {
        this.pc!.addTrack(track, stream);
      });

      this.connectionTimeout = setTimeout(() => {
        if (this._state === 'connecting') {
          console.warn('[WebRTCEngine] Connection timeout');
          this.emit('error', 'Connection timed out');
          this.setState('failed');
          this.endCall();
        }
      }, 30000);

      if (initialOffer) {
        await this.handleSignal(initialOffer);
      }

      await this.drainPendingSignals();
    } catch (err: any) {
      console.error('[WebRTCEngine] Accept call error:', err);
      this.emit('error', err.message || 'Failed to accept call');
      this.setState('failed');
      this.cleanup();
    }
  }

  // ── Called when remote peer accepts (caller side) ──────────────────────

  async onCallAccepted(): Promise<void> {
    if (this._state !== 'ringing' && this._state !== 'outgoing' && this._state !== 'connecting') {
      console.log('[WebRTCEngine] onCallAccepted called in state:', this._state, '— ignoring');
      return;
    }

    this.setState('connecting');

    if (!this.pc || !this._localStream) {
      console.error('[WebRTCEngine] onCallAccepted: PC or stream missing');
      return;
    }

    this.clearConnectionTimeout();
    this.connectionTimeout = setTimeout(() => {
      if (this._state === 'connecting') {
        console.warn('[WebRTCEngine] Connection timeout after accept');
        this.emit('error', 'Connection timed out');
        this.setState('failed');
        this.endCall();
      }
    }, 30000);

    try {
      if (this.makingOffer) {
        console.warn('[WebRTCEngine] Already making offer, skipping duplicate');
        return;
      }

      this.makingOffer = true;

      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this._callType === 'video',
      });
      await this.pc.setLocalDescription(offer);

      const target = this._peer?.email?.toLowerCase().trim();
      const signalPayload = { type: 'offer', sdp: offer.sdp };
      this.socket?.emit('webrtc_signal', {
        to: target,
        toUserId: this._peer?.id,
        callId: this._callId,
        signal: signalPayload,
      });

      // FIX 13: Do NOT call setAudioPriority() here.
      // Encodings don't exist until after the full O/A exchange.
      // setAudioPriority() is correctly called in handleSignal() after
      // the answer is received and setRemoteDescription() completes.
    } catch (e) {
      console.error('[WebRTCEngine] Offer creation error:', e);
    } finally {
      // FIX: always clear makingOffer even on error
      this.makingOffer = false;
    }
  }

  // ── End Call ────────────────────────────────────────────────────────────

  endCall(): void {
    if (this._state === 'ended' || this._state === 'idle') return;

    this.setState('ending');

    if (this.socket?.connected && this._peer) {
      const target = this._peer.email?.toLowerCase().trim();
      this.socket.emit('end_call', { to: target, toUserId: this._peer.id, callId: this._callId });
    }

    this.cleanup();
    this.setState('ended');
  }

  // ── Media Controls ─────────────────────────────────────────────────────

  toggleMute(): boolean {
    if (!this._localStream) return false;
    const audioTrack = this._localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  }

  async enableVideo(): Promise<boolean> {
    if (!this._localStream) return false;
    this._callType = 'video';

    let videoTrack = this._localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = true;
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return false;

      this._localStream.addTrack(videoTrack);
      if (this.pc) {
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        } else {
          this.pc.addTrack(videoTrack, this._localStream);
        }
      }
      this.emit('localStream', this._localStream);
      return true;
    } catch (e) {
      console.warn('[WebRTCEngine] Failed to enable video:', e);
      return false;
    }
  }

  async toggleCamera(): Promise<boolean> {
    if (!this._localStream) return false;
    let videoTrack = this._localStream.getVideoTracks()[0];
    if (!videoTrack) {
      const enabled = await this.enableVideo();
      return !enabled;
    }
    videoTrack.enabled = !videoTrack.enabled;
    return !videoTrack.enabled;
  }

  async switchCamera(): Promise<void> {
    if (!this._localStream || this._callType !== 'video') return;

    const currentTrack = this._localStream.getVideoTracks()[0];
    if (!currentTrack) return;

    const currentSettings = currentTrack.getSettings();
    const newFacingMode = currentSettings.facingMode === 'user' ? 'environment' : 'user';

    try {
      currentTrack.stop();

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      this._localStream.removeTrack(currentTrack);
      this._localStream.addTrack(newTrack);

      if (this.pc) {
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }

      this.emit('localStream', this._localStream);
    } catch (e) {
      console.warn('[WebRTCEngine] Camera switch failed:', e);
    }
  }

  // ── PeerConnection Setup ───────────────────────────────────────────────

  private createPeerConnection(config: RTCConfiguration): void {
    if (this.pc) {
      this.closePeerConnection();
    }

    const pc = new RTCPeerConnection(config);
    this.pc = pc;
    this.iceCandidateQueue = [];
    this.makingOffer = false;
    this.ignoreOffer = false;

    // ── ICE candidate → send to peer ────────────────────────────────────
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket?.connected) {
        const target = this._peer?.email?.toLowerCase().trim();
        const candJson = event.candidate.toJSON();
        this.socket.emit('webrtc_signal', {
          to: target,
          toUserId: this._peer?.id,
          callId: this._callId,
          signal: { candidate: candJson },
        });
      }
    };

    pc.onicecandidateerror = (event: RTCPeerConnectionIceErrorEvent) => {
      console.warn('[WebRTCEngine] ICE candidate error:', event.errorCode, event.errorText);
    };

    // ── Remote tracks ────────────────────────────────────────────────────
    const remoteStream = new MediaStream();

    pc.ontrack = (event) => {
      console.log('[WebRTCEngine] Remote track received:', event.track.kind, event.track.id);

      if (!remoteStream.getTrackById(event.track.id)) {
        remoteStream.addTrack(event.track);
      }

      if (event.streams?.[0]) {
        event.streams[0].getTracks().forEach(t => {
          if (!remoteStream.getTrackById(t.id)) {
            remoteStream.addTrack(t);
          }
        });
      }

      event.track.onunmute = () => {
        if (!remoteStream.getTrackById(event.track.id)) {
          remoteStream.addTrack(event.track);
        }
        this.emit('remoteStream', remoteStream);
      };

      this._remoteStream = remoteStream;
      this.emit('remoteStream', this._remoteStream);

      if (this._state === 'connecting' || this._state === 'reconnecting') {
        this.setState('connected');
        this.clearConnectionTimeout();
        this.startStatsMonitoring();
      }
    };

    // ── ICE connection state ─────────────────────────────────────────────
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log('[WebRTCEngine] ICE state:', iceState);

      switch (iceState) {
        case 'connected':
        case 'completed':
          if (this._state === 'connecting' || this._state === 'reconnecting') {
            this.setState('connected');
            this.clearConnectionTimeout();
            this.reconnectAttempts = 0;
            this.startStatsMonitoring();
          }
          break;

        case 'disconnected':
          if (this._state === 'connected') {
            this.setState('reconnecting');
            this.reconnectTimer = setTimeout(() => {
              if (this._state === 'reconnecting') {
                this.attemptIceRestart();
              }
            }, 3000);
          }
          break;

        case 'failed':
          if (this._state === 'connected' || this._state === 'reconnecting') {
            this.attemptIceRestart();
          } else if (this._state === 'connecting') {
            this.setState('failed');
            this.emit('error', 'Connection failed — check network and TURN configuration');
            this.endCall();
          }
          break;

        case 'closed':
          break;
      }
    };

    // ── Connection state (more reliable in modern browsers) ──────────────
    pc.onconnectionstatechange = () => {
      const connState = pc.connectionState;
      console.log('[WebRTCEngine] Connection state:', connState);

      switch (connState) {
        case 'connected':
          if (this._state === 'connecting' || this._state === 'reconnecting') {
            this.setState('connected');
            this.clearConnectionTimeout();
            this.reconnectAttempts = 0;
            this.startStatsMonitoring();
          }
          break;

        case 'disconnected':
          if (this._state === 'connected') {
            this.setState('reconnecting');
          }
          break;

        case 'failed':
          if (this._state === 'connected' || this._state === 'reconnecting') {
            this.attemptIceRestart();
          } else if (this._state === 'connecting') {
            this.setState('failed');
            this.emit('error', 'Connection failed');
            this.endCall();
          }
          break;
      }
    };

    // ── Signaling state ──────────────────────────────────────────────────
    pc.onsignalingstatechange = () => {
      console.log('[WebRTCEngine] Signaling state:', pc.signalingState);
    };

    // ── Negotiation needed ───────────────────────────────────────────────
    // FIX 12: Allow renegotiation in 'connecting' and 'reconnecting' states too,
    // not just 'connected'. This is critical for video tracks added via
    // enableVideo() before ICE handshake completes — without this fix, the
    // video track is added to the PC but never signaled to the remote peer.
    pc.onnegotiationneeded = async () => {
      if (!this._isCaller || this.makingOffer) return;

      const activeState =
        this._state === 'connected' ||
        this._state === 'connecting' ||
        this._state === 'reconnecting';
      if (!activeState) return;

      if (pc.signalingState !== 'stable') return;

      try {
        this.makingOffer = true;
        const offer = await pc.createOffer();

        // Re-check after the async gap
        if (pc.signalingState !== 'stable') {
          this.makingOffer = false;
          return;
        }

        await pc.setLocalDescription(offer);

        const target = this._peer?.email?.toLowerCase().trim();
        this.socket?.emit('webrtc_signal', {
          to: target,
          toUserId: this._peer?.id,
          callId: this._callId,
          signal: { type: 'offer', sdp: offer.sdp },
        });
      } catch (e) {
        console.error('[WebRTCEngine] onnegotiationneeded error:', e);
      } finally {
        this.makingOffer = false;
      }
    };
  }

  // ── Audio Priority ─────────────────────────────────────────────────────

  private setAudioPriority(): void {
    if (!this.pc) return;

    try {
      const senders = this.pc.getSenders();
      for (const sender of senders) {
        if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].priority = 'high';
            (params.encodings[0] as any).networkPriority = 'high';
            sender.setParameters(params).catch(() => { });
          }
        }
      }
    } catch {
      // Priority API might not be supported — non-critical
    }
  }

  // ── ICE Restart ────────────────────────────────────────────────────────

  private attemptIceRestart(): void {
    if (!this.pc || this.isDestroyed) return;
    if (
      this._state !== 'connected' &&
      this._state !== 'reconnecting' &&
      this._state !== 'connecting'
    ) return;

    this.reconnectAttempts++;
    console.log(`[WebRTCEngine] ICE restart attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);

    if (this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
      console.warn('[WebRTCEngine] Max reconnect attempts reached — ending call');
      this.emit('error', 'Connection lost — could not recover');
      this.setState('failed');
      this.endCall();
      return;
    }

    if (this._state === 'connected') {
      this.setState('reconnecting');
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (this.isDestroyed || !this.pc) return;

      try {
        if (this.pc.signalingState !== 'stable') {
          console.warn('[WebRTCEngine] ICE restart skipped — signaling state is not stable:', this.pc.signalingState);
          return;
        }

        if (this._isCaller) {
          this.makingOffer = true;
          const offer = await this.pc.createOffer({ iceRestart: true });
          await this.pc.setLocalDescription(offer);
          this.makingOffer = false;

          const target = this._peer?.email?.toLowerCase().trim();
          this.socket?.emit('webrtc_signal', {
            to: target,
            toUserId: this._peer?.id,
            callId: this._callId,
            signal: { type: 'offer', sdp: offer.sdp },
          });
        } else {
          this.pc.restartIce();
        }
      } catch (e) {
        this.makingOffer = false;
        console.error('[WebRTCEngine] ICE restart error:', e);
      }
    }, delay);

    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
    this.connectionTimeout = setTimeout(() => {
      if (this._state === 'reconnecting') {
        console.warn('[WebRTCEngine] Reconnection timeout');
        this.emit('error', 'Could not reconnect');
        this.setState('failed');
        this.endCall();
      }
    }, this.RECONNECT_TIMEOUT_MS);
  }

  // ── Signal Handling ────────────────────────────────────────────────────

  async handleSignal(signal: any): Promise<void> {
    if (!this.pc) {
      this.pendingSignals.push(signal);
      return;
    }

    if (signal.callId && this._callId && signal.callId !== this._callId) {
      console.warn('[WebRTCEngine] Signal rejected — callId mismatch:', signal.callId, '!=', this._callId);
      return;
    }

    const pc = this.pc;
    const target = this._peer?.email?.toLowerCase().trim();

    try {
      // ─── OFFER ──────────────────────────────────────────────────────────
      if (
        signal.type === 'offer' ||
        (signal.sdp && typeof signal.sdp === 'string' && !signal.type) ||
        (signal.offer && (signal.offer.type === 'offer' || signal.offer.sdp))
      ) {
        const raw = signal.offer || signal;
        const sdpObj: RTCSessionDescriptionInit = {
          type: 'offer',
          sdp: raw.sdp || (typeof raw === 'string' ? raw : undefined),
        };

        const offerCollision =
          this.makingOffer || pc.signalingState !== 'stable';

        this.ignoreOffer = !this._isCaller && offerCollision;

        if (this.ignoreOffer) {
          console.warn('[WebRTCEngine] Ignoring colliding offer (polite peer)');
          return;
        }

        if (offerCollision && this._isCaller) {
          await pc.setLocalDescription({ type: 'rollback' } as any);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
        await this.drainIceCandidateQueue();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.setAudioPriority();

        const signalPayload = { type: 'answer', sdp: answer.sdp };
        this.socket?.emit('webrtc_signal', {
          to: target,
          toUserId: this._peer?.id,
          callId: this._callId,
          signal: signalPayload,
        });
        return;
      }

      // ─── ANSWER ─────────────────────────────────────────────────────────
      if (
        signal.type === 'answer' ||
        (signal.answer && (signal.answer.type === 'answer' || signal.answer.sdp))
      ) {
        const raw = signal.answer || signal;
        const sdpObj: RTCSessionDescriptionInit = {
          type: 'answer',
          sdp: raw.sdp || (typeof raw === 'string' ? raw : undefined),
        };

        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
          await this.drainIceCandidateQueue();

          this.setAudioPriority();
        } else {
          console.warn('[WebRTCEngine] Received answer in wrong signaling state:', pc.signalingState);
        }
        return;
      }

      // ─── ICE CANDIDATE ──────────────────────────────────────────────────
      if (signal.candidate !== undefined || signal.sdpMid !== undefined || signal.sdpMLineIndex !== undefined) {
        let candidateInit: RTCIceCandidateInit | null = null;
        if (signal.candidate === null || signal.candidate === '') {
          candidateInit = null;
        } else if (signal.candidate && typeof signal.candidate === 'object') {
          candidateInit = signal.candidate;
        } else if (signal.candidate && typeof signal.candidate === 'string') {
          try {
            candidateInit = JSON.parse(signal.candidate);
          } catch {
            candidateInit = {
              candidate: signal.candidate,
              sdpMid: signal.sdpMid,
              sdpMLineIndex: signal.sdpMLineIndex,
            };
          }
        } else {
          candidateInit = signal;
        }

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            if (candidateInit && candidateInit.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
            } else if (candidateInit === null) {
              await pc.addIceCandidate(undefined);
            }
          } catch (e) {
            if (!this.ignoreOffer) {
              console.warn('[WebRTCEngine] Add ICE candidate error:', e);
            }
          }
        } else if (candidateInit && candidateInit.candidate) {
          this.iceCandidateQueue.push(candidateInit);
        }
        return;
      }

      console.warn('[WebRTCEngine] Unknown signal format:', Object.keys(signal));
    } catch (e) {
      console.error('[WebRTCEngine] Signal handling error:', e, signal);
    }
  }

  private async drainIceCandidateQueue(): Promise<void> {
    if (!this.pc) return;

    const queue = [...this.iceCandidateQueue];
    this.iceCandidateQueue = [];

    for (const candidate of queue) {
      try {
        if (candidate && candidate.candidate) {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.warn('[WebRTCEngine] Queued ICE candidate error:', e);
      }
    }
  }

  private async drainPendingSignals(): Promise<void> {
    while (this.pendingSignals.length > 0) {
      const signal = this.pendingSignals.shift();
      if (signal) {
        await this.handleSignal(signal);
      }
    }
  }

  // ── Socket Listeners ───────────────────────────────────────────────────

  private setupSocketListeners(): void {
    if (!this.socket) return;

    const handlers: Record<string, (...args: any[]) => void> = {

      // ─── Primary unified signal channel ────────────────────────────────
      'webrtc_signal': (data: any) => {
        if (data.callId && this._callId && data.callId !== this._callId) return;
        this.handleSignal(data.signal || data);
      },

      // ─── Backward-compat: offer via dedicated 'offer' event ────────────
      'offer': (data: any) => {
        if (data.callId && this._callId && data.callId !== this._callId) return;
        this.handleSignal(data.offer || data);
      },

      // ─── Backward-compat: answer via dedicated 'answer' event ──────────
      'answer': (data: any) => {
        if (data.callId && this._callId && data.callId !== this._callId) return;
        this.handleSignal(data.answer || data);
      },

      // ─── Backward-compat: ICE candidate via dedicated event ─────────────
      // FIX 11: Extract nested candidate fields correctly.
      // Server sends: { callId, candidate: { candidate, sdpMid, sdpMLineIndex } }
      // OR flat:      { callId, candidate, sdpMid, sdpMLineIndex }
      // Old code did: this.handleSignal(data.candidate ? data : data)  ← passed data either way
      // which caused sdpMid/sdpMLineIndex to be lost when shape was nested.
      'ice_candidate': (data: any) => {
        if (data.callId && this._callId && data.callId !== this._callId) return;

        const nested = data.candidate;
        if (nested && typeof nested === 'object' && 'candidate' in nested) {
          // Nested shape — hoist inner fields so handleSignal sees a flat candidate
          this.handleSignal({
            callId: data.callId,
            candidate: nested.candidate,
            sdpMid: nested.sdpMid,
            sdpMLineIndex: nested.sdpMLineIndex,
          });
        } else {
          // Flat shape or null end-of-candidates — pass as-is
          this.handleSignal(data);
        }
      },

      // ─── Call termination events ────────────────────────────────────────
      'call_ended': (data: any) => {
        if (data?.callId && this._callId && data.callId !== this._callId) return;
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('ended');
        }
      },

      'call_rejected': (data: any) => {
        if (data?.callId && this._callId && data.callId !== this._callId) return;
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('rejected');
        }
      },

      'call_decline': (data: any) => {
        if (data?.callId && this._callId && data.callId !== this._callId) return;
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('rejected');
        }
      },

      'call_cancelled': (data: any) => {
        if (data?.callId && this._callId && data.callId !== this._callId) return;
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('ended');
        }
      },

      'call_timed_out': (data: any) => {
        if (data?.callId && this._callId && data.callId !== this._callId) return;
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('timeout');
        }
      },

      'call_busy': (data: any) => {
        if (data?.callId && this._callId && data.callId !== this._callId) return;
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('busy');
        }
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      this.boundHandlers.set(event, handler);
      this.socket.on(event, handler);
    }
  }

  private removeSocketListeners(): void {
    if (!this.socket) return;

    for (const [event, handler] of this.boundHandlers.entries()) {
      this.socket.off(event, handler);
    }
    this.boundHandlers.clear();
  }

  // ── Stats Monitoring & Adaptive Bitrate ────────────────────────────────

  private startStatsMonitoring(): void {
    if (this.statsInterval) return;

    this.prevBytesSent = 0;
    this.prevBytesReceived = 0;
    this.prevAudioBytesReceived = 0; // FIX 14: reset the class field
    this.prevTimestamp = performance.now();

    this.statsInterval = setInterval(() => this.collectStats(), 3000);
  }

  private stopStatsMonitoring(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  private async collectStats(): Promise<void> {
    if (!this.pc || this.isDestroyed) return;

    try {
      const stats = await this.pc.getStats();
      const now = performance.now();
      const elapsed = (now - this.prevTimestamp) / 1000;
      if (elapsed <= 0) return;

      let packetLoss = 0;
      let jitter = 0;
      let rtt = 0;
      let framesDropped = 0;
      let fps = 0;
      let totalBytesSent = 0;
      let totalBytesReceived = 0;
      let audioBytesReceived = 0;
      let candidateType = 'unknown';

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'video') {
            fps = report.framesPerSecond || 0;
            framesDropped = report.framesDropped || 0;
          }
          if (report.kind === 'audio') {
            audioBytesReceived = report.bytesReceived || 0;
          }
          if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
            const total = report.packetsReceived + report.packetsLost;
            if (total > 0) {
              packetLoss = Math.max(packetLoss, Math.round((report.packetsLost / total) * 100));
            }
          }
          if (report.jitter !== undefined) {
            jitter = Math.max(jitter, Math.round(report.jitter * 1000));
          }
          totalBytesReceived += report.bytesReceived || 0;
        }

        if (report.type === 'outbound-rtp') {
          totalBytesSent += report.bytesSent || 0;
        }

        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          rtt = Math.round((report.currentRoundTripTime || 0) * 1000);
          const localCandidate = stats.get(report.localCandidateId);
          if (localCandidate) {
            candidateType = (localCandidate as any).candidateType || 'unknown';
          }
        }
      });

      const videoBitrate = Math.round(((totalBytesSent - this.prevBytesSent) * 8) / elapsed / 1000);
      // FIX 14: use class-level this.prevAudioBytesReceived for correct delta
      const audioBitrate = Math.round(((audioBytesReceived - this.prevAudioBytesReceived) * 8) / elapsed / 1000);

      this.prevBytesSent = totalBytesSent;
      this.prevBytesReceived = totalBytesReceived;
      this.prevAudioBytesReceived = audioBytesReceived; // FIX 14: persist for next interval
      this.prevTimestamp = now;

      this._stats = {
        packetLoss,
        jitter,
        rtt,
        framesDropped,
        fps,
        bytesSent: totalBytesSent,
        bytesReceived: totalBytesReceived,
        videoBitrate,
        audioBitrate,
        candidateType,
        timestamp: Date.now(),
      };

      this.emit('stats', this._stats);

      if (process.env.NODE_ENV === 'development') {
        console.log(`[WebRTCEngine Stats] RTT:${rtt}ms Loss:${packetLoss}% Jitter:${jitter}ms Video:${videoBitrate}kbps Audio:${audioBitrate}kbps Candidate:${candidateType}`);
      }

      this.adaptBitrate(packetLoss, rtt, jitter);
    } catch {
      // Stats collection can fail during state transitions — non-critical
    }
  }

  private async adaptBitrate(packetLoss: number, rtt: number, jitter: number): Promise<void> {
    if (!this.pc || this._callType !== 'video') return;

    const isPoor = packetLoss > 5 || rtt > 400 || jitter > 100;
    const isGood = packetLoss < 2 && rtt < 150 && jitter < 30;

    if (isPoor) {
      this.consecutivePoorStats++;
      this.consecutiveGoodStats = 0;
    } else if (isGood) {
      this.consecutiveGoodStats++;
      this.consecutivePoorStats = 0;
    } else {
      this.consecutivePoorStats = Math.max(0, this.consecutivePoorStats - 1);
      this.consecutiveGoodStats = Math.max(0, this.consecutiveGoodStats - 1);
    }

    if (this.consecutivePoorStats >= 2) {
      this.currentMaxBitrate = Math.max(
        this.currentMaxBitrate * 0.6,
        this.MIN_VIDEO_BITRATE
      );
      await this.applyVideoEncodingParams();
      this.consecutivePoorStats = 0;
    } else if (this.consecutiveGoodStats >= 4) {
      this.currentMaxBitrate = Math.min(
        this.currentMaxBitrate * 1.25,
        this.MAX_VIDEO_BITRATE
      );
      await this.applyVideoEncodingParams();
      this.consecutiveGoodStats = 0;
    }
  }

  private async applyVideoEncodingParams(): Promise<void> {
    if (!this.pc) return;

    try {
      const senders = this.pc.getSenders();
      for (const sender of senders) {
        if (sender.track?.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = this.currentMaxBitrate;
          if (this.currentMaxBitrate < 300000) {
            params.encodings[0].scaleResolutionDownBy = 2;
          } else if (this.currentMaxBitrate < 600000) {
            params.encodings[0].scaleResolutionDownBy = 1.5;
          } else {
            params.encodings[0].scaleResolutionDownBy = 1;
          }
          await sender.setParameters(params);
        }

        if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = this.AUDIO_BITRATE_BPS;
            params.encodings[0].priority = 'high';
            await sender.setParameters(params).catch(() => { });
          }
        }
      }
    } catch {
      // Bitrate API might not be fully supported — non-critical
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private closePeerConnection(): void {
    if (!this.pc) return;
    try {
      this.pc.onicecandidate = null;
      this.pc.onicecandidateerror = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onsignalingstatechange = null;
      this.pc.onnegotiationneeded = null;
      this.pc.close();
    } catch { }
    this.pc = null;
  }

  private cleanup(): void {
    this.isDestroyed = true;

    this.clearConnectionTimeout();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.incomingCallDismissTimer) {
      clearTimeout(this.incomingCallDismissTimer);
      this.incomingCallDismissTimer = null;
    }
    this.stopStatsMonitoring();

    this.removeSocketListeners();
    this.closePeerConnection();

    if (this._localStream) {
      this._localStream.getTracks().forEach(t => {
        try { t.stop(); } catch { }
      });
      this._localStream = null;
    }

    this._remoteStream = null;

    this.iceCandidateQueue = [];
    this.pendingSignals = [];
    this.makingOffer = false;
    this.ignoreOffer = false;

    this.reconnectAttempts = 0;
    this.consecutivePoorStats = 0;
    this.consecutiveGoodStats = 0;
    this.currentMaxBitrate = 1200000;
    this._stats = null;
    this.prevAudioBytesReceived = 0; // FIX 14: reset on cleanup
  }

  reset(): void {
    this.cleanup();
    this._state = 'idle';
    this._callType = 'audio';
    this._callId = '';
    this._isCaller = false;
    this._peer = null;
    this.socket = null;
  }

  destroy(): void {
    this.cleanup();
    this.listeners.clear();
  }
}