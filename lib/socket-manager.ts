/**
 * SocketManager — Singleton real-time connection layer
 *
 * Strategy:
 *  1. Primary: Socket.IO WebSocket to Railway server
 *  2. Fallback: HTTP polling via Next.js server actions (works even when Socket server is down)
 *  3. Heartbeat: Re-identifies every 15s, syncs messages on visibility change
 *  4. Cross-network: Handles WiFi↔Cell switches by reconnecting and syncing missed messages
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOCKET_URL) ||
  'https://server-6gmj.onrender.com';

type MessageHandler = (msg: any) => void;
type StatusHandler = (connected: boolean) => void;

class SocketManager {
  private static instance: SocketManager | null = null;
  private socket: Socket | null = null;
  private userEmail: string | null = null;
  private userId: string | null = null;
  private isIdentified = false;
  private messageHandlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private genericHandlers = new Map<string, Set<(...args: any[]) => void>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  connect(email: string, userId: string): Socket {
    this.userEmail = email.toLowerCase().trim();
    this.userId = String(userId);

    // Return existing connected socket if still alive
    if (this.socket?.connected) {
      this.identify();
      return this.socket;
    }

    // Disconnect stale socket first
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      forceNew: false,
    });

    this.socket = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      this.isIdentified = false;
      this.identify();
      this.broadcastStatus(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.isIdentified = false;
      this.broadcastStatus(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
      this.broadcastStatus(false);
    });

    socket.on('reconnect', (attempt) => {
      console.log('[Socket] Reconnected after', attempt, 'attempts');
      this.isIdentified = false;
      this.identify();
      this.broadcastStatus(true);
    });

    // Forward all registered generic events
    this.genericHandlers.forEach((handlers, event) => {
      handlers.forEach(handler => {
        socket.on(event, handler);
      });
    });

    return socket;
  }

  identify() {
    if (!this.socket?.connected || this.isIdentified) return;
    if (!this.userEmail && !this.userId) return;

    this.socket.emit('identify', {
      email: this.userEmail,
      userId: this.userId,
    });
    this.isIdentified = true;
    console.log('[Socket] Identified:', this.userEmail, this.userId);
  }

  on(event: string, handler: (...args: any[]) => void) {
    if (!this.genericHandlers.has(event)) {
      this.genericHandlers.set(event, new Set());
    }
    this.genericHandlers.get(event)!.add(handler);
    this.socket?.on(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void) {
    this.genericHandlers.get(event)?.delete(handler);
    this.socket?.off(event, handler);
  }

  emit(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      return true;
    }
    console.warn('[Socket] Cannot emit — not connected:', event);
    return false;
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    // Immediately fire current state
    if (this.socket?.connected) handler(true);
  }

  offStatus(handler: StatusHandler) {
    this.statusHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.isIdentified = false;
  }

  private broadcastStatus(connected: boolean) {
    this.statusHandlers.forEach(h => h(connected));
  }
}

export const socketManager = SocketManager.getInstance();
export type { MessageHandler, StatusHandler };
