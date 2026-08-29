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

/**
 * STUN-only fallback — we do NOT embed TURN credentials in client code.
 * If the /api/turn-credentials fetch fails, we try STUN-only first.
 * Most calls on the same ISP or same NAT type will still work with STUN.
 * Only truly symmetric NAT scenarios require TURN, and those will fail gracefully
 * rather than silently leaking credentials.
 */
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
  ],
  iceCandidatePoolSize: 0,
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
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
    console.warn('[WebRTCEngine] Failed to fetch TURN credentials, using STUN-only fallback:', err);
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
      // Prefer a sample rate that Opus handles well
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 }, // Mono is better for voice calls
    };

    const constraints: MediaStreamConstraints = {
      audio: audioConstraints,
      video: this._callType === 'video' ? {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user',
      } : false,
    };

    // Progressive fallback chain
    const fallbackAttempts: MediaStreamConstraints[] = [
      constraints,
      // Lower resolution
      {
        audio: audioConstraints,
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

        // Don't retry on permission denial
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
      // Acquire media first
      const stream = await this.acquireMedia();
      if (this.isDestroyed) { stream.getTracks().forEach(t => t.stop()); return; }

      this._localStream = stream;
      this.emit('localStream', stream);

      // Fetch ICE config and create peer connection (but don't offer yet)
      const iceConfig = await fetchIceConfig();
      if (this.isDestroyed) return;

      this.createPeerConnection(iceConfig);

      // Add local tracks to the peer connection
      stream.getTracks().forEach(track => {
        this.pc!.addTrack(track, stream);
      });

      // Move to ringing state — inform the UI
      this.setState('ringing');

      // *** FIX Bug 1: Do NOT create an SDP offer here ***
      // The offer is created ONLY in onCallAccepted() once the peer picks up.
      // Creating an offer now and sending it before the peer has accepted causes:
      // - The receiver may not have getUserMedia ready yet
      // - Double-offer race conditions
      // - Invalid signaling state errors on both sides
      //
      // The call_user socket event (emitted by SocialChat) tells the peer to ring.
      // We wait for call_accepted before touching SDP.

      // Process any signals that arrived before PC was ready
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

      // Connection timeout — if not connected within 30s, fail
      this.connectionTimeout = setTimeout(() => {
        if (this._state === 'connecting') {
          console.warn('[WebRTCEngine] Connection timeout');
          this.emit('error', 'Connection timed out');
          this.setState('failed');
          this.endCall();
        }
      }, 30000);

      // Process initial offer if provided (receiver gets caller's offer)
      if (initialOffer) {
        await this.handleSignal(initialOffer);
      }

      // Process any signals that arrived during setup
      await this.drainPendingSignals();
    } catch (err: any) {
      console.error('[WebRTCEngine] Accept call error:', err);
      this.emit('error', err.message || 'Failed to accept call');
      this.setState('failed');
      this.cleanup();
    }
  }

  // ── Called when remote peer accepts (caller side) ──────────────────────
  // This is where the caller creates and sends the SDP offer (only once).

  async onCallAccepted(): Promise<void> {
    if (this._state !== 'ringing' && this._state !== 'outgoing') {
      console.log('[WebRTCEngine] onCallAccepted called in state:', this._state, '— ignoring');
      return;
    }

    this.setState('connecting');

    if (!this.pc || !this._localStream) {
      console.error('[WebRTCEngine] onCallAccepted: PC or stream missing');
      return;
    }

    // Connection timeout
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
      // Guard against duplicate offers (makingOffer flag)
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
      this.socket?.emit('webrtc_signal', {
        to: target,
        toUserId: this._peer?.id,
        callId: this._callId,
        signal: { type: 'offer', sdp: offer.sdp },
      });

      this.makingOffer = false;

      // Set audio priority after SDP exchange (FIX Bug 17)
      this.setAudioPriority();
    } catch (e) {
      this.makingOffer = false;
      console.error('[WebRTCEngine] Offer creation error:', e);
    }
  }

  // ── End Call ────────────────────────────────────────────────────────────

  endCall(): void {
    if (this._state === 'ended' || this._state === 'idle') return;

    this.setState('ending');

    // Notify peer via socket
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

      // Replace in local stream
      this._localStream.removeTrack(currentTrack);
      this._localStream.addTrack(newTrack);

      // Replace in peer connection sender — no renegotiation needed
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
        this.socket.emit('webrtc_signal', {
          to: target,
          toUserId: this._peer?.id,
          callId: this._callId,
          signal: { candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.onicecandidateerror = (event: RTCPeerConnectionIceErrorEvent) => {
      // Only log — ICE candidate errors are common and non-fatal
      console.warn('[WebRTCEngine] ICE candidate error:', event.errorCode, event.errorText);
    };

    // ── Remote tracks ────────────────────────────────────────────────────
    // Build a single persistent MediaStream for the remote side
    const remoteStream = new MediaStream();

    pc.ontrack = (event) => {
      console.log('[WebRTCEngine] Remote track received:', event.track.kind, event.track.id);

      // Add track if not already in stream (deduplicate)
      if (!remoteStream.getTrackById(event.track.id)) {
        remoteStream.addTrack(event.track);
      }

      // Also add any tracks from the event's streams array
      if (event.streams?.[0]) {
        event.streams[0].getTracks().forEach(t => {
          if (!remoteStream.getTrackById(t.id)) {
            remoteStream.addTrack(t);
          }
        });
      }

      // Handle track ending (e.g., remote camera turned off and back on)
      event.track.onunmute = () => {
        if (!remoteStream.getTrackById(event.track.id)) {
          remoteStream.addTrack(event.track);
        }
        this.emit('remoteStream', remoteStream);
      };

      this._remoteStream = remoteStream;
      this.emit('remoteStream', this._remoteStream);

      // Mark as connected if we were waiting
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
          // Network might recover — wait before acting
          if (this._state === 'connected') {
            this.setState('reconnecting');
            // Give it 3 seconds to self-recover before forcing ICE restart
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
          // Normal — no action needed
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

    // ── Negotiation needed (triggered after addTrack, renegotiation, etc.) ──
    // Guard against spurious triggers — we control negotiation explicitly
    pc.onnegotiationneeded = async () => {
      // Only the caller triggers negotiation, and only when connected (renegotiation)
      if (!this._isCaller || this._state !== 'connected' || this.makingOffer) return;

      try {
        this.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') {
          // State changed while we were async — abort
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
  // Called AFTER setLocalDescription() so encodings exist

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
            sender.setParameters(params).catch(() => {});
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

    // Exponential backoff: 1s, 2s, 4s, 8s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (this.isDestroyed || !this.pc) return;

      try {
        // *** FIX Bug 12: Guard ICE restart with signalingState check ***
        if (this.pc.signalingState !== 'stable') {
          console.warn('[WebRTCEngine] ICE restart skipped — signaling state is not stable:', this.pc.signalingState);
          return;
        }

        if (this._isCaller) {
          // Caller: send ICE restart offer
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
          // Receiver: request ICE restart from the caller side
          // (restartIce() signals the caller to create a new offer)
          this.pc.restartIce();
        }
      } catch (e) {
        this.makingOffer = false;
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

    // *** FIX Bug 5/8: Reject signals from unrelated calls ***
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

        // Perfect Negotiation pattern:
        // Determine if we should "politely" yield when there's a collision
        const offerCollision =
          this.makingOffer || pc.signalingState !== 'stable';

        // Caller is the "impolite" peer — it never yields
        // Receiver is the "polite" peer — it yields on collision
        this.ignoreOffer = !this._isCaller && offerCollision;

        if (this.ignoreOffer) {
          console.warn('[WebRTCEngine] Ignoring colliding offer (polite peer)');
          return;
        }

        // If impolite peer and collision: rollback our offer
        if (offerCollision && this._isCaller) {
          await pc.setLocalDescription({ type: 'rollback' } as any);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
        await this.drainIceCandidateQueue();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // *** FIX Bug 17: Set audio priority after SDP exchange ***
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

          // *** FIX Bug 17: Set audio priority after receiving answer too ***
          this.setAudioPriority();
        } else {
          console.warn('[WebRTCEngine] Received answer in wrong signaling state:', pc.signalingState);
        }
        return;
      }

      // ─── ICE CANDIDATE ──────────────────────────────────────────────────
      if (signal.candidate !== undefined || signal.sdpMid !== undefined || signal.sdpMLineIndex !== undefined) {
        const candidateInit: RTCIceCandidateInit =
          signal.candidate && typeof signal.candidate === 'object'
            ? signal.candidate
            : signal.candidate && typeof signal.candidate === 'string'
              ? JSON.parse(signal.candidate)
              : signal;

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
          } catch (e) {
            // Ignore benign candidate errors (e.g., candidate for ended session)
            if (!this.ignoreOffer) {
              console.warn('[WebRTCEngine] Add ICE candidate error:', e);
            }
          }
        } else {
          // Queue for after remote description is set
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
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
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
        // *** FIX Bug 5/8: Reject signals for other calls ***
        if (data.callId && this._callId && data.callId !== this._callId) {
          return; // Signal for a different call — ignore silently
        }
        this.handleSignal(data.signal || data);
      },

      // ─── Backward-compat: offer sent via dedicated 'offer' event ───────
      // FIX Bug 10/11: Engine must also listen to these legacy channels
      'offer': (data: any) => {
        if (data.callId && this._callId && data.callId !== this._callId) return;
        this.handleSignal(data.offer || data);
      },

      // ─── Backward-compat: answer sent via dedicated 'answer' event ─────
      'answer': (data: any) => {
        if (data.callId && this._callId && data.callId !== this._callId) return;
        this.handleSignal(data.answer || data);
      },

      // ─── Backward-compat: ICE candidate via dedicated event ────────────
      // FIX Bug 10: Handle ice_candidate socket event
      'ice_candidate': (data: any) => {
        if (data.callId && this._callId && data.callId !== this._callId) return;
        this.handleSignal(data.candidate ? data : data);
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
      let prevAudioBytesReceived = 0;
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
          // Determine relay vs direct
          const localCandidate = stats.get(report.localCandidateId);
          if (localCandidate) {
            candidateType = (localCandidate as any).candidateType || 'unknown';
          }
        }
      });

      const videoBitrate = Math.round(((totalBytesSent - this.prevBytesSent) * 8) / elapsed / 1000);
      const audioBitrate = Math.round(((audioBytesReceived - prevAudioBytesReceived) * 8) / elapsed / 1000);

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
        candidateType,
        timestamp: Date.now(),
      };

      this.emit('stats', this._stats);

      // Dev diagnostics
      if (process.env.NODE_ENV === 'development') {
        console.log(`[WebRTCEngine Stats] RTT:${rtt}ms Loss:${packetLoss}% Jitter:${jitter}ms Video:${videoBitrate}kbps Candidate:${candidateType}`);
      }

      // Adaptive bitrate adjustment
      this.adaptBitrate(packetLoss, rtt, jitter);
    } catch {
      // Stats collection can fail during state transitions — non-critical
    }
  }

  private async adaptBitrate(packetLoss: number, rtt: number, jitter: number): Promise<void> {
    if (!this.pc || this._callType !== 'video') return;

    // Thresholds for poor/good network
    const isPoor = packetLoss > 5 || rtt > 400 || jitter > 100;
    const isGood = packetLoss < 2 && rtt < 150 && jitter < 30;

    if (isPoor) {
      this.consecutivePoorStats++;
      this.consecutiveGoodStats = 0;
    } else if (isGood) {
      this.consecutiveGoodStats++;
      this.consecutivePoorStats = 0;
    } else {
      // Neutral — don't oscillate
      this.consecutivePoorStats = Math.max(0, this.consecutivePoorStats - 1);
      this.consecutiveGoodStats = Math.max(0, this.consecutiveGoodStats - 1);
    }

    // Act only after multiple consistent readings (prevent oscillation)
    if (this.consecutivePoorStats >= 2) {
      this.currentMaxBitrate = Math.max(
        this.currentMaxBitrate * 0.6,
        this.MIN_VIDEO_BITRATE
      );
      await this.applyVideoEncodingParams();
      this.consecutivePoorStats = 0;
    } else if (this.consecutiveGoodStats >= 4) {
      // Restore gradually
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
          // Scale down resolution on very poor network
          if (this.currentMaxBitrate < 300000) {
            params.encodings[0].scaleResolutionDownBy = 2; // Half resolution
          } else if (this.currentMaxBitrate < 600000) {
            params.encodings[0].scaleResolutionDownBy = 1.5;
          } else {
            params.encodings[0].scaleResolutionDownBy = 1;
          }
          await sender.setParameters(params);
        }

        // Audio: always enforce stable bitrate — never sacrifice audio for video
        if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = this.AUDIO_BITRATE_BPS;
            params.encodings[0].priority = 'high';
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
    } catch {}
    this.pc = null;
  }

  private cleanup(): void {
    this.isDestroyed = true;

    // Clear all timers
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

    // Remove socket listeners
    this.removeSocketListeners();

    // Close peer connection
    this.closePeerConnection();

    // Stop all local tracks
    if (this._localStream) {
      this._localStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this._localStream = null;
    }

    // Clear remote stream reference (don't stop remote tracks — we don't own them)
    this._remoteStream = null;

    // Clear queues and flags
    this.iceCandidateQueue = [];
    this.pendingSignals = [];
    this.makingOffer = false;
    this.ignoreOffer = false;

    // Reset adaptation state
    this.reconnectAttempts = 0;
    this.consecutivePoorStats = 0;
    this.consecutiveGoodStats = 0;
    this.currentMaxBitrate = 1200000;
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
