'use client';

import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import {
  searchUsers,
  getSocialMessages,
  getSocialUser,
  saveSocialMessage,
  deleteSocialMessage,
  hideSocialChat,
  reactToSocialMessage,
  getRecentChats,
  markMessagesAsSeen,
  getChatSharedMedia,
  askAI,
  saveCall,
  toggleShowActivityStatus,
} from '@/app/dashboard/actions';
import {
  optimizeImageClient,
  extractVideoMetadataAndThumbnail,
  validateMediaFile,
  uploadBinaryWithProgress,
} from '@/lib/media-optimizer';
import dynamic from 'next/dynamic';
import { LocalNotifications } from '@capacitor/local-notifications';
import { triggerHaptic } from '@/lib/haptics';
import {
  Bell,
  Plus,
  Archive,
  CheckCheck,
  Check,
  Search,
  X,
  ChevronLeft,
  Pencil,
  Palette,
  Trash2,
  Pin,
  Ban,
  Phone,
  Video,
  PhoneCall,
  MessageSquare,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Mic as LucideMic,
} from 'lucide-react';
import ChatInput from './ChatInput';
import './SocialChat.css';

// Code-split CallInterface so WebRTC and media engines load strictly on-demand when a call starts
const CallInterface = dynamic(() => import('./CallInterface'), {
  ssr: false,
});

// ── Request Coalescing and In-Flight Caching for getRecentChats ─────────────
let recentChatsInFlightPromise: Promise<any[]> | null = null;
let lastRecentChatsFetchTime = 0;
let cachedRecentChatsData: any[] | null = null;

export async function fetchRecentChatsCoalesced(force = false): Promise<any[]> {
  const now = Date.now();
  if (!force && cachedRecentChatsData && now - lastRecentChatsFetchTime < 5000) {
    return cachedRecentChatsData;
  }
  if (recentChatsInFlightPromise) {
    return recentChatsInFlightPromise;
  }
  recentChatsInFlightPromise = (async () => {
    try {
      const data = await getRecentChats();
      cachedRecentChatsData = data;
      lastRecentChatsFetchTime = Date.now();
      return data;
    } finally {
      recentChatsInFlightPromise = null;
    }
  })();
  return recentChatsInFlightPromise;
}

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  image?: string;

  lastMessage?: string;
  unseenCount?: number;
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: string;
  createdAt: Date;
  isSeen?: boolean;
  reactions?: any[];
  replyTo?: {
    id: string;
    content: string;
    senderName?: string;
  };
}

const EMOJI_CATEGORIES = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿']
};

export interface ChatTheme {
  id: string;
  name: string;
  category?: 'Gradients' | 'Ambient' | 'Nature' | 'Special';
  outgoingGradient: string;
  outgoingTextColor: string;
  incomingBubbleColor: string;
  incomingTextColor: string;
  chatBg: string;
  accentColor: string;
  inputBorderColor: string;
  reactionAccent: string;
  previewWallpaper: string;
  wallpaperUrl?: string;
}

export const INSTAGRAM_THEMES: ChatTheme[] = [
  { id: 'default', name: 'Default', category: 'Ambient', outgoingGradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'var(--dm-bg-hover)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'var(--dm-bg-main)', accentColor: '#6366f1', inputBorderColor: 'var(--dm-border)', reactionAccent: '#6366f1', previewWallpaper: 'radial-gradient(circle at center, #27272a 0%, #09090b 100%)' },
  { id: 'care', name: 'Care', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #8C5E3D 0%, #6E4324 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(244, 239, 230, 0.92)', incomingTextColor: '#6E4324', chatBg: 'transparent', accentColor: '#8C5E3D', inputBorderColor: '#6E4324', reactionAccent: '#8C5E3D', previewWallpaper: '/Care.jpeg', wallpaperUrl: '/Care.jpeg' },
  { id: 'cartoon', name: 'Cartoon', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #5A3828 0%, #3E2419 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(252, 252, 252, 0.94)', incomingTextColor: '#3E2419', chatBg: 'transparent', accentColor: '#5A3828', inputBorderColor: '#3E2419', reactionAccent: '#5A3828', previewWallpaper: '/Cartoon.jpeg', wallpaperUrl: '/Cartoon.jpeg' },
  { id: 'delululu', name: 'Delululu', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #B82872 0%, #8B1B54 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(252, 215, 229, 0.92)', incomingTextColor: '#8B1B54', chatBg: 'transparent', accentColor: '#B82872', inputBorderColor: '#8B1B54', reactionAccent: '#B82872', previewWallpaper: '/Delululu.jpeg', wallpaperUrl: '/Delululu.jpeg' },
  { id: 'moment', name: 'Moment', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #B8243A 0%, #8A1525 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(244, 241, 234, 0.92)', incomingTextColor: '#8A1525', chatBg: 'transparent', accentColor: '#B8243A', inputBorderColor: '#8A1525', reactionAccent: '#B8243A', previewWallpaper: '/Moment.jpeg', wallpaperUrl: '/Moment.jpeg' },
  { id: 'ribbo', name: 'Ribbo', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #AA4862 0%, #7D2E42 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(253, 245, 246, 0.92)', incomingTextColor: '#7D2E42', chatBg: 'transparent', accentColor: '#AA4862', inputBorderColor: '#7D2E42', reactionAccent: '#AA4862', previewWallpaper: '/Ribbo.jpeg', wallpaperUrl: '/Ribbo.jpeg' },
  { id: 'sunflower', name: 'Sunflower', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #94591B 0%, #6E3F10 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(251, 242, 222, 0.92)', incomingTextColor: '#6E3F10', chatBg: 'transparent', accentColor: '#94591B', inputBorderColor: '#6E3F10', reactionAccent: '#94591B', previewWallpaper: '/Sunflower.jpeg', wallpaperUrl: '/Sunflower.jpeg' },
  { id: 'suprise', name: 'Suprise', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #A33B4F 0%, #752332 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(247, 235, 235, 0.92)', incomingTextColor: '#752332', chatBg: 'transparent', accentColor: '#A33B4F', inputBorderColor: '#752332', reactionAccent: '#A33B4F', previewWallpaper: '/Suprise.jpeg', wallpaperUrl: '/Suprise.jpeg' },
  { id: 'tom-jerry', name: 'Tom Jerry', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #586280 0%, #3B4257 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(253, 230, 221, 0.92)', incomingTextColor: '#3B4257', chatBg: 'transparent', accentColor: '#586280', inputBorderColor: '#3B4257', reactionAccent: '#586280', previewWallpaper: '/Tom Jerry.jpeg', wallpaperUrl: '/Tom Jerry.jpeg' },
  { id: 'vibe', name: 'Vibe', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #2A77C5 0%, #164C82 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(232, 242, 250, 0.92)', incomingTextColor: '#164C82', chatBg: 'transparent', accentColor: '#2A77C5', inputBorderColor: '#164C82', reactionAccent: '#2A77C5', previewWallpaper: '/Vibe.jpeg', wallpaperUrl: '/Vibe.jpeg' },
  { id: 'alpha', name: 'Alpha', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #5A4230 0%, #3D2B1E 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(245, 237, 228, 0.92)', incomingTextColor: '#4A3525', chatBg: 'transparent', accentColor: '#4A3525', inputBorderColor: '#5A4230', reactionAccent: '#4A3525', previewWallpaper: '/Alpha.jpg', wallpaperUrl: '/Alpha.jpg' },
  { id: 'dark-alpha', name: 'Dark Alpha', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #5A121E 0%, #36080F 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(242, 216, 220, 0.92)', incomingTextColor: '#420D15', chatBg: 'transparent', accentColor: '#5A121E', inputBorderColor: '#420D15', reactionAccent: '#5A121E', previewWallpaper: '/Dark Alpha.jpg', wallpaperUrl: '/Dark Alpha.jpg' },
  { id: 'pattern', name: 'Pattern', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #5E2252 0%, #3D1434 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(247, 225, 237, 0.92)', incomingTextColor: '#4A1A40', chatBg: 'transparent', accentColor: '#5E2252', inputBorderColor: '#4A1A40', reactionAccent: '#5E2252', previewWallpaper: '/Pattern.jpg', wallpaperUrl: '/Pattern.jpg' },
  { id: 'view', name: 'View', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #323C70 0%, #1D2342 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(230, 233, 250, 0.92)', incomingTextColor: '#252D54', chatBg: 'transparent', accentColor: '#323C70', inputBorderColor: '#252D54', reactionAccent: '#323C70', previewWallpaper: '/View.jpg', wallpaperUrl: '/View.jpg' },
  { id: 'purply', name: 'Purply', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #544975 0%, #352E4B 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(250, 227, 217, 0.92)', incomingTextColor: '#433A5E', chatBg: 'transparent', accentColor: '#544975', inputBorderColor: '#433A5E', reactionAccent: '#544975', previewWallpaper: '/Purply.jpg', wallpaperUrl: '/Purply.jpg' },
  { id: 'love', name: 'Love', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #ff7597 0%, #e63946 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: '#4d0522', incomingTextColor: '#ffffff', chatBg: 'transparent', accentColor: '#ff7597', inputBorderColor: '#ff7597', reactionAccent: '#ff7597', previewWallpaper: '/Love.jpg', wallpaperUrl: '/Love.jpg' },
  { id: 'love-u', name: 'Love U', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #ff4d6d 0%, #c9184a 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: '#590d22', incomingTextColor: '#ffffff', chatBg: 'transparent', accentColor: '#ff4d6d', inputBorderColor: '#ff4d6d', reactionAccent: '#ff4d6d', previewWallpaper: '/Love-2.jpg', wallpaperUrl: '/Love-2.jpg' },
  { id: 'whale', name: 'Whale', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: '#092038', incomingTextColor: '#ffffff', chatBg: 'transparent', accentColor: '#38bdf8', inputBorderColor: '#38bdf8', reactionAccent: '#38bdf8', previewWallpaper: '/Whale.jpg', wallpaperUrl: '/Whale.jpg' },
  { id: 'couple', name: 'Couple', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #e76f51 0%, #f4a261 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: '#3d1c14', incomingTextColor: '#ffffff', chatBg: 'transparent', accentColor: '#f4a261', inputBorderColor: '#f4a261', reactionAccent: '#f4a261', previewWallpaper: '/Couple.jpg', wallpaperUrl: '/Couple.jpg' },
  { id: 'mono', name: 'Mono', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #27272a 0%, #09090b 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: '#18181b', incomingTextColor: '#f4f4f5', chatBg: 'transparent', accentColor: '#e4e4e7', inputBorderColor: '#71717a', reactionAccent: '#ffffff', previewWallpaper: '/Mono.jpg', wallpaperUrl: '/Mono.jpg' },
  { id: 'sea-side', name: 'Sea Side', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: '#E83F78', incomingTextColor: '#ffffff', chatBg: 'transparent', accentColor: '#E83F78', inputBorderColor: '#38bdf8', reactionAccent: '#E83F78', previewWallpaper: '/sea-side.jpg', wallpaperUrl: '/sea-side.jpg' },
  { id: 'hearts', name: 'Hearts', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #FF2A6D 0%, #D8005A 50%, #9B0040 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 240, 246, 0.94)', incomingTextColor: '#3D0B20', chatBg: 'transparent', accentColor: '#FF2A6D', inputBorderColor: '#FF2A6D', reactionAccent: '#FF2A6D', previewWallpaper: '/Hearts.jpg', wallpaperUrl: '/Hearts.jpg' },
  { id: 'floral', name: 'Floral', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #9C1952 0%, #750D3A 50%, #520526 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 255, 255, 0.96)', incomingTextColor: '#42071F', chatBg: 'transparent', accentColor: '#9C1952', inputBorderColor: '#9C1952', reactionAccent: '#9C1952', previewWallpaper: '/Floral.jpg', wallpaperUrl: '/Floral.jpg' },
  { id: 'sakura', name: 'Sakura', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #FF1764 0%, #D40049 50%, #8A002E 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 245, 247, 0.95)', incomingTextColor: '#450014', chatBg: 'transparent', accentColor: '#FF1764', inputBorderColor: '#FF1764', reactionAccent: '#FF1764', previewWallpaper: '/Sakura.jpg', wallpaperUrl: '/Sakura.jpg' },
  { id: 'lilac', name: 'Lilac', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #6B4E9B 0%, #50337E 50%, #371D62 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 253, 248, 0.95)', incomingTextColor: '#2D184C', chatBg: 'transparent', accentColor: '#6B4E9B', inputBorderColor: '#6B4E9B', reactionAccent: '#6B4E9B', previewWallpaper: '/Lilac.jpg', wallpaperUrl: '/Lilac.jpg' },
  { id: 'moon', name: 'Moon', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #107382 0%, #084D58 50%, #032F36 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(242, 253, 255, 0.95)', incomingTextColor: '#062E35', chatBg: 'transparent', accentColor: '#107382', inputBorderColor: '#107382', reactionAccent: '#107382', previewWallpaper: '/Moon.jpg', wallpaperUrl: '/Moon.jpg' },
];

export interface MessageTag {
  id: string;
  emoji: string;
  label: string;
  color: string;
}

export const PRESET_TAGS: MessageTag[] = [
  { id: 'important', emoji: '⭐', label: 'Important', color: '#f59e0b' },
  { id: 'favorite', emoji: '❤️', label: 'Favorite', color: '#ec4899' },
  { id: 'urgent', emoji: '⚡', label: 'Urgent', color: '#ef4444' },
  { id: 'pinned', emoji: '📌', label: 'Pinned', color: '#3b82f6' },
  { id: 'todo', emoji: '🏷️', label: 'To Do', color: '#10b981' },
  { id: 'idea', emoji: '💡', label: 'Idea', color: '#a855f7' },
  { id: 'trending', emoji: '🔥', label: 'Trending', color: '#f97316' },
];

export const formatLastSeenAgo = (lastSeenRaw?: string | Date | null): string => {
  if (!lastSeenRaw) return '';

  const d = typeof lastSeenRaw === 'string' ? new Date(lastSeenRaw) : (lastSeenRaw instanceof Date ? lastSeenRaw : new Date(lastSeenRaw));
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffSec / 3600);
  const diffDays = Math.floor(diffSec / 86400);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const formatDateSeparator = (date: Date): string => {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' }).toUpperCase();
  }
  const monthStr = d.toLocaleDateString([], { month: 'short' }).toUpperCase();
  return `${monthStr} ${d.getDate()}`;
};

export interface PendingQueueItem {
  tempId: string;
  receiverId: string;
  receiverEmail?: string;
  content: string;
  type: string;
  createdAt: string;
  replyTo?: any;
  themeId?: string;
}

export const getPendingQueue = (): PendingQueueItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('social_pending_messages');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const savePendingQueue = (queue: PendingQueueItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('social_pending_messages', JSON.stringify(queue));
  } catch (e) {}
};

export const addToPendingQueue = (item: PendingQueueItem) => {
  const queue = getPendingQueue();
  if (!queue.some(q => q.tempId === item.tempId)) {
    queue.push(item);
    savePendingQueue(queue);
  }
};

export const removeFromPendingQueue = (tempId: string) => {
  const queue = getPendingQueue().filter(q => q.tempId !== tempId);
  savePendingQueue(queue);
};

export const getPendingMessagesForUser = (userId: string, currentUserId: string): any[] => {
  const queue = getPendingQueue().filter(q => q.receiverId === userId);
  return queue.map(p => ({
    id: p.tempId,
    senderId: currentUserId,
    receiverId: p.receiverId,
    content: p.content,
    type: p.type as any,
    createdAt: new Date(p.createdAt),
    isSeen: false,
    replyTo: p.replyTo,
    status: 'sending'
  }));
};

export const FONT_OPTIONS = [
  { id: 'default', name: 'Default', family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: 'bubble', name: 'Bubble', family: "'Comfortaa', 'Fredoka', cursive, sans-serif" },
  { id: 'deco', name: 'Deco', family: "'Playfair Display', 'Cinzel', serif" },
  { id: 'editor', name: 'Editor', family: "'Fira Code', 'Courier New', monospace" },
  { id: 'poster', name: 'Poster', family: "'Oswald', 'Impact', sans-serif" },
  { id: 'serif', name: 'Serif', family: "'Georgia', 'Merriweather', serif" },
  { id: 'signature', name: 'Signature', family: "'Caveat', 'Dancing Script', cursive" }
];

export const detectThemeIdFromMessages = (msgs: any[]): string | null => {
  if (!Array.isArray(msgs) || msgs.length === 0) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || !m.content) continue;
    const content = String(m.content);
    const isThemeMsg = m.type === 'system' || content.toLowerCase().includes('changed the theme to') || content.toLowerCase().includes('set theme to');
    if (isThemeMsg) {
      const tagMatch = content.match(/\[theme:([a-zA-Z0-9_-]+)\]/i);
      if (tagMatch && tagMatch[1]) {
        return tagMatch[1];
      }
      const lowerContent = content.toLowerCase();
      const sortedThemes = [...INSTAGRAM_THEMES].sort((a, b) => b.name.length - a.name.length);
      for (const theme of sortedThemes) {
        const cleanName = theme.name.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim().toLowerCase();
        if (cleanName && lowerContent.includes(cleanName)) {
          return theme.id;
        }
      }
    }
  }
  return null;
};

// ─── Instagram DM-style Message Overlay ────────────────────────────────────

const IG_QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🙏', '🔥'];

interface IGMenuState {
  msg: any;
  bubbleRect: DOMRect;
  isSent: boolean;
}

const IGMessageOverlay = ({
  state,
  currentUserId,
  onClose,
  onReact,
  onReply,
  onForward,
  onRequestDelete,
  onOpenTagPicker,
  session,
  activeTheme,
}: {
  state: IGMenuState;
  currentUserId: string;
  onClose: () => void;
  onReact: (msgId: string, emoji: string) => void;
  onReply: (msg: any) => void;
  onForward: (msg: any) => void;
  onRequestDelete: (msgId: string, type: 'me' | 'everyone') => void;
  onOpenTagPicker: (msg: any) => void;
  session: any;
  activeTheme?: ChatTheme;
}) => {
  if (!state || !state.msg) return null;
  const { msg, isSent } = state;
  const rawRect = state.bubbleRect || (state as any).rect;
  const bubbleRect = rawRect && typeof rawRect.top === 'number'
    ? rawRect
    : { top: 150, bottom: 250, left: 20, right: 300, width: 280, height: 100 };

  const overlayRef = useRef<HTMLDivElement>(null);
  const reactionBarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Escape key dismiss
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleClose = () => {
    setMounted(false);
    setTimeout(onClose, 220);
  };

  // Swipe-down-to-dismiss on the menu panel
  const swipeStartY = useRef(0);
  const handleMenuTouchStart = (e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY;
  };
  const handleMenuTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - swipeStartY.current;
    if (diff > 60) handleClose();
  };

  // Smart layout: reaction bar & action menu positioning without collision/overlap
  const REACTION_BAR_H = 50;
  const MENU_ITEMS_H = isSent ? 245 : 195;
  const GAP = 8;
  const PAD = 14;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Clamp bubble rect to viewport
  const bTop = Math.max(PAD, bubbleRect.top);
  const bBottom = Math.min(vh - PAD, bubbleRect.bottom);
  const bLeft = Math.max(10, bubbleRect.left);
  const bRight = Math.min(vw - 10, bubbleRect.right);
  const bCenterX = (bLeft + bRight) / 2;

  const spaceBelow = vh - bBottom;
  const spaceAbove = bTop;

  let reactionBarTop: number;
  let menuTop: number;

  if (spaceBelow >= MENU_ITEMS_H + PAD && spaceAbove >= REACTION_BAR_H + PAD) {
    // Normal Case: Reaction Bar directly above bubble, Menu directly below bubble
    reactionBarTop = Math.max(PAD, bTop - REACTION_BAR_H - GAP);
    menuTop = Math.min(vh - MENU_ITEMS_H - PAD, bBottom + GAP);
  } else if (spaceBelow < MENU_ITEMS_H + PAD) {
    // Message is down / near the bottom: Both reaction bar and menu go ABOVE the bubble
    // Stack: Menu -> Gap -> Reaction Bar -> Gap -> Bubble
    reactionBarTop = Math.max(PAD + MENU_ITEMS_H + GAP, bTop - REACTION_BAR_H - GAP);
    menuTop = reactionBarTop - MENU_ITEMS_H - GAP;

    // Safety: if whole stack hits the top of viewport, clamp from top
    if (menuTop < PAD) {
      menuTop = PAD;
      reactionBarTop = menuTop + MENU_ITEMS_H + GAP;
    }
  } else {
    // Message is near the top: Both reaction bar and menu go BELOW the bubble
    // Stack: Bubble -> Gap -> Reaction Bar -> Gap -> Menu
    reactionBarTop = Math.min(vh - REACTION_BAR_H - MENU_ITEMS_H - GAP - PAD, bBottom + GAP);
    menuTop = reactionBarTop + REACTION_BAR_H + GAP;

    // Safety: if whole stack hits the bottom of viewport, clamp from bottom
    if (menuTop + MENU_ITEMS_H > vh - PAD) {
      menuTop = vh - MENU_ITEMS_H - PAD;
      reactionBarTop = Math.max(PAD, menuTop - REACTION_BAR_H - GAP);
    }
  }

  // Horizontal Sizing & Centering
  const reactionBarW = Math.min(390, vw - 24);
  let reactionBarLeft = bCenterX - reactionBarW / 2;
  reactionBarLeft = Math.max(12, Math.min(reactionBarLeft, vw - reactionBarW - 12));

  const MENU_W = Math.min(280, vw - 24);
  let menuLeft = isSent ? bRight - MENU_W : bLeft;
  menuLeft = Math.max(12, Math.min(menuLeft, vw - MENU_W - 12));

  // Check if user already reacted with an emoji
  const myReactions = new Set<string>(
    (msg.reactions || [])
      .filter((r: any) => String(r.userId) === String(currentUserId))
      .map((r: any) => r.emoji)
  );

  const accentColor = activeTheme?.accentColor || '#6366f1';
  const outgoingGradient = activeTheme?.outgoingGradient || 'linear-gradient(135deg, #3797F0 0%, #833AB4 50%, #C13584 100%)';
  const incomingBubbleColor = activeTheme?.incomingBubbleColor || 'rgba(39, 39, 42, 0.9)';

  const isDark = typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';

  const menuBg = isDark
    ? 'rgba(20, 20, 24, 0.94)'
    : 'rgba(255, 255, 255, 0.96)';
  const menuBorder = activeTheme?.id !== 'default'
    ? `${accentColor}50`
    : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)');
  const menuText = isDark ? '#ffffff' : '#09090b';
  const menuMuted = isDark ? 'rgba(255,255,255,0.48)' : 'rgba(0,0,0,0.42)';
  const dividerColor = activeTheme?.id !== 'default'
    ? `${accentColor}25`
    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');
  const hoverBg = activeTheme?.id !== 'default'
    ? `${accentColor}20`
    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)');
  const dangerColor = '#ef4444';

  const reactionBg = isDark
    ? 'rgba(22, 22, 26, 0.94)'
    : 'rgba(255, 255, 255, 0.96)';

  const animStyle = (extraTransform = '') => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? `scale(1) ${extraTransform}` : `scale(0.95) translateY(8px) ${extraTransform}`,
    transition: 'opacity 0.22s ease-out, transform 0.22s ease-out',
  });

  const menuItem = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    danger = false,
    hint = ''
  ) => (
    <button
      key={label}
      onClick={() => { onClick(); handleClose(); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        width: '100%',
        padding: '0 16px',
        height: '48px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: danger ? dangerColor : menuText,
        fontSize: '14px',
        fontWeight: 600,
        textAlign: 'left',
        borderRadius: '0',
        flexShrink: 0,
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(239, 68, 68, 0.12)' : hoverBg;
        if (!danger && activeTheme?.id !== 'default') {
          (e.currentTarget as HTMLElement).style.color = accentColor;
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
        (e.currentTarget as HTMLElement).style.color = danger ? dangerColor : menuText;
      }}
    >
      <span style={{ width: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: danger ? dangerColor : (activeTheme?.id !== 'default' ? accentColor : 'inherit'), opacity: danger ? 1 : 0.9 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ fontSize: '12px', color: menuMuted, flexShrink: 0 }}>{hint}</span>}
    </button>
  );

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'all',
      }}
    >
      {/* Dim overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          opacity: mounted ? 1 : 0,
          transition: 'opacity 0.22s ease-out',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Message bubble highlight outline (transparent interior so text is never covered or faded) */}
      <div
        style={{
          position: 'absolute',
          top: bubbleRect.top,
          left: bubbleRect.left,
          width: bubbleRect.width,
          height: bubbleRect.height,
          pointerEvents: 'none',
          borderRadius: '1.25rem',
          boxShadow: `0 0 0 2px ${activeTheme?.id !== 'default' ? accentColor : (isSent ? '#3797F0' : 'rgba(255,255,255,0.4)')}, 0 8px 25px rgba(0,0,0,0.3)`,
          background: 'transparent',
          opacity: mounted ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
          zIndex: 1,
        }}
      />

      {/* Reaction Bar */}
      <div
        ref={reactionBarRef}
        style={{
          position: 'absolute',
          top: reactionBarTop,
          left: reactionBarLeft,
          maxWidth: 'min(390px, calc(100vw - 24px))',
          width: 'fit-content',
          height: '48px',
          background: reactionBg,
          borderRadius: '24px',
          border: `1.5px solid ${menuBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          padding: '0 8px',
          boxShadow: `0 14px 38px rgba(0,0,0,0.3), 0 0 20px ${accentColor}30`,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          zIndex: 3,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          whiteSpace: 'nowrap',
          ...animStyle('translateY(0px)'),
        }}
      >
        {IG_QUICK_REACTIONS.map(emoji => {
          const alreadyReacted = myReactions.has(emoji);
          return (
            <button
              key={emoji}
              onClick={() => { onReact(msg.id, emoji); handleClose(); }}
              title={emoji}
              style={{
                background: alreadyReacted ? (activeTheme?.id !== 'default' ? outgoingGradient : 'rgba(99,102,241,0.25)') : 'transparent',
                border: alreadyReacted ? `1.5px solid ${accentColor}` : '1.5px solid transparent',
                color: alreadyReacted ? '#ffffff' : 'inherit',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                fontSize: '18px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.18s cubic-bezier(0.18, 0.89, 0.32, 1.28), background 0.15s',
                flexShrink: 0,
                boxShadow: alreadyReacted ? `0 4px 12px ${accentColor}50` : 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              onTouchStart={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)'; }}
              onTouchEnd={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              {emoji}
            </button>
          );
        })}
        {/* More emoji picker button */}
        <button
          onClick={() => setShowPicker(p => !p)}
          style={{
            background: showPicker ? `${accentColor}30` : 'transparent',
            border: showPicker ? `1.5px solid ${accentColor}` : '1.5px solid transparent',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            fontSize: '18px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: menuMuted,
            transition: 'transform 0.15s ease-out',
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.18)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
          title="More reactions"
        >
          ＋
        </button>
      </div>

      {/* Extended Emoji Picker Grid Modal */}
      {showPicker && (
        <div
          style={{
            position: 'absolute',
            top: reactionBarTop + REACTION_BAR_H + 8 > vh - 220 ? Math.max(10, reactionBarTop - 215) : reactionBarTop + REACTION_BAR_H + 8,
            left: Math.max(12, Math.min(reactionBarLeft, vw - 312)),
            width: '300px',
            maxHeight: '210px',
            background: menuBg,
            borderRadius: '20px',
            border: `1.5px solid ${menuBorder}`,
            boxShadow: `0 20px 50px rgba(0,0,0,0.35), 0 0 20px ${accentColor}25`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            padding: '10px',
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '6px',
            overflowY: 'auto',
            zIndex: 10,
          }}
          className="no-scrollbar animate-in zoom-in-95 duration-150"
        >
          {[
            '❤️', '😂', '😮', '😢', '😡', '👍', '🙏', '🔥',
            '🥳', '✨', '💯', '🎉', '🤩', '😍', '😭', '💀',
            '💩', '🤡', '👏', '🙌', '🤝', '💡', '💎', '🚀',
            '👑', '🦄', '🌈', '🌸', '⚡', '🎯', '🖤', '💜',
            '💙', '💚', '💛', '🧡', '💖', '🤍', '💘', '💌',
            '🤐', '🤔', '🧐', '🫠', '😈', '😇', '👀', '🤙',
            '💪', '🧠', '⭐', '🎈', '🍾', '🥂', '🍹', '🍕'
          ].map(emoji => (
            <button
              key={emoji}
              onClick={() => {
                onReact(msg.id, emoji);
                handleClose();
              }}
              style={{
                width: '36px',
                height: '36px',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, background 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)';
                (e.currentTarget as HTMLElement).style.background = hoverBg;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Action Menu */}
      <div
        ref={menuRef}
        onTouchStart={handleMenuTouchStart}
        onTouchEnd={handleMenuTouchEnd}
        style={{
          position: 'absolute',
          top: menuTop,
          left: menuLeft,
          width: MENU_W,
          background: menuBg,
          borderRadius: '20px',
          border: `1.5px solid ${menuBorder}`,
          boxShadow: `0 24px 64px rgba(0,0,0,0.38), 0 0 25px ${accentColor}25`,
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          overflow: 'hidden',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          ...animStyle(),
        }}
      >
        {/* Reply */}
        {menuItem(
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>,
          'Reply',
          () => onReply(msg)
        )}

        <div style={{ height: '1px', background: dividerColor, margin: '0 16px' }} />

        {/* Copy (text only) */}
        {msg.type === 'text' && menuItem(
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>,
          'Copy Text',
          () => {
            try { navigator.clipboard.writeText(msg.content); } catch { }
          }
        )}

        {/* Forward */}
        {menuItem(
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 9V5l7 7-7 7v-4.1c-5-.13-8.5 1.57-11 5.1.97-4.97 3.97-9.87 11-11z"/></svg>,
          'Forward',
          () => onForward(msg)
        )}

        {/* Tag */}
        {menuItem(
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>,
          'Tag Message',
          () => onOpenTagPicker(msg)
        )}

        <div style={{ height: '1px', background: dividerColor, margin: '0 16px' }} />

        {/* Destructive: Delete for me */}
        {menuItem(
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>,
          'Delete for Me',
          () => onRequestDelete(msg.id, 'me'),
          true
        )}

        {/* Destructive: Delete for everyone (sent only) */}
        {isSent && (
          <>
            <div style={{ height: '1px', background: dividerColor, margin: '0 16px' }} />
            {menuItem(
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
              'Delete for Everyone',
              () => onRequestDelete(msg.id, 'everyone'),
              true,
              ''
            )}
          </>
        )}
      </div>
    </div>
  );
};

const PASTEL_PALETTES = [
  { bg: '#E0F2FE', text: '#0369A1', emoji: '👨' }, // Soft Blue
  { bg: '#FCE7F3', text: '#BE185D', emoji: '🏀' }, // Soft Pink
  { bg: '#FEF9C3', text: '#A16207', emoji: '💪' }, // Soft Yellow
  { bg: '#EDE9FE', text: '#6D28D9', emoji: '✨' }, // Soft Purple
  { bg: '#D1FAE5', text: '#047857', emoji: '🦄' }, // Soft Emerald
];

const getPastelForUser = (userIdOrName?: string) => {
  if (!userIdOrName) return PASTEL_PALETTES[0];
  const sum = String(userIdOrName).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PASTEL_PALETTES[Math.abs(sum) % PASTEL_PALETTES.length];
};

const formatChatTime = (timeVal?: any) => {
  if (!timeVal) return '';
  const d = typeof timeVal === 'string' ? new Date(timeVal) : (timeVal instanceof Date ? timeVal : new Date(timeVal));
  if (isNaN(d.getTime())) return '';
  
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hrs}.${mins}`;
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const ChatItem = memo(({
  user,
  isSelected,
  isOnline,
  showActivity,
  isPinned,
  lastSeenVal,
  nickname,
  onSelect,
  onLongPress,
  index = 0
}: any) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const startPress = (e: React.TouchEvent | React.MouseEvent) => {
    isLongPressRef.current = false;
    if ('touches' in e && e.touches.length > 0) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      touchStartPosRef.current = null;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    // Standard comfortable long-press duration (520ms)
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      timerRef.current = null;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(40); } catch (err) {}
      }
      onLongPress(user);
    }, 520);
  };

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    // If finger moves more than 7px (scrolling the list), cancel long press immediately
    if (dx > 7 || dy > 7) {
      cancelPress();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    cancelPress();
    onSelect(user, e);
  };

  const pastel = getPastelForUser(user.id || user.username || user.name);
  const timeDisplay = formatChatTime((user as any).lastMessageTime || (user as any).updatedAt || lastSeenVal);
  const unseen = (user as any).unseenCount || 0;

  return (
    <div
      className={`flex items-center gap-3.5 p-2 rounded-2xl hover:bg-zinc-50 transition-colors cursor-pointer active:scale-[0.99] select-none ${
        isSelected ? 'bg-zinc-100/80' : ''
      }`}
      onClick={handleClick}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={handleTouchMove}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelPress();
        onLongPress(user);
      }}
    >
      {/* Avatar (w-12 h-12 rounded-full with pastel tokens) */}
      <div className="relative shrink-0">
        <div 
          className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-xl shrink-0 relative shadow-xs"
          style={{ background: pastel.bg, color: pastel.text }}
        >
          {user.image && user.image.length > 5 ? (
            <img src={user.image} alt={user.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span>{pastel.emoji}</span>
          )}
        </div>
        {showActivity && isOnline && (
          <span className="w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white absolute bottom-0 right-0" />
        )}
      </div>

      {/* Middle Details */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <h4 className="text-[15px] font-semibold text-zinc-900 truncate">
            {nickname || user.name}
          </h4>
          {isPinned && <span className="text-[10px] text-[#9D4EDD]">📌</span>}
        </div>
        <p className="text-[13px] text-zinc-400 truncate">
          {(user as any).lastMessage || (
            showActivity && isOnline ? 'Active now' : 'Tap to start chatting'
          )}
        </p>
      </div>

      {/* Meta Column */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-[11px] font-medium text-zinc-400">
          {timeDisplay || '12:45 PM'}
        </span>
        {unseen > 0 ? (
          <span className="w-2 h-2 rounded-full bg-[#9D4EDD]" />
        ) : (
          <svg className="w-[15px] h-[15px] text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 7 17l-5-5" />
            <path d="m22 10-7.5 7.5L13 16" />
          </svg>
        )}
      </div>
    </div>
  );
});

// Status text component for the last sent message in a consecutive group (Instagram / iMessage style)
const SentMessageStatus = memo(({ msg, isDark, isLastSentInGroup, partnerLastSeen }: { msg: any, isDark: boolean, isLastSentInGroup: boolean, partnerLastSeen?: string | Date | null }) => {
  const [, setTicker] = useState(0);

  // Periodic ticker to recalculate relative timestamps dynamically every 15s
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(t => t + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  if (!isLastSentInGroup) return null;
  if (msg.type === 'call' || msg.type === 'deleted') return null;

  const isSending = (msg as any).status === 'sending';
  if (isSending) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', fontSize: '0.68rem', fontWeight: 600, color: isDark ? '#e4e4e7' : '#18181b', marginTop: '2px', pointerEvents: 'none' }}>
        <span>Sending...</span>
      </div>
    );
  }

  const formatAgo = (timestamp?: any) => {
    if (!timestamp) return 'just now';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    if (isNaN(date.getTime())) return 'just now';
    const now = new Date();
    const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  };

  // Determine fixed seen timestamp:
  // Once a message is seen, its seenAt timestamp is IMMUTABLE and saved in memory/localStorage.
  // It NEVER uses partnerLastSeen, preventing any time resets when the partner comes online/offline again later.
  let fixedSeenAt = (msg as any).seenAt;
  if (msg.isSeen && !fixedSeenAt && typeof window !== 'undefined') {
    const key = `seen_at_${msg.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      fixedSeenAt = stored;
    } else {
      fixedSeenAt = new Date().toISOString();
      try { localStorage.setItem(key, fixedSeenAt); } catch {}
    }
  }

  const statusText = msg.isSeen
    ? `Seen ${formatAgo(fixedSeenAt || msg.createdAt)}`
    : `Sent ${formatAgo(msg.createdAt)}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '4px',
        fontSize: '0.68rem',
        fontWeight: 600,
        color: isDark ? '#e4e4e7' : '#18181b',
        marginTop: '3px',
        userSelect: 'none',
        pointerEvents: 'none',
        opacity: 1,
        transition: 'color 0.3s ease',
      }}
    >
      <span>{statusText}</span>
    </div>
  );
});

const MessageItem = memo(({ msg, currentUserId, selectedUser, partnerLastSeen, onDelete, onReact, onRequestDelete, isSelected, isInSelectionMode, toggleMessageSelection, onShowIGMenu, onReply, activeTheme, onPreviewImage, onPreviewMedia, msgTag, onOpenTagPicker, onOpenThemePicker, isPrevSameSender, isNextSameSender, hasPrevReactions, isLastSentInGroup, chatSwipeOffset, onContainerSwipeOffset, onOpenAlbum, onRetryUpload }: any) => {
  const isDark = typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'));
  if (msg.type === 'system') {
    const isThemeSystemMsg = msg.content.toLowerCase().includes('theme to') || msg.content.toLowerCase().includes('customize chat');
    
    if (isThemeSystemMsg) {
      let baseText = msg.content
        .replace(/\[theme:[a-zA-Z0-9_-]+\]/gi, '')
        .replace(/\.\s*Customize chat$/i, '')
        .replace(/\s*Customize chat$/i, '')
        .trim();
      baseText = baseText.replace(/set theme to/i, 'changed the theme to');

      return (
        <div className="w-full flex justify-center my-2 text-center px-4 animate-in fade-in duration-300 pointer-events-none">
          <span className="text-[11px] font-semibold text-[var(--dm-text-primary)] pointer-events-auto">
            {baseText}.{' '}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenThemePicker) onOpenThemePicker();
              }}
              className="font-bold underline hover:opacity-80 cursor-pointer text-[var(--dm-text-primary)] ml-1 transition-colors"
            >
              Customize chat
            </button>
          </span>
        </div>
      );
    }

    return (
      <div className="w-full flex justify-center my-2 text-center px-4 animate-in fade-in duration-300 pointer-events-none">
        <span className="text-[11px] font-medium text-[var(--dm-text-muted)]">
          {msg.content}
        </span>
      </div>
    );
  }

  const isAI = msg.senderId === 'ai';
  const isSent = !isAI && String(msg.senderId) === String(currentUserId);

  // Swipe-to-reply gesture state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwipingHorizontally = useRef<boolean | null>(null);
  const effectiveSwipeOffset = swipeOffset > 0 ? swipeOffset : (chatSwipeOffset || 0);

  // Long-press
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
  const isMoving = useRef(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const reactionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (msg.reactions || []).forEach((r: any) => {
      if (r.emoji) {
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      }
    });
    return counts;
  }, [msg.reactions]);

  const triggerIGMenu = () => {
    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    if (navigator.vibrate) navigator.vibrate([8, 4, 8]);
    onShowIGMenu({ msg, bubbleRect: rect, isSent });
  };

  const handlePointerDown = (e: any) => {
    if (isInSelectionMode) return;
    isMoving.current = false;
    longPressTimeout.current = setTimeout(() => {
      if (!isMoving.current) triggerIGMenu();
    }, 450);
  };

  const handlePointerUp = () => {
    if (longPressTimeout.current) { clearTimeout(longPressTimeout.current); longPressTimeout.current = null; }
  };

  const handlePointerMove = () => {
    isMoving.current = true;
    if (longPressTimeout.current) { clearTimeout(longPressTimeout.current); longPressTimeout.current = null; }
  };

  const mouseStartX = useRef(0);
  const mouseStartY = useRef(0);
  const isDraggingMouse = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isInSelectionMode || e.button !== 0) return;
    handlePointerDown(e);
    isDraggingMouse.current = true;
    mouseStartX.current = e.clientX;
    mouseStartY.current = e.clientY;

    const handleMouseMoveWindow = (moveEv: MouseEvent) => {
      handlePointerMove();
      if (!isDraggingMouse.current) return;
      const diffX = moveEv.clientX - mouseStartX.current;
      const diffY = moveEv.clientY - mouseStartY.current;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 6) {
        setIsSwiping(true);
        if (diffX > 0) {
          const clampedOffset = Math.min(diffX * 0.6, 85);
          setSwipeOffset(clampedOffset);
        } else {
          const clampedOffset = Math.max(diffX * 0.75, -85);
          if (onContainerSwipeOffset) onContainerSwipeOffset(clampedOffset);
        }
      }
    };

    const handleMouseUpWindow = () => {
      isDraggingMouse.current = false;
      window.removeEventListener('mousemove', handleMouseMoveWindow);
      window.removeEventListener('mouseup', handleMouseUpWindow);
      handlePointerUp();
      if (onContainerSwipeOffset) onContainerSwipeOffset(0);
      setSwipeOffset(prev => {
        if (prev > 40) {
          if (navigator.vibrate) navigator.vibrate(30);
          onReply(msg);
        }
        return 0;
      });
      setIsSwiping(false);
    };

    window.addEventListener('mousemove', handleMouseMoveWindow);
    window.addEventListener('mouseup', handleMouseUpWindow);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwipingHorizontally.current = null;
    handlePointerDown(e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handlePointerMove();
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    if (isSwipingHorizontally.current === null) {
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
        isSwipingHorizontally.current = true;
      } else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
        isSwipingHorizontally.current = false;
      }
    }

    if (isSwipingHorizontally.current) {
      if (diffX > 0) {
        setIsSwiping(true);
        const clampedOffset = Math.min(diffX * 0.6, 85);
        setSwipeOffset(clampedOffset);
        if (clampedOffset > 40 && (e.currentTarget as any)._hapticsTriggered !== true) {
          if (navigator.vibrate) navigator.vibrate(30);
          (e.currentTarget as any)._hapticsTriggered = true;
        }
      } else if (diffX < 0) {
        setIsSwiping(true);
        const clampedOffset = Math.max(diffX * 0.75, -85);
        if (onContainerSwipeOffset) onContainerSwipeOffset(clampedOffset);
      }
    }
  };

  const handleTouchEnd = () => {
    handlePointerUp();
    if (onContainerSwipeOffset) onContainerSwipeOffset(0);
    if (swipeOffset > 40) {
      if (navigator.vibrate) navigator.vibrate(30);
      onReply(msg);
    }
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(40);
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      onShowIGMenu({
        msg,
        bubbleRect: rect,
        isSent,
      });
    }
  };

  const handleMessageClick = (e: React.MouseEvent) => {
    if (isInSelectionMode) {
      e.stopPropagation();
      toggleMessageSelection(msg.id);
    }
  };

  const hasReactions = Object.keys(reactionCounts).length > 0;

  return (
    <div
      className={`msg-wrapper ${isSent ? 'sent' : isAI ? 'ai' : 'received'} ${isSelected ? 'selected-item' : ''} animate-in slide-in-from-bottom-2 duration-300 relative`}
      onClick={handleMessageClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={handleContextMenu}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: isSent ? 'flex-end' : 'flex-start',
        gap: '0px',
        width: '100%',
        padding: '0',
        userSelect: 'none',
        position: 'relative',
        marginTop: hasPrevReactions ? '14px' : (isPrevSameSender ? '1px' : '4px'),
        marginBottom: hasReactions ? '16px' : (isNextSameSender ? '1px' : '4px'),
        transition: isSwiping
          ? 'none'
          : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        transform: effectiveSwipeOffset !== 0
          ? `translateX(${effectiveSwipeOffset}px)`
          : 'none',
      }}
    >
      {/* Revealed Timestamp on Swipe Left (Instagram / iOS Messages style) */}
      <div
        className="revealed-swipe-timestamp"
        style={{
          position: 'absolute',
          right: '-52px',
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: effectiveSwipeOffset < -6 ? Math.min(1, Math.abs(effectiveSwipeOffset) / 30) : 0,
          transition: isSwiping ? 'none' : 'opacity 0.22s ease',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.70rem',
          fontWeight: 500,
          color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}
      >
        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
      </div>

      {/* Consecutive Grouping Tail Logic — column wrapper keeps bubble + time stacked */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isSent ? 'flex-end' : 'flex-start',
        order: isSent ? 2 : 1,
        minWidth: 0,
        maxWidth: '78%',
        width: 'fit-content',
      }}>
      {(() => {
        const isMiddleInGroup = isPrevSameSender && isNextSameSender;
        const isFirstInGroup = !isPrevSameSender && isNextSameSender;
        const isLastInGroup = isPrevSameSender && !isNextSameSender;

        let bubbleBorderRadius = '18px 18px 4px 18px';
        if (isSent) {
          if (isFirstInGroup) bubbleBorderRadius = '18px 18px 4px 18px';
          else if (isMiddleInGroup) bubbleBorderRadius = '18px 4px 4px 18px';
          else if (isLastInGroup) bubbleBorderRadius = '18px 4px 18px 18px';
          else bubbleBorderRadius = '18px 18px 4px 18px';
        } else {
          if (isFirstInGroup) bubbleBorderRadius = '18px 18px 18px 4px';
          else if (isMiddleInGroup) bubbleBorderRadius = '4px 18px 18px 4px';
          else if (isLastInGroup) bubbleBorderRadius = '4px 18px 18px 18px';
          else bubbleBorderRadius = '18px 18px 18px 4px';
        }

        const isMedia = msg.type === 'image' || msg.type === 'video' || msg.type === 'media_album';
        const isSending = (msg as any).status === 'sending';
        const isDeletedMsg = msg.type === 'deleted' || msg.content === 'This message was deleted';

        // Pure soft pill rounded bubble shape with extra light font
        const bubbleClasses = isSent
          ? `bg-zinc-100 text-zinc-900 px-4.5 py-3 !rounded-[28px] max-w-full self-end text-[13.5px] font-light leading-relaxed ${isPrevSameSender ? '-mt-2' : ''}`
          : `bg-[#FEF5D1] text-zinc-900 px-4.5 py-3 !rounded-[28px] max-w-full text-[13.5px] font-light leading-relaxed ${isPrevSameSender ? '-mt-2' : ''}`;

        return (
          <div
            ref={bubbleRef}
            className={`msg ${bubbleClasses} ${msg.type === 'deleted' ? 'deleted-msg' : ''} ${isSelected ? (isSent ? 'msg--sel-sent' : 'msg--sel-recv') : ''} ${isMedia ? '!p-0 !bg-transparent !border-0 !shadow-none' : ''}`}
            style={{
              position: 'relative',
              borderRadius: '28px',
              transition: isSelected ? 'transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28)' : 'none',
              transform: isSelected ? 'scale(0.965) translateX(' + (isSent ? '4px' : '-4px') + ')' : 'none',
            }}
          >
            {msg.replyTo && (
              <div className={`mb-2 p-2 rounded-xl border-l-4 text-xs flex flex-col gap-0.5 max-w-full overflow-hidden ${isSent ? 'border-zinc-400 bg-black/5 text-black' : 'border-zinc-400 bg-black/5'}`}>
                <span className="font-bold text-[11px] opacity-90">{msg.replyTo.senderName || 'Quoted Message'}</span>
                <span className="truncate text-[11px] opacity-85">{msg.replyTo.content}</span>
              </div>
            )}
            {isAI && <div className="system-sender">AI Assistant</div>}
            {isMedia ? (
              msg.type === 'media_album' ? (() => {
                let items: Array<{ url: string; type: string; name?: string; thumbnailUrl?: string }> = [];
                try {
                  items = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
                } catch (e) {
                  items = [{ url: msg.content, type: 'image' }];
                }

                if (!Array.isArray(items) || items.length === 0) return null;

                if (items.length === 1) {
                  const item = items[0];
                  return (
                    <div className="relative group rounded-[1.25rem] overflow-hidden" style={{ width: 'fit-content', maxWidth: '320px' }}>
                      {item.type === 'video' ? (
                        <div
                          className="relative cursor-pointer group rounded-[1.25rem] overflow-hidden bg-black/40"
                          style={{ minWidth: '200px', minHeight: '140px', maxWidth: '300px' }}
                          onClick={e => { e.stopPropagation(); if (onPreviewMedia) onPreviewMedia(item.url, 'video'); }}
                        >
                          <img
                            src={item.thumbnailUrl || item.url}
                            alt="video preview"
                            className="w-full h-full object-cover rounded-[1.25rem] transition-transform duration-300 group-hover:scale-105"
                            style={{ maxHeight: '340px', display: 'block' }}
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none group-hover:bg-black/35 transition-colors">
                            <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white shadow-lg border border-white/20 transition-transform duration-200 group-hover:scale-110">
                              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={item.thumbnailUrl || item.url}
                          alt="media"
                          loading="lazy"
                          className="cursor-pointer hover:opacity-95 transition-opacity rounded-[1.25rem] object-cover"
                          style={{ maxHeight: '340px', maxWidth: '100%', display: 'block' }}
                          onClick={e => { e.stopPropagation(); if (onPreviewMedia) onPreviewMedia(item.url, 'image'); else if (onPreviewImage) onPreviewImage(item.url); }}
                        />
                      )}
                    </div>
                  );
                }

                const displayItems = items.slice(0, 3);
                const remainingCount = items.length - 3;

                return (
                  <div
                    className="relative rounded-[1.25rem] overflow-hidden cursor-pointer group"
                    style={{ width: '270px', maxWidth: '100%' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenAlbum) {
                        onOpenAlbum({
                          id: msg.id,
                          items,
                          time: new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                        });
                      }
                    }}
                  >
                    <div className="grid grid-cols-2 gap-1 bg-black/20 p-1 rounded-[1.25rem]">
                      {/* First item */}
                      <div className={`relative overflow-hidden rounded-xl bg-black/30 ${items.length >= 3 ? 'row-span-2 aspect-[9/16]' : 'aspect-square'}`}>
                        <img src={displayItems[0].thumbnailUrl || displayItems[0].url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {displayItems[0].type === 'video' && (
                          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white">
                            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        )}
                      </div>

                      {/* Second item */}
                      {displayItems[1] && (
                        <div className="relative overflow-hidden rounded-xl bg-black/30 aspect-square">
                          <img src={displayItems[1].thumbnailUrl || displayItems[1].url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          {displayItems[1].type === 'video' && (
                            <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white">
                              <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Third item */}
                      {displayItems[2] && (
                        <div className="relative overflow-hidden rounded-xl bg-black/30 aspect-square">
                          <img src={displayItems[2].thumbnailUrl || displayItems[2].url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          {remainingCount > 0 ? (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white font-bold">
                              <span className="text-lg leading-none">+{remainingCount + 1}</span>
                              <span className="text-[10px] opacity-80 uppercase tracking-wider mt-0.5">Photos</span>
                            </div>
                          ) : (
                            displayItems[2].type === 'video' && (
                              <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white">
                                <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="relative group rounded-[1.25rem] overflow-hidden" style={{ width: 'fit-content', maxWidth: '320px' }}>
                  {msg.type === 'image' && (
                    <img
                      src={msg.thumbnailUrl || msg.content}
                      alt="media"
                      draggable={false}
                      loading="lazy"
                      className="cursor-pointer hover:opacity-95 transition-opacity rounded-[1.25rem] object-cover"
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                        maxHeight: '360px',
                        width: msg.width ? `${Math.min(320, msg.width)}px` : 'auto',
                        aspectRatio: msg.width && msg.height ? `${msg.width} / ${msg.height}` : 'auto'
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        if (onPreviewMedia) onPreviewMedia(msg.content, 'image');
                        else if (onPreviewImage) onPreviewImage(msg.content);
                        else window.open(msg.content, '_blank');
                      }}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); handleContextMenu(e); }}
                    />
                  )}
                  {msg.type === 'video' && (
                    <div
                      className="relative cursor-pointer group rounded-[1.25rem] overflow-hidden bg-black/40"
                      style={{ minWidth: '200px', minHeight: '140px', maxWidth: '300px' }}
                      onClick={e => {
                        e.stopPropagation();
                        if (onPreviewMedia) onPreviewMedia(msg.content, 'video');
                        else if (onPreviewImage) onPreviewImage(msg.content);
                      }}
                    >
                      <img
                        src={msg.thumbnailUrl || msg.content}
                        alt="video preview"
                        className="w-full h-full object-cover rounded-[1.25rem] transition-transform duration-300 group-hover:scale-105"
                        style={{ maxHeight: '340px', display: 'block' }}
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none group-hover:bg-black/35 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white shadow-lg border border-white/20 transition-transform duration-200 group-hover:scale-110">
                          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      {msg.duration && (
                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[10px] font-semibold text-white pointer-events-none">
                          {Math.floor(msg.duration / 60)}:{(Math.floor(msg.duration % 60)).toString().padStart(2, '0')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Real-time Upload Progress Overlay */}
                  {isSending && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center rounded-[1.25rem] text-white z-10">
                      <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin mb-1.5" />
                      <span className="text-[10px] font-bold tracking-wider">
                        {msg.uploadProgress !== undefined && msg.uploadProgress > 0 ? `${msg.uploadProgress}%` : 'Uploading...'}
                      </span>
                    </div>
                  )}

                  {/* Failed Upload Retry Button */}
                  {(msg as any).status === 'error' && (
                    <div className="absolute inset-0 bg-black/65 backdrop-blur-xs flex flex-col items-center justify-center rounded-[1.25rem] text-white z-10 p-2">
                      <span className="text-[11px] text-red-400 font-semibold mb-2">Upload Failed</span>
                      {onRetryUpload && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRetryUpload(msg); }}
                          className="px-3 py-1 bg-white/25 hover:bg-white/35 rounded-full text-[10px] font-bold transition-all cursor-pointer shadow-md"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            ) : (
              <>
                {msg.type === 'voice' && (
                  <div className="relative">
                    <audio src={msg.content} controls className="max-w-[240px]" />
                    {isSending && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center rounded-lg text-white text-[10px] font-medium">
                        Uploading voice...
                      </div>
                    )}
                  </div>
                )}
                {msg.type === 'file' && (
                  <div className="file-attachment">
                    <a href={msg.content} target="_blank" rel="noreferrer">
                      Download File
                    </a>
                  </div>
                )}
                {msg.type === 'call' && (
                  <div className="call-log-msg">
                    <div className={`call-icon ${msg.content.includes('Missed') ? 'missed' : msg.content.includes('rejected') ? 'rejected' : 'completed'}`}>
                      {msg.content.includes('video') ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                      )}
                      {(msg.content.includes('Missed') || msg.content.includes('rejected')) && <div className="call-status-badge">!</div>}
                    </div>
                    <div className="call-details">
                      <span className="call-title">{msg.content.split(' • ')[0]}</span>
                      {msg.content.includes(' • ') && <span className="call-duration">{msg.content.split(' • ')[1]}</span>}
                    </div>
                  </div>
                )}
                {msg.type !== 'voice' && msg.type !== 'file' && msg.type !== 'call' ? (
                  <div style={{ fontSize: '1.01rem', lineHeight: '1.44', letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
                    <span>{msg.content}</span>
                  </div>
                ) : null}
              </>
            )}

            {msgTag && (
              <div
                onClick={e => { e.stopPropagation(); onOpenTagPicker(msg); }}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95 animate-in zoom-in-75 duration-200 mt-1.5"
                style={{ background: `${msgTag.color}25`, border: `1px solid ${msgTag.color}50`, color: msgTag.color }}
              >
                <span>{msgTag.emoji}</span>
                <span>{msgTag.label}</span>
                <span className="text-[9px] opacity-60 ml-0.5">✕</span>
              </div>
            )}

            {/* Reaction bubbles anchored to bubble bottom */}
            {hasReactions && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '-10px',
                  [isSent ? 'right' : 'left']: '8px',
                  display: 'flex',
                  gap: '3px',
                  zIndex: 10,
                }}
              >
                {Object.entries(reactionCounts).map(([emoji, count]: [string, number]) => (
                  <span
                    key={emoji}
                    onClick={e => { e.stopPropagation(); onReact(msg.id, emoji); }}
                    style={{
                      background: isDark ? '#27272a' : '#ffffff',
                      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '16px',
                      padding: '1px 6px',
                      fontSize: '12px',
                      lineHeight: '18px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      fontWeight: 600,
                      color: isDark ? '#f4f4f5' : '#18181b',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.18)',
                      transition: 'transform 0.12s ease-out',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span style={{ fontSize: '10px', opacity: 0.9 }}>{count}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Time text below message bubble */}
      <span className={`text-[11px] font-medium text-zinc-400 mt-1 select-none ${isSent ? 'mr-2 self-end text-right' : 'ml-2 self-start text-left'}`}>
        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
      </span>

      {/* Status indicator row under the last sent message */}
      {isSent && (
        <SentMessageStatus msg={msg} isDark={isDark} isLastSentInGroup={isLastSentInGroup} partnerLastSeen={partnerLastSeen} />
      )}
      </div>
    </div>
  );
});



const SidebarItem = memo(({ user, isActive, onClick }: { user: User, isActive: boolean, onClick: any }) => {
  return (
    <div className={`item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="user-pfp">
        {user.image && user.image.length > 5 ? (
          <img src={user.image} alt={user.name} referrerPolicy="no-referrer" />
        ) : (
          <img src="/Avatar.png" alt="avatar" />
        )}
      </div>
      <div className="meta">
        <b>
          {user.name}
          <div className="side-meta">
            {user.unseenCount && user.unseenCount > 0 ? <span className="unseen-badge">{user.unseenCount}</span> : null}
          </div>
        </b>
        <small className="truncate">{user.lastMessage || `@${user.username || user.name?.toLowerCase().replace(/\s+/g, '')}`}</small>
      </div>
    </div>
  );
});

interface SocialChatProps {
  isActive: boolean;
  onStatusChange?: (status: boolean) => void;
  onChatChange?: (user: any) => void;
  onBack?: () => void;
  onCallStateChange?: (isCallActive: boolean) => void;
  initialUser?: any; // Pre-select a user when opened from another profile
  onOpenProfile?: (user: any) => void;
  onLongPressChatChange?: (active: boolean) => void;
  onSearchActiveChange?: (isSearching: boolean) => void;
}

// ── Custom PWA & Capacitor Mobile Notification Dispatcher ──
const triggerStunningNotification = async (
  type: 'call' | 'message',
  title: string,
  body: string,
  extraData?: any
) => {
  if (typeof window === 'undefined') return;

  const isNative = typeof (window as any).Capacitor !== 'undefined' && typeof (window as any).Capacitor.isNativePlatform === 'function' && (window as any).Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== 'granted') return;
      }

      await LocalNotifications.createChannel({
        id: type === 'call' ? 'incoming_calls' : 'chat_messages',
        name: type === 'call' ? 'Incoming Calls' : 'Chat Messages',
        importance: type === 'call' ? 5 : 4,
        visibility: 1,
        vibration: true
      }).catch(() => {});

      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 1000000) + 1,
            schedule: { at: new Date(Date.now() + 100) },
            channelId: type === 'call' ? 'incoming_calls' : 'chat_messages',
            extra: extraData
          }
        ]
      });
      return;
    } catch (err) {
      console.warn("Capacitor LocalNotifications failed, falling back to Web Notifications:", err);
    }
  }

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    try { Notification.requestPermission(); } catch (e) {}
    return;
  }

  const iconUrl = '/connect-logo.png';
  const badgeUrl = '/icon-192.png';

  const options: any = {
    body,
    icon: iconUrl,
    badge: badgeUrl,
    vibrate: type === 'call'
      ? [200, 100, 200, 100, 200, 100, 200, 100, 400]
      : [100, 50, 100],
    tag: type === 'call' ? 'incoming-call' : `msg-${extraData?.partnerId || 'general'}`,
    renotify: true,
    data: {
      url: window.location.origin + '/dashboard',
      ...extraData
    },
    requireInteraction: type === 'call',
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      const pwaOptions = {
        ...options,
        actions: type === 'call'
          ? [
            { action: 'answer', title: 'Answer' },
            { action: 'decline', title: 'Decline' }
          ]
          : [
            { action: 'view', title: 'View' }
          ]
      };
      reg.showNotification(title, pwaOptions);
    }).catch(() => {
      new Notification(title, options);
    });
  } else {
    new Notification(title, options);
  }
};

/** Converts flat DB replyTo fields into the nested object the UI renders.
 *  Works for messages coming from getSocialMessages (Prisma) as well as
 *  the return value of saveSocialMessage. */
const normalizeMsg = (m: any): any => {
  if (m.replyToId && !m.replyTo) {
    return {
      ...m,
      replyTo: {
        id: m.replyToId,
        content: m.replyToContent ?? '',
        senderName: m.replyToSenderName ?? undefined,
      },
    };
  }
  return m;
};

const SocialChat = React.forwardRef(({ isActive, onStatusChange, onChatChange, onBack, onCallStateChange, initialUser, onOpenProfile, onLongPressChatChange, onSearchActiveChange }: SocialChatProps, ref) => {
  const { data: session } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [isRecentLoading, setIsRecentLoading] = useState<boolean>(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-select the user passed from another profile's Message button
  useEffect(() => {
    if (initialUser && initialUser.id) {
      setShowChatDetails(false);
      setShowThemePicker(false);
      setSelectedUser(initialUser);

      // Ensure user is in contacts list so header and list reflect correctly
      setUsers(prev => {
        if (prev.some(u => u.id === initialUser.id)) return prev;
        const updated = [{ ...initialUser, unseenCount: 0, isRequest: false }, ...prev];
        allContactsRef.current = updated;
        return updated;
      });

      // Automatically unhide if previously hidden in deletedChatIds
      setDeletedChatIds(prev => {
        if (prev.has(initialUser.id)) {
          const next = new Set(prev);
          next.delete(initialUser.id);
          if (typeof window !== 'undefined') {
            localStorage.setItem('social_deleted_chats', JSON.stringify(Array.from(next)));
          }
          return next;
        }
        return prev;
      });
    }
  }, [initialUser]);

  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const transitionInProgress = React.useRef(false);

  // Circular ripple transition helper
  // Transition helper (direct action execution, standard IG slide animations handle the rest)
  const runCircleTransition = (
    action: () => void,
    _x?: number,
    _y?: number,
    _reverse = false
  ) => {
    action();
  };

  // Forward Message Modal State
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardSentUserIds, setForwardSentUserIds] = useState<Set<string>>(new Set());

  // Direct Immediate Message Deletion
  const handleRequestDelete = (msgId: string, type: 'me' | 'everyone') => {
    handleDelete(msgId, type);
  };

  // Bulk Message Selection State
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [igMenu, setIgMenu] = useState<IGMenuState | null>(null);

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const handleLongPress = (msgId: string) => {
    setSelectedMessageIds(new Set([msgId]));
  };

  const handleBulkDelete = async (type: 'me' | 'everyone') => {
    const ids = Array.from(selectedMessageIds);
    setSelectedMessageIds(new Set()); // Exit selection mode

    // Local optimistic delete
    if (type === 'everyone') {
      setMessages(prev => prev.map(m => {
        if (ids.includes(m.id)) return { ...m, content: "This message was deleted", type: "deleted" };
        return m;
      }));
    } else {
      setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    }

    // Server-side delete
    for (const msgId of ids) {
      try {
        await deleteSocialMessage(msgId, type);
        if (type === 'everyone') {
          socket?.emit('delete_social_message', { messageId: msgId, receiverEmail: selectedUser?.email });
        }
      } catch (err) {
        console.error("Failed to delete message during bulk action:", err);
      }
    }
  };

  // Expose closeChat to parent via ref
  React.useImperativeHandle(ref, () => ({
    closeChat: () => {
      runCircleTransition(() => setSelectedUser(null), 28, 28, true);
    },
    // Silent version: resets without firing a nested startViewTransition
    // Use this when called from inside another ongoing view transition
    silentReset: () => {
      setSelectedUser(null);
    }
  }));

  const handleChatBack = (e?: React.MouseEvent) => {
    if (showChatDetails) {
      setShowChatDetails(false);
      setEditingNickname(false);
      return;
    }
    if (showThemePicker) {
      setShowThemePicker(false);
      return;
    }
    const clientX = e ? e.clientX : 28;
    const clientY = e ? e.clientY : 28;
    runCircleTransition(() => {
      setShowChatDetails(false);
      setShowThemePicker(false);
      setSelectedUser(null);
    }, clientX, clientY, true);
  };

  const handleSelectUser = (user: any, e?: React.MouseEvent) => {
    selectedUserRef.current = user;
    setShowChatDetails(false);
    setShowThemePicker(false);
    const clientX = e?.clientX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
    const clientY = e?.clientY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0);
    runCircleTransition(() => setSelectedUser(user), clientX, clientY, false);
  };

  const [view, setView] = useState<'recent' | 'requests'>('recent');
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({});
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(new Set());
  const [deletedMessageIds, setDeletedMessageIds] = useState<Set<string>>(new Set());
  const [deletedChatIds, setDeletedChatIds] = useState<Set<string>>(new Set());
  const [selectedChatForOptions, setSelectedChatForOptions] = useState<User | null>(null);

  // Connect Redesign Notifications & Stories state
  const [unreadNotifications, setUnreadNotifications] = useState<number>(2);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState<boolean>(false);
  const [notificationsList, setNotificationsList] = useState([
    { id: '1', title: 'Missed Voice Call', desc: 'Yoga tried to call you 10m ago', time: '10m', unread: true },
    { id: '2', title: 'New Message', desc: 'Rehan Wangsaff: Hey, are you free today?', time: '1h', unread: true },
    { id: '3', title: 'Story Alert', desc: 'Dono added a new story', time: '3h', unread: false }
  ]);

  const [isArchivedView, setIsArchivedView] = useState<boolean>(false);
  const [archivedChatIds, setArchivedChatIds] = useState<Set<string>>(new Set());

  const [userStory, setUserStory] = useState<{ id: string; media: string; time: string } | null>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);
  const [viewStory, setViewStory] = useState<{ name: string; avatar?: string; media?: string; emoji?: string; time?: string; isMe?: boolean } | null>(null);

  const handleStoryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setUserStory({
      id: `story-${Date.now()}`,
      media: url,
      time: 'Just now'
    });
    e.target.value = '';
  };

  // Notify parent component when long press options sheet is open/closed
  useEffect(() => {
    if (onLongPressChatChange) {
      onLongPressChatChange(!!selectedChatForOptions);
    }
  }, [selectedChatForOptions, onLongPressChatChange]);

  // Load storage states safely after mount to prevent React hydration mismatch errors on Vercel
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // 0ms Optimistic Contact List Restore for instant First Paint
      const cachedContacts = localStorage.getItem('social_contacts_cache');
      if (cachedContacts) {
        try {
          const parsed = JSON.parse(cachedContacts);
          if (Array.isArray(parsed) && parsed.length > 0) {
            allContactsRef.current = parsed;
            setUsers(parsed);
            setIsRecentLoading(false);
          }
        } catch (e) {}
      }

      const cachedMsgs = localStorage.getItem('social_messages_cache');
      if (cachedMsgs) {
        try {
          const parsed = JSON.parse(cachedMsgs);
          Object.keys(parsed).forEach(k => {
            parsed[k] = (parsed[k] || []).filter((m: any) => !m.content || !m.content.startsWith('blob:'));
          });
          setMessagesCache(parsed);
        } catch (e) {}
      }

      const pinned = localStorage.getItem('social_pinned_chats');
      if (pinned) setPinnedChats(new Set(JSON.parse(pinned)));

      const archived = localStorage.getItem('social_archived_chats');
      if (archived) setArchivedChatIds(new Set(JSON.parse(archived)));

      const deletedMsgs = localStorage.getItem('social_deleted_msg_ids');
      if (deletedMsgs) setDeletedMessageIds(new Set(JSON.parse(deletedMsgs)));

      const deletedChats = localStorage.getItem('social_deleted_chats');
      if (deletedChats) setDeletedChatIds(new Set(JSON.parse(deletedChats)));

      const savedNicknames = localStorage.getItem('chat_nicknames');
      if (savedNicknames) setNicknames(JSON.parse(savedNicknames));

      const savedThemes = localStorage.getItem('chat_themes');
      if (savedThemes) setChatThemes(JSON.parse(savedThemes));

      const savedLastSeen = localStorage.getItem('chat_last_seen');
      if (savedLastSeen) setLastSeenMap(JSON.parse(savedLastSeen));
    } catch (e) {
      console.warn('Storage init error:', e);
    }
  }, []);

  // Sync deleted chat IDs to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('social_deleted_chats', JSON.stringify(Array.from(deletedChatIds)));
    }
  }, [deletedChatIds]);

  // Sync pinned chats to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('social_pinned_chats', JSON.stringify(Array.from(pinnedChats)));
    }
  }, [pinnedChats]);

  // Sync deleted message IDs to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('social_deleted_msg_ids', JSON.stringify(Array.from(deletedMessageIds)));
    }
  }, [deletedMessageIds]);

  // Sync cache to local storage for instant offline / reload access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('social_messages_cache', JSON.stringify(messagesCache));
    }
  }, [messagesCache]);

  // Mobile & PWA Notification Permission & Tap Action Listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initNotifications = async () => {
      const isNative = typeof (window as any).Capacitor !== 'undefined' && typeof (window as any).Capacitor.isNativePlatform === 'function' && (window as any).Capacitor.isNativePlatform();
      
      if (isNative) {
        try {
          await LocalNotifications.requestPermissions();
          LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
            const extra = action.notification.extra;
            if (extra?.partnerId) {
              window.location.href = `/dashboard?userId=${extra.partnerId}`;
            }
          });
        } catch (e) {
          console.warn("Capacitor notification listener error:", e);
        }
      } else if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          console.log('Notification permission status:', permission);
        }).catch(() => {});
      }
    };

    initNotifications();

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NAVIGATE') {
        window.location.href = event.data.url;
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    }
  }, []);

  const [requests, setRequests] = useState<User[]>([]);
  const isFlushingRef = useRef(false);
  const socketRef = useRef<any>(null);

  const flushPendingQueue = React.useCallback(async () => {
    if (isFlushingRef.current) return;
    const queue = getPendingQueue();
    if (queue.length === 0) return;

    isFlushingRef.current = true;
    for (const item of queue) {
      try {
        if (socketRef.current) {
          socketRef.current.emit('send_social_message', {
            id: item.tempId,
            senderId: (sessionRef.current?.user as any)?.id,
            receiverId: item.receiverId,
            content: item.content,
            type: item.type,
            createdAt: item.createdAt,
            isSeen: false,
            replyTo: item.replyTo,
            receiverEmail: item.receiverEmail
          });
        }

        const savedMsg = await saveSocialMessage(item.receiverId, item.content, item.type, item.replyTo ?? null);
        if (savedMsg) {
          removeFromPendingQueue(item.tempId);
          const normalized = normalizeMsg(savedMsg as any);
          setMessages(prev => prev.map(m => m.id === item.tempId ? { ...normalized, id: normalized.id || item.tempId, status: undefined } : m));
          setMessagesCache(prev => {
            const current = prev[item.receiverId] || [];
            return {
              ...prev,
              [item.receiverId]: current.map(m => m.id === item.tempId ? { ...normalized, id: normalized.id || item.tempId, status: undefined } : m)
            };
          });
        }
      } catch (e) {
        console.warn("Will retry sending pending message when back online:", item.tempId, e);
      }
    }
    isFlushingRef.current = false;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      flushPendingQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushPendingQueue]);
  // PWA Notification Deep-linking URL Parser: Automatically selects active chat conversation
  useEffect(() => {
    if (typeof window === 'undefined' || users.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const targetUserId = params.get('userId');

    if (targetUserId) {
      const targetUser = users.find(u => u.id === targetUserId) || requests.find(u => u.id === targetUserId);
      if (targetUser) {
        // Optimistically select user
        setSelectedUser(targetUser);

        // Reset browser URL query parameters without full page reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [users, requests]);
  const [chatSwipeOffset, setChatSwipeOffset] = useState<number>(0);
  const chatTouchStartX = useRef<number>(0);
  const chatTouchStartY = useRef<number>(0);
  const isDraggingContainerMouse = useRef<boolean>(false);

  const handleContainerTouchStart = (e: React.TouchEvent) => {
    chatTouchStartX.current = e.touches[0].clientX;
    chatTouchStartY.current = e.touches[0].clientY;
  };

  const handleContainerTouchMove = (e: React.TouchEvent) => {
    const diffX = e.touches[0].clientX - chatTouchStartX.current;
    const diffY = e.touches[0].clientY - chatTouchStartY.current;
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 6) {
      const offset = Math.max(-85, Math.min(85, diffX * 0.75));
      setChatSwipeOffset(offset);
    }
  };

  const handleContainerTouchEnd = () => {
    setChatSwipeOffset(0);
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    chatTouchStartX.current = e.clientX;
    chatTouchStartY.current = e.clientY;
    isDraggingContainerMouse.current = true;

    const handleMouseMoveContainer = (moveEv: MouseEvent) => {
      if (!isDraggingContainerMouse.current) return;
      const diffX = moveEv.clientX - chatTouchStartX.current;
      const diffY = moveEv.clientY - chatTouchStartY.current;
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 6) {
        const offset = Math.max(-85, Math.min(85, diffX * 0.75));
        setChatSwipeOffset(offset);
      }
    };

    const handleMouseUpContainer = () => {
      isDraggingContainerMouse.current = false;
      window.removeEventListener('mousemove', handleMouseMoveContainer);
      window.removeEventListener('mouseup', handleMouseUpContainer);
      setChatSwipeOffset(0);
    };

    window.addEventListener('mousemove', handleMouseMoveContainer);
    window.addEventListener('mouseup', handleMouseUpContainer);
  };

  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [isVoiceToText, setIsVoiceToText] = useState(false);
  const voiceToTextRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isCancelingRecordingRef = useRef(false);

  // Call States
  const [incomingCall, setIncomingCall] = useState<{ from: any, type: 'audio' | 'video', offer?: any, callId?: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ peer: any, type: 'audio' | 'video', isCaller: boolean, callId?: string, initialOffer?: any } | null>(null);
  // *** FIX Bug 3: Ref mirror of activeCall so socket closures always read current value ***
  const activeCallRef = useRef<{ peer: any, type: 'audio' | 'video', isCaller: boolean, callId?: string, initialOffer?: any } | null>(null);
  const incomingCallDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAIMention, setShowAIMention] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Instagram-style Chat Details, Theme, Tagging & Lightbox State
  const [showChatDetails, setShowChatDetails] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [customizerTab, setCustomizerTab] = useState<'themes' | 'fonts'>('themes');
  const [activeFont, setActiveFont] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chat_font') || 'default';
    }
    return 'default';
  });
  const [liveThemeId, setLiveThemeId] = useState<string | null>(null);
  const [themeSearchQuery, setThemeSearchQuery] = useState('');
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const openMediaLightbox = (url: string, type: 'image' | 'video' = 'image') => {
    setLightboxMedia({ url, type });
  };

  const handleDownloadMedia = async (url: string, type?: 'image' | 'video') => {
    if (!url) return;
    const ext = type === 'video' ? 'mp4' : (url.includes('.png') ? 'png' : url.includes('.webp') ? 'webp' : 'jpg');
    const filename = `connect_media_${Date.now()}.${ext}`;

    try {
      const isDataOrBlob = url.startsWith('data:') || url.startsWith('blob:');
      if (isDataOrBlob) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // 1. Try direct fetch & blob
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
        return;
      }
      throw new Error(`Direct fetch failed: ${res.status}`);
    } catch (err) {
      console.warn("Direct blob download failed, falling back to server download proxy:", err);
      // 2. Direct server proxy with Content-Disposition: attachment
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
      const link = document.createElement('a');
      link.href = proxyUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  const [detailsTab, setDetailsTab] = useState<'media' | 'files'>('media');
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [chatThemes, setChatThemes] = useState<Record<string, string>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [mutedChats, setMutedChats] = useState<Set<string>>(new Set());
  const [acceptedContactIds, setAcceptedContactIds] = useState<Set<string>>(new Set());
  const acceptedContactIdsRef = useRef<Set<string>>(new Set());
  const wasSocketDisconnectedRef = useRef<boolean>(false);
  // Close chat details modal first when user hits back button / Escape key
  useEffect(() => {
    if (!showChatDetails) return;

    try {
      window.history.pushState({ chatDetailsOpen: true }, '');
    } catch (err) {}

    const handlePopState = () => {
      setShowChatDetails(false);
      setEditingNickname(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowChatDetails(false);
        setEditingNickname(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showChatDetails]);

  // Global App-Wide Font Application Effect
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const selected = FONT_OPTIONS.find(f => f.id === activeFont);
      if (selected && selected.family !== 'inherit') {
        document.body.style.fontFamily = selected.family;
      } else {
        document.body.style.fontFamily = '';
      }
    }
  }, [activeFont]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMuted = localStorage.getItem('social_muted_chats');
      if (savedMuted) {
        try { setMutedChats(new Set(JSON.parse(savedMuted))); } catch (e) {}
      }
      const savedAccepted = localStorage.getItem('social_accepted_contacts');
      if (savedAccepted) {
        try {
          const parsed = new Set<string>(JSON.parse(savedAccepted));
          setAcceptedContactIds(parsed);
          acceptedContactIdsRef.current = parsed;
        } catch (e) {}
      }
    }
  }, []);

  useEffect(() => {
    acceptedContactIdsRef.current = acceptedContactIds;
  }, [acceptedContactIds]);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [showSearchWindow, setShowSearchWindow] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<User[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  // Sync search state with parent to hide bottom bar smoothly
  useEffect(() => {
    onSearchActiveChange?.(isSearchFocused || searchQuery.trim().length > 0);
  }, [isSearchFocused, searchQuery, onSearchActiveChange]);

  // Global live user search across entire platform
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setGlobalSearchResults([]);
      setIsSearchingGlobal(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        const results = await searchUsers(q);
        if (Array.isArray(results)) {
          const myId = (session?.user as any)?.id;
          const filtered = results.filter((u: any) => u.id !== myId);
          setGlobalSearchResults(filtered);
        }
      } catch (err) {
        console.warn('Failed to search users globally:', err);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, session]);

  const [showReportModal, setShowReportModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [sharedMedia, setSharedMedia] = useState<{
    picsAndVideos: { id: string; content: string; type: string; createdAt: any; senderId?: string }[];
    files: { id: string; content: string; type: string; createdAt: any; senderId?: string }[];
  }>({ picsAndVideos: [], files: [] });
  const [mediaDisplayLimit, setMediaDisplayLimit] = useState<number>(15);
  const [selectedAlbum, setSelectedAlbum] = useState<{ id: string; items: any[]; time?: string } | null>(null);

  // Automatically fetch ALL shared media for this chat from DB regardless of pagination state
  useEffect(() => {
    if (!selectedUser?.id) {
      setSharedMedia({ picsAndVideos: [], files: [] });
      setMediaDisplayLimit(15);
      return;
    }
    getChatSharedMedia(selectedUser.id).then((mediaMsgs: any[]) => {
      const picsAndVideos: any[] = [];
      const files: any[] = [];

      (mediaMsgs || []).forEach((m) => {
        if (m.type === 'image' || m.type === 'video') {
          picsAndVideos.push({ id: m.id, content: m.content, type: m.type, createdAt: m.createdAt, senderId: m.senderId });
        } else if (m.type === 'voice' || m.type === 'file') {
          files.push({ id: m.id, content: m.content, type: m.type, createdAt: m.createdAt, senderId: m.senderId });
        } else if (m.type === 'media_album') {
          try {
            const items = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
            if (Array.isArray(items)) {
              items.forEach((it: any, idx: number) => {
                if (it.type === 'video' || it.type === 'image') {
                  picsAndVideos.push({ id: `${m.id}-${idx}`, content: it.url, type: it.type, createdAt: m.createdAt, senderId: m.senderId });
                } else {
                  files.push({ id: `${m.id}-${idx}`, content: it.url, type: it.type || 'file', createdAt: m.createdAt, senderId: m.senderId });
                }
              });
            }
          } catch (e) {}
        }
      });

      setSharedMedia({ picsAndVideos, files });
      setMediaDisplayLimit(15);
    }).catch(() => {});
  }, [selectedUser?.id]);

  const activeThemeId = (selectedUser ? (
    liveThemeId ||
    chatThemes[selectedUser.id] ||
    (selectedUser.email ? chatThemes[selectedUser.email.toLowerCase().trim()] : null) ||
    (selectedUser.username ? chatThemes[selectedUser.username.toLowerCase().trim()] : null)
  ) : null) || 'default';
  const activeTheme = useMemo(() => {
    return INSTAGRAM_THEMES.find(t => t.id === activeThemeId) || INSTAGRAM_THEMES[0];
  }, [activeThemeId, selectedUser, chatThemes, liveThemeId]);

  // Message Tagging System State
  const [msgTags, setMsgTags] = useState<Record<string, MessageTag>>({});
  const [openTagPickerMsg, setOpenTagPickerMsg] = useState<any | null>(null);
  const [customTagLabel, setCustomTagLabel] = useState('');
  const [customTagEmoji, setCustomTagEmoji] = useState('🏷️');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('message_tags');
      if (saved) {
        try { setMsgTags(JSON.parse(saved)); } catch (e) {}
      }
    }
  }, []);

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const selectedUserRef = useRef<User | null>(null);

  // Sync with parent for header updates
  useEffect(() => {
    if (onChatChange) {
      onChatChange(selectedUser);
    }
  }, [selectedUser, onChatChange]);
  const sessionRef = useRef<any>(session);
  const usersRef = useRef<User[]>(users);
  const requestsRef = useRef<User[]>(requests);
  // Stable copy of full contact/request list so client-side search can filter without re-fetching
  const allContactsRef = useRef<User[]>([]);
  const allRequestsRef = useRef<User[]>([]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
    sessionRef.current = session;
    usersRef.current = users;
    requestsRef.current = requests;
  }, [selectedUser, session, users, requests]);

  const handleSelectTheme = async (theme: ChatTheme) => {
    if (!selectedUser) return;
    const currentUserName = session?.user?.name || (session?.user?.email ? session.user.email.split('@')[0] : 'Someone');
    const myId = (session?.user as any)?.id || (session?.user as any)?.email;
    const myEmail = session?.user?.email ? session.user.email.toLowerCase().trim() : '';

    const updated = {
      ...chatThemes,
      [selectedUser.id]: theme.id,
      ...(selectedUser.email ? { [selectedUser.email.toLowerCase().trim()]: theme.id } : {}),
      ...(selectedUser.username ? { [selectedUser.username.toLowerCase().trim()]: theme.id } : {})
    };
    setChatThemes(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat_themes', JSON.stringify(updated));
    }
    setShowThemePicker(false);

    if (socket) {
      socket.emit('change_chat_theme', {
        receiverEmail: selectedUser.email,
        receiverId: selectedUser.id,
        themeId: theme.id,
        themeName: theme.name,
        senderName: currentUserName,
        senderId: myId,
        senderEmail: myEmail
      });
    }

    const cleanThemeName = theme.name.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    const systemText = `${currentUserName} changed the theme to ${cleanThemeName} [theme:${theme.id}]. Customize chat`;
    const stableId = 'system-theme-' + Date.now() + Math.random().toString(36).substring(7);
    const systemMsg: Message = {
      id: stableId,
      senderId: myId,
      receiverId: selectedUser.id,
      content: systemText,
      type: 'system',
      createdAt: new Date(),
      isSeen: false
    };

    setMessages(prev => [...prev, systemMsg]);
    setMessagesCache(prev => {
      const current = prev[selectedUser.id] || [];
      return { ...prev, [selectedUser.id]: [...current, systemMsg] };
    });

    if (socket) {
      socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...systemMsg });
    }

    try {
      const savedMsg = await saveSocialMessage(selectedUser.id, systemText, 'system');
      if (savedMsg) {
        const finalMsg = { ...(savedMsg as any), id: (savedMsg as any).id || stableId };
        setMessages(prev => prev.map(m => m.id === stableId ? finalMsg : m));
        setMessagesCache(prev => {
          const current = prev[selectedUser.id] || [];
          return { ...prev, [selectedUser.id]: current.map(m => m.id === stableId ? finalMsg : m) };
        });
      }
    } catch (err) {
      console.error("Failed to save theme system message:", err);
    }
  };

  const handleSaveNickname = async () => {
    if (!selectedUser) return;
    const newNick = nicknameInput.trim();
    const currentUserName = session?.user?.name || (session?.user?.email ? session.user.email.split('@')[0] : 'Someone');
    const targetName = selectedUser.name || 'User';

    const updated = { ...nicknames, [selectedUser.id]: newNick };
    setNicknames(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat_nicknames', JSON.stringify(updated));
    }
    setEditingNickname(false);

    if (socket) {
      socket.emit('change_nickname', {
        receiverEmail: selectedUser.email,
        receiverId: selectedUser.id,
        nickname: newNick,
        senderName: currentUserName,
        senderId: (session?.user as any)?.id
      });
    }

    const systemText = newNick
      ? `${currentUserName} set nickname for ${targetName} to ${newNick}`
      : `${currentUserName} removed nickname for ${targetName}`;

    const senderId = (session?.user as any)?.id || 'user';
    const stableId = 'system-nick-' + Date.now() + Math.random().toString(36).substring(7);
    const systemMsg: Message = {
      id: stableId,
      senderId: senderId,
      receiverId: selectedUser.id,
      content: systemText,
      type: 'system',
      createdAt: new Date(),
      isSeen: false
    };

    setMessages(prev => [...prev, systemMsg]);
    setMessagesCache(prev => {
      const current = prev[selectedUser.id] || [];
      return { ...prev, [selectedUser.id]: [...current, systemMsg] };
    });

    if (socket) {
      socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...systemMsg });
    }

    try {
      await saveSocialMessage(selectedUser.id, systemText, 'system');
    } catch (err) {
      console.error("Failed to save nickname system message:", err);
    }
  };

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Notify parent of active call status and keep ref in sync
  useEffect(() => {
    if (onCallStateChange) {
      onCallStateChange(!!activeCall);
    }
    activeCallRef.current = activeCall;
  }, [activeCall, onCallStateChange]);

  // Incoming call vibration haptics
  useEffect(() => {
    if (incomingCall && !activeCall) {
      try {
        if (typeof window !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      } catch {}
    }
    // Auto-dismiss (45s) is handled imperatively in the incoming_call socket handler
  }, [incomingCall, activeCall]);
  // 1. Stable Socket Instance
  useEffect(() => {
    if (typeof window === 'undefined' || !session?.user) return;

    const initSocket = async () => {
      const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
      const newSocket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: false,
        transports: ['websocket', 'polling']
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        socketRef.current = newSocket;
        flushPendingQueue();
        if (onStatusChange) onStatusChange(true);
        if (sessionRef.current?.user) {
          const userObj = sessionRef.current.user as any;
          newSocket.emit('identify', {
            email: userObj.email ? userObj.email.toLowerCase().trim() : undefined,
            userId: userObj.id
          });
        }
        // ── Refresh lastSeenMap from DB only on true reconnect after being disconnected ──
        if (wasSocketDisconnectedRef.current) {
          wasSocketDisconnectedRef.current = false;
          fetchRecentChatsCoalesced(true).then(results => {
            const freshLastSeen: Record<string, string> = {};
            results.forEach((u: any) => {
              const timeVal = u.lastSeen ? (typeof u.lastSeen === 'string' ? u.lastSeen : new Date(u.lastSeen).toISOString()) : null;
              if (timeVal) {
                if (u.email) freshLastSeen[u.email.toLowerCase().trim()] = timeVal;
                if (u.id) freshLastSeen[u.id] = timeVal;
              }
            });
            if (Object.keys(freshLastSeen).length > 0) {
              setLastSeenMap(prev => {
                const merged = { ...prev, ...freshLastSeen };
                if (typeof window !== 'undefined') {
                  localStorage.setItem('chat_last_seen', JSON.stringify(merged));
                }
                return merged;
              });
            }
          }).catch(() => {});
        }
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        wasSocketDisconnectedRef.current = true;
        setIsConnected(false);
        if (onStatusChange) onStatusChange(false);
      });

      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        wasSocketDisconnectedRef.current = true;
        setIsConnected(false);
        if (onStatusChange) onStatusChange(false);
      });

      newSocket.on('receive_social_message', async (msg: any) => {
        const myId = String((sessionRef.current?.user as any)?.id || '');
        const msgSenderId = String(msg.senderId || '');
        const msgReceiverId = String(msg.receiverId || '');
        const partnerId = msgSenderId === myId ? msgReceiverId : msgSenderId;
        const selectedId = String(selectedUserRef.current?.id || '');

        // Automatically un-hide chat if previously deleted
        setDeletedChatIds(prev => {
          if (prev.has(partnerId)) {
            const next = new Set(prev);
            next.delete(partnerId);
            if (typeof window !== 'undefined') {
              localStorage.setItem('social_deleted_chats', JSON.stringify(Array.from(next)));
            }
            return next;
          }
          return prev;
        });

        // Check for theme change from payload or system messages coming via socket
        const incomingTheme = (msg as any).themeId || detectThemeIdFromMessages([msg]);
        if (incomingTheme && partnerId) {
          setChatThemes(prev => {
            const updated = {
              ...prev,
              [partnerId]: incomingTheme,
              ...(selectedUserRef.current?.id === partnerId && selectedUserRef.current?.email ? { [selectedUserRef.current.email.toLowerCase().trim()]: incomingTheme } : {}),
              ...(selectedUserRef.current?.id === partnerId && selectedUserRef.current?.username ? { [selectedUserRef.current.username.toLowerCase().trim()]: incomingTheme } : {})
            };
            if (typeof window !== 'undefined') {
              localStorage.setItem('chat_themes', JSON.stringify(updated));
            }
            return updated;
          });
        }

        // 1. Update Message Stream safely without duplicates
        setMessages((prev) => {
          // Only update messages state if this message belongs to the active conversation
          if (selectedId && selectedId !== partnerId && selectedId !== msgSenderId && selectedId !== msgReceiverId) return prev;
          const isDup = prev.some(m =>
            // Exact ID match
            (msg.id && m.id === msg.id) ||
            // Optimistic message match — replace sending placeholder
            ((m as any).status === 'sending' && String(m.senderId) === msgSenderId && m.content === msg.content && m.type === msg.type) ||
            // Already-committed duplicate (server echo of our own sent msg)
            (String(m.senderId) === msgSenderId && m.content === msg.content && m.type === msg.type &&
              Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 10000)
          );
          if (isDup) {
            return prev.map(m =>
              (m.id === msg.id || ((m as any).status === 'sending' && String(m.senderId) === msgSenderId && m.content === msg.content && m.type === msg.type))
                ? { ...m, ...msg, id: msg.id || m.id, status: 'sent' }
                : m
            );
          }
          return [...prev, { ...msg, status: 'sent' }];
        });

        // Sync to cache immediately so reload preserves received photos
        setMessagesCache((prev) => {
          const cacheKey = partnerId || msgSenderId;
          if (!cacheKey) return prev;
          const current = prev[cacheKey] || [];
          const isDup = current.some(m =>
            m.id === msg.id ||
            ((m as any).status === 'sending' && String(m.senderId) === msgSenderId && m.content === msg.content && m.type === msg.type)
          );
          let updatedList;
          if (isDup) {
            updatedList = current.map(m =>
              (m.id === msg.id || ((m as any).status === 'sending' && String(m.senderId) === msgSenderId && m.content === msg.content && m.type === msg.type))
                ? { ...m, ...msg, id: msg.id || m.id, status: 'sent' }
                : m
            );
          } else {
            updatedList = [...current, { ...msg, status: 'sent' }];
          }
          const next = { ...prev, [cacheKey]: updatedList };
          if (typeof window !== 'undefined') {
            localStorage.setItem('social_messages_cache', JSON.stringify(next));
          }
          return next;
        });

        // Real-time update to sharedMedia
        if (selectedUserRef.current?.id === partnerId) {
          if (msg.type === 'image' || msg.type === 'video') {
            setSharedMedia(p => ({
              ...p,
              picsAndVideos: [{ id: msg.id, content: msg.content, type: msg.type, createdAt: msg.createdAt, senderId: msg.senderId }, ...p.picsAndVideos]
            }));
          } else if (msg.type === 'voice' || msg.type === 'file') {
            setSharedMedia(p => ({
              ...p,
              files: [{ id: msg.id, content: msg.content, type: msg.type, createdAt: msg.createdAt, senderId: msg.senderId }, ...p.files]
            }));
          } else if (msg.type === 'media_album') {
            try {
              const items = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
              if (Array.isArray(items)) {
                setSharedMedia(p => {
                  const npv = [...p.picsAndVideos];
                  const nf = [...p.files];
                  items.forEach((it: any, idx: number) => {
                    if (it.type === 'video' || it.type === 'image') {
                      npv.unshift({ id: `${msg.id}-${idx}`, content: it.url, type: it.type, createdAt: msg.createdAt, senderId: msg.senderId });
                    } else {
                      nf.unshift({ id: `${msg.id}-${idx}`, content: it.url, type: it.type, createdAt: msg.createdAt, senderId: msg.senderId });
                    }
                  });
                  return { picsAndVideos: npv, files: nf };
                });
              }
            } catch (e) {}
          }
        }

        // 2. Update Sidebar (Users/Requests)
        const formatMsg = (m: Message) => {
          if (m.type === 'voice') return 'Voice Message';
          if (m.type === 'image') return 'Photo';
          if (m.type === 'video') return 'Video';
          if (m.type === 'media_album') return 'Photos & Videos';
          if (m.type === 'file') return 'Attachment';
          if (m.type === 'accepted') return 'Request accepted';
          return m.content.length > 30 ? m.content.substring(0, 30) + '...' : m.content;
        };

        // If an 'accepted' type comes in, move sender from requests → contacts
        if (msg.type === 'accepted') {
          const senderId = msg.senderId;
          setRequests(prev => {
            const req = prev.find(u => u.id === senderId);
            if (req) {
              const next = prev.filter(u => u.id !== senderId);
              allRequestsRef.current = next;
              setUsers(prevContacts => {
                if (prevContacts.some(u => u.id === senderId)) return prevContacts;
                const updated = [...prevContacts, { ...req, isRequest: false, unseenCount: 0 }];
                allContactsRef.current = updated;
                return updated;
              });
              return next;
            }
            return prev;
          });
          return; // Don't append to message stream
        }

        const updateSidebarList = async (prevList: User[]) => {
          const existingIndex = prevList.findIndex(u => u.id === partnerId);
          if (existingIndex > -1) {
            const updatedUser = {
              ...prevList[existingIndex],
              lastMessage: formatMsg(msg),
              unseenCount: (selectedUserRef.current?.id === partnerId) ? 0 : (prevList[existingIndex].unseenCount || 0) + 1
            };
            const newList = [...prevList];
            newList.splice(existingIndex, 1);
            return [updatedUser, ...newList];
          }

          // If NOT in list, fetch user and add as request
          if (msg.senderId !== (sessionRef.current?.user as any)?.id) {
            const newUser = await getSocialUser(msg.senderId);
            if (newUser) {
              return [{
                ...(newUser as any),
                lastMessage: formatMsg(msg),
                isRequest: true,
                unseenCount: 1
              }, ...prevList];
            }
          }
          return prevList;
        };

        setUsers(prev => {
          const existing = prev.find(u => u.id === partnerId);
          if (existing) {
            const index = prev.indexOf(existing);
            const updated = { ...existing, lastMessage: formatMsg(msg), unseenCount: (selectedUserRef.current?.id === partnerId) ? 0 : (existing.unseenCount || 0) + 1 };
            const next = [...prev];
            next.splice(index, 1);
            const finalList = [updated, ...next];
            allContactsRef.current = finalList;
            return finalList;
          }
          return prev;
        });

        setRequests(prev => {
          const existing = prev.find(u => u.id === partnerId);
          if (existing) {
            const index = prev.indexOf(existing);
            const updated = { ...existing, lastMessage: formatMsg(msg), unseenCount: (selectedUserRef.current?.id === partnerId) ? 0 : (existing.unseenCount || 0) + 1 };
            const next = [...prev];
            next.splice(index, 1);
            const finalList = [updated, ...next];
            allRequestsRef.current = finalList;
            return finalList;
          }

          // If it's a completely new person who messaged us or chat was deleted
          if (msg.senderId !== (sessionRef.current?.user as any)?.id && !usersRef.current.some(u => u.id === msg.senderId)) {
            getSocialUser(msg.senderId).then(newUser => {
              if (newUser) {
                const isAcceptedUser = acceptedContactIdsRef.current.has(newUser.id) ||
                                      allContactsRef.current.some(u => u.id === newUser.id) ||
                                      !(newUser as any).isRequest;

                if (isAcceptedUser) {
                  // Resurrect directly into main chats inbox!
                  setUsers(current => {
                    if (current.some(u => u.id === newUser.id)) return current;
                    const finalList = [{ ...(newUser as any), lastMessage: formatMsg(msg), isRequest: false, unseenCount: 1 }, ...current];
                    allContactsRef.current = finalList;
                    return finalList;
                  });
                } else {
                  // Stranger request -> add to Requests tab
                  setRequests(current => {
                    if (current.some(u => u.id === newUser.id)) return current;
                    const finalList = [{ ...(newUser as any), lastMessage: formatMsg(msg), isRequest: true, unseenCount: 1 }, ...current];
                    allRequestsRef.current = finalList;
                    return finalList;
                  });
                }
              }
            });
          }
          return prev;
        });

        // 3. Update Cache safely without duplicates
        setMessagesCache(prev => {
          const current = prev[partnerId] || [];
          const isDup = current.some(m =>
            m.id === msg.id ||
            (m.content === msg.content && String(m.senderId) === String(msg.senderId) && m.type === msg.type && Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 15000)
          );
          if (isDup) {
            return {
              ...prev,
              [partnerId]: current.map(m =>
                (m.id === msg.id || (m.content === msg.content && String(m.senderId) === String(msg.senderId) && m.type === msg.type && Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 15000))
                  ? { ...msg, id: msg.id || m.id }
                  : m
              )
            };
          }
          return { ...prev, [partnerId]: [...current, msg] };
        });

        // 4. Mark as seen if active chat is open and this message is incoming
        if (selectedUserRef.current?.id === partnerId && msgSenderId !== String((sessionRef.current?.user as any)?.id || '')) {
          markMessagesAsSeen(partnerId).catch(() => {});
          const seenAt = new Date().toISOString();
          newSocket.emit('mark_as_seen', {
            senderEmail: selectedUserRef.current.email ? selectedUserRef.current.email.toLowerCase().trim() : undefined,
            senderId: partnerId
          });
          // Update our own messages state immediately so Seen just now shows
          setMessages(prev => prev.map(m => (m.isSeen ? m : { ...m, isSeen: true, seenAt })));
        }

        // 5. Stunning Custom PWA / Local Notification Trigger
        const isSentByMe = msg.senderId === (sessionRef.current?.user as any)?.id;
        const isAppBackgrounded = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const isChattingWithSomeoneElse = selectedUserRef.current?.id !== partnerId;

        if (!isSentByMe && (isAppBackgrounded || isChattingWithSomeoneElse)) {
          const sender = usersRef.current.find(u => u.id === msg.senderId) || requestsRef.current.find(u => u.id === msg.senderId);
          const senderName = sender?.name || (msg as any).senderEmail?.split('@')[0] || 'Someone';

          let contentPreview = msg.content;
          if (msg.type === 'voice') contentPreview = 'Voice Message';
          else if (msg.type === 'image') contentPreview = 'Image';
          else if (msg.type === 'video') contentPreview = 'Video';
          else if (msg.type === 'file') contentPreview = 'Attachment';

          triggerStunningNotification(
            'message',
            `Message from ${senderName}`,
            contentPreview,
            { partnerId }
          );
        }
      });

      newSocket.on('receive_social_delete', ({ messageId }) => {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) return { ...m, content: "This message was deleted", type: "deleted" };
          return m;
        }));

        // Update cache as well
        setMessagesCache(prev => {
          const newCache = { ...prev };
          Object.keys(newCache).forEach(userId => {
            newCache[userId] = newCache[userId].map(m =>
              m.id === messageId ? { ...m, content: "This message was deleted", type: "deleted" } : m
            );
          });
          return newCache;
        });
      });

      newSocket.on('messages_seen', (data?: { seenAt?: string }) => {
        const nowIso = data?.seenAt || new Date().toISOString();
        setMessages(prev => prev.map(m => (m.isSeen ? m : { ...m, isSeen: true, seenAt: nowIso })));

        // Update cache as well
        setMessagesCache(prev => {
          const newCache = { ...prev };
          Object.keys(newCache).forEach(userId => {
            newCache[userId] = newCache[userId].map(m => (m.isSeen ? m : { ...m, isSeen: true, seenAt: nowIso }));
          });
          return newCache;
        });
      });

      newSocket.on('incoming_call', (data) => {
        console.log("Incoming call received:", data);
        // *** FIX Bug 3: Use activeCallRef (not stale closure) to check busy state ***
        if (activeCallRef.current) {
          newSocket.emit('reject_call', { to: data.from?.email?.toLowerCase().trim(), toUserId: data.from?.id, callId: data.callId });
          return;
        }
        setIncomingCall(data);

        // *** FIX Bug 13: Auto-dismiss incoming call after 45 seconds ***
        if (incomingCallDismissTimer.current) clearTimeout(incomingCallDismissTimer.current);
        incomingCallDismissTimer.current = setTimeout(() => {
          setIncomingCall(prev => {
            if (prev && prev.callId === data.callId) {
              // Auto-dismiss — no need to emit rejection since caller will time out too
              return null;
            }
            return prev;
          });
        }, 45000);

        // Push notification if app is backgrounded
        const callerName = data.from?.name || data.from?.email?.split('@')[0] || 'Someone';
        const isAppBackgrounded = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        if (isAppBackgrounded) {
          triggerStunningNotification(
            'call',
            `Incoming ${data.type.charAt(0).toUpperCase() + data.type.slice(1)} Call`,
            `${callerName} is calling you... tap to answer`,
            { partnerId: data.from?.id, callType: data.type, callerEmail: data.from?.email }
          );
        }
      });

      // *** FIX Bug 7: Only keep call_accepted here (triggers engine's onCallAccepted via isAccepted prop) ***
      // Termination events (call_ended, call_rejected, etc.) are handled by the WebRTC engine
      // which fires onEnd() → the hook fires onEnd → CallInterface calls onEnd → SocialChat clears activeCall.
      // Having BOTH listeners caused double state mutations.
      newSocket.on('call_accepted', (data) => {
        // Mark the active call as connected so CallInterface passes isAccepted=true to the engine
        setActiveCall(prev => prev ? { ...prev, connected: true } as any : null);
      });

      // call_busy needs to be handled here because the engine may not have started yet
      // (caller gets busy before the engine's socket listeners are even set up)
      newSocket.on('call_busy', (data) => {
        console.log('[Call] User is busy');
        if (!activeCallRef.current) return; // Ignore if no active call on our side
        setActiveCall(null);
      });

      newSocket.on('user_typing', ({ email }) => {
        setTypingUsers(prev => new Set(prev).add(email));
      });

      newSocket.on('user_stop_typing', ({ email }) => {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(email);
          return next;
        });
      });

      newSocket.on('receive_social_reaction', ({ messageId, emoji, userId }: any) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId) {
              const existingReactions = m.reactions || [];
              const userHasReacted = existingReactions.find(
                (r: any) => String(r.userId) === String(userId) && r.emoji === emoji
              );
              let newReactions;
              if (userHasReacted) {
                newReactions = existingReactions.filter(
                  (r: any) => !(String(r.userId) === String(userId) && r.emoji === emoji)
                );
              } else {
                newReactions = [...existingReactions, { emoji, userId }];
              }
              return { ...m, reactions: newReactions };
            }
            return m;
          })
        );
        setMessagesCache((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((key) => {
            updated[key] = updated[key].map((m) => {
              if (m.id === messageId) {
                const existingReactions = m.reactions || [];
                const userHasReacted = existingReactions.find(
                  (r: any) => String(r.userId) === String(userId) && r.emoji === emoji
                );
                let newReactions;
                if (userHasReacted) {
                  newReactions = existingReactions.filter(
                    (r: any) => !(String(r.userId) === String(userId) && r.emoji === emoji)
                  );
                } else {
                  newReactions = [...existingReactions, { emoji, userId }];
                }
                return { ...m, reactions: newReactions };
              }
              return m;
            });
          });
          return updated;
        });
      });

      newSocket.on('receive_chat_theme', ({ themeId, themeName, senderName, senderId, senderEmail }: any) => {
        if (themeId) {
          const partnerId = senderId || senderEmail;
          setChatThemes(prev => {
            const updated = { ...prev };
            if (senderId) updated[senderId] = themeId;
            if (senderEmail) updated[senderEmail.toLowerCase().trim()] = themeId;
            if (selectedUserRef.current?.id === senderId && selectedUserRef.current?.username) {
              updated[selectedUserRef.current.username.toLowerCase().trim()] = themeId;
            }
            if (typeof window !== 'undefined') {
              localStorage.setItem('chat_themes', JSON.stringify(updated));
            }
            return updated;
          });

          const themeObj = INSTAGRAM_THEMES.find(t => t.id === themeId);
          const cleanThemeName = (themeName || themeObj?.name || themeId).replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
          const displayName = senderName || 'Someone';
          const systemText = `${displayName} changed the theme to ${cleanThemeName} [theme:${themeId}]. Customize chat`;
          const stableId = 'system-theme-' + Date.now() + Math.random().toString(36).substring(7);
          const systemMsg: Message = {
            id: stableId,
            senderId: partnerId,
            receiverId: (sessionRef.current?.user as any)?.id || 'me',
            content: systemText,
            type: 'system',
            createdAt: new Date(),
            isSeen: true
          };

          if (partnerId && selectedUserRef.current && (String(selectedUserRef.current.id) === String(partnerId) || (selectedUserRef.current.email && selectedUserRef.current.email.toLowerCase().trim() === String(senderEmail).toLowerCase().trim()))) {
            setMessages(prev => [...prev, systemMsg]);
          }
        }
      });



      newSocket.on('receive_nickname', ({ nickname, senderId, senderEmail }: any) => {
        setNicknames(prev => {
          const updated = { ...prev };
          if (senderId) updated[senderId] = nickname;
          if (senderEmail) updated[senderEmail.toLowerCase().trim()] = nickname;
          if (typeof window !== 'undefined') {
            localStorage.setItem('chat_nicknames', JSON.stringify(updated));
          }
          return updated;
        });
      });


      // ── Presence: online_users bulk snapshot on connect ──────────────────
      newSocket.on('online_users', (identifiers: string[]) => {
        setOnlineUsers(new Set(identifiers.map((e: string) => e.toLowerCase().trim())));
      });

      // ── Presence: single user activity change (online/offline) ───────────
      // Replaces old user_last_seen + user_status combo
      newSocket.on('activity_update', ({ userId, email, isOnline, lastSeen }: {
        userId?: string;
        email?: string;
        isOnline: boolean;
        lastSeen: string;
      }) => {
        // Update online set
        setOnlineUsers(prev => {
          const next = new Set(prev);
          const keys = [email && email.toLowerCase().trim(), userId].filter(Boolean) as string[];
          if (isOnline) {
            keys.forEach(k => next.add(k));
          } else {
            keys.forEach(k => next.delete(k));
          }
          return next;
        });

        // Update lastSeen map
        if (!isOnline && lastSeen) {
          setLastSeenMap(prev => {
            const updated = { ...prev };
            if (email) updated[email.toLowerCase().trim()] = lastSeen;
            if (userId) updated[userId] = lastSeen;
            if (typeof window !== 'undefined') {
              localStorage.setItem('chat_last_seen', JSON.stringify(updated));
            }
            return updated;
          });
        }
      });

      newSocket.on('reconnect', () => {
        console.log('Socket reconnected - re-identifying...');
        setIsConnected(true);
        socketRef.current = newSocket;
        flushPendingQueue();
        if (onStatusChange) onStatusChange(true);
        // Re-identify immediately so socket rooms are rebuilt after network change
        const userObj = sessionRef.current?.user as any;
        if (userObj) {
          newSocket.emit('identify', {
            email: userObj.email ? userObj.email.toLowerCase().trim() : undefined,
            userId: userObj.id
          });
        }
        // Fetch any missed messages for the active chat
        const activeUser = selectedUserRef.current;
        if (activeUser) {
          const activeUserId = activeUser.id;
          getSocialMessages(activeUserId).then((history: any) => {
            if (selectedUserRef.current?.id !== activeUserId) return;
            setMessages(prev => {
              const deletedRef = deletedMessageIds;
              const dbMsgs = (history as any[]).filter(m => !deletedRef.has(m.id)).map(normalizeMsg);
              if (dbMsgs.length === 0) return prev;
              const dbMsgIds = new Set(dbMsgs.map(m => m.id));
              const earliestDbTime = new Date(dbMsgs[0].createdAt).getTime();

              const isMatchInDb = (m: any) => {
                if (dbMsgIds.has(m.id)) return true;
                const mTime = new Date(m.createdAt).getTime();
                return dbMsgs.some((dbM: any) =>
                  dbM.content === m.content &&
                  String(dbM.senderId) === String(m.senderId) &&
                  dbM.type === m.type &&
                  Math.abs(new Date(dbM.createdAt).getTime() - mTime) < 30000
                );
              };

              const olderInPrev = prev.filter(m => {
                const mTime = new Date(m.createdAt).getTime();
                return mTime < earliestDbTime && !isMatchInDb(m);
              });

              const now = Date.now();
              const inFlight = prev.filter(m => {
                const mTime = new Date(m.createdAt).getTime();
                const isPending = (m as any).status === 'sending' || getPendingQueue().some(p => p.tempId === m.id);
                return !isMatchInDb(m) && (isPending || (now - mTime < 300000)) && (mTime >= earliestDbTime);
              });

              return [...olderInPrev, ...dbMsgs, ...inFlight].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              );
            });
            const normalizedHistory = (history as any[]).map(normalizeMsg);
            setMessagesCache((prev: any) => {
              const existing = prev[activeUserId] || [];
              if (normalizedHistory.length === 0) return prev;
              const dbMsgIds = new Set(normalizedHistory.map(m => m.id));
              const earliestDbTime = new Date(normalizedHistory[0].createdAt).getTime();

              const isMatchInDb = (m: any) => {
                if (dbMsgIds.has(m.id)) return true;
                const mTime = new Date(m.createdAt).getTime();
                return normalizedHistory.some((dbM: any) =>
                  dbM.content === m.content &&
                  String(dbM.senderId) === String(m.senderId) &&
                  dbM.type === m.type &&
                  Math.abs(new Date(dbM.createdAt).getTime() - mTime) < 30000
                );
              };

              const olderInExisting = existing.filter((m: any) => {
                const mTime = new Date(m.createdAt).getTime();
                return mTime < earliestDbTime && !isMatchInDb(m);
              });

              return { ...prev, [activeUserId]: [...olderInExisting, ...normalizedHistory] };
            });
          }).catch(() => {});
        }
      });

      return newSocket;
    };

    const socketInstancePromise = initSocket();

    // Re-identify + sync messages when app tab comes back to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        socketInstancePromise.then(s => {
          if (s && s.connected) {
            const userObj = sessionRef.current?.user as any;
            if (userObj) {
              s.emit('identify', {
                email: userObj.email ? userObj.email.toLowerCase().trim() : undefined,
                userId: userObj.id
              });
            }
          }
          // Only perform database refetch if the socket was disconnected during backgrounding
          if (!s || !s.connected || wasSocketDisconnectedRef.current) {
            wasSocketDisconnectedRef.current = false;
            const activeUser = selectedUserRef.current;
            if (activeUser) {
              const activeUserId = activeUser.id;
              getSocialMessages(activeUserId).then((history: any) => {
                if (selectedUserRef.current?.id !== activeUserId) return;
                setMessages(prev => {
                  const deletedRef = deletedMessageIds;
                  const dbMsgs = (history as any[]).filter(m => !deletedRef.has(m.id)).map(normalizeMsg);
                  if (dbMsgs.length === 0) return prev;
                  const dbMsgIds = new Set(dbMsgs.map(m => m.id));
                  const earliestDbTime = new Date(dbMsgs[0].createdAt).getTime();

                  const isMatchInDb = (m: any) => {
                    if (dbMsgIds.has(m.id)) return true;
                    const mTime = new Date(m.createdAt).getTime();
                    return dbMsgs.some((dbM: any) =>
                      dbM.content === m.content &&
                      String(dbM.senderId) === String(m.senderId) &&
                      dbM.type === m.type &&
                      Math.abs(new Date(dbM.createdAt).getTime() - mTime) < 30000
                    );
                  };

                  const olderInPrev = prev.filter(m => {
                    const mTime = new Date(m.createdAt).getTime();
                    return mTime < earliestDbTime && !isMatchInDb(m);
                  });

                  const now = Date.now();
                  const inFlight = prev.filter(m => {
                    const mTime = new Date(m.createdAt).getTime();
                    const isPending = (m as any).status === 'sending' || getPendingQueue().some(p => p.tempId === m.id);
                    return !isMatchInDb(m) && (isPending || (now - mTime < 300000)) && (mTime >= earliestDbTime);
                  });

                  return [...olderInPrev, ...dbMsgs, ...inFlight].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                });
                const normalizedHistory = (history as any[]).map(normalizeMsg);
                setMessagesCache((prev: any) => {
                  const existing = prev[activeUserId] || [];
                  if (normalizedHistory.length === 0) return prev;
                  const dbMsgIds = new Set(normalizedHistory.map(m => m.id));
                  const earliestDbTime = new Date(normalizedHistory[0].createdAt).getTime();

                  const isMatchInDb = (m: any) => {
                    if (dbMsgIds.has(m.id)) return true;
                    const mTime = new Date(m.createdAt).getTime();
                    return normalizedHistory.some((dbM: any) =>
                      dbM.content === m.content &&
                      String(dbM.senderId) === String(m.senderId) &&
                      dbM.type === m.type &&
                      Math.abs(new Date(dbM.createdAt).getTime() - mTime) < 30000
                    );
                  };

                  const olderInExisting = existing.filter((m: any) => {
                    const mTime = new Date(m.createdAt).getTime();
                    return mTime < earliestDbTime && !isMatchInDb(m);
                  });

                  return { ...prev, [activeUserId]: [...olderInExisting, ...normalizedHistory] };
                });
              }).catch(() => {});
            }

            // ── Refresh lastSeenMap from DB only if disconnected while in background ──
            fetchRecentChatsCoalesced(true).then(results => {
              const freshLastSeen: Record<string, string> = {};
              results.forEach((u: any) => {
                const timeVal = u.lastSeen ? (typeof u.lastSeen === 'string' ? u.lastSeen : new Date(u.lastSeen).toISOString()) : null;
                if (timeVal) {
                  if (u.email) freshLastSeen[u.email.toLowerCase().trim()] = timeVal;
                  if (u.id) freshLastSeen[u.id] = timeVal;
                }
              });
              if (Object.keys(freshLastSeen).length > 0) {
                setLastSeenMap(prev => {
                  const merged = { ...prev, ...freshLastSeen };
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('chat_last_seen', JSON.stringify(merged));
                  }
                  return merged;
                });
              }
            }).catch(() => {});
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── Keep-alive: ping the Render.com socket server every 4 minutes ──────────
    // Render free tier sleeps after 15 minutes of inactivity. A cold start takes
    // 30-60s — long enough to silently drop any call initiation during that window.
    // This lightweight HTTP ping keeps the server warm at near-zero cost.
    const SOCKET_URL_FOR_PING = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-6gmj.onrender.com';
    const keepAliveInterval = setInterval(() => {
      fetch(`${SOCKET_URL_FOR_PING}/ping`, { method: 'GET', cache: 'no-store' })
        .catch(() => {}); // fire-and-forget, never throw
    }, 4 * 60 * 1000); // every 4 minutes

    return () => {
      console.log("Cleaning up socket...");
      socketInstancePromise.then(s => s?.disconnect());
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(keepAliveInterval);
    };
  }, [session?.user?.email]); // Run when session loads

  // 2. Identify once when socket connects or session loads
  // Note: identify is already done inside the connect event handler above.
  // This effect is a safety net in case socket was already connected when session loaded.
  useEffect(() => {
    if (socket && socket.connected && session?.user?.email) {
      const email = session.user.email.toLowerCase().trim();
      const username = session.user.name || email.split('@')[0];
      socket.emit('identify', { email, userId: (session.user as any).id, username });
    }
  }, [session?.user?.email]); // Only re-run when session email changes, not on every socket state change

  const handleCall = async (type: 'audio' | 'video') => {
    if (!selectedUser || !session?.user || !socket) return;

    // *** FIX: If socket is disconnected (e.g. Render.com cold start), reconnect
    // before emitting call_user — otherwise the event drops silently.
    if (!socket.connected) {
      socket.connect();
      // Wait up to 3 seconds for reconnection
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 3000);
        socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      });
      if (!socket.connected) {
        console.warn('[Call] Socket still disconnected after reconnect attempt — aborting call');
        return;
      }
    }

    const targetEmail = selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined;
    const callId = `call-${Date.now()}`;

    const payload = {
      to: targetEmail,
      toUserId: selectedUser.id,
      from: session.user,
      type,
      callId
    };

    // Emit only once — server handles both event names via handleCallRequest
    socket.emit('call_user', payload);

    setActiveCall({ peer: { ...selectedUser, email: targetEmail }, type, isCaller: true, callId } as any);
  };

  const handleAcceptCall = () => {
    if (!incomingCall || !socket) return;

    const payload = {
      to: incomingCall.from.email?.toLowerCase().trim(),
      toUserId: incomingCall.from.id,
      from: session?.user,
      callId: incomingCall.callId
    };

    // Emit once — server handles both 'accept_call' and 'call_accept' via handleCallAccept
    socket.emit('accept_call', payload);

    setActiveCall({
      peer: incomingCall.from,
      type: incomingCall.type,
      isCaller: false,
      callId: incomingCall.callId,
      initialOffer: incomingCall.offer
    } as any);
    setIncomingCall(null);
  };

  const handleRejectCall = async () => {
    if (!incomingCall || !socket) return;

    const payload = {
      to: incomingCall.from.email?.toLowerCase().trim(),
      toUserId: incomingCall.from.id
    };

    // Emit once — server handles both 'reject_call' and 'call_decline' via handleCallDecline
    socket.emit('reject_call', payload);

    const result = await saveCall(incomingCall.from.id, incomingCall.type, 'rejected');
    if (result?.message) {
      socket.emit('send_social_message', {
        ...result.message,
        receiverEmail: incomingCall.from.email
      });
      if (selectedUser?.id === incomingCall.from.id) {
        setMessages(prev => [...prev, result.message as any]);
      }
    }
    setIncomingCall(null);
  };

  // *** FIX Bug 6: handleEndCall removed — engine.endCall() already emits 'end_call'. ***
  // Keeping a separate handleEndCall caused duplicate 'end_call' emissions to the peer.

  // Search or Load Recent
  useEffect(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    const q = rawQ.startsWith('@') ? rawQ.substring(1).trim() : rawQ;

    if (q.length >= 1) {
      // 1. Instant client-side filter from cached list (checking name, username, email, nickname, and last message)
      const matchesContact = (u: any) => {
        const nick = (nicknames[u.id] || '').toLowerCase();
        const name = (u.name || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const lastMsg = (u.lastMessage || '').toLowerCase();
        return name.includes(q) || username.includes(q) || email.includes(q) || nick.includes(q) || lastMsg.includes(q);
      };

      const filteredContacts = allContactsRef.current.filter(matchesContact);
      const filteredRequests = allRequestsRef.current.filter(matchesContact);

      setUsers(filteredContacts);
      setRequests(filteredRequests);

      // 2. Background server search (finds people globally not yet in recent chats)
      const delayDebounce = setTimeout(async () => {
        try {
          const results = await searchUsers(q);
          if (Array.isArray(results) && results.length > 0) {
            const existingIds = new Set(allContactsRef.current.map(c => c.id));
            const existingReqIds = new Set(allRequestsRef.current.map(r => r.id));

            const newPeople: User[] = [];
            results.forEach((u: any) => {
              if (u.id === (session?.user as any)?.id) return;
              if (!existingIds.has(u.id) && !existingReqIds.has(u.id)) {
                newPeople.push({
                  ...u,
                  lastMessage: u.bio || `@${u.username || 'user'}`,
                  unseenCount: 0,
                  isRequest: false
                });
              }
            });

            // Keep filtered contacts first, followed by new global people
            setUsers([...filteredContacts, ...newPeople]);
          }
        } catch (e) {
          console.error("Search users error:", e);
        }
      }, 300);

      return () => clearTimeout(delayDebounce);

    } else {
      // Restore full list from ref (no network call needed)
      if (allContactsRef.current.length > 0 || allRequestsRef.current.length > 0) {
        setUsers(allContactsRef.current);
        setRequests(allRequestsRef.current);
      } else {
        // First load — fetch coalesced from server
        fetchRecentChatsCoalesced().then(results => {
          const contacts: User[] = [];
          const reqs: User[] = [];
          const initialLastSeen: Record<string, string> = {};
          results.forEach((u: any) => {
            if (u.isRequest) reqs.push(u);
            else contacts.push(u);
            const timeVal = u.lastSeen ? (typeof u.lastSeen === 'string' ? u.lastSeen : new Date(u.lastSeen).toISOString()) : null;
            if (timeVal) {
              if (u.email) initialLastSeen[u.email.toLowerCase().trim()] = timeVal;
              if (u.id) initialLastSeen[u.id] = timeVal;
            }
          });
          if (Object.keys(initialLastSeen).length > 0) {
            setLastSeenMap(prev => ({ ...initialLastSeen, ...prev }));
          }
          allContactsRef.current = contacts;
          allRequestsRef.current = reqs.filter(r => !contacts.some(c => c.id === r.id));
          setUsers(allContactsRef.current);
          setRequests(allRequestsRef.current);
          setIsRecentLoading(false);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('social_contacts_cache', JSON.stringify(contacts));
            } catch (e) {}
          }
        }).catch(() => {
          setIsRecentLoading(false);
        });
      }
    }
  }, [searchQuery, nicknames]);

  // ── Instagram-style Activity Status Lifecycle ─────────────────────────────
  useEffect(() => {
    if (!session?.user?.email) return;

    const myEmail = session.user.email.toLowerCase().trim();
    const myId = (session.user as any)?.id;

    // Socket heartbeat every 20s (keeps WebSocket alive & updates presence on Render server with 0 Vercel requests)
    const heartbeatInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('heartbeat', { userId: myId, email: myEmail });
      }
    }, 20000);

    // Visibility: come back to foreground → emit socket heartbeat immediately
    const handleVisible = () => {
      if (document.visibilityState === 'visible' && socketRef.current?.connected) {
        socketRef.current.emit('heartbeat', { userId: myId, email: myEmail });
      }
    };

    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [session?.user?.email]);

  // Periodic ticker to recalculate relative timestamps dynamically
  const [, setTimeTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTicker(t => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Load messages
  useEffect(() => {
    let isCancelled = false;

    async function loadMessages() {
      if (!selectedUser) return;
      const targetUserId = selectedUser.id;
      setSelectedMessageIds(new Set());
      setHasMoreMessages(true);
      setIsLoadingOlder(false);

      const cached = messagesCache[targetUserId];
      const hasUnseen = !!(selectedUser.unseenCount && selectedUser.unseenCount > 0);
      if (cached && cached.length > 0) {
        const filteredCached = cached
          .filter(m => !deletedMessageIds.has(m.id))
          .filter(m => !m.content || !m.content.startsWith('blob:'));
        setMessages(filteredCached);
        const detectedCachedTheme = detectThemeIdFromMessages(filteredCached);
        if (detectedCachedTheme && selectedUser) {
          setChatThemes(prev => {
            if (prev[targetUserId] === detectedCachedTheme) return prev;
            const updated = {
              ...prev,
              [targetUserId]: detectedCachedTheme,
              ...(selectedUser.email ? { [selectedUser.email.toLowerCase().trim()]: detectedCachedTheme } : {}),
              ...(selectedUser.username ? { [selectedUser.username.toLowerCase().trim()]: detectedCachedTheme } : {})
            };
            if (typeof window !== 'undefined') {
              localStorage.setItem('chat_themes', JSON.stringify(updated));
            }
            return updated;
          });
        }
        setIsLoadingMessages(false);
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }

        // If we already have cached history and there are no unread messages,
        // and socket is connected, avoid downloading the exact same 30 messages again!
        if (!hasUnseen && socketRef.current?.connected) {
          return;
        }
      } else {
        setIsLoadingMessages(true);
        setMessages([]); // Clear while loading if no cache
      }

      setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, unseenCount: 0 } : u));

      try {
        const history = await getSocialMessages(targetUserId, 30);
        if (isCancelled || selectedUserRef.current?.id !== targetUserId) return;

        // Filter out messages the user deleted locally (persisted in localStorage)
        const deletedRef = deletedMessageIds;
        const fresh = (history as any[]).filter(m => !deletedRef.has(m.id)).map(normalizeMsg);

        if (fresh.length < 30) {
          setHasMoreMessages(false);
        } else {
          setHasMoreMessages(true);
        }

        const currentSenderId = (sessionRef.current?.user as any)?.id || '';
        const pendingMsgs = getPendingMessagesForUser(targetUserId, currentSenderId);
        const freshIds = new Set(fresh.map(m => m.id));
        const uncommittedPending = pendingMsgs.filter(p => !freshIds.has(p.id));

        const merged = [...fresh, ...uncommittedPending].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        setMessages(merged);
        setMessagesCache(prev => ({ ...prev, [targetUserId]: merged }));

        const detectedFreshTheme = detectThemeIdFromMessages(fresh);
        if (detectedFreshTheme && selectedUser) {
          setChatThemes(prev => {
            if (prev[targetUserId] === detectedFreshTheme) return prev;
            const updated = {
              ...prev,
              [targetUserId]: detectedFreshTheme,
              ...(selectedUser.email ? { [selectedUser.email.toLowerCase().trim()]: detectedFreshTheme } : {}),
              ...(selectedUser.username ? { [selectedUser.username.toLowerCase().trim()]: detectedFreshTheme } : {})
            };
            if (typeof window !== 'undefined') {
              localStorage.setItem('chat_themes', JSON.stringify(updated));
            }
            return updated;
          });
        }

        if (hasUnseen) {
          markMessagesAsSeen(targetUserId).catch(() => {});
          socket?.emit('mark_as_seen', {
            senderEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
            senderId: targetUserId
          });
        }

        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        });
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        if (!isCancelled && selectedUserRef.current?.id === targetUserId) {
          setIsLoadingMessages(false);
        }
      }
    }
    loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [selectedUser?.id]);

  // Load older historical messages on scroll up
  const loadOlderMessages = async () => {
    if (!selectedUser || isLoadingOlder || !hasMoreMessages || messages.length === 0) return;
    const firstMsg = messages[0];
    if (!firstMsg || !firstMsg.id) return;

    setIsLoadingOlder(true);
    const container = messagesContainerRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;

    try {
      const olderHistory = await getSocialMessages(selectedUser.id, 30, firstMsg.id);
      if (!olderHistory || olderHistory.length === 0) {
        setHasMoreMessages(false);
        setIsLoadingOlder(false);
        return;
      }
      if (olderHistory.length < 30) {
        setHasMoreMessages(false);
      }
      const deletedRef = deletedMessageIds;
      const olderFresh = (olderHistory as any[]).filter(m => !deletedRef.has(m.id)).map(normalizeMsg);

      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const uniqueOlder = olderFresh.filter(m => !existingIds.has(m.id));
        if (uniqueOlder.length === 0) return prev;
        return [...uniqueOlder, ...prev];
      });

      setMessagesCache(prev => {
        const currentCache = prev[selectedUser.id] || [];
        const existingIds = new Set(currentCache.map(m => m.id));
        const uniqueOlder = olderFresh.filter(m => !existingIds.has(m.id));
        return { ...prev, [selectedUser.id]: [...uniqueOlder, ...currentCache] };
      });

      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const prevScrollTopRef = useRef<number>(0);

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
    isNearBottomRef.current = distance <= 80;

    const isScrollingUp = target.scrollTop < prevScrollTopRef.current;
    prevScrollTopRef.current = target.scrollTop;

    // Only trigger loadOlderMessages when user actively scrolls UP near the very top (scrollTop <= 5)
    if (
      isScrollingUp &&
      target.scrollTop <= 5 &&
      target.scrollHeight > target.clientHeight + 150 &&
      distance > 150 &&
      hasMoreMessages &&
      !isLoadingOlder &&
      !isLoadingMessages
    ) {
      loadOlderMessages();
    }
  };

  // Auto scroll to bottom ONLY when a new message actually arrives or chat switches
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastMsgId = lastMsg?.id || null;
  const prevSelectedChatIdRef = useRef<string | null>(null);
  const prevLastMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedUser?.id || messages.length === 0 || isLoadingOlder) return;

    // Chat Switch -> immediately jump to bottom
    if (prevSelectedChatIdRef.current !== selectedUser.id) {
      prevSelectedChatIdRef.current = selectedUser.id;
      prevLastMsgIdRef.current = lastMsgId;
      isNearBottomRef.current = true;
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      return;
    }

    // New Message Arrived -> scroll down
    if (lastMsgId && lastMsgId !== prevLastMsgIdRef.current) {
      prevLastMsgIdRef.current = lastMsgId;
      const currentUserId = (session?.user as any)?.id;
      const isSentByMe = lastMsg && String(lastMsg.senderId) === String(currentUserId);

      if (isSentByMe || isNearBottomRef.current) {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }
    }
  }, [selectedUser?.id, lastMsgId]);

  const handleSendMessage = async (e?: React.FormEvent, explicitText?: string) => {
    e?.preventDefault();
    const textToSend = (explicitText !== undefined ? explicitText : inputValue).trim();
    if (!textToSend || !selectedUser || !session?.user) return;

    const currentContent = textToSend;
    const senderId = (session.user as any).id;
    setInputValue('');
    setShowAIMention(false);

    // Reset textarea element height to single line
    if (typeof document !== 'undefined') {
      const textareaEl = document.querySelector('.social-chat-container .type-box textarea') as HTMLTextAreaElement;
      if (textareaEl) textareaEl.style.height = 'auto';
    }

    // Un-hide user locally and update sidebar list
    if (selectedUser) {
      if (deletedChatIds.has(selectedUser.id)) {
        setDeletedChatIds(prev => {
          const next = new Set(prev);
          next.delete(selectedUser.id);
          if (typeof window !== 'undefined') {
            localStorage.setItem('social_deleted_chats', JSON.stringify(Array.from(next)));
          }
          return next;
        });
      }
      setUsers(prev => {
        const existing = prev.find(u => u.id === selectedUser.id);
        const updatedUser = {
          ...(existing || selectedUser),
          lastMessage: currentContent.length > 30 ? currentContent.substring(0, 30) + '...' : currentContent,
          unseenCount: 0
        };
        const filtered = prev.filter(u => u.id !== selectedUser.id);
        const nextList = [updatedUser, ...filtered];
        allContactsRef.current = nextList;
        return nextList;
      });
    }

    const currentReplyTo = replyToMessage ? {
      id: replyToMessage.id,
      content: replyToMessage.type === 'voice' ? '🎙️ Voice Clip' : replyToMessage.type === 'image' ? '📷 Photo' : replyToMessage.content,
      senderName: replyToMessage.senderId === senderId ? 'You' : selectedUser.name
    } : undefined;

    setReplyToMessage(null);

    if (currentContent.toLowerCase().startsWith('/ai ') || currentContent.toLowerCase().startsWith('@ai ')) {
      const prompt = currentContent.toLowerCase().startsWith('/ai ') ? currentContent.substring(4) : currentContent.substring(4);
      const userMsg: any = { id: 'ai-user-' + Date.now(), content: currentContent, senderId, createdAt: new Date(), type: 'text' };
      setMessages(prev => [...prev, userMsg]);

      const aiResponse = await askAI(prompt);
      const aiMsg: any = { id: 'ai-resp-' + Date.now(), content: aiResponse, senderId: 'ai', createdAt: new Date(), type: 'text' };
      setMessages(prev => [...prev, aiMsg]);
      return;
    }

    // Immediate Socket Emission & UI Update
    const stableId = (Math.random().toString(36) + Date.now().toString(36)).substring(2);
    const optimisticMsg: Message = {
      id: stableId,
      senderId: senderId,
      receiverId: selectedUser.id,
      content: currentContent,
      type: 'text',
      createdAt: new Date(),
      isSeen: false,
      replyTo: currentReplyTo,
      status: 'sending',
      ...(activeThemeId && activeThemeId !== 'default' ? { themeId: activeThemeId } : {})
    } as any;

    addToPendingQueue({
      tempId: stableId,
      receiverId: selectedUser.id,
      receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
      content: currentContent,
      type: 'text',
      createdAt: optimisticMsg.createdAt.toISOString(),
      replyTo: currentReplyTo,
      themeId: activeThemeId
    });

    setMessages(prev => [...prev, optimisticMsg]);
    setMessagesCache(prev => {
      const current = prev[selectedUser.id] || [];
      return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
    });

    if (socket) {
      socket.emit('send_social_message', {
        ...optimisticMsg,
        receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined
      });
    }

    try {
      // Background DB Save – pass replyTo so it's persisted in the database
      const savedMsg = await saveSocialMessage(selectedUser.id, currentContent, 'text', currentReplyTo ?? null);
      if (savedMsg) {
        removeFromPendingQueue(stableId);
        const normalized = normalizeMsg(savedMsg as any);
        setMessages(prev => prev.map(m => {
          if (m.id === stableId) {
            return {
              ...normalized,
              id: normalized.id || stableId,
              isSeen: m.isSeen || normalized.isSeen || false,
              status: undefined
            };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error("Failed to persist message:", err);
    }
  };

  const startRecording = async () => {
    isCancelingRecordingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (isCancelingRecordingRef.current) {
          isCancelingRecordingRef.current = false;
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        if (selectedUser && socket && session?.user) {
          const senderId = (session.user as any).id;
          const stableId = 'voice-' + Date.now() + Math.random().toString(36).substring(7);
          const localPreview = URL.createObjectURL(audioBlob);

          const optimisticMsg: any = {
            id: stableId,
            senderId: senderId,
            receiverId: selectedUser.id,
            content: localPreview,
            type: 'voice',
            createdAt: new Date(),
            isSeen: false,
            status: 'sending',
            uploadProgress: 0,
          };
          setMessages(prev => [...prev, optimisticMsg]);
          setMessagesCache(prev => {
            const current = prev[selectedUser.id] || [];
            return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
          });

          try {
            // 1. Get presigned ticket for direct upload
            const presignRes = await fetch('/api/chat/media/presign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                receiverId: selectedUser.id,
                messageId: stableId,
                filename: 'voice.webm',
                mimeType: 'audio/webm',
                hasThumbnail: false,
              }),
            });

            let finalAudioUrl = '';
            let storagePath = '';
            if (presignRes.ok) {
              const { ticket } = await presignRes.json();
              if (ticket?.uploadUrl) {
                await uploadBinaryWithProgress(
                  ticket.uploadUrl,
                  audioBlob,
                  'audio/webm',
                  (pct) => {
                    setMessages(prev => prev.map(m => m.id === stableId ? { ...m, uploadProgress: pct } : m));
                  }
                );
                finalAudioUrl = ticket.publicUrl;
                storagePath = ticket.storagePath;
              }
            }

            // If direct upload was not supported, use fallback
            if (!finalAudioUrl) {
              const formData = new FormData();
              formData.append('file', audioBlob, 'voice.webm');
              formData.append('receiverId', selectedUser.id);
              formData.append('type', 'voice');
              const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
              const resData = await res.json();
              if (resData?.success && resData?.message) {
                finalAudioUrl = resData.message.content;
                storagePath = resData.storagePath || '';
              }
            }

            if (!finalAudioUrl) throw new Error('Voice upload failed');

            // 2. Save message with metadata
            const savedMsg = await saveSocialMessage(
              selectedUser.id,
              finalAudioUrl,
              'voice',
              null,
              {
                mediaUrl: finalAudioUrl,
                mimeType: 'audio/webm',
                fileSize: audioBlob.size,
                storagePath,
              }
            );

            if (savedMsg) {
              setMessages(prev => prev.map(m => {
                if (m.id === stableId) {
                  return {
                    ...(savedMsg as any),
                    id: (savedMsg as any).id || stableId,
                    isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                    status: 'sent'
                  };
                }
                return m;
              }));

              setMessagesCache(prev => {
                const current = prev[selectedUser.id] || [];
                return {
                  ...prev,
                  [selectedUser.id]: current.map(m => m.id === stableId ? {
                    ...(savedMsg as any),
                    id: (savedMsg as any).id || stableId,
                    isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                    status: 'sent'
                  } : m)
                };
              });

              // Emit clean URL over Socket.io — ZERO base64!
              socket.emit('send_social_message', {
                ...(savedMsg as any),
                id: (savedMsg as any).id || stableId,
                receiverId: selectedUser.id,
                receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
                ...(activeThemeId && activeThemeId !== 'default' ? { themeId: activeThemeId } : {})
              });
            }
          } catch (err) {
            console.error('Failed to upload voice message:', err);
            setMessages(prev => prev.map(m => m.id === stableId ? { ...m, status: 'error' } : m));
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    isCancelingRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    triggerHaptic('warning');
    isCancelingRecordingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const startVoiceToText = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInputValue(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsVoiceToText(false);
      };

      recognition.onend = () => {
        setIsVoiceToText(false);
      };

      recognition.start();
      voiceToTextRef.current = recognition;
      setIsVoiceToText(true);
    } catch (e) {
      console.error("Voice-to-text error", e);
    }
  };

  const stopVoiceToText = () => {
    if (voiceToTextRef.current) {
      voiceToTextRef.current.onend = null;
      try { voiceToTextRef.current.stop(); } catch (e) { }
      voiceToTextRef.current = null;
    }
    setIsVoiceToText(false);
  };

  const uploadMediaItemDirect = async (
    rawFile: File,
    stableId: string,
    onProgress?: (pct: number) => void
  ) => {
    if (!selectedUser) {
      throw new Error("No chat selected");
    }
    const currentSelectedUser = selectedUser;

    // 1. Validate
    const validation = validateMediaFile(rawFile);
    if (!validation.isValid) {
      throw new Error(validation.error || 'File validation failed');
    }

    const isImage = rawFile.type.startsWith('image/');
    const isVideo = rawFile.type.startsWith('video/');
    const isAudio = rawFile.type.startsWith('audio/');
    const msgType = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'voice' : 'file';

    // 2. Client-side optimization & thumbnail generation
    let optimizedFile: File | Blob = rawFile;
    let thumbnailBlob: Blob | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let mimeType = rawFile.type;

    if (isImage) {
      const imgOpt = await optimizeImageClient(rawFile);
      optimizedFile = imgOpt.file;
      thumbnailBlob = imgOpt.thumbnailBlob;
      width = imgOpt.width;
      height = imgOpt.height;
      mimeType = imgOpt.mimeType;
    } else if (isVideo) {
      const vidOpt = await extractVideoMetadataAndThumbnail(rawFile);
      optimizedFile = vidOpt.file;
      thumbnailBlob = vidOpt.thumbnailBlob;
      width = vidOpt.width;
      height = vidOpt.height;
      duration = vidOpt.duration;
      mimeType = vidOpt.mimeType;
    }

    // 3. Request presigned upload authorization ticket
    const presignRes = await fetch('/api/chat/media/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverId: currentSelectedUser.id,
        messageId: stableId,
        filename: rawFile.name,
        mimeType,
        hasThumbnail: !!thumbnailBlob,
      }),
    });

    let mediaUrl = '';
    let thumbnailUrl = '';
    let storagePath = '';

    if (presignRes.ok) {
      const presignData = await presignRes.json();
      const ticket = presignData.ticket;
      if (ticket?.uploadUrl) {
        // Direct upload to Supabase Storage
        await uploadBinaryWithProgress(ticket.uploadUrl, optimizedFile, mimeType, onProgress);
        if (thumbnailBlob && ticket.thumbnailUploadUrl) {
          await uploadBinaryWithProgress(ticket.thumbnailUploadUrl, thumbnailBlob, 'image/jpeg');
        }
        mediaUrl = ticket.publicUrl;
        thumbnailUrl = ticket.thumbnailUrl || ticket.publicUrl;
        storagePath = ticket.storagePath;
      }
    }

    // Fallback: multipart upload
    if (!mediaUrl) {
      const formData = new FormData();
      formData.append('file', optimizedFile);
      formData.append('receiverId', currentSelectedUser.id);
      formData.append('type', msgType);

      const upRes = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      });

      if (!upRes.ok) {
        throw new Error(`Upload error status: ${upRes.status}`);
      }

      const upData = await upRes.json();
      if (upData?.success && upData?.message) {
        return {
          message: upData.message,
          mediaUrl: upData.message.content,
          thumbnailUrl: upData.message.content,
          type: msgType,
          width,
          height,
          duration,
        };
      }
      throw new Error('Upload failed');
    }

    // Finalize database record with metadata
    const saveRes = await fetch('/api/chat/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverId: currentSelectedUser.id,
        mediaUrl,
        thumbnailUrl,
        type: msgType,
        mimeType,
        fileSize: optimizedFile.size,
        width,
        height,
        duration,
        storagePath,
        replyTo: replyToMessage ? {
          id: replyToMessage.id,
          content: replyToMessage.content,
          senderName: replyToMessage.senderId === (session?.user as any)?.id ? 'You' : (currentSelectedUser.name || currentSelectedUser.username)
        } : undefined
      }),
    });

    const saveData = await saveRes.json();
    return {
      message: saveData.message,
      mediaUrl,
      thumbnailUrl,
      type: msgType,
      width,
      height,
      duration,
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files ? Array.from(e.target.files) : [];
    if (rawFiles.length === 0 || !selectedUser || !socket || !session?.user) return;

    // Reset input so selecting the same file twice triggers change event
    e.target.value = '';

    const senderId = (session.user as any).id;
    const stableId = 'file-' + Date.now() + Math.random().toString(36).substring(7);

    if (rawFiles.length === 1) {
      const rawFile = rawFiles[0];
      const type = rawFile.type.startsWith('image/') ? 'image' : rawFile.type.startsWith('video/') ? 'video' : rawFile.type.startsWith('audio/') ? 'voice' : 'file';
      const localPreview = URL.createObjectURL(rawFile);

      const optimisticMsg: any = {
        id: stableId,
        senderId: senderId,
        receiverId: selectedUser.id,
        content: localPreview,
        type: type,
        createdAt: new Date(),
        isSeen: false,
        status: 'sending',
        uploadProgress: 0,
        _rawFile: rawFile,
      };

      setMessages(prev => [...prev, optimisticMsg]);
      setMessagesCache(prev => {
        const current = prev[selectedUser.id] || [];
        return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
      });

      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }

      try {
        const result = await uploadMediaItemDirect(rawFile, stableId, (pct) => {
          setMessages(prev => prev.map(m => m.id === stableId ? { ...m, uploadProgress: pct } : m));
        });

        if (result?.message) {
          const savedMsg = result.message;
          setMessages(prev => prev.map(m => {
            if (m.id === stableId) {
              return {
                ...(savedMsg as any),
                id: (savedMsg as any).id || stableId,
                thumbnailUrl: result.thumbnailUrl,
                width: result.width,
                height: result.height,
                duration: result.duration,
                isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                status: 'sent',
                uploadProgress: 100,
              };
            }
            return m;
          }));

          setMessagesCache(prev => {
            const current = prev[selectedUser.id] || [];
            const updated = current.map(m => {
              if (m.id === stableId) {
                return {
                  ...(savedMsg as any),
                  id: (savedMsg as any).id || stableId,
                  thumbnailUrl: result.thumbnailUrl,
                  width: result.width,
                  height: result.height,
                  duration: result.duration,
                  isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                  status: 'sent'
                };
              }
              return m;
            });
            const nextCache = { ...prev, [selectedUser.id]: updated };
            if (typeof window !== 'undefined') {
              localStorage.setItem('social_messages_cache', JSON.stringify(nextCache));
            }
            return nextCache;
          });

          // Emit real-time message with saved permanent file URL
          socket.emit('send_social_message', {
            ...(savedMsg as any),
            id: (savedMsg as any).id || stableId,
            thumbnailUrl: result.thumbnailUrl,
            width: result.width,
            height: result.height,
            duration: result.duration,
            receiverId: selectedUser.id,
            receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
            ...(activeThemeId && activeThemeId !== 'default' ? { themeId: activeThemeId } : {})
          });
        }
      } catch (err) {
        console.error("Failed to upload media file:", err);
        setMessages(prev => prev.map(m => m.id === stableId ? { ...m, status: 'error' } : m));
      }
    } else {
      // Multi-file batch
      const localItems = rawFiles.map(f => ({
        url: URL.createObjectURL(f),
        type: f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file',
        name: f.name
      }));

      const optimisticMsg: any = {
        id: stableId,
        senderId: senderId,
        receiverId: selectedUser.id,
        content: JSON.stringify(localItems),
        type: 'media_album',
        createdAt: new Date(),
        isSeen: false,
        status: 'sending',
        uploadProgress: 0,
        _rawFiles: rawFiles,
      };

      setMessages(prev => [...prev, optimisticMsg]);
      setMessagesCache(prev => {
        const current = prev[selectedUser.id] || [];
        return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
      });

      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }

      try {
        let completed = 0;
        const uploadedItems = await Promise.all(
          rawFiles.map(async (f) => {
            const subId = 'sub-' + Date.now() + Math.random().toString(36).substring(7);
            const itemRes = await uploadMediaItemDirect(f, subId);
            completed++;
            const pct = Math.round((completed / rawFiles.length) * 100);
            setMessages(prev => prev.map(m => m.id === stableId ? { ...m, uploadProgress: pct } : m));
            return {
              url: itemRes.mediaUrl,
              thumbnailUrl: itemRes.thumbnailUrl,
              type: itemRes.type,
              name: f.name || "media",
            };
          })
        );

        const albumRes = await fetch('/api/chat/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiverId: selectedUser.id,
            mediaUrl: JSON.stringify(uploadedItems),
            type: 'media_album',
          }),
        });

        const albumData = await albumRes.json();
        if (albumData?.success && albumData?.message) {
          const savedMsg = albumData.message;
          setMessages(prev => prev.map(m => {
            if (m.id === stableId) {
              return {
                ...(savedMsg as any),
                id: (savedMsg as any).id || stableId,
                isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                status: 'sent',
                uploadProgress: 100,
              };
            }
            return m;
          }));

          setMessagesCache(prev => {
            const current = prev[selectedUser.id] || [];
            const updated = current.map(m => {
              if (m.id === stableId) {
                return {
                  ...(savedMsg as any),
                  id: (savedMsg as any).id || stableId,
                  isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                  status: 'sent'
                };
              }
              return m;
            });
            const nextCache = { ...prev, [selectedUser.id]: updated };
            if (typeof window !== 'undefined') {
              localStorage.setItem('social_messages_cache', JSON.stringify(nextCache));
            }
            return nextCache;
          });

          // Update sharedMedia Pics & Videos
          setSharedMedia(prev => {
            const newPicsAndVideos = [...prev.picsAndVideos];
            const newFiles = [...prev.files];
            uploadedItems.forEach((it: any, idx: number) => {
              if (it.type === 'video' || it.type === 'image') {
                newPicsAndVideos.unshift({ id: `${savedMsg.id}-${idx}`, content: it.url, type: it.type, createdAt: savedMsg.createdAt, senderId });
              } else {
                newFiles.unshift({ id: `${savedMsg.id}-${idx}`, content: it.url, type: it.type, createdAt: savedMsg.createdAt, senderId });
              }
            });
            return { picsAndVideos: newPicsAndVideos, files: newFiles };
          });

          socket.emit('send_social_message', {
            ...(savedMsg as any),
            id: (savedMsg as any).id || stableId,
            receiverId: selectedUser.id,
            receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
            ...(activeThemeId && activeThemeId !== 'default' ? { themeId: activeThemeId } : {})
          });
        }
      } catch (err) {
        console.error("Failed to upload media batch:", err);
        setMessages(prev => prev.map(m => m.id === stableId ? { ...m, status: 'error' } : m));
      }
    }
  };

  const handleRetryUpload = async (failedMsg: any) => {
    if (!failedMsg || !selectedUser) return;
    if (failedMsg._rawFile) {
      setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'sending', uploadProgress: 0 } : m));
      try {
        const result = await uploadMediaItemDirect(failedMsg._rawFile, failedMsg.id, (pct) => {
          setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, uploadProgress: pct } : m));
        });
        if (result?.message) {
          const savedMsg = result.message;
          setMessages(prev => prev.map(m => m.id === failedMsg.id ? {
            ...(savedMsg as any),
            id: (savedMsg as any).id || failedMsg.id,
            thumbnailUrl: result.thumbnailUrl,
            status: 'sent',
            uploadProgress: 100
          } : m));
          socket?.emit('send_social_message', {
            ...(savedMsg as any),
            id: (savedMsg as any).id || failedMsg.id,
            receiverId: selectedUser.id,
            receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
          });
        }
      } catch (err) {
        setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'error' } : m));
      }
    }
  };

  const handleDelete = async (msgId: string, type: 'me' | 'everyone') => {
    // Confirmation is now handled in the child MessageItem component before this is called
    await deleteSocialMessage(msgId, type);
    if (type === 'everyone') {
      socket?.emit('delete_social_message', { messageId: msgId, receiverEmail: selectedUser?.email });
      setMessages(prev => prev.map(m => {
        if (m.id === msgId) return { ...m, content: "This message was deleted", type: "deleted" };
        return m;
      }));
      // Persist to cache
      if (selectedUser) {
        setMessagesCache(prev => ({
          ...prev,
          [selectedUser.id]: (prev[selectedUser.id] || []).map(m =>
            m.id === msgId ? { ...m, content: "This message was deleted", type: "deleted" } : m
          )
        }));
      }
    } else {
      // Local delete — persist the ID so it doesn't reappear on refresh
      setDeletedMessageIds(prev => new Set(prev).add(msgId));
      setMessages(prev => prev.filter(m => m.id !== msgId));
      // Remove from cache too
      if (selectedUser) {
        setMessagesCache(prev => ({
          ...prev,
          [selectedUser.id]: (prev[selectedUser.id] || []).filter(m => m.id !== msgId)
        }));
      }
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    const myId = (session?.user as any)?.id || (session?.user as any)?.email;

    // Local optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        const existingReactions = m.reactions || [];
        const userHasReacted = existingReactions.find((r: any) => String(r.userId) === String(myId) && r.emoji === emoji);
        let newReactions;
        if (userHasReacted) {
          // Remove reaction
          newReactions = existingReactions.filter((r: any) => !(String(r.userId) === String(myId) && r.emoji === emoji));
        } else {
          // Add reaction
          newReactions = [...existingReactions, { emoji, userId: myId }];
        }
        return { ...m, reactions: newReactions };
      }
      return m;
    }));
    socket?.emit('react_social_message', { messageId: msgId, emoji, userId: myId, receiverEmail: selectedUser?.email, receiverId: selectedUser?.id });
    await reactToSocialMessage(msgId, emoji);
  };

  const handleAcceptRequest = async () => {
    if (!selectedUser || !socket || !session?.user) return;

    // 1. Move from requests → contacts immediately in local state
    const acceptedUser = { ...selectedUser, unseenCount: 0, isRequest: false };
    setUsers(prev => {
      const next = [...prev, acceptedUser];
      allContactsRef.current = next;
      return next;
    });
    setRequests(prev => {
      const next = prev.filter(u => u.id !== selectedUser.id);
      allRequestsRef.current = next;
      return next;
    });
    setView('recent');

    // 2. Persist to DB: save a silent handshake message so getRecentChats
    //    will find this in contactIdsSet on next refresh and keep them in Chats.
    try {
      const saved = await saveSocialMessage(selectedUser.id, '👋', 'accepted');
      if (saved && socket) {
        // Optionally notify the other person
        socket.emit('send_social_message', {
          receiverEmail: selectedUser.email,
          ...saved,
          type: 'accepted'
        });
      }
    } catch (err) {
      console.error('Failed to persist request acceptance:', err);
    }
  };

  const initiateCall = (type: 'audio' | 'video') => {
    if (!selectedUser) return;
    const url = `/call?id=${selectedUser.id}&type=${type}`;
    window.open(url, '_blank', 'width=1000,height=800');
  };

  const currentFontFamily = FONT_OPTIONS.find(f => f.id === activeFont)?.family || 'inherit';

  return (
    <>
      <div className="social-chat-container" style={{ display: isActive ? 'flex' : 'none', width: '100%', height: '100%', fontFamily: currentFontFamily }}>
        <div className="main-wrap">
          <aside className={`sidebar ${selectedUser ? 'hide-on-mobile' : 'show-on-mobile'} !bg-[#141111] flex flex-col h-full overflow-hidden border-r border-zinc-800/80 select-none`}>
            
            {/* Hidden Story Upload Input */}
            <input 
              type="file" 
              ref={storyInputRef} 
              accept="image/*,video/*" 
              className="hidden" 
              onChange={handleStoryUpload} 
            />

            {/* 1. Header Layout (Strict 2-Row Dark Section with smooth search collapse) */}
            <div className={`w-full bg-[#141111] px-6 transition-all duration-300 ease-out select-none flex-shrink-0 ${
              isSearchFocused ? 'max-h-0 opacity-0 pt-0 pb-0 overflow-hidden pointer-events-none' : 'pt-14 pb-4 max-h-[300px] opacity-100 flex flex-col gap-6'
            }`}>
              
              {/* Row 1 (App Header) */}
              <div className="flex justify-between items-center w-full">
                {/* Left Column: Greeting & Brand */}
                <div className="flex flex-col">
                  <span className="text-[13px] text-zinc-400 font-medium">
                    Welcome {session?.user?.name ? session.user.name.split(' ')[0] : 'Oji'} 👋
                  </span>
                  <h1 className="text-[26px] font-bold text-white tracking-tight leading-tight">
                    Connect
                  </h1>
                </div>

                {/* Right: ONLY the Notification Bell button */}
                <div className="relative">
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setShowNotificationsDrawer(prev => !prev);
                    }}
                    className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center relative cursor-pointer active:scale-95 transition-all shadow-xs hover:bg-zinc-800"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5 text-white" strokeWidth={2} />
                    {unreadNotifications > 0 && (
                      <span className="w-2.5 h-2.5 bg-[#9D4EDD] rounded-full absolute top-2 right-2 ring-2 ring-[#141111]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Row 2 (Story Section Title) */}
              <div className="flex justify-between items-center w-full mt-2">
                <span className="text-[18px] font-bold text-white tracking-tight">Story</span>
                <span 
                  onClick={() => triggerHaptic('light')}
                  className="text-[13px] text-zinc-400 cursor-pointer hover:text-white transition-colors font-medium"
                >
                  See All
                </span>
              </div>

              {/* 2. Story Carousel (Clean, no demo mock stories) */}
              <div className="flex flex-row items-start gap-4 overflow-x-auto pt-1 pb-3 no-scrollbar w-full">
                {/* Item 1 (Add Story Button - Functional) */}
                <div
                  onClick={() => {
                    triggerHaptic('light');
                    storyInputRef.current?.click();
                  }}
                  className="flex flex-col items-center gap-2 shrink-0 cursor-pointer group"
                >
                  <div className="w-[64px] h-[64px] rounded-full border-2 border-dashed border-zinc-700 bg-zinc-900/80 flex items-center justify-center transition-all group-hover:border-zinc-500 active:scale-95">
                    <Plus className="w-6 h-6 text-zinc-300" strokeWidth={2.2} />
                  </div>
                  <span className="text-[12px] text-zinc-400 group-hover:text-white transition-colors font-medium">
                    Add Story
                  </span>
                </div>

                {/* Active User Uploaded Story (If any) */}
                {userStory && (
                  <div
                    onClick={() => {
                      triggerHaptic('light');
                      setViewStory({
                        name: 'Your Story',
                        media: userStory.media,
                        time: userStory.time,
                        isMe: true,
                        avatar: session?.user?.image || undefined
                      });
                    }}
                    className="flex flex-col items-center gap-2 shrink-0 cursor-pointer group"
                  >
                    <div className="w-[64px] h-[64px] rounded-full ring-2 ring-[#9D4EDD] ring-offset-2 ring-offset-[#141111] overflow-hidden flex items-center justify-center bg-[#FFF3CD] shadow-sm active:scale-95 transition-all">
                      {session?.user?.image ? (
                        <img src={session.user.image} alt="You" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-2xl">👨🏻</span>
                      )}
                    </div>
                    <span className="text-[12px] text-zinc-300 font-medium group-hover:text-white transition-colors">
                      Your Story
                    </span>
                  </div>
                )}
              </div>

              {/* Notification Modal Drawer */}
              {showNotificationsDrawer && (
                <div className="absolute top-28 right-4 left-4 z-50 bg-[#181515] border border-zinc-800/90 rounded-3xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-top-3 duration-200 text-white backdrop-blur-xl">
                  {/* Drawer Header */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-[#9D4EDD]/15 text-[#9D4EDD] flex items-center justify-center text-sm font-bold">
                        <Bell className="w-4 h-4 text-[#9D4EDD]" strokeWidth={2.2} />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-bold text-white leading-tight">Notifications</h3>
                        <span className="text-[11px] text-zinc-400 font-medium">
                          {unreadNotifications > 0 ? `${unreadNotifications} unread alerts` : 'All caught up'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {notificationsList.length > 0 && (
                        <button 
                          onClick={() => {
                            setNotificationsList([]);
                            setUnreadNotifications(0);
                          }}
                          className="text-[11px] text-[#D8B4E2] hover:text-white font-semibold cursor-pointer transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                        >
                          Clear All
                        </button>
                      )}
                      <button
                        onClick={() => setShowNotificationsDrawer(false)}
                        className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Notifications List (Clean minimal text, no svgs, no emojis) */}
                  <div className="py-2.5 space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                    {notificationsList.length === 0 ? (
                      <div className="py-8 flex flex-col items-center justify-center text-center">
                        <p className="text-xs text-zinc-400 font-medium">No new notifications</p>
                      </div>
                    ) : (
                      notificationsList.map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setNotificationsList(prev => prev.map(n => n.id === item.id ? { ...n, unread: false } : n));
                            setUnreadNotifications(prev => Math.max(0, prev - 1));
                          }}
                          className={`p-3 rounded-2xl transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                            item.unread ? 'bg-zinc-900 border border-zinc-800 text-white' : 'bg-zinc-900/50 text-zinc-400 opacity-80'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-[13px] font-semibold text-zinc-100 truncate">{item.title}</h4>
                              <span className="text-[10px] text-zinc-500 font-medium shrink-0">{item.time}</span>
                            </div>
                            <p className="text-[12px] text-zinc-400 mt-0.5 line-clamp-1">{item.desc}</p>
                          </div>
                          {item.unread && (
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Light Bottom Sheet (Chat List & People Search with smooth upward expansion) */}
            <div className={`w-full flex-1 bg-white relative overflow-hidden min-h-0 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] transition-all duration-300 ease-out flex flex-col ${
              isSearchFocused ? 'rounded-t-none sm:rounded-t-[32px] px-3.5 sm:px-4 pt-12 sm:pt-4 pb-12' : 'rounded-t-[32px] px-3.5 sm:px-4 pt-3 pb-28'
            }`}>
              {/* Drag Handle (Hidden in search mode) */}
              {!isSearchFocused && (
                <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto my-1.5 shrink-0" />
              )}

              {/* Header Row */}
              {!isSearchFocused && (
                <div className="flex justify-between items-center mt-3 mb-3 px-1 shrink-0">
                  <h2 className="text-[22px] font-bold text-black tracking-tight">
                    {isArchivedView ? 'Archived Chats' : (searchQuery.trim() ? 'Search Results' : 'Recent Chat')}
                  </h2>

                  {/* Archive Button */}
                  <button 
                    onClick={() => {
                      triggerHaptic('light');
                      setIsArchivedView(prev => !prev);
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer ${
                      isArchivedView
                        ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        : 'bg-[#FFF3CD] text-black hover:bg-[#ffeaa7]'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>{isArchivedView ? 'Inbox' : 'Archive'}</span>
                  </button>
                </div>
              )}

              {/* Top Long-Press Action Bar (Pin, Archive, Delete) */}
              {selectedChatForOptions && (
                <div className="mb-2.5 p-2.5 rounded-2xl bg-[#141111] text-white border border-zinc-800 flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 shrink-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1 pl-1">
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedChatForOptions(null);
                      }}
                      className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      title="Deselect"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="truncate min-w-0">
                      <span className="text-[13px] font-bold text-white truncate block">
                        {nicknames[selectedChatForOptions.id] || selectedChatForOptions.name}
                      </span>
                    </div>
                  </div>

                  {/* 3 Action Buttons: Pin, Archive, Delete */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* 1. Pin / Unpin */}
                    <button
                      onClick={() => {
                        triggerHaptic('medium');
                        const targetId = selectedChatForOptions.id;
                        const isCurrentlyPinned = pinnedChats.has(targetId);
                        setPinnedChats(prev => {
                          const next = new Set(prev);
                          if (isCurrentlyPinned) {
                            next.delete(targetId);
                          } else {
                            next.add(targetId);
                          }
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('social_pinned_chats', JSON.stringify(Array.from(next)));
                          }
                          return next;
                        });
                        setSelectedChatForOptions(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        pinnedChats.has(selectedChatForOptions.id)
                          ? 'bg-[#9D4EDD] text-white'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      }`}
                      title={pinnedChats.has(selectedChatForOptions.id) ? 'Unpin Chat' : 'Pin to Top'}
                    >
                      <Pin className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>{pinnedChats.has(selectedChatForOptions.id) ? 'Unpin' : 'Pin'}</span>
                    </button>

                    {/* 2. Archive / Unarchive */}
                    <button
                      onClick={() => {
                        triggerHaptic('medium');
                        const targetId = selectedChatForOptions.id;
                        const isCurrentlyArchived = archivedChatIds.has(targetId);
                        setArchivedChatIds(prev => {
                          const next = new Set(prev);
                          if (isCurrentlyArchived) {
                            next.delete(targetId);
                          } else {
                            next.add(targetId);
                          }
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('social_archived_chats', JSON.stringify(Array.from(next)));
                          }
                          return next;
                        });
                        setSelectedChatForOptions(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        archivedChatIds.has(selectedChatForOptions.id)
                          ? 'bg-[#FFF3CD] text-zinc-900'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      }`}
                      title={archivedChatIds.has(selectedChatForOptions.id) ? 'Move to Inbox' : 'Archive Chat'}
                    >
                      <Archive className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>{archivedChatIds.has(selectedChatForOptions.id) ? 'Unarchive' : 'Archive'}</span>
                    </button>

                    {/* 3. Delete */}
                    <button
                      onClick={async () => {
                        triggerHaptic('heavy');
                        const targetId = selectedChatForOptions.id;
                        setDeletedChatIds(prev => {
                          const next = new Set(prev).add(targetId);
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('social_deleted_chats', JSON.stringify(Array.from(next)));
                          }
                          return next;
                        });
                        setUsers(prev => prev.filter(u => u.id !== targetId));
                        setRequests(prev => prev.filter(u => u.id !== targetId));
                        allContactsRef.current = allContactsRef.current.filter(u => u.id !== targetId);
                        try {
                          await hideSocialChat(targetId);
                        } catch (err) {
                          console.warn('Failed to hide chat on server:', err);
                        }
                        setSelectedChatForOptions(null);
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-all cursor-pointer active:scale-95"
                      title="Delete Chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Search - Cute, All-Round, Animated with Back Arrow on focus */}
              <div className="pt-1 pb-3 px-1 flex-shrink-0">
                <div className="flex items-center gap-2">
                  {isSearchFocused && (
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setSearchQuery('');
                        setIsSearchFocused(false);
                      }}
                      className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center cursor-pointer active:scale-95 transition-all shrink-0 shadow-2xs"
                      title="Back to conversation list"
                    >
                      <ChevronLeft className="w-5 h-5 text-zinc-800" strokeWidth={2.2} />
                    </button>
                  )}
                  <div className="flex-1 flex items-center gap-2.5 px-4.5 py-2.5 rounded-full bg-zinc-100/90 border border-zinc-200/50 text-zinc-800 transition-all">
                    <Search className="w-[18px] h-[18px] text-zinc-400 flex-shrink-0" strokeWidth={2} />
                    <input 
                      type="text" 
                      placeholder="Search people, conversations..." 
                      value={searchQuery}
                      onFocus={() => setIsSearchFocused(true)}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-[13.5px] text-zinc-900 placeholder:text-zinc-400 outline-none font-medium"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer p-1">✕</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat & People List Feed */}
              <div className="flex flex-col gap-1 overflow-y-auto flex-1 pr-0.5 no-scrollbar">
                {(() => {
                  const baseList = view === 'recent' ? users : requests;
                  const q = searchQuery.toLowerCase().trim();

                  let filtered = baseList
                    .filter(u => isArchivedView ? archivedChatIds.has(u.id) : (!archivedChatIds.has(u.id) && !deletedChatIds.has(u.id)))
                    .filter(u => {
                      if (!q) return true;
                      return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
                    })
                    .sort((a, b) => {
                      const ap = pinnedChats.has(a.id) ? 0 : 1;
                      const bp = pinnedChats.has(b.id) ? 0 : 1;
                      return ap - bp;
                    });

                  // If user is searching, merge global registered users seamlessly
                  if (q && globalSearchResults.length > 0) {
                    const existingIds = new Set(filtered.map(u => u.id));
                    const newGlobal = globalSearchResults.filter(u => !existingIds.has(u.id));
                    filtered = [...filtered, ...newGlobal];
                  }

                  if (isRecentLoading && filtered.length === 0) {
                    return (
                      <div className="flex flex-col gap-3.5 pt-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div key={i} className="flex items-center gap-3.5 p-2 rounded-2xl animate-pulse">
                            <div className="w-14 h-14 rounded-full bg-zinc-200 flex-shrink-0" />
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="w-28 h-4 bg-zinc-200 rounded" />
                                <div className="w-10 h-3 bg-zinc-200 rounded" />
                              </div>
                              <div className="w-40 h-3 bg-zinc-100 rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <p className="text-sm font-bold text-zinc-800">
                          {isSearchingGlobal ? 'Searching users...' : (q ? `No people found for "${searchQuery}"` : (isArchivedView ? 'No archived chats' : 'No conversations yet'))}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {q ? 'Try searching by a different name or username' : 'Search to connect with anyone on Connect'}
                        </p>
                      </div>
                    );
                  }

                  return filtered.map((user, idx) => {
                    const userEmail = (user.email || '').toLowerCase().trim();
                    const showActivity = (user as any).showActivityStatus !== false;
                    const isOnline = showActivity && ((userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(user.id));
                    const isPinned = pinnedChats.has(user.id);
                    const lastSeenVal = (userEmail && lastSeenMap[userEmail]) || lastSeenMap[user.id] || (user as any).lastSeen || (user as any).lastHeartbeat;

                    return (
                      <ChatItem
                        key={user.id}
                        user={user}
                        index={idx}
                        isSelected={selectedUser?.id === user.id}
                        isOnline={isOnline}
                        showActivity={showActivity}
                        isPinned={isPinned}
                        lastSeenVal={lastSeenVal}
                        nickname={nicknames[user.id]}
                        onSelect={handleSelectUser}
                        onLongPress={setSelectedChatForOptions}
                      />
                    );
                  });
                })()}
              </div>
            </div>
          </aside>

          <section
            className={`chat-area ${selectedUser ? 'active ig-chat-enter' : ''} ${selectedUser ? 'show-on-mobile' : 'hide-on-mobile'} !bg-[#141111] flex flex-col h-full overflow-hidden relative`}
          >
            {selectedUser ? (
              <div className="flex flex-col h-full w-full overflow-hidden bg-[#141111] relative">
                
                {/* ── SCREEN 1: DARK HEADER (Top Bar) ── */}
                <div className="w-full bg-[#141111] pt-14 pb-7 px-5 flex items-center justify-between shrink-0 select-none z-20">
                  {/* Left: Back Button + Contact Information */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Back Action (ChevronLeft) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleChatBack(e); }}
                      className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all flex-shrink-0"
                      title="Back to conversation list"
                    >
                      <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.2} />
                    </button>

                    {/* User Identifier (Touch Target -> Screen 2) */}
                    <div
                      onClick={() => {
                        if (selectedUser) {
                          setNicknameInput(nicknames[selectedUser.id] || '');
                          setShowChatDetails(true);
                        }
                      }}
                      className="flex items-center gap-3 flex-1 ml-1 cursor-pointer min-w-0"
                      title="View Profile & Chat Details"
                    >
                      {/* Avatar with deterministic matching token */}
                      {(() => {
                        const pastel = getPastelForUser(selectedUser.id || selectedUser.username || selectedUser.name);
                        return (
                          <div 
                            className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0 overflow-hidden relative border border-zinc-800 font-bold shadow-xs"
                            style={{ background: pastel.bg, color: pastel.text }}
                          >
                            {selectedUser.image && selectedUser.image.length > 5 ? (
                              <img src={selectedUser.image} alt={selectedUser.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                            ) : (
                              <span>{pastel.emoji}</span>
                            )}
                            {(() => {
                              const userEmail = (selectedUser.email || '').toLowerCase().trim();
                              const isOnline = (userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(selectedUser.id);
                              return isOnline ? (
                                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-[#141111] absolute bottom-0 right-0" />
                              ) : null;
                            })()}
                          </div>
                        );
                      })()}

                      {/* Contact Name & Presence */}
                      <div className="flex flex-col min-w-0">
                        <h3 className="text-[16px] font-bold text-white truncate leading-tight">
                          {nicknames[selectedUser.id] || selectedUser.name}
                        </h3>
                        <span className="text-[12px] text-zinc-400 mt-0.5 truncate font-medium">
                          {(() => {
                            const userEmail = (selectedUser.email || '').toLowerCase().trim();
                            const isOnline = (userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(selectedUser.id);
                            if (isOnline) return 'Online';
                            const lastSeenVal = (userEmail && lastSeenMap[userEmail]) || lastSeenMap[selectedUser.id] || (selectedUser as any).lastSeen || (selectedUser as any).lastHeartbeat;
                            const ago = formatLastSeenAgo(lastSeenVal);
                            return ago ? `Active ${ago}` : 'Offline';
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Options & Call Controls */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCall('audio'); }}
                      className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700/50 hover:bg-zinc-700/80 active:scale-95 text-white flex items-center justify-center cursor-pointer transition-all shadow-xs"
                      title="Voice Call"
                    >
                      <Phone className="w-4 h-4 text-white" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => {
                        if (selectedUser) {
                          setNicknameInput(nicknames[selectedUser.id] || '');
                          setShowChatDetails(true);
                        }
                      }}
                      className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700/50 hover:bg-zinc-700/80 active:scale-95 text-white flex items-center justify-center cursor-pointer transition-all shadow-xs"
                      title="Chat Info"
                    >
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="6" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="18" r="1.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* ── SCREEN 1: LIGHT MESSAGES SHEET (Smooth rounded-t-[36px]) ── */}
                <div className="w-full flex-1 bg-white rounded-t-[36px] px-5 pt-5 pb-20 flex flex-col relative shadow-[0_-12px_32px_rgba(0,0,0,0.25)] overflow-hidden z-10 min-h-0">
                  {/* Centered Date Pill */}
                  <div className="flex justify-center mb-5 shrink-0">
                    <div className="bg-[#F3E8FF] text-[#9D4EDD] px-4 py-1.5 rounded-full text-[12px] font-semibold tracking-wide shadow-xs">
                      Today
                    </div>
                  </div>

                  {/* Messages Scroll Area */}
                  <div
                    ref={messagesContainerRef}
                    onScroll={handleMessagesScroll}
                    onTouchStart={handleContainerTouchStart}
                    onTouchMove={handleContainerTouchMove}
                    onTouchEnd={handleContainerTouchEnd}
                    onMouseDown={handleContainerMouseDown}
                    className="flex flex-col gap-4 overflow-y-auto flex-1 no-scrollbar pr-0.5 pb-24"
                  >
                    {isLoadingMessages && messages.length === 0 && (
                      <div className="chat-skeleton-container">
                        <div className="chat-skeleton-bubble recv" />
                        <div className="chat-skeleton-bubble sent" />
                      </div>
                    )}
                    {isLoadingOlder && (
                      <div className="pagination-loader">
                        <div className="pagination-loader-spinner" />
                        <span>Loading older messages...</span>
                      </div>
                    )}
                    {(() => {
                      const filteredMessages = messages.filter(msg => msg.type !== 'accepted');
                      const currentUserIdStr = String((session?.user as any)?.id);
                      const lastSentMsg = [...filteredMessages].reverse().find(m => String(m.senderId) === currentUserIdStr && m.type !== 'system' && m.type !== 'call' && m.type !== 'deleted');
                      const lastSentMsgId = lastSentMsg ? lastSentMsg.id : null;

                      const partnerHasRepliedAfterLastSent = lastSentMsg
                        ? filteredMessages.some(m =>
                            String(m.senderId) !== currentUserIdStr &&
                            m.type !== 'system' &&
                            new Date(m.createdAt).getTime() > new Date(lastSentMsg.createdAt).getTime()
                          )
                        : false;

                      return filteredMessages.map((msg, index) => {
                        const prevMsg = filteredMessages[index - 1];
                        const nextMsg = filteredMessages[index + 1];
                        const isPrevSameSender = prevMsg && String(prevMsg.senderId) === String(msg.senderId);
                        const isNextSameSender = nextMsg && String(nextMsg.senderId) === String(msg.senderId);
                        const hasPrevReactions = prevMsg && Array.isArray(prevMsg.reactions) && prevMsg.reactions.length > 0;
                        const isLatestSentInThread = msg.id === lastSentMsgId && !partnerHasRepliedAfterLastSent;
                        const showSep = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                        return (
                          <React.Fragment key={msg.id}>
                            {showSep && (
                              <div className="date-separator">
                                <span>{formatDateSeparator(new Date(msg.createdAt))}</span>
                              </div>
                            )}
                            <div id={`msg-item-${msg.id}`}>
                              <MessageItem
                                msg={msg}
                                currentUserId={(session?.user as any)?.id}
                                selectedUser={selectedUser}
                                partnerLastSeen={selectedUser ? ((selectedUser.email && lastSeenMap[selectedUser.email.toLowerCase().trim()]) || lastSeenMap[selectedUser.id] || (selectedUser as any).lastSeen || (selectedUser as any).lastHeartbeat) : null}
                                onDelete={handleDelete}
                                onReact={handleReact}
                                onRequestDelete={handleRequestDelete}
                                isSelected={selectedMessageIds.has(msg.id)}
                                isInSelectionMode={selectedMessageIds.size > 0}
                                toggleMessageSelection={toggleMessageSelection}
                                onShowIGMenu={setIgMenu}
                                onReply={setReplyToMessage}
                                activeTheme={activeTheme}
                                onPreviewImage={(src: string) => openMediaLightbox(src, 'image')}
                                onPreviewMedia={openMediaLightbox}
                                msgTag={msgTags[msg.id]}
                                onOpenTagPicker={setOpenTagPickerMsg}
                                onOpenThemePicker={() => setShowThemePicker(true)}
                                isPrevSameSender={isPrevSameSender}
                                isNextSameSender={isNextSameSender}
                                hasPrevReactions={hasPrevReactions}
                                isLastSentInGroup={isLatestSentInThread}
                                chatSwipeOffset={chatSwipeOffset}
                                onContainerSwipeOffset={setChatSwipeOffset}
                                onOpenAlbum={setSelectedAlbum}
                                onRetryUpload={handleRetryUpload}
                              />
                            </div>
                          </React.Fragment>
                        );
                      });
                    })()}
                    {!isLoadingMessages && messages.filter(msg => msg.type !== 'accepted').length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-14 h-14 rounded-full bg-[#FFF3CD] flex items-center justify-center text-2xl mb-2">
                          👨🏻
                        </div>
                        <h3 className="text-base font-bold text-black">Start a conversation</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Send a message to start chatting with {selectedUser.name}</p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply bar if replying */}
                  {replyToMessage && (
                    <div className="mx-2 mb-2 p-2.5 rounded-2xl bg-zinc-100 border border-zinc-200/70 flex items-center justify-between shadow-2xs">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[11px] font-bold text-[#9D4EDD]">
                          Replying to {replyToMessage.senderId === (session?.user as any)?.id ? 'yourself' : selectedUser?.name}
                        </span>
                        <span className="text-xs text-zinc-600 truncate">{replyToMessage.content}</span>
                      </div>
                      <button onClick={() => setReplyToMessage(null)} className="text-xs text-zinc-400 hover:text-black p-1 cursor-pointer">✕</button>
                    </div>
                  )}

                  {/* Hidden File Picker for Gallery Button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip,.txt"
                    className="hidden"
                    multiple
                  />

                  {/* ── INTERACTIVE CHAT INPUT PILL ── */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-full z-30 flex justify-center">
                    <ChatInput
                      onSendMessage={(text) => handleSendMessage(undefined, text)}
                      onOpenGallery={() => fileInputRef.current?.click()}
                      onSendVoice={async (audioBlob, duration) => {
                        if (selectedUser && socket && session?.user) {
                          const senderId = (session.user as any).id;
                          const stableId = 'voice-' + Date.now() + Math.random().toString(36).substring(7);
                          const localPreview = URL.createObjectURL(audioBlob);

                          const optimisticMsg: any = {
                            id: stableId,
                            senderId: senderId,
                            receiverId: selectedUser.id,
                            content: localPreview,
                            type: 'voice',
                            createdAt: new Date(),
                            isSeen: false,
                            status: 'sending',
                            uploadProgress: 0,
                          };
                          setMessages(prev => [...prev, optimisticMsg]);
                          setMessagesCache(prev => {
                            const current = prev[selectedUser.id] || [];
                            return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
                          });

                          try {
                            const presignRes = await fetch('/api/chat/media/presign', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                filename: `voice_${Date.now()}.webm`,
                                mimeType: 'audio/webm',
                                fileSize: audioBlob.size,
                                chatType: 'dm',
                              }),
                            });

                            let finalAudioUrl = localPreview;
                            let storagePath: string | undefined;

                            if (presignRes.ok) {
                              const { uploadUrl, fileUrl, storagePath: sPath } = await presignRes.json();
                              const uploadRes = await fetch(uploadUrl, {
                                method: 'PUT',
                                body: audioBlob,
                                headers: { 'Content-Type': 'audio/webm' },
                              });
                              if (uploadRes.ok) {
                                finalAudioUrl = fileUrl;
                                storagePath = sPath;
                              }
                            }

                            const savedMsg = await saveSocialMessage(
                              selectedUser.id,
                              finalAudioUrl,
                              'voice',
                              null,
                              {
                                mediaUrl: finalAudioUrl,
                                mimeType: 'audio/webm',
                                fileSize: audioBlob.size,
                                storagePath,
                              }
                            );

                            if (savedMsg) {
                              setMessages(prev => prev.map(m => m.id === stableId ? {
                                ...(savedMsg as any),
                                id: (savedMsg as any).id || stableId,
                                isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                                status: 'sent'
                              } : m));

                              setMessagesCache(prev => {
                                const current = prev[selectedUser.id] || [];
                                return {
                                  ...prev,
                                  [selectedUser.id]: current.map(m => m.id === stableId ? {
                                    ...(savedMsg as any),
                                    id: (savedMsg as any).id || stableId,
                                    isSeen: m.isSeen || (savedMsg as any).isSeen || false,
                                    status: 'sent'
                                  } : m)
                                };
                              });

                              socket.emit('send_social_message', {
                                ...(savedMsg as any),
                                id: (savedMsg as any).id || stableId,
                                receiverId: selectedUser.id,
                                receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
                                ...(activeThemeId && activeThemeId !== 'default' ? { themeId: activeThemeId } : {})
                              });
                            }
                          } catch (err) {
                            console.error('Failed to upload voice message:', err);
                            setMessages(prev => prev.map(m => m.id === stableId ? { ...m, status: 'error' } : m));
                          }
                        }
                      }}
                      onTyping={() => {
                        if (socket && selectedUser) {
                          if (!typingTimeoutRef.current) { socket.emit('typing', { receiverEmail: selectedUser.email }); }
                          else { clearTimeout(typingTimeoutRef.current); }
                          typingTimeoutRef.current = setTimeout(() => {
                            socket.emit('stop_typing', { receiverEmail: selectedUser.email });
                            typingTimeoutRef.current = null;
                          }, 2000);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* ── SCREEN 2: REDESIGNED PREMIUM CHAT DETAILS SCREEN (CLEAN, NO EMOJIS, NO LOUD RED) ── */}
                {showChatDetails && selectedUser && (
                  <div className="absolute inset-0 z-50 flex flex-col bg-[#141111] animate-in slide-in-from-right-full duration-300 overflow-y-auto no-scrollbar font-sans">
                    {/* Top Header Bar */}
                    <div className="pt-14 pb-4 px-5 flex items-center justify-between select-none flex-shrink-0 bg-[#141111] sticky top-0 z-20">
                      <button
                        onClick={() => {
                          setEditingNickname(false);
                          setShowChatDetails(false);
                        }}
                        className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center cursor-pointer hover:bg-zinc-700 active:scale-95 transition-all text-white"
                        title="Back to conversation"
                      >
                        <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.2} />
                      </button>
                      <span className="text-[15px] font-bold text-white tracking-tight">Conversation Info</span>
                      <div className="w-10" />
                    </div>

                    {/* Hero Profile Card */}
                    <div className="flex flex-col items-center px-6 pt-4 pb-8 select-none">
                      <div className="relative">
                        <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-zinc-800 border-2 border-zinc-700 text-3xl shadow-xl">
                          {selectedUser.image && selectedUser.image.length > 5 ? (
                            <img src={selectedUser.image} alt={selectedUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-zinc-300 font-bold">{selectedUser.name?.charAt(0) || 'U'}</span>
                          )}
                        </div>
                        {(() => {
                          const userEmail = (selectedUser.email || '').toLowerCase().trim();
                          const isOnline = (userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(selectedUser.id);
                          return isOnline ? (
                            <span className="w-4 h-4 bg-emerald-500 rounded-full ring-4 ring-[#141111] absolute bottom-1 right-1" />
                          ) : null;
                        })()}
                      </div>

                      <h2 className="text-[22px] font-bold text-white mt-4 tracking-tight text-center">
                        {nicknames[selectedUser.id] || selectedUser.name}
                      </h2>
                      <span className="text-[13px] text-[#9D4EDD] font-medium mt-0.5">
                        @{selectedUser.username || (selectedUser.name || 'user').toLowerCase().replace(/\s+/g, '')}
                      </span>
                      <span className="text-[12px] text-zinc-400 mt-1">
                        {(() => {
                          const userEmail = (selectedUser.email || '').toLowerCase().trim();
                          const isOnline = (userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(selectedUser.id);
                          if (isOnline) return 'Online now';
                          const lastSeenVal = (userEmail && lastSeenMap[userEmail]) || lastSeenMap[selectedUser.id] || (selectedUser as any).lastSeen || (selectedUser as any).lastHeartbeat;
                          const ago = formatLastSeenAgo(lastSeenVal);
                          return ago ? `Last seen ${ago}` : 'Offline';
                        })()}
                      </span>

                      {/* Quick Action Buttons Row */}
                      <div className="grid grid-cols-4 gap-3 w-full max-w-sm mt-6">
                        {/* 1. Message */}
                        <button
                          onClick={() => setShowChatDetails(false)}
                          className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group"
                        >
                          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
                            <svg className="w-5 h-5 text-zinc-300" viewBox="-0.5 0 25 25" fill="none" stroke="currentColor">
                              <path d="M2.33045 8.38999C0.250452 11.82 9.42048 14.9 9.42048 14.9C9.42048 14.9 12.5005 24.07 15.9305 21.99C19.5705 19.77 23.9305 6.13 21.0505 3.27C18.1705 0.409998 4.55045 4.74999 2.33045 8.38999Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M15.1999 9.12L9.41992 14.9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <span className="text-[11px] font-medium text-zinc-300">Message</span>
                        </button>

                        {/* 2. Voice Call */}
                        <button
                          onClick={() => { setShowChatDetails(false); handleCall('audio'); }}
                          className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group"
                        >
                          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
                            <Phone className="w-5 h-5 text-zinc-300" strokeWidth={2} />
                          </div>
                          <span className="text-[11px] font-medium text-zinc-300">Audio</span>
                        </button>

                        {/* 3. Video Call */}
                        <button
                          onClick={() => { setShowChatDetails(false); handleCall('video'); }}
                          className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group"
                        >
                          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
                            <Video className="w-5 h-5 text-zinc-300" strokeWidth={2} />
                          </div>
                          <span className="text-[11px] font-medium text-zinc-300">Video</span>
                        </button>

                        {/* 4. Search in Chat */}
                        <button
                          onClick={() => {
                            setShowChatDetails(false);
                            setShowSearchWindow(true);
                            setChatSearchQuery('');
                          }}
                          className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group"
                        >
                          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
                            <Search className="w-5 h-5 text-zinc-300" strokeWidth={2} />
                          </div>
                          <span className="text-[11px] font-medium text-zinc-300">Search</span>
                        </button>
                      </div>
                    </div>

                    {/* Light Mode Information & Settings Bottom Sheet */}
                    <div className="flex-1 bg-white rounded-t-[36px] px-6 pt-7 pb-24 flex flex-col gap-6 text-zinc-900 shadow-[0_-10px_40px_rgba(0,0,0,0.15)]">
                      
                      {/* Section 1: Chat Customization */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                          Preferences
                        </span>
                        <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-1.5 divide-y divide-zinc-100">
                          {/* Notifications Mute Row */}
                          <div 
                            onClick={() => {
                              setIsChatMuted(prev => !prev);
                              setMutedChats(prev => {
                                const next = new Set(prev);
                                if (next.has(selectedUser.id)) next.delete(selectedUser.id);
                                else next.add(selectedUser.id);
                                return next;
                              });
                            }}
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-100/70 rounded-xl transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-purple-50 text-[#9D4EDD] flex items-center justify-center">
                                <Bell className="w-4 h-4" strokeWidth={2} />
                              </div>
                              <span className="text-[14px] font-semibold text-zinc-800">Notifications</span>
                            </div>
                            <span className="text-[13px] font-medium text-zinc-500">
                              {isChatMuted ? 'Muted' : 'Sound & Banners'}
                            </span>
                          </div>

                          {/* Nickname Row */}
                          <div className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                  <Pencil className="w-4 h-4" strokeWidth={2} />
                                </div>
                                <span className="text-[14px] font-semibold text-zinc-800">Nickname</span>
                              </div>
                              {!editingNickname ? (
                                <button
                                  onClick={() => setEditingNickname(true)}
                                  className="text-[13px] font-medium text-[#9D4EDD] hover:underline cursor-pointer"
                                >
                                  {nicknames[selectedUser.id] || 'Set Nickname'}
                                </button>
                              ) : null}
                            </div>
                            {editingNickname && (
                              <div className="flex items-center gap-2 mt-3 pt-2">
                                <input
                                  type="text"
                                  placeholder="Enter nickname..."
                                  value={nicknameInput}
                                  onChange={(e) => setNicknameInput(e.target.value)}
                                  className="flex-1 px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl outline-none"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    const val = nicknameInput.trim();
                                    const updated = { ...nicknames, [selectedUser.id]: val };
                                    if (!val) delete updated[selectedUser.id];
                                    setNicknames(updated);
                                    if (typeof window !== 'undefined') localStorage.setItem('chat_nicknames', JSON.stringify(updated));
                                    setEditingNickname(false);
                                  }}
                                  className="px-3 py-2 bg-[#9D4EDD] text-white rounded-xl text-xs font-bold cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingNickname(false)}
                                  className="px-3 py-2 bg-zinc-200 text-zinc-700 rounded-xl text-xs font-medium cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Theme Row */}
                          <div
                            onClick={() => setShowThemePicker(true)}
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-100/70 rounded-xl transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Palette className="w-4 h-4" strokeWidth={2} />
                              </div>
                              <span className="text-[14px] font-semibold text-zinc-800">Chat Theme</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-zinc-500">{activeTheme.name}</span>
                              <span className="text-zinc-400">›</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Shared Content Tabs (Media, Files, Voice) */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider">
                            Shared Content
                          </span>
                          <span className="text-[11px] text-zinc-400 font-medium">
                            {sharedMedia.picsAndVideos.length + sharedMedia.files.length} items
                          </span>
                        </div>

                        {/* Tab switcher */}
                        <div className="flex border-b border-zinc-100 gap-6 px-1">
                          <button
                            onClick={() => setDetailsTab('media')}
                            className={`pb-2.5 cursor-pointer text-[13px] font-semibold transition-all ${
                              detailsTab === 'media'
                                ? 'text-zinc-950 font-bold border-b-2 border-zinc-950'
                                : 'text-zinc-400 hover:text-zinc-600 font-medium'
                            }`}
                          >
                            Media ({sharedMedia.picsAndVideos.length})
                          </button>
                          <button
                            onClick={() => setDetailsTab('files')}
                            className={`pb-2.5 cursor-pointer text-[13px] font-semibold transition-all ${
                              detailsTab === 'files'
                                ? 'text-zinc-950 font-bold border-b-2 border-zinc-950'
                                : 'text-zinc-400 hover:text-zinc-600 font-medium'
                            }`}
                          >
                            Files & Voice ({sharedMedia.files.length})
                          </button>
                        </div>

                        {/* Content list */}
                        <div className="pt-2">
                          {detailsTab === 'media' && (
                            sharedMedia.picsAndVideos.length === 0 ? (
                              <div className="bg-zinc-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-zinc-400">
                                <ImageIcon className="w-8 h-8 mb-2 text-zinc-300" strokeWidth={1.5} />
                                <span className="text-[13px] font-medium">No photos or videos shared yet</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                {sharedMedia.picsAndVideos.slice(0, mediaDisplayLimit).map(m => (
                                  <div
                                    key={m.id}
                                    className="aspect-square rounded-2xl overflow-hidden bg-black/10 cursor-pointer group relative shadow-xs"
                                    onClick={() => openMediaLightbox(m.content, m.type === 'video' ? 'video' : 'image')}
                                  >
                                    {m.type === 'video' ? (
                                      <video src={m.content} className="w-full h-full object-cover pointer-events-none" />
                                    ) : (
                                      <img src={m.content} alt="media" className="w-full h-full object-cover" loading="lazy" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          )}

                          {detailsTab === 'files' && (
                            sharedMedia.files.length === 0 ? (
                              <div className="bg-zinc-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-zinc-400">
                                <FileText className="w-8 h-8 mb-2 text-zinc-300" strokeWidth={1.5} />
                                <span className="text-[13px] font-medium">No files or voice notes shared yet</span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {sharedMedia.files.map(m => (
                                  <div key={m.id} className="p-3 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-[#9D4EDD] flex items-center justify-center text-sm font-bold shrink-0">
                                        {m.type === 'voice' ? <LucideMic className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                      </div>
                                      <span className="text-xs font-semibold text-zinc-800 truncate">
                                        {m.type === 'voice' ? 'Voice Message' : m.content}
                                      </span>
                                    </div>
                                    {m.type === 'voice' ? (
                                      <audio src={m.content} controls className="h-8 max-w-[140px]" />
                                    ) : (
                                      <a href={m.content} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#9D4EDD] hover:underline shrink-0">
                                        Open
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* Section 3: Privacy & Actions (Clean dark/zinc tokens) */}
                      <div className="flex flex-col gap-1.5 pt-2">
                        <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                          Privacy & Security
                        </span>
                        <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-1.5 divide-y divide-zinc-100">
                          <div
                            onClick={() => setShowClearConfirmModal(true)}
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-100 rounded-xl transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-zinc-200 text-zinc-700 group-hover:text-rose-600 flex items-center justify-center transition-colors">
                                <Trash2 className="w-4 h-4" strokeWidth={2} />
                              </div>
                              <span className="text-[14px] font-semibold text-zinc-800 group-hover:text-rose-600 transition-colors">Clear Chat History</span>
                            </div>
                            <span className="text-xs text-zinc-400 font-medium">Delete messages</span>
                          </div>

                          <div
                            onClick={() => setIsUserBlocked(prev => !prev)}
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-100 rounded-xl transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-zinc-200 text-zinc-700 group-hover:text-rose-600 flex items-center justify-center transition-colors">
                                <Ban className="w-4 h-4" strokeWidth={2} />
                              </div>
                              <span className="text-[14px] font-semibold text-zinc-800 group-hover:text-rose-600 transition-colors">
                                {isUserBlocked ? 'Unblock Contact' : 'Block Contact'}
                              </span>
                            </div>
                            <span className="text-xs text-zinc-400 font-medium">{isUserBlocked ? 'Blocked' : 'Active'}</span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* ── MULTI-MEDIA ALBUM VIEWER OVERLAY (Instagram style) ── */}
                {selectedAlbum && (
                  <div className="absolute inset-0 z-50 flex flex-col bg-[var(--dm-bg-main)] text-[var(--dm-text-primary)] animate-in slide-in-from-right duration-250 font-sans overflow-hidden">
                    {/* Top Header with Back Button on the top left */}
                    <div className="flex items-center justify-between px-4 pt-[calc(14px+env(safe-area-inset-top,0px))] pb-3 border-b border-[var(--dm-border)]/40 bg-[var(--dm-bg-sidebar)]/95 backdrop-blur-md z-10">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSelectedAlbum(null)}
                          className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--dm-bg-hover)] hover:bg-[var(--dm-bg-active)] text-[var(--dm-text-primary)] active:scale-90 transition-all cursor-pointer flex-shrink-0"
                          title="Back to chat"
                          aria-label="Back to chat"
                        >
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <div>
                          <h3 className="font-bold text-sm leading-tight text-[var(--dm-text-primary)]">Shared Media</h3>
                          <p className="text-[11px] text-[var(--dm-text-muted)] font-medium">
                            {selectedAlbum.items.length} {selectedAlbum.items.length === 1 ? 'item' : 'items'} {selectedAlbum.time ? `• ${selectedAlbum.time}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Media Grid */}
                    <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {selectedAlbum.items.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              openMediaLightbox(item.url, item.type === 'video' ? 'video' : 'image');
                            }}
                            className="relative aspect-square rounded-2xl overflow-hidden bg-black/15 cursor-pointer group hover:scale-[1.02] active:scale-95 transition-all shadow-sm"
                          >
                            {item.type === 'video' ? (
                              <>
                                <video src={item.url} className="w-full h-full object-cover pointer-events-none" />
                                <div className="absolute inset-0 bg-black/25 flex items-center justify-center group-hover:bg-black/15 transition-colors">
                                  <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white shadow-lg">
                                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <img
                                src={item.url}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            )}
                            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-[10px] font-semibold text-white/95">
                              {idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── IN-CHAT MESSAGE SEARCH OVERLAY ── */}
                {showSearchWindow && selectedUser && (
                  <div className="absolute inset-0 z-50 flex flex-col bg-[var(--dm-bg-main)] text-[var(--dm-text-primary)] animate-in slide-in-from-bottom duration-250 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-3 bg-[var(--dm-bg-sidebar)]/95 backdrop-blur-md">
                      <button
                        onClick={() => setShowSearchWindow(false)}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--dm-bg-hover)] hover:bg-[var(--dm-bg-active)] text-[var(--dm-text-primary)] active:scale-90 transition-all cursor-pointer flex-shrink-0"
                        title="Back to chat"
                      >
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>

                      <div className="flex-1 relative flex items-center">
                        <input
                          type="text"
                          placeholder="Search in chat..."
                          value={chatSearchQuery}
                          onChange={(e) => setChatSearchQuery(e.target.value)}
                          className="w-full pl-4 pr-9 py-2.5 text-xs rounded-full bg-[var(--dm-bg-input)] text-[var(--dm-text-primary)] placeholder-[var(--dm-text-muted)] focus:outline-none"
                          autoFocus
                        />
                        {chatSearchQuery && (
                          <button
                            onClick={() => setChatSearchQuery('')}
                            className="absolute right-3 text-xs text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)] cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                      {!chatSearchQuery.trim() ? (
                        <div className="p-8 text-center text-xs text-[var(--dm-text-muted)] font-medium">
                          Type a word above to search messages in this chat
                        </div>
                      ) : (() => {
                        const query = chatSearchQuery.toLowerCase().trim();
                        const matches = messages.filter(m => m.type !== 'accepted' && m.content && m.content.toLowerCase().includes(query));

                        if (matches.length === 0) {
                          return (
                            <div className="p-8 text-center text-xs text-[var(--dm-text-muted)] font-medium">
                              No messages found matching &quot;{chatSearchQuery}&quot;
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            <div className="text-[11px] font-bold text-[var(--dm-text-muted)] uppercase tracking-wider px-2 mb-2">
                              Found {matches.length} {matches.length === 1 ? 'result' : 'results'}
                            </div>
                            {matches.map((msg) => {
                              const isMe = msg.senderId === (session?.user as any)?.id;
                              const senderName = isMe ? 'You' : (nicknames[selectedUser.id] || selectedUser.name);
                              const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                              return (
                                <div
                                  key={msg.id}
                                  onClick={() => {
                                    setShowSearchWindow(false);
                                    const targetId = msg.id;
                                    setTimeout(() => {
                                      const el = document.getElementById(`msg-item-${targetId}`);
                                      if (el) {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        el.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-500/20', 'transition-all', 'duration-500');
                                        setTimeout(() => {
                                          el.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-500/20');
                                        }, 2000);
                                      }
                                    }, 150);
                                  }}
                                  className="p-3.5 rounded-2xl bg-[var(--dm-bg-hover)] hover:bg-[var(--dm-bg-active)] cursor-pointer transition-colors space-y-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-[var(--dm-text-primary)]">{senderName}</span>
                                    <span className="text-[10px] text-[var(--dm-text-muted)]">{timeStr}</span>
                                  </div>
                                  <p className="text-xs text-[var(--dm-text-secondary)] line-clamp-2 leading-relaxed">
                                    {msg.content}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* ── SIMPLE CUSTOM REPORT MODAL ── */}
                {showReportModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-xs rounded-3xl bg-[var(--dm-bg-sidebar)] text-[var(--dm-text-primary)] p-6 text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
                      {reportSubmitted ? (
                        <div className="space-y-3 py-2">
                          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center text-xl font-bold">✓</div>
                          <h3 className="text-base font-extrabold">Report Submitted</h3>
                          <p className="text-xs text-[var(--dm-text-secondary)]">Thank you. Our moderation team will review this conversation.</p>
                          <button
                            onClick={() => {
                              setShowReportModal(false);
                              setReportSubmitted(false);
                            }}
                            className="w-full py-2.5 rounded-full bg-[var(--dm-bg-hover)] hover:bg-[var(--dm-bg-active)] text-xs font-bold transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <h3 className="text-base font-extrabold">Report Conversation</h3>
                          <p className="text-xs text-[var(--dm-text-secondary)] leading-relaxed">
                            Are you sure you want to report this conversation to moderation?
                          </p>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={() => setShowReportModal(false)}
                              className="flex-1 py-2.5 rounded-full bg-[var(--dm-bg-hover)] text-xs font-bold text-[var(--dm-text-secondary)] hover:text-[var(--dm-text-primary)] transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => setReportSubmitted(true)}
                              className="flex-1 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-xs font-bold text-white transition-colors cursor-pointer"
                            >
                              Report
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── SIMPLE CUSTOM CLEAR CHAT HISTORY MODAL ── */}
                {showClearConfirmModal && selectedUser && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-xs rounded-3xl bg-[var(--dm-bg-sidebar)] text-[var(--dm-text-primary)] p-6 text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
                      <h3 className="text-base font-extrabold">Clear Chat History</h3>
                      <p className="text-xs text-[var(--dm-text-secondary)] leading-relaxed">
                        This will clear all messages in your conversation with <span className="font-bold text-[var(--dm-text-primary)]">{nicknames[selectedUser.id] || selectedUser.name}</span>.
                      </p>
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={() => setShowClearConfirmModal(false)}
                          className="flex-1 py-2.5 rounded-full bg-[var(--dm-bg-hover)] text-xs font-bold text-[var(--dm-text-secondary)] hover:text-[var(--dm-text-primary)] transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            setShowClearConfirmModal(false);
                            await hideSocialChat(selectedUser.id);
                            setMessages([]);
                            setMessagesCache(prev => {
                              const next = { ...prev };
                              delete next[selectedUser.id];
                              return next;
                            });
                            setShowChatDetails(false);
                          }}
                          className="flex-1 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition-colors cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── INSTAGRAM THEME PICKER MODAL (BORDERLESS & UNBOXED) ── */}
                {showThemePicker && selectedUser && (
                  <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md mx-auto bg-[var(--dm-bg-sidebar)] text-[var(--dm-text-primary)] rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
                      <div className="flex items-center justify-between pb-3">
                        <h3 className="font-extrabold text-base tracking-tight">Themes</h3>
                        <button
                          onClick={() => setShowThemePicker(false)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto py-2 space-y-1 no-scrollbar">
                        {INSTAGRAM_THEMES.map((theme) => {
                          const isSelected = (chatThemes[selectedUser.id] || 'default') === theme.id;
                          return (
                            <div
                              key={theme.id}
                              onClick={() => handleSelectTheme(theme)}
                              className={`flex items-center justify-between py-3 px-3 rounded-2xl cursor-pointer transition-all ${
                                isSelected ? 'bg-[var(--dm-bg-hover)]/80' : 'hover:bg-[var(--dm-bg-hover)]/40'
                              }`}
                            >
                              <div className="flex items-center gap-3.5">
                                <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm shadow-sm transition-transform active:scale-95 flex-shrink-0"
                                  style={{ background: theme.previewWallpaper }}
                                >
                                  {theme.id === 'love' && '❤️'}
                                  {theme.id === 'rosegold' && '🌸'}
                                  {theme.id === 'astral' && '🌟'}
                                  {theme.id === 'neon' && '⚡'}
                                  {theme.id === 'ocean' && '🌊'}
                                  {theme.id === 'sunset' && '🌅'}
                                  {theme.id === 'galaxy' && '🌌'}
                                  {theme.id === 'lavender' && '💜'}
                                  {theme.id === 'emerald' && '🌿'}
                                  {theme.id === 'nordic' && '❄️'}
                                  {theme.id === 'monochrome' && '🖤'}
                                  {theme.id === 'ig_teal' && '🌊'}
                                  {theme.id === 'ig_dark' && '🌑'}
                                  {theme.id === 'ig_blue' && '💙'}
                                  {theme.id === 'ig_green' && '🌿'}
                                  {theme.id === 'default' && '🔮'}
                                </div>
                                <span className="text-xs font-semibold text-[var(--dm-text-primary)]">{theme.name}</span>
                              </div>

                              {isSelected && (
                                <span className="text-indigo-500 font-extrabold text-sm pr-1">
                                  ✓
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <h3>Select a Chat</h3>
                <p>Choose a contact to start messaging or search for new people.</p>
              </div>
            )}

          </section>
        </div>
      </div>

      {/* --- INCOMING CALL OVERLAY --- */}
      {incomingCall && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500 overflow-hidden font-sans" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="relative z-10 w-full h-full flex flex-col items-center justify-center" style={{ background: incomingCall.type === 'video' ? 'rgba(0,0,0,0.5)' : 'transparent' }}>

            <div className="flex flex-col items-center gap-6 text-center animate-in zoom-in duration-700">
              <div className="relative">
                <div className="absolute inset-0 rounded-full animate-ping [animation-duration:2s]" style={{ background: 'var(--dm-bg-input)' }} />
                <div className="absolute -inset-6 rounded-full animate-pulse [animation-duration:3s]" style={{ background: 'var(--dm-bg-active)', opacity: 0.5 }} />
                <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 shadow-2xl flex items-center justify-center text-4xl font-bold" style={{ borderColor: 'var(--dm-bg-main)', background: 'var(--dm-bg-input)', color: 'var(--dm-text-primary)' }}>
                  {incomingCall.from.image ? <img src={incomingCall.from.image} className="w-full h-full object-cover" /> : <img src="/Avatar.png" className="w-full h-full object-cover" />}
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--dm-text-heading)' }}>{incomingCall.from.name}</h2>
                <div className="flex items-center justify-center gap-2">
                  <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest" style={{ background: 'var(--dm-bg-active)', color: 'var(--dm-text-secondary)' }}>
                    Incoming {incomingCall.type} Call
                  </span>
                  <span className="font-medium text-base" style={{ color: 'var(--dm-text-muted)' }}>
                    Ringing...
                  </span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="absolute bottom-10 flex items-center gap-6 px-8 py-4 backdrop-blur-2xl rounded-full shadow-2xl z-30" style={{ background: 'var(--dm-bg-sidebar)', border: '1px solid var(--dm-border)' }}>
              <button
                onClick={handleRejectCall}
                className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                </svg>
              </button>

              <button
                onClick={handleAcceptCall}
                className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl animate-bounce"
                style={{ background: '#22c55e', color: '#fff' }}
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* --- STORY VIEWER MODAL OVERLAY --- */}
      {viewStory && (
        <div className="fixed inset-0 z-[2000] bg-black flex flex-col justify-between p-4 animate-in fade-in duration-200 select-none">
          {/* Story Progress Bar */}
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-white rounded-full animate-[pulse_2s_ease-in-out_infinite]" style={{ width: '100%' }} />
          </div>

          {/* Top Header */}
          <div className="flex items-center justify-between px-2 pt-2 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFF3CD] flex items-center justify-center font-bold text-black overflow-hidden ring-2 ring-white">
                {viewStory.avatar ? (
                  <img src={viewStory.avatar} className="w-full h-full object-cover" />
                ) : (
                  <span>👤</span>
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white leading-tight">{viewStory.name}</h4>
                <span className="text-[11px] text-zinc-400">{viewStory.time}</span>
              </div>
            </div>
            <button 
              onClick={() => setViewStory(null)} 
              className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80 active:scale-90 transition-transform"
            >
              ✕
            </button>
          </div>

          {/* Media in Center */}
          <div className="flex-1 flex items-center justify-center my-4 overflow-hidden rounded-3xl bg-zinc-950/80">
            {viewStory.media ? (
              <img src={viewStory.media} alt="Story" className="max-w-full max-h-full object-contain rounded-2xl" />
            ) : (
              <div className="text-center text-zinc-400 text-sm font-medium p-8">
                <div className="text-4xl mb-3">📸</div>
                <span>No media attached to this story preview</span>
              </div>
            )}
          </div>

          {/* Bottom Quick Reply */}
          <div className="flex items-center gap-2 pb-6 px-2">
            <input 
              type="text" 
              placeholder={`Reply to ${viewStory.name}...`} 
              className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-3 text-sm text-white placeholder:text-zinc-400 outline-none"
            />
            <button 
              onClick={() => setViewStory(null)} 
              className="px-5 py-3 bg-[#9D4EDD] hover:bg-[#883ec5] rounded-full text-sm font-bold text-white cursor-pointer transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {activeCall && socket && (
        <CallInterface
          socket={socket}
          peer={activeCall.peer}
          type={activeCall.type}
          isCaller={activeCall.isCaller}
          isAccepted={(activeCall as any).connected}
          initialOffer={(activeCall as any).initialOffer}
          callId={(activeCall as any).callId}
          onEnd={(duration, wasConnected) => {
            // Clear any pending dismiss timer
            if (incomingCallDismissTimer.current) {
              clearTimeout(incomingCallDismissTimer.current);
              incomingCallDismissTimer.current = null;
            }
            const callData = activeCall;
            setActiveCall(null);
            setIncomingCall(null);

            if (callData && callData.isCaller) {
              (async () => {
                try {
                  const status = wasConnected ? 'completed' : 'missed';
                  const result = await saveCall(callData.peer.id, callData.type, status, duration);
                  if (result?.message && socket) {
                    socket.emit('send_social_message', { receiverEmail: callData.peer.email, ...result.message });
                    setMessages(prev => {
                      if (prev.some(m => m.id === (result.message as any).id)) return prev;
                      return [...prev, result.message as any];
                    });
                  }
                } catch (e) { console.error("Call background save error:", e); }
              })();
            }
          }}
        />
      )}

      {/* ── CHAT OPTIONS BOTTOM SHEET (DYNAMIC SYSTEM THEME: LIGHT & DARK MODE WITH ANIMATIONS, NO EMOJIS) ── */}
      {selectedChatForOptions && (
        <div
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 font-sans"
          onClick={() => setSelectedChatForOptions(null)}
        >
          <div
            className="w-full max-w-md mx-auto z-40 rounded-t-[2rem] p-6 pb-8 max-h-[90vh] overflow-y-auto no-scrollbar transform animate-in slide-in-from-bottom duration-300 ease-out"
            style={{ background: 'var(--dm-bg-sidebar)', borderTop: '1px solid var(--dm-border)', color: 'var(--dm-text-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Top Handle Bar */}
            <div className="w-10 h-1 rounded-full mx-auto mb-5 opacity-30" style={{ background: 'var(--dm-text-muted)' }} />

            {/* Header: User Avatar & Name */}
            <div className="flex items-center gap-3.5 pb-4 mb-2 border-b" style={{ borderColor: 'var(--dm-border)' }}>
              <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--dm-bg-hover)' }}>
                <img
                  src={selectedChatForOptions.image || '/Avatar.png'}
                  alt={selectedChatForOptions.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold truncate" style={{ color: 'var(--dm-text-primary)' }}>
                  {selectedChatForOptions.name}
                </h3>
                <p className="text-xs font-medium truncate opacity-70" style={{ color: 'var(--dm-text-muted)' }}>
                  @{selectedChatForOptions.username || selectedChatForOptions.email?.split('@')[0] || 'user'}
                </p>
              </div>
              <button
                onClick={() => setSelectedChatForOptions(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer text-xs font-bold opacity-60 hover:opacity-100 transition-opacity"
                style={{ background: 'var(--dm-bg-hover)', color: 'var(--dm-text-muted)' }}
              >
                ✕
              </button>
            </div>

            {/* Flat Action Menu List with Plain Horizontal Divider Lines */}
            <div className="flex flex-col">
              {/* Pin / Unpin Button */}
              <button
                onClick={() => {
                  const isPinned = pinnedChats.has(selectedChatForOptions.id);
                  setPinnedChats(prev => {
                    const next = new Set(prev);
                    if (isPinned) next.delete(selectedChatForOptions.id);
                    else next.add(selectedChatForOptions.id);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('social_pinned_chats', JSON.stringify(Array.from(next)));
                    }
                    return next;
                  });
                  setSelectedChatForOptions(null);
                }}
                className="w-full py-3.5 px-2 text-left text-sm font-semibold flex items-center justify-between border-b transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                style={{ borderColor: 'var(--dm-border)', color: 'var(--dm-text-primary)' }}
              >
                <span>{pinnedChats.has(selectedChatForOptions.id) ? 'Unpin Chat' : 'Pin Chat to Top'}</span>
                {pinnedChats.has(selectedChatForOptions.id) && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--dm-bg-hover)', color: 'var(--dm-text-secondary)' }}>
                    Pinned
                  </span>
                )}
              </button>

              {/* Mute / Unmute Notifications Button */}
              <button
                onClick={() => {
                  const isMuted = mutedChats.has(selectedChatForOptions.id);
                  setMutedChats(prev => {
                    const next = new Set(prev);
                    if (isMuted) next.delete(selectedChatForOptions.id);
                    else next.add(selectedChatForOptions.id);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('social_muted_chats', JSON.stringify(Array.from(next)));
                    }
                    return next;
                  });
                  setSelectedChatForOptions(null);
                }}
                className="w-full py-3.5 px-2 text-left text-sm font-semibold flex items-center justify-between border-b transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                style={{ borderColor: 'var(--dm-border)', color: 'var(--dm-text-primary)' }}
              >
                <span>{mutedChats.has(selectedChatForOptions.id) ? 'Unmute Notifications' : 'Mute Notifications'}</span>
                {mutedChats.has(selectedChatForOptions.id) && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--dm-bg-hover)', color: 'var(--dm-text-secondary)' }}>
                    Muted
                  </span>
                )}
              </button>

              {/* Delete Chat Button (Darker Red accent) */}
              <button
                onClick={async () => {
                  const targetId = selectedChatForOptions.id;
                  try {
                    await hideSocialChat(targetId);
                    setDeletedChatIds(prev => {
                      const next = new Set(prev).add(targetId);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('social_deleted_chats', JSON.stringify(Array.from(next)));
                      }
                      return next;
                    });
                    setMessagesCache(prev => {
                      const next = { ...prev };
                      delete next[targetId];
                      return next;
                    });
                    setUsers(prev => prev.filter(u => u.id !== targetId));
                    allContactsRef.current = allContactsRef.current.filter(u => u.id !== targetId);
                    setRequests(prev => prev.filter(u => u.id !== targetId));
                    allRequestsRef.current = allRequestsRef.current.filter(u => u.id !== targetId);
                    setPinnedChats(prev => { const n = new Set(prev); n.delete(targetId); return n; });
                    if (selectedUser?.id === targetId) {
                      setSelectedUser(null);
                      setMessages([]);
                    }
                    setSelectedChatForOptions(null);
                  } catch (error) {
                    console.error('Failed to hide chat:', error);
                    alert('Failed to delete chat. Please try again.');
                  }
                }}
                className="w-full py-3.5 px-2 text-left text-sm font-bold flex items-center justify-between border-b transition-colors cursor-pointer"
                style={{ borderColor: 'var(--dm-border)', color: '#b91c1c' }}
              >
                <span>Delete Chat</span>
              </button>

              {/* Cancel Button */}
              <button
                onClick={() => setSelectedChatForOptions(null)}
                className="w-full py-3 mt-3 text-center text-sm font-semibold rounded-xl transition-colors cursor-pointer hover:opacity-80"
                style={{ background: 'var(--dm-bg-hover)', color: 'var(--dm-text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* --- IMAGE & VIDEO LIGHTBOX PREVIEW OVERLAY --- */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxMedia(null)}
        >
          {/* Top-left Back Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxMedia(null);
            }}
            className="absolute top-12 left-5 md:top-14 md:left-8 w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white/90 hover:text-white hover:bg-black/80 flex items-center justify-center cursor-pointer transition-all active:scale-90 z-30 shadow-xl"
            title="Go back"
            aria-label="Go back"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>

          {/* Top-right Download Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadMedia(lightboxMedia.url, lightboxMedia.type);
            }}
            className="absolute top-12 right-5 md:top-14 md:right-8 w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white/90 hover:text-white hover:bg-black/80 flex items-center justify-center cursor-pointer transition-all active:scale-90 z-30 shadow-xl"
            title="Save to device"
            aria-label="Save to device"
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {lightboxMedia.type === 'video' ? (
            <video
              src={lightboxMedia.url}
              controls
              autoPlay
              className="max-w-full max-h-[88vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={lightboxMedia.url}
              alt="Full preview"
              className="max-w-full max-h-[88vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
      {/* --- INSTAGRAM-STYLE PREMIUM CONVERSATION THEME & FONT CUSTOMIZER MODAL --- */}
      {showThemePicker && selectedUser && (
        <div
          className="fixed inset-0 z-[1600] flex items-end justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => {
            setLiveThemeId(null);
            setShowThemePicker(false);
          }}
        >
          <div
            className="w-full max-w-md bg-[var(--dm-bg-sidebar)] border-t border-x border-[var(--dm-border)] rounded-t-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom zoom-in-95 duration-300 font-sans text-[var(--dm-text-primary)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle Bar */}
            <div className="w-full pt-3 pb-1 flex items-center justify-center">
              <div className="w-12 h-1.5 rounded-full bg-[var(--dm-border)]" />
            </div>

            {/* Header */}
            <div className="px-6 py-3 flex items-center justify-between border-b border-[var(--dm-border)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--dm-text-primary)] tracking-tight">Customize</h3>
              </div>
              <button
                onClick={() => {
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--dm-bg-hover)] text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)] transition-colors cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Two Box Slider Tabs */}
            <div className="mx-6 my-3 p-1 rounded-2xl bg-[var(--dm-bg-hover)] border border-[var(--dm-border)] flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setCustomizerTab('themes')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  customizerTab === 'themes'
                    ? 'bg-[var(--dm-bg-active)] text-[var(--dm-text-primary)] shadow-sm'
                    : 'text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)]'
                }`}
              >
                Themes
              </button>
              <button
                onClick={() => setCustomizerTab('fonts')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  customizerTab === 'fonts'
                    ? 'bg-[var(--dm-bg-active)] text-[var(--dm-text-primary)] shadow-sm'
                    : 'text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)]'
                }`}
              >
                Fonts
              </button>
            </div>

            {/* Tab 1: Themes (Horizontal 3 Columns Grid, 160px height per box showing pure wallpaper background) */}
            {customizerTab === 'themes' && (
              <div className="px-6 py-3 overflow-y-auto grid grid-cols-3 gap-3 no-scrollbar max-h-[55vh]">
                {INSTAGRAM_THEMES.map(theme => {
                  const isSelected = (liveThemeId || (selectedUser ? chatThemes[selectedUser.id] : null) || 'default') === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(20);
                        setLiveThemeId(theme.id);
                      }}
                      className={`h-[160px] rounded-2xl flex flex-col items-center justify-end p-2.5 cursor-pointer transition-all relative overflow-hidden bg-cover bg-center ${
                        isSelected
                          ? 'ring-2 ring-indigo-500 scale-[1.02] shadow-xl'
                          : 'hover:opacity-90 opacity-80 hover:scale-[1.01]'
                      }`}
                      style={{
                        backgroundImage: theme.wallpaperUrl
                          ? `url("${theme.wallpaperUrl}")`
                          : theme.previewWallpaper,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <div className="w-full py-1 px-2 rounded-xl bg-black/50 backdrop-blur-md text-center">
                        <span className="text-[11px] font-bold text-white tracking-wide">{theme.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 2: Fonts (2 Columns Grid, 100px height per box, outline removed) */}
            {customizerTab === 'fonts' && (
              <div className="px-6 py-3 overflow-y-auto grid grid-cols-2 gap-3 no-scrollbar max-h-[55vh]">
                {FONT_OPTIONS.map(font => {
                  const isSelected = activeFont === font.id;
                  return (
                    <div
                      key={font.id}
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(20);
                        setActiveFont(font.id);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('chat_font', font.id);
                        }
                      }}
                      className={`h-[100px] rounded-2xl flex items-center justify-center cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#3a3a3c] text-white shadow-md'
                          : 'bg-[var(--dm-bg-hover)] text-[var(--dm-text-primary)] hover:opacity-80'
                      }`}
                      style={{ fontFamily: font.id === 'default' ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' : font.family }}
                    >
                      <span className="text-base font-semibold">{font.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Action Footer (Shifted higher up with clean spacing) */}
            <div className="px-6 pt-2 pb-5 bg-[var(--dm-bg-sidebar)] flex items-center gap-3">
              <button
                onClick={() => {
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="flex-1 py-3 px-4 rounded-full text-xs font-bold text-[var(--dm-text-muted)] bg-[var(--dm-bg-hover)] hover:bg-[var(--dm-bg-active)] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (customizerTab === 'fonts') {
                    setLiveThemeId(null);
                    setShowThemePicker(false);
                    return;
                  }
                  if (liveThemeId && selectedUser) {
                    const themeObj = INSTAGRAM_THEMES.find(t => t.id === liveThemeId) || INSTAGRAM_THEMES[0];
                    handleSelectTheme(themeObj);
                  }
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="flex-1 py-3 px-4 rounded-full text-xs font-bold text-white bg-[#262626] hover:bg-[#1a1a1a] shadow-md transition-all cursor-pointer active:scale-95"
              >
                {customizerTab === 'fonts' ? 'Done' : 'Apply Theme'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- MESSAGE TAG PICKER BOTTOM SHEET MODAL --- */}
      {openTagPickerMsg && (
        <div
          className="fixed inset-0 z-[1700] flex items-end justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setOpenTagPickerMsg(null)}
        >
          <div
            className="w-full max-w-md bg-[var(--dm-bg-sidebar)] border-t border-x border-[var(--dm-border)] rounded-t-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-full pt-3 pb-1 flex items-center justify-center">
              <div className="w-12 h-1.5 rounded-full bg-[var(--dm-border)]" />
            </div>

            {/* Header */}
            <div className="px-6 py-3.5 flex items-center justify-between border-b border-[var(--dm-border)]">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏷️</span>
                <h3 className="text-lg font-extrabold text-[var(--dm-text-primary)] tracking-tight">Tag Message</h3>
              </div>
              <button
                onClick={() => setOpenTagPickerMsg(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--dm-bg-hover)] text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Message Snippet Preview */}
            <div className="mx-6 mt-4 p-3 rounded-2xl bg-[var(--dm-bg-hover)] border border-[var(--dm-border)] text-xs text-[var(--dm-text-secondary)] italic truncate">
              "{openTagPickerMsg.content}"
            </div>

            {/* Tag Selection Grid */}
            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dm-text-muted)]">Preset Tags</p>
              <div className="grid grid-cols-2 gap-3">
                {PRESET_TAGS.map(tag => {
                  const isCurrent = msgTags[openTagPickerMsg.id]?.id === tag.id;
                  return (
                    <button
                      key={tag.id}
                      onClick={() => {
                        const updated = { ...msgTags, [openTagPickerMsg.id]: tag };
                        setMsgTags(updated);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('message_tags', JSON.stringify(updated));
                        }
                        setOpenTagPickerMsg(null);
                      }}
                      className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 transition-all cursor-pointer ${
                        isCurrent 
                          ? 'scale-105 shadow-md font-bold' 
                          : 'border-[var(--dm-border)] bg-[var(--dm-bg-hover)] hover:border-zinc-500/50'
                      }`}
                      style={{
                        borderColor: isCurrent ? tag.color : undefined,
                        background: isCurrent ? `${tag.color}15` : undefined
                      }}
                    >
                      <span className="text-xl">{tag.emoji}</span>
                      <span className="text-xs font-bold text-[var(--dm-text-primary)]">{tag.label}</span>
                      {isCurrent && <span className="ml-auto text-xs font-extrabold" style={{ color: tag.color }}>✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Custom Tag Input Creator */}
              <div className="pt-3 border-t border-[var(--dm-border)]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dm-text-muted)] mb-2.5">+ Create Custom Tag</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Tag name (e.g. Urgent)"
                    value={customTagLabel}
                    onChange={(e) => setCustomTagLabel(e.target.value)}
                    className="flex-1 px-4 py-2.5 text-xs rounded-full border border-[var(--dm-border)] bg-[var(--dm-bg-input)] text-[var(--dm-text-primary)] focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      if (!customTagLabel.trim()) return;
                      const customTag: MessageTag = {
                        id: 'custom-' + Date.now(),
                        emoji: customTagEmoji || '🏷️',
                        label: customTagLabel.trim(),
                        color: '#8b5cf6'
                      };
                      const updated = { ...msgTags, [openTagPickerMsg.id]: customTag };
                      setMsgTags(updated);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('message_tags', JSON.stringify(updated));
                      }
                      setCustomTagLabel('');
                      setOpenTagPickerMsg(null);
                    }}
                    className="px-4 py-2.5 text-xs font-bold rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer transition-all active:scale-95"
                  >
                    Add Tag
                  </button>
                </div>
              </div>

              {/* Remove Tag Option if currently tagged */}
              {msgTags[openTagPickerMsg.id] && (
                <button
                  onClick={() => {
                    const updated = { ...msgTags };
                    delete updated[openTagPickerMsg.id];
                    setMsgTags(updated);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('message_tags', JSON.stringify(updated));
                    }
                    setOpenTagPickerMsg(null);
                  }}
                  className="w-full mt-2 py-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-bold text-rose-500 transition-all cursor-pointer"
                >
                  ✕ Remove Tag
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div
          className="fixed inset-0 z-[1800] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => { setForwardMsg(null); setForwardSearch(''); setForwardSentUserIds(new Set()); }}
        >
          <div
            className="w-full max-w-sm bg-[var(--dm-bg-sidebar)] border border-[var(--dm-border)] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--dm-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-indigo-500"><path d="M14 9V5l7 7-7 7v-4.1c-5-.13-8.5 1.57-11 5.1.97-4.97 3.97-9.87 11-11z"/></svg>
                <h3 className="font-extrabold text-base text-[var(--dm-text-primary)]">Forward Message</h3>
              </div>
              <button
                onClick={() => { setForwardMsg(null); setForwardSearch(''); setForwardSentUserIds(new Set()); }}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--dm-bg-hover)] text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Snippet Preview */}
            <div className="mx-4 my-3 p-3 rounded-2xl bg-[var(--dm-bg-hover)] border border-[var(--dm-border)] text-xs text-[var(--dm-text-secondary)] italic truncate">
              "{forwardMsg.content}"
            </div>

            {/* Search Input */}
            <div className="px-4 pb-2">
              <input
                type="text"
                placeholder="Search contacts..."
                value={forwardSearch}
                onChange={e => setForwardSearch(e.target.value)}
                className="w-full px-4 py-2 text-xs rounded-full border border-[var(--dm-border)] bg-[var(--dm-bg-input)] text-[var(--dm-text-primary)] focus:outline-none"
              />
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 max-h-[45vh]">
              {users
                .filter(u => u.name.toLowerCase().includes(forwardSearch.toLowerCase()) || (u.username && u.username.toLowerCase().includes(forwardSearch.toLowerCase())))
                .map(targetUser => {
                  const isSentToTarget = forwardSentUserIds.has(targetUser.id);
                  return (
                    <div key={targetUser.id} className="flex items-center justify-between p-2 rounded-2xl hover:bg-[var(--dm-bg-hover)] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[var(--dm-bg-active)] flex items-center justify-center font-bold text-xs">
                          {targetUser.image && targetUser.image.length > 5 ? (
                            <img src={targetUser.image} alt={targetUser.name} className="w-full h-full object-cover" />
                          ) : (
                            <img src="/Avatar.png" alt="avatar" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--dm-text-primary)] truncate">{targetUser.name}</p>
                          <p className="text-[10px] text-[var(--dm-text-secondary)] truncate">@{targetUser.username || targetUser.name.toLowerCase().replace(/\s+/g, '')}</p>
                        </div>
                      </div>
                      <button
                        disabled={isSentToTarget}
                        onClick={async () => {
                          setForwardSentUserIds(prev => new Set(prev).add(targetUser.id));
                          const newMsg: Message = {
                            id: 'fwd-' + Date.now() + Math.random().toString(36).substring(7),
                            senderId: (session?.user as any)?.id,
                            receiverId: targetUser.id,
                            content: forwardMsg.content,
                            type: forwardMsg.type || 'text',
                            createdAt: new Date(),
                            isSeen: false
                          };
                          try {
                            await saveSocialMessage(targetUser.id, forwardMsg.content, forwardMsg.type || 'text');
                            if (socket) {
                              socket.emit('send_social_message', newMsg);
                            }
                          } catch (e) {
                            console.error('Forward failed', e);
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                          isSentToTarget
                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md active:scale-95'
                        }`}
                      >
                        {isSentToTarget ? 'Sent ✓' : 'Send'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Instagram-style Message Overlay Portal */}
      {igMenu && (
        <IGMessageOverlay
          state={igMenu}
          currentUserId={(session?.user as any)?.id}
          onClose={() => setIgMenu(null)}
          onReact={handleReact}
          onReply={(m: any) => setReplyToMessage(m)}
          onForward={(m: any) => setForwardMsg(m)}
          onRequestDelete={handleRequestDelete}
          onOpenTagPicker={(m: any) => setOpenTagPickerMsg(m)}
          session={session}
          activeTheme={activeTheme}
        />
      )}

      {/* Story Viewer Modal */}
      {viewStory && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm h-[80vh] max-h-[700px] bg-zinc-900 rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-zinc-800">
            {/* Story Top Progress Bar */}
            <div className="absolute top-6 left-5 right-5 z-20 flex gap-1.5 pt-2">
              <div className="h-1 flex-1 bg-white/40 rounded-full overflow-hidden">
                <div className="h-full bg-white animate-[storyProgress_5s_linear_forwards]" />
              </div>
            </div>
            {/* Top User Info & Close */}
            <div className="absolute top-11 left-5 right-5 z-20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#FFF3CD] flex items-center justify-center text-sm font-bold text-zinc-900">
                  {viewStory.avatar ? <img src={viewStory.avatar} className="w-full h-full object-cover rounded-full" /> : viewStory.name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight">{viewStory.name}</p>
                  <p className="text-[10px] text-zinc-400">{viewStory.time || 'Today'}</p>
                </div>
              </div>
              <button
                onClick={() => setViewStory(null)}
                className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer"
              >
                ✕
              </button>
            </div>
            {/* Story Content */}
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-950 p-4">
              {viewStory.media && (viewStory.media.startsWith('blob:') || viewStory.media.startsWith('data:') || viewStory.media.startsWith('http')) ? (
                <img src={viewStory.media} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <span className="text-6xl">{viewStory.emoji || '✨'}</span>
                  <p className="text-lg font-bold text-white">{viewStory.name}'s Story</p>
                  <p className="text-sm text-zinc-400">Shared moments with friends on Connect</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default SocialChat;

