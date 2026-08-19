/**
 * WebRTC Engine — Production-quality centralized WebRTC manager
 * 
 * Handles the complete lifecycle of a 1-to-1 audio/video call:
 * - ICE configuration with dynamic TURN credentials
 * - RTCPeerConnection management
 * - getUserMedia acquisition with retry/fallback
 * - Offer/answer exchange via Socket.IO signaling
 * - ICE candidate queuing (handles candidates before remote description)
 * - ICE restart on network changes
 * - Connection state monitoring with reconnection
 * - Adaptive bitrate via getStats() monitoring
 * - Audio priority over video
 * - Complete cleanup
 * 
 * This module runs ONLY on the client (browser). Never import at SSR time.
 */

// ─── Call State Machine ──────────────────────────────────────────────────────

export type CallState =
  | 'idle'
  | 'outgoing'      // Caller initiated, waiting for peer to ring
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
  idle:         ['outgoing', 'connecting'],
  outgoing:     ['ringing', 'connecting', 'ending', 'ended', 'rejected', 'busy', 'failed', 'timeout'],
  ringing:      ['connecting', 'ending', 'ended', 'rejected', 'busy', 'failed', 'timeout'],
  connecting:   ['connected', 'reconnecting', 'ending', 'ended', 'failed'],
  connected:    ['reconnecting', 'ending', 'ended', 'failed'],
  reconnecting: ['connected', 'ending', 'ended', 'failed'],
  ending:       ['ended'],
  ended:        ['idle'],
  rejected:     ['idle'],
  busy:         ['idle'],
  failed:       ['idle'],
  timeout:      ['idle'],
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

// Fallback ICE config if API fetch fails — using user's Metered TURN configuration
const FALLBACK_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.relay.metered.ca:80',
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
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
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80?transport=tcp',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
  iceTransportPolicy: 'all' as RTCIceTransportPolicy,
};

export async function fetchIceConfig(): Promise<RTCConfiguration> {
  // Return cached config if still valid
  if (cachedIceConfig && Date.now() - iceConfigFetchedAt < iceConfigCacheTtl) {
    return cachedIceConfig;
  }

  try {
    const res = await fetch('/api/turn-credentials', {
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`TURN API returned ${res.status}`);
    }

    const data = await res.json();

    cachedIceConfig = {
      iceServers: data.iceServers,
      iceCandidatePoolSize: 10,
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

  // Timers
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_TIMEOUT_MS = 30000;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  // Stats tracking
  private _stats: CallStats | null = null;
  private prevBytesSent = 0;
  private prevBytesReceived = 0;
  private prevTimestamp = 0;

  // Bitrate adaptation state
  private currentMaxBitrate = 1500000; // 1.5 Mbps default for video
  private readonly MIN_VIDEO_BITRATE = 100000;  // 100 kbps
  private readonly MAX_VIDEO_BITRATE = 2500000;  // 2.5 Mbps
  private readonly AUDIO_BITRATE = 48000;  // 48 kbps for Opus
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
      console.warn(`[WebRTCEngine] Invalid state transition: ${oldState} → ${newState}`);
      return;
    }

    console.log(`[WebRTCEngine] State: ${oldState} → ${newState}`);
    this._state = newState;
    this.emit('stateChange', newState, oldState);
  }

  // ── Media Acquisition ──────────────────────────────────────────────────

  private async acquireMedia(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: this._callType === 'video' ? {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user',
      } : false,
    };

    // Try ideal constraints first, then progressively fall back
    const fallbackAttempts: MediaStreamConstraints[] = [
      constraints,
      // Lower resolution fallback
      {
        audio: constraints.audio,
        video: this._callType === 'video' ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        } : false,
      },
      // Minimal constraints
      {
        audio: true,
        video: this._callType === 'video',
      },
      // Audio-only fallback for video calls (camera might be in use)
      ...(this._callType === 'video' ? [{
        audio: true,
        video: false as const,
      }] : []),
    ];

    let lastError: any = null;
    for (const attempt of fallbackAttempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(attempt);
        if (stream) return stream;
      } catch (err: any) {
        lastError = err;
        console.warn('[WebRTCEngine] getUserMedia attempt failed:', err.name, err.message);

        // Don't retry if permission was denied
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error(
            this._callType === 'video'
              ? 'Camera and microphone permission denied'
              : 'Microphone permission denied'
          );
        }

        // Don't retry if no devices found
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new Error(
            this._callType === 'video'
              ? 'Camera or microphone not found'
              : 'Microphone not found'
          );
        }
      }
    }

    throw lastError || new Error('Could not acquire media');
  }

  // ── Initialize Call ────────────────────────────────────────────────────

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
      // Acquire media
      const stream = await this.acquireMedia();
      if (this.isDestroyed) { stream.getTracks().forEach(t => t.stop()); return; }

      this._localStream = stream;
      this.emit('localStream', stream);

      // Fetch ICE config and create peer connection
      const iceConfig = await fetchIceConfig();
      if (this.isDestroyed) return;

      this.createPeerConnection(iceConfig);

      // Add local tracks
      stream.getTracks().forEach(track => {
        this.pc!.addTrack(track, stream);
      });

      // Set audio priority via codec preferences
      this.setAudioPriority();

      this.setState('ringing');

      // Process any signals that arrived before PC was ready
      await this.drainPendingSignals();
    } catch (err: any) {
      console.error('[WebRTCEngine] Start call error:', err);
      this.emit('error', err.message || 'Failed to start call');
      this.setState('failed');
      this.cleanup();
    }
  }

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
      // Acquire media
      const stream = await this.acquireMedia();
      if (this.isDestroyed) { stream.getTracks().forEach(t => t.stop()); return; }

      this._localStream = stream;
      this.emit('localStream', stream);

      // Fetch ICE config and create peer connection
      const iceConfig = await fetchIceConfig();
      if (this.isDestroyed) return;

      this.createPeerConnection(iceConfig);

      // Add local tracks
      stream.getTracks().forEach(track => {
        this.pc!.addTrack(track, stream);
      });

      // Set audio priority
      this.setAudioPriority();

      // Process initial offer if provided
      if (initialOffer) {
        await this.handleSignal(initialOffer);
      }

      // Process any pending signals
      await this.drainPendingSignals();

      // Connection timeout — if not connected within 30s, fail
      this.connectionTimeout = setTimeout(() => {
        if (this._state === 'connecting') {
          console.warn('[WebRTCEngine] Connection timeout');
          this.emit('error', 'Connection timed out');
          this.setState('failed');
          this.endCall();
        }
      }, 30000);
    } catch (err: any) {
      console.error('[WebRTCEngine] Accept call error:', err);
      this.emit('error', err.message || 'Failed to accept call');
      this.setState('failed');
      this.cleanup();
    }
  }

  // ── Called when remote peer accepts (caller side) ──────────────────────

  async onCallAccepted(): Promise<void> {
    if (this._state !== 'ringing' && this._state !== 'outgoing') return;
    
    this.setState('connecting');

    if (!this.pc || !this._localStream) return;

    // Connection timeout
    this.connectionTimeout = setTimeout(() => {
      if (this._state === 'connecting') {
        console.warn('[WebRTCEngine] Connection timeout after accept');
        this.emit('error', 'Connection timed out');
        this.setState('failed');
        this.endCall();
      }
    }, 30000);

    try {
      // Create and send offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this._callType === 'video',
      });
      await this.pc.setLocalDescription(offer);

      const target = this._peer?.email?.toLowerCase().trim();
      this.socket?.emit('webrtc_signal', {
        to: target,
        toUserId: this._peer?.id,
        callId: this._callId,
        signal: { type: 'offer', sdp: offer.sdp },
      });
    } catch (e) {
      console.error('[WebRTCEngine] Offer creation error:', e);
    }
  }

  // ── End Call ────────────────────────────────────────────────────────────

  endCall(): void {
    if (this._state === 'ended' || this._state === 'idle') return;

    const wasConnected = this._state === 'connected' || this._state === 'reconnecting';

    this.setState('ending');

    // Notify peer
    if (this.socket?.connected && this._peer) {
      const target = this._peer.email?.toLowerCase().trim();
      this.socket.emit('end_call', { to: target, toUserId: this._peer.id, callId: this._callId });
      this.socket.emit('call_end', { to: target, toUserId: this._peer.id, callId: this._callId });
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
      return !audioTrack.enabled; // returns true if now muted
    }
    return false;
  }

  toggleCamera(): boolean {
    if (!this._localStream || this._callType !== 'video') return false;
    const videoTrack = this._localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // returns true if camera now off
    }
    return false;
  }

  async switchCamera(): Promise<void> {
    if (!this._localStream || this._callType !== 'video') return;

    const currentTrack = this._localStream.getVideoTracks()[0];
    if (!currentTrack) return;

    // Determine current facing mode
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

      // Replace track in the local stream
      this._localStream.removeTrack(currentTrack);
      this._localStream.addTrack(newTrack);

      // Replace track in the peer connection sender
      if (this.pc) {
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }

      // Notify UI of stream update
      this.emit('localStream', this._localStream);
    } catch (e) {
      console.warn('[WebRTCEngine] Camera switch failed:', e);
    }
  }

  // ── PeerConnection Setup ───────────────────────────────────────────────

  private createPeerConnection(config: RTCConfiguration): void {
    if (this.pc) {
      try { this.pc.close(); } catch {}
    }

    const pc = new RTCPeerConnection(config);
    this.pc = pc;
    this.iceCandidateQueue = [];

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket?.connected) {
        const target = this._peer?.email?.toLowerCase().trim();
        this.socket.emit('webrtc_signal', {
          to: target,
          toUserId: this._peer?.id,
          callId: this._callId,
          signal: { candidate: event.candidate.toJSON() },
        });
      }
    };

    // Remote tracks
    const receivedStream = new MediaStream();
    pc.ontrack = (event) => {
      console.log('[WebRTCEngine] Remote track received:', event.track.kind);

      if (event.streams?.[0]) {
        this._remoteStream = event.streams[0];
      } else {
        receivedStream.addTrack(event.track);
        this._remoteStream = receivedStream;
      }

      this.emit('remoteStream', this._remoteStream);

      if (this._state === 'connecting' || this._state === 'reconnecting') {
        this.setState('connected');
        this.clearConnectionTimeout();
        this.startStatsMonitoring();
      }
    };

    // ICE connection state monitoring
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
          // Don't immediately fail — network might recover
          if (this._state === 'connected') {
            this.setState('reconnecting');
            this.attemptIceRestart();
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

        case 'closed':
          // Normal cleanup, nothing to do
          break;
      }
    };

    // Connection state monitoring (more reliable than ICE state in modern browsers)
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
            this.attemptIceRestart();
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

    // Signaling state monitoring
    pc.onsignalingstatechange = () => {
      console.log('[WebRTCEngine] Signaling state:', pc.signalingState);
    };
  }

  // ── Audio Priority ─────────────────────────────────────────────────────

  private setAudioPriority(): void {
    if (!this.pc) return;

    try {
      const transceivers = this.pc.getTransceivers();
      for (const transceiver of transceivers) {
        if (transceiver.sender.track?.kind === 'audio') {
          // Set audio to high priority
          const params = transceiver.sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].priority = 'high';
            params.encodings[0].networkPriority = 'high' as any;
            transceiver.sender.setParameters(params).catch(() => {});
          }
        }
      }
    } catch {
      // Priority API might not be supported — that's fine
    }
  }

  // ── ICE Restart ────────────────────────────────────────────────────────

  private attemptIceRestart(): void {
    if (!this.pc || this.isDestroyed) return;
    if (this._state !== 'connected' && this._state !== 'reconnecting' && this._state !== 'connecting') return;

    this.reconnectAttempts++;
    console.log(`[WebRTCEngine] ICE restart attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);

    if (this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
      console.warn('[WebRTCEngine] Max reconnect attempts reached');
      this.emit('error', 'Connection lost');
      this.setState('failed');
      this.endCall();
      return;
    }

    if (this._state === 'connected') {
      this.setState('reconnecting');
    }

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (this.isDestroyed || !this.pc) return;

      try {
        if (this._isCaller || this.reconnectAttempts > 1) {
          const offer = await this.pc.createOffer({ iceRestart: true });
          await this.pc.setLocalDescription(offer);

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
        console.error('[WebRTCEngine] ICE restart error:', e);
      }
    }, delay);

    // Overall reconnection timeout
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

    const pc = this.pc;
    const target = this._peer?.email?.toLowerCase().trim();

    try {
      // ─── OFFER ───────────────────────────────────────────────────────
      if (signal.type === 'offer' || signal.offer || (signal.sdp && (signal.sdp.type === 'offer' || (typeof signal.sdp === 'string' && !signal.type)))) {
        const sdp = signal.offer || signal.sdp || signal;
        const sdpObj = typeof sdp === 'string' 
          ? { type: 'offer' as RTCSdpType, sdp } 
          : { type: (sdp.type || 'offer') as RTCSdpType, sdp: sdp.sdp || sdp };

        // Handle renegotiation — if we already have a remote description
        if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
        } else if (pc.signalingState === 'have-local-offer') {
          // Glare handling: both sides created offers simultaneously
          // Lower ID yields (rollback)
          const myId = this._peer?.id || '';
          const theirId = signal.from || '';
          if (myId > theirId) {
            // We yield — rollback our offer and accept theirs
            await pc.setLocalDescription({ type: 'rollback' } as any);
            await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
          } else {
            // They yield — ignore their offer
            return;
          }
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
        }

        await this.drainIceCandidateQueue();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket?.emit('webrtc_signal', {
          to: target,
          toUserId: this._peer?.id,
          callId: this._callId,
          signal: { type: 'answer', sdp: answer.sdp },
        });
        return;
      }

      // ─── ANSWER ──────────────────────────────────────────────────────
      if (signal.type === 'answer' || signal.answer || (signal.sdp && signal.sdp.type === 'answer')) {
        const sdp = signal.answer || signal.sdp || signal;
        const sdpObj = typeof sdp === 'string'
          ? { type: 'answer' as RTCSdpType, sdp }
          : { type: (sdp.type || 'answer') as RTCSdpType, sdp: sdp.sdp || sdp };

        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
          await this.drainIceCandidateQueue();
        }
        return;
      }

      // ─── ICE CANDIDATE ──────────────────────────────────────────────
      if (signal.candidate || signal.sdpMid !== undefined || signal.sdpMLineIndex !== undefined) {
        const candidateInit: RTCIceCandidateInit = signal.candidate
          ? (typeof signal.candidate === 'string' ? JSON.parse(signal.candidate) : signal.candidate)
          : signal;

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
          } catch (e) {
            console.warn('[WebRTCEngine] Add ICE candidate error:', e);
          }
        } else {
          // Queue for later
          this.iceCandidateQueue.push(candidateInit);
        }
      }
    } catch (e) {
      console.error('[WebRTCEngine] Signal handling error:', e);
    }
  }

  private async drainIceCandidateQueue(): Promise<void> {
    if (!this.pc) return;

    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTCEngine] Queued ICE candidate error:', e);
        }
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
      'webrtc_signal': (data: any) => {
        // Validate this signal is for our active call
        if (data.callId && data.callId !== this._callId) return;
        this.handleSignal(data);
      },

      'offer': (data: any) => {
        this.handleSignal({
          type: 'offer',
          sdp: data.offer?.sdp || data.offer || data.sdp || data,
          from: data.from,
        });
      },

      'answer': (data: any) => {
        this.handleSignal({
          type: 'answer',
          sdp: data.answer?.sdp || data.answer || data.sdp || data,
          from: data.from,
        });
      },

      'ice_candidate': (data: any) => {
        this.handleSignal({
          candidate: data.candidate || data,
          from: data.from,
        });
      },

      'call_ended': () => {
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('ended');
        }
      },

      'call_rejected': () => {
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('rejected');
        }
      },

      'call_decline': () => {
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('rejected');
        }
      },

      'call_cancelled': () => {
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('ended');
        }
      },

      'call_timed_out': () => {
        if (this._state !== 'idle' && this._state !== 'ended') {
          this.cleanup();
          this.setState('timeout');
        }
      },

      'call_busy': () => {
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

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'video') {
            fps = report.framesPerSecond || 0;
            framesDropped = report.framesDropped || 0;
          }
          if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
            const total = report.packetsReceived + report.packetsLost;
            if (total > 0) {
              packetLoss = Math.round((report.packetsLost / total) * 100);
            }
          }
          if (report.jitter !== undefined) {
            jitter = Math.round(report.jitter * 1000);
          }
          totalBytesReceived += report.bytesReceived || 0;
        }

        if (report.type === 'outbound-rtp') {
          totalBytesSent += report.bytesSent || 0;
        }

        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = Math.round(report.currentRoundTripTime * 1000 || 0);
        }
      });

      const videoBitrate = Math.round(((totalBytesSent - this.prevBytesSent) * 8) / elapsed / 1000);
      const audioBitrate = 0; // Difficult to separate, just track combined

      this.prevBytesSent = totalBytesSent;
      this.prevBytesReceived = totalBytesReceived;
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
        timestamp: Date.now(),
      };

      this.emit('stats', this._stats);

      // Adaptive bitrate adjustment
      this.adaptBitrate(packetLoss, rtt, jitter);
    } catch (e) {
      // Stats collection can fail during state transitions — not critical
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
      this.consecutivePoorStats = 0;
      this.consecutiveGoodStats = 0;
    }

    // Only act after consecutive readings (avoid jitter)
    if (this.consecutivePoorStats >= 2) {
      // Reduce video bitrate (never touch audio)
      this.currentMaxBitrate = Math.max(
        this.currentMaxBitrate * 0.6,
        this.MIN_VIDEO_BITRATE
      );
      await this.applyBitrateLimit();
      this.consecutivePoorStats = 0;
    } else if (this.consecutiveGoodStats >= 3) {
      // Gradually restore video quality
      this.currentMaxBitrate = Math.min(
        this.currentMaxBitrate * 1.3,
        this.MAX_VIDEO_BITRATE
      );
      await this.applyBitrateLimit();
      this.consecutiveGoodStats = 0;
    }
  }

  private async applyBitrateLimit(): Promise<void> {
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
          await sender.setParameters(params);
        }
        // Ensure audio bitrate stays stable
        if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = this.AUDIO_BITRATE;
            await sender.setParameters(params).catch(() => {});
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

  private cleanup(): void {
    this.isDestroyed = true;

    // Clear timers
    this.clearConnectionTimeout();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopStatsMonitoring();

    // Remove socket listeners
    this.removeSocketListeners();

    // Close peer connection
    if (this.pc) {
      try {
        this.pc.onicecandidate = null;
        this.pc.ontrack = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.onconnectionstatechange = null;
        this.pc.onsignalingstatechange = null;
        this.pc.close();
      } catch {}
      this.pc = null;
    }

    // Stop local tracks
    if (this._localStream) {
      this._localStream.getTracks().forEach(t => t.stop());
      this._localStream = null;
    }

    // Clear remote stream reference
    this._remoteStream = null;

    // Clear queues
    this.iceCandidateQueue = [];
    this.pendingSignals = [];

    // Reset adaptation state
    this.reconnectAttempts = 0;
    this.consecutivePoorStats = 0;
    this.consecutiveGoodStats = 0;
    this.currentMaxBitrate = 1500000;
    this._stats = null;
  }

  // Full reset to idle (for reuse after a call ends)
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
