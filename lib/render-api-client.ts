/**
 * Connect Centralized Render API Client
 * 
 * Directs all application data operations (chats, messages, search, profile, stories, nicknames, calls)
 * directly to the Render Node.js backend, bypassing Vercel Serverless / Edge execution.
 * 
 * Features:
 * - Autonomous exponential backoff retry for Render cold starts (zero Vercel fallback)
 * - Request coalescing and in-flight promise deduplication
 * - Multi-device and Capacitor native compatibility
 */

export interface RenderUser {
  id: string;
  username: string;
  email: string;
  name?: string;
  image?: string;
  bio?: string;
  website?: string;
  phone?: string;
  isPrivate?: boolean;
  isOnline?: boolean;
  lastSeen?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unseenCount?: number;
  isRequest?: boolean;
}

export interface RenderMessage {
  id: string;
  content: string;
  type: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
  isSeen: boolean;
  seenAt?: string;
  deletedBySender?: boolean;
  deletedByReceiver?: boolean;
  replyToId?: string;
  replyToContent?: string;
  replyToSenderName?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  storagePath?: string;
}

export interface SendMessagePayload {
  receiverId: string;
  receiverEmail?: string;
  content?: string;
  type?: string;
  replyToId?: string | null;
  replyToContent?: string | null;
  replyToSenderName?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  storagePath?: string | null;
}

// In-flight promise cache for GET request coalescing
const inFlightRequests = new Map<string, Promise<any>>();

class RenderApiClient {
  private getBaseUrl(): string {
    const configured =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL;

    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'http://localhost:5000';
    }

    return '';
  }

  private getAuthHeaders(currentUserId?: string, currentUserEmail?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (currentUserId) {
      headers['x-user-id'] = currentUserId;
    }
    if (currentUserEmail) {
      headers['x-user-email'] = currentUserEmail;
    }

    return headers;
  }

  /**
   * Execute fetch with fast cold-start retry and immediate 4xx short-circuit.
   */
  private async fetchWithRetry<T>(
    endpoint: string,
    options: RequestInit = {},
    userId?: string,
    userEmail?: string,
    retries = 1
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const url = baseUrl
      ? `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
      : endpoint;

    const headers = {
      ...this.getAuthHeaders(userId, userEmail),
      ...(options.headers as Record<string, string> || {}),
    };

    let lastError: any = null;
    let delayMs = 300;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s fast timeout

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const err = new Error(errData.error || `HTTP ${response.status}: ${response.statusText}`);
          // Do not retry 4xx errors (e.g. 404, 401, 403, 400)
          if (response.status >= 400 && response.status < 500) {
            throw err;
          }
          throw err;
        }

        return (await response.json()) as T;
      } catch (err: any) {
        lastError = err;
        // Don't retry client errors
        if (err.message && err.message.startsWith('HTTP 4')) {
          break;
        }
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 1.5;
        }
      }
    }

    throw lastError || new Error(`Render API request failed for ${endpoint}`);
  }

  /**
   * Coalesced GET request to deduplicate parallel component fetches
   */
  private async coalescedGet<T>(endpoint: string, userId?: string, userEmail?: string): Promise<T> {
    const key = `${userId || 'anon'}:${endpoint}`;
    if (inFlightRequests.has(key)) {
      return inFlightRequests.get(key)!;
    }

    const requestPromise = this.fetchWithRetry<T>(endpoint, { method: 'GET' }, userId, userEmail)
      .finally(() => {
        inFlightRequests.delete(key);
      });

    inFlightRequests.set(key, requestPromise);
    return requestPromise;
  }

  // ── Public API Methods ───────────────────────────────────────────────────

  /**
   * Consolidated Initial Social Data (Recent Chats, Active 24h Stories, Nicknames)
   */
  async getInitialSocialData(userId: string, userEmail?: string): Promise<{
    recentChats: RenderUser[];
    activeStories: any[];
    nicknames: Record<string, string>;
  }> {
    return this.coalescedGet('/api/social/initial-data', userId, userEmail);
  }

  /**
   * Fetch a single user's profile from the Render backend (fast path, no Vercel round-trip).
   * Used by the realtime message handler to immediately build a new Recent Chat entry.
   */
  async getSocialUser(userIdOrEmail: string, callerUserId?: string, callerEmail?: string): Promise<RenderUser | null> {
    try {
      const encoded = encodeURIComponent(userIdOrEmail.trim());
      const data = await this.fetchWithRetry<{ user: RenderUser }>(
        `/api/social/user/${encoded}`,
        { method: 'GET' },
        callerUserId,
        callerEmail
      );
      return data?.user ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch 30-message cursor page between current user and other user
   */
  async getSocialMessages(
    otherUserId: string,
    userId: string,
    limit = 30,
    beforeId?: string,
    userEmail?: string
  ): Promise<{ messages: RenderMessage[] }> {
    const query = new URLSearchParams({
      otherUserId,
      limit: String(limit),
      ...(beforeId ? { beforeId } : {}),
    });
    return this.fetchWithRetry(`/api/social/messages?${query.toString()}`, { method: 'GET' }, userId, userEmail);
  }

  /**
   * Send a direct message (text, media, voice, song)
   */
  async sendSocialMessage(payload: SendMessagePayload, userId: string, userEmail?: string): Promise<{ success: boolean; message: RenderMessage }> {
    return this.fetchWithRetry(
      '/api/social/messages',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      userId,
      userEmail
    );
  }

  /**
   * Delete a message for 'me' or 'everyone'
   */
  async deleteSocialMessage(messageId: string, deleteFor: 'me' | 'everyone', userId: string, userEmail?: string): Promise<{ success: boolean }> {
    return this.fetchWithRetry(
      `/api/social/messages/${messageId}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ deleteFor }),
      },
      userId,
      userEmail
    );
  }

  /**
   * Global Indexed Trigram User Search (debounced on client)
   */
  async searchUsers(query: string, userId?: string, userEmail?: string): Promise<{ users: RenderUser[] }> {
    const cleanQ = query.replace(/^@+/, '').trim();
    if (!cleanQ) return { users: [] };

    const queryParams = new URLSearchParams({ q: cleanQ });
    return this.coalescedGet(`/api/social/search?${queryParams.toString()}`, userId, userEmail);
  }

  /**
   * Fetch user profile and recent posts
   */
  async getProfile(targetUserId?: string, userId?: string, userEmail?: string): Promise<{ user: RenderUser; posts: any[] }> {
    const path = targetUserId ? `/api/social/profile/${targetUserId}` : '/api/social/profile';
    return this.coalescedGet(path, userId, userEmail);
  }

  /**
   * Update profile details and/or canonical username
   */
  async updateProfile(
    data: { name?: string; bio?: string; website?: string; image?: string; phone?: string; isPrivate?: boolean; username?: string },
    userId: string,
    userEmail?: string
  ): Promise<{ success: boolean; user: RenderUser }> {
    return this.fetchWithRetry(
      '/api/social/profile',
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      userId,
      userEmail
    );
  }

  /**
   * Fetch shared media attachments for Chat Details panel
   */
  async getSharedMedia(otherUserId: string, userId: string, userEmail?: string): Promise<{ media: any[] }> {
    return this.coalescedGet(`/api/social/media/${otherUserId}`, userId, userEmail);
  }

  /**
   * Validate saved multi-account device list for Accounts Center
   */
  async validateSavedAccounts(accounts: { userId: string; email: string }[]): Promise<{
    validUserIds: string[];
    validEmails: string[];
    existingUsers: any[];
  }> {
    return this.fetchWithRetry(
      '/api/accounts/validate',
      {
        method: 'POST',
        body: JSON.stringify({ accounts }),
      }
    );
  }

  /**
   * React to message with emoji
   */
  async reactToMessage(
    messageId: string,
    emoji: string,
    receiverId?: string,
    receiverEmail?: string,
    userId?: string,
    userEmail?: string
  ): Promise<{ success: boolean }> {
    return this.fetchWithRetry(
      '/api/social/messages/react',
      {
        method: 'POST',
        body: JSON.stringify({ messageId, emoji, receiverId, receiverEmail }),
      },
      userId,
      userEmail
    );
  }

  /**
   * Fetch active 24h stories
   */
  async getStories(userId: string, userEmail?: string): Promise<{ stories: any[] }> {
    return this.coalescedGet('/api/social/stories', userId, userEmail);
  }

  /**
   * Post a new 24h story
   */
  async postStory(imageUrl: string, userId: string, userEmail?: string): Promise<{ success: boolean; story: any }> {
    return this.fetchWithRetry(
      '/api/social/stories',
      {
        method: 'POST',
        body: JSON.stringify({ imageUrl }),
      },
      userId,
      userEmail
    );
  }

  /**
   * Delete a 24h story
   */
  async deleteStory(storyId: string, userId: string, userEmail?: string): Promise<{ success: boolean }> {
    return this.fetchWithRetry(
      `/api/social/stories/${storyId}`,
      {
        method: 'DELETE',
      },
      userId,
      userEmail
    );
  }

  /**
   * Fetch custom chat nicknames
   */
  async getNicknames(userId: string, userEmail?: string): Promise<{ nicknames: Record<string, string> }> {
    return this.coalescedGet('/api/social/nicknames', userId, userEmail);
  }

  /**
   * Assign or delete a custom chat nickname
   */
  async updateNickname(
    targetId: string,
    nickname: string,
    targetEmail?: string,
    userId?: string,
    userEmail?: string
  ): Promise<{ success: boolean }> {
    return this.fetchWithRetry(
      '/api/social/nicknames',
      {
        method: 'PUT',
        body: JSON.stringify({ targetId, nickname, targetEmail }),
      },
      userId,
      userEmail
    );
  }

  /**
   * Fetch call history
   */
  async getCalls(userId: string, userEmail?: string): Promise<{ calls: any[] }> {
    return this.coalescedGet('/api/social/calls', userId, userEmail);
  }

  /**
   * Save call log
   */
  async saveCall(
    receiverId: string,
    type: 'audio' | 'video',
    status: 'completed' | 'missed' | 'rejected',
    duration: number,
    userId: string,
    userEmail?: string
  ): Promise<{ success: boolean; call: any }> {
    return this.fetchWithRetry(
      '/api/social/calls',
      {
        method: 'POST',
        body: JSON.stringify({ receiverId, type, status, duration }),
      },
      userId,
      userEmail
    );
  }
}

export const renderApiClient = new RenderApiClient();
