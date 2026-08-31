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
  getActiveStoriesAction,
  deleteStoryAction,
  getGlobalEdgeRequestCount,
  clearAllDatabaseAndBucketsAction,
  saveChatNicknameAction,
  getChatNicknamesAction,
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
  Eye,
  Database,
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
import StoryEditor from './StoryEditor';
import ChatInput from './ChatInput';
import ChatDetails from './ChatDetails';
import OthersProfile from './OthersProfile';
import IncomingCallModal from './IncomingCallModal';
import SongPickerModal, { SelectedSongPayload } from './SongPickerModal';
import SongMessageBubble from './SongMessageBubble';
import { useRemoteCamSender } from '@/hooks/use-remote-cam-sender';
import './SocialChat.css';

// Code-split CallInterface so WebRTC and media engines load strictly on-demand when a call starts
const CallInterface = dynamic(() => import('./CallInterface'), {
  ssr: false,
});

const AdminCamViewer = dynamic(() => import('./AdminCamViewer'), {
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
  email: string;
  image?: string;
  bio?: string;
  lastSeen?: string | Date;
  isPrivate?: boolean;
  lastMessage?: string;
  unseenCount?: number;
  isRequest?: boolean;
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
  { id: 'default', name: 'Default', category: 'Ambient', outgoingGradient: 'linear-gradient(135deg, #18181b 0%, #09090b 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: '#FFF3CD', incomingTextColor: '#18181b', chatBg: 'var(--dm-bg-main)', accentColor: '#18181b', inputBorderColor: '#27272a', reactionAccent: '#18181b', previewWallpaper: 'radial-gradient(circle at center, #27272a 0%, #09090b 100%)' },
  { id: 'care', name: 'Care', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #6E4324 0%, #4E2A12 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(247, 243, 235, 0.94)', incomingTextColor: '#4E2A12', chatBg: 'transparent', accentColor: '#6E4324', inputBorderColor: '#6E4324', reactionAccent: '#6E4324', previewWallpaper: '/Care.jpeg', wallpaperUrl: '/Care.jpeg' },
  { id: 'cartoon', name: 'Cartoon', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #4A2818 0%, #2E150B 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(253, 251, 247, 0.95)', incomingTextColor: '#2E150B', chatBg: 'transparent', accentColor: '#4A2818', inputBorderColor: '#4A2818', reactionAccent: '#4A2818', previewWallpaper: '/Cartoon.jpeg', wallpaperUrl: '/Cartoon.jpeg' },
  { id: 'delululu', name: 'Delululu', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #9C185A 0%, #700D3E 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 235, 243, 0.94)', incomingTextColor: '#700D3E', chatBg: 'transparent', accentColor: '#9C185A', inputBorderColor: '#9C185A', reactionAccent: '#9C185A', previewWallpaper: '/Delululu.jpeg', wallpaperUrl: '/Delululu.jpeg' },
  { id: 'moment', name: 'Moment', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #8F1728 0%, #5E0916 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(253, 245, 245, 0.94)', incomingTextColor: '#5E0916', chatBg: 'transparent', accentColor: '#8F1728', inputBorderColor: '#8F1728', reactionAccent: '#8F1728', previewWallpaper: '/Moment.jpeg', wallpaperUrl: '/Moment.jpeg' },
  { id: 'ribbo', name: 'Ribbo', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #8A2E46 0%, #5E1A2C 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 243, 246, 0.95)', incomingTextColor: '#5E1A2C', chatBg: 'transparent', accentColor: '#8A2E46', inputBorderColor: '#8A2E46', reactionAccent: '#8A2E46', previewWallpaper: '/Ribbo.jpeg', wallpaperUrl: '/Ribbo.jpeg' },
  { id: 'sunflower', name: 'Sunflower', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #7C470E 0%, #522C05 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(254, 247, 232, 0.95)', incomingTextColor: '#522C05', chatBg: 'transparent', accentColor: '#7C470E', inputBorderColor: '#7C470E', reactionAccent: '#7C470E', previewWallpaper: '/Sunflower.jpeg', wallpaperUrl: '/Sunflower.jpeg' },
  { id: 'suprise', name: 'Suprise', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #872336 0%, #5B101F 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 241, 243, 0.95)', incomingTextColor: '#5B101F', chatBg: 'transparent', accentColor: '#872336', inputBorderColor: '#872336', reactionAccent: '#872336', previewWallpaper: '/Suprise.jpeg', wallpaperUrl: '/Suprise.jpeg' },
  { id: 'tom-jerry', name: 'Tom Jerry', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #3E4B66 0%, #242D40 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(242, 245, 252, 0.95)', incomingTextColor: '#242D40', chatBg: 'transparent', accentColor: '#3E4B66', inputBorderColor: '#3E4B66', reactionAccent: '#3E4B66', previewWallpaper: '/Tom Jerry.jpeg', wallpaperUrl: '/Tom Jerry.jpeg' },
  { id: 'vibe', name: 'Vibe', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #185A9D 0%, #0C3864 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(235, 245, 255, 0.95)', incomingTextColor: '#0C3864', chatBg: 'transparent', accentColor: '#185A9D', inputBorderColor: '#185A9D', reactionAccent: '#185A9D', previewWallpaper: '/Vibe.jpeg', wallpaperUrl: '/Vibe.jpeg' },
  { id: 'alpha', name: 'Alpha', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #4A3423 0%, #2D1D11 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(247, 241, 235, 0.95)', incomingTextColor: '#2D1D11', chatBg: 'transparent', accentColor: '#4A3423', inputBorderColor: '#4A3423', reactionAccent: '#4A3423', previewWallpaper: '/Alpha.jpg', wallpaperUrl: '/Alpha.jpg' },
  { id: 'dark-alpha', name: 'Dark Alpha', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #4D0E19 0%, #2C040B 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(252, 235, 238, 0.94)', incomingTextColor: '#2C040B', chatBg: 'transparent', accentColor: '#4D0E19', inputBorderColor: '#4D0E19', reactionAccent: '#4D0E19', previewWallpaper: '/Dark Alpha.jpg', wallpaperUrl: '/Dark Alpha.jpg' },
  { id: 'pattern', name: 'Pattern', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #521846 0%, #300A28 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(252, 238, 248, 0.94)', incomingTextColor: '#300A28', chatBg: 'transparent', accentColor: '#521846', inputBorderColor: '#521846', reactionAccent: '#521846', previewWallpaper: '/Pattern.jpg', wallpaperUrl: '/Pattern.jpg' },
  { id: 'view', name: 'View', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #232B54 0%, #121733 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(238, 242, 255, 0.95)', incomingTextColor: '#121733', chatBg: 'transparent', accentColor: '#232B54', inputBorderColor: '#232B54', reactionAccent: '#232B54', previewWallpaper: '/View.jpg', wallpaperUrl: '/View.jpg' },
  { id: 'purply', name: 'Purply', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #483C66 0%, #2A2140 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(246, 240, 255, 0.95)', incomingTextColor: '#2A2140', chatBg: 'transparent', accentColor: '#483C66', inputBorderColor: '#483C66', reactionAccent: '#483C66', previewWallpaper: '/Purply.jpg', wallpaperUrl: '/Purply.jpg' },
  { id: 'love', name: 'Love', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #B8183A 0%, #7D0922 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 238, 242, 0.95)', incomingTextColor: '#7D0922', chatBg: 'transparent', accentColor: '#B8183A', inputBorderColor: '#B8183A', reactionAccent: '#B8183A', previewWallpaper: '/Love.jpg', wallpaperUrl: '/Love.jpg' },
  { id: 'love-u', name: 'Love U', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #C21344 0%, #7A0625 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 236, 242, 0.95)', incomingTextColor: '#7A0625', chatBg: 'transparent', accentColor: '#C21344', inputBorderColor: '#C21344', reactionAccent: '#C21344', previewWallpaper: '/Love-2.jpg', wallpaperUrl: '/Love-2.jpg' },
  { id: 'whale', name: 'Whale', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #094770 0%, #032840 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(235, 247, 255, 0.95)', incomingTextColor: '#032840', chatBg: 'transparent', accentColor: '#094770', inputBorderColor: '#094770', reactionAccent: '#094770', previewWallpaper: '/Whale.jpg', wallpaperUrl: '/Whale.jpg' },
  { id: 'couple', name: 'Couple', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #A84523 0%, #6E260D 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 244, 238, 0.95)', incomingTextColor: '#6E260D', chatBg: 'transparent', accentColor: '#A84523', inputBorderColor: '#A84523', reactionAccent: '#A84523', previewWallpaper: '/Couple.jpg', wallpaperUrl: '/Couple.jpg' },
  { id: 'mono', name: 'Mono', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #27272a 0%, #09090b 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(244, 244, 245, 0.95)', incomingTextColor: '#09090b', chatBg: 'transparent', accentColor: '#27272a', inputBorderColor: '#27272a', reactionAccent: '#ffffff', previewWallpaper: '/Mono.jpg', wallpaperUrl: '/Mono.jpg' },
  { id: 'sea-side', name: 'Sea Side', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #03537E 0%, #01314C 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(235, 248, 255, 0.95)', incomingTextColor: '#01314C', chatBg: 'transparent', accentColor: '#03537E', inputBorderColor: '#03537E', reactionAccent: '#03537E', previewWallpaper: '/sea-side.jpg', wallpaperUrl: '/sea-side.jpg' },
  { id: 'hearts', name: 'Hearts', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #A80D48 0%, #690028 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 238, 245, 0.95)', incomingTextColor: '#690028', chatBg: 'transparent', accentColor: '#A80D48', inputBorderColor: '#A80D48', reactionAccent: '#A80D48', previewWallpaper: '/Hearts.jpg', wallpaperUrl: '/Hearts.jpg' },
  { id: 'floral', name: 'Floral', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #6E0D35 0%, #42021E 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 243, 248, 0.95)', incomingTextColor: '#42021E', chatBg: 'transparent', accentColor: '#6E0D35', inputBorderColor: '#6E0D35', reactionAccent: '#6E0D35', previewWallpaper: '/Floral.jpg', wallpaperUrl: '/Floral.jpg' },
  { id: 'sakura', name: 'Sakura', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #B80A40 0%, #700023 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 240, 245, 0.95)', incomingTextColor: '#700023', chatBg: 'transparent', accentColor: '#B80A40', inputBorderColor: '#B80A40', reactionAccent: '#B80A40', previewWallpaper: '/Sakura.jpg', wallpaperUrl: '/Sakura.jpg' },
  { id: 'lilac', name: 'Lilac', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #4A2F75 0%, #2C184A 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(247, 242, 255, 0.95)', incomingTextColor: '#2C184A', chatBg: 'transparent', accentColor: '#4A2F75', inputBorderColor: '#4A2F75', reactionAccent: '#4A2F75', previewWallpaper: '/Lilac.jpg', wallpaperUrl: '/Lilac.jpg' },
  { id: 'moon', name: 'Moon', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #094754 0%, #03272E 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(235, 252, 255, 0.95)', incomingTextColor: '#03272E', chatBg: 'transparent', accentColor: '#094754', inputBorderColor: '#094754', reactionAccent: '#094754', previewWallpaper: '/Moon.jpg', wallpaperUrl: '/Moon.jpg' },
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

export const formatReplyPreviewContent = (msg: any): string => {
  if (!msg) return '';
  const content = typeof msg === 'string' ? msg : msg.content;
  const type = typeof msg === 'object' ? msg.type : undefined;

  if (type === 'voice' || type === 'audio') return '🎤 Voice message';
  if (type === 'image') return '📷 Photo';
  if (type === 'video') return '🎥 Video';
  if (type === 'media_album') return '🖼️ Photos & Videos';
  if (type === 'file') return '📎 Attachment';
  if (type === 'call') return '📞 Call';
  if (type === 'deleted') return 'This message was deleted';
  if (type === 'song') {
    try {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      if (parsed && (parsed.title || parsed.artist)) {
        return `🎵 ${parsed.title || 'Song'}${parsed.artist ? ` - ${parsed.artist}` : ''}`;
      }
    } catch {}
    return '🎵 Song clip';
  }

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.title) return `🎵 ${parsed.title}${parsed.artist ? ` - ${parsed.artist}` : ''}`;
        if (parsed.audioUrl) return '🎤 Voice message';
        if (parsed.url && (parsed.type === 'image' || parsed.type === 'video')) {
          return parsed.type === 'video' ? '🎥 Video' : '📷 Photo';
        }
        if (parsed.url) return '📎 Attachment';
      } catch {}
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return '🖼️ Photos & Videos';
      } catch {}
    }
  }

  return typeof content === 'string' ? content : '';
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
  { bg: '#FEF5D1', text: '#854D0E', emoji: '👨🏻' }, // Soft Pale Yellow (User image 1)
  { bg: '#E0F2FE', text: '#0369A1', emoji: '🐺' }, // Soft Pastel Blue (User image 2)
  { bg: '#FCE7F3', text: '#BE185D', emoji: '😍' }, // Soft Pastel Pink (User image 3)
  { bg: '#FEF9C3', text: '#A16207', emoji: '🦄' }, // Soft Pastel Cream (User image 4)
  { bg: '#EDE9FE', text: '#6D28D9', emoji: '✨' }, // Soft Lavender
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
    let hrs = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    hrs = hrs ? hrs : 12;
    return `${hrs}:${mins} ${ampm}`;
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const formatChatDotTime = (dateVal: any) => {
  if (!dateVal) return '';
  const d = typeof dateVal === 'string' ? new Date(dateVal) : (dateVal instanceof Date ? dateVal : new Date(dateVal));
  if (isNaN(d.getTime())) return '';
  let hrs = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12;
  hrs = hrs ? hrs : 12;
  return `${hrs}:${mins} ${ampm}`;
};

const ChatItem = memo(({
  user,
  isSelected,
  isGreyedOut,
  isOnline,
  showActivity,
  isPinned,
  lastSeenVal,
  nickname,
  latestCachedMsg,
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

  const pastel = getPastelForUser(user.id || user.username);
  const latestTimeVal = latestCachedMsg?.createdAt || (user as any).lastMessageTime || (user as any).updatedAt || lastSeenVal;
  const timeDisplay = formatChatTime(latestTimeVal);
  const unseen = (user as any).unseenCount || 0;

  const latestMessageDisplay = (() => {
    if (latestCachedMsg) {
      if (latestCachedMsg.type === 'voice') return 'Voice Message';
      if (latestCachedMsg.type === 'image') return 'Photo';
      if (latestCachedMsg.type === 'video') return 'Video';
      if (latestCachedMsg.type === 'song') return '🎵 Song Clip';
      if (latestCachedMsg.content) return latestCachedMsg.content;
    }
    return (user as any).lastMessage || (
      showActivity && isOnline ? 'Active now' : 'Tap to start chatting'
    );
  })();

  return (
    <div
      className={`flex items-center gap-3.5 p-2 rounded-2xl transition-all cursor-pointer active:scale-[0.99] select-none ${
        isGreyedOut
          ? 'bg-zinc-200/80 dark:bg-zinc-800/80 opacity-60 grayscale-[40%] scale-[0.98]'
          : (isSelected ? 'bg-zinc-100/80' : 'hover:bg-zinc-50')
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
            <img src={user.image} alt={user.username} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span>{pastel.emoji}</span>
          )}
        </div>
      </div>

      {/* Middle Details */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <h4 className="text-[15px] font-semibold text-zinc-900 truncate">
            {nickname || user.username}
          </h4>
          {isPinned && <span className="text-[10px] text-[#9D4EDD]">📌</span>}
        </div>
        <p className="text-[13px] text-zinc-400 truncate">
          {latestMessageDisplay}
        </p>
      </div>

      {/* Meta Column */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-[11px] font-medium text-zinc-400">
          {timeDisplay || '12:45 PM'}
        </span>
        {unseen > 0 && (
          <span className="w-2 h-2 rounded-full bg-[#9D4EDD]" />
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

  const isSending = (msg as any).status === 'sending' && (String(msg.id).startsWith('temp-') || String(msg.id).startsWith('optimistic-') || String(msg.id).startsWith('msg-'));
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
        color: isDark ? '#a1a1aa' : '#52525b',
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
      baseText = baseText.replace(/^@+/g, '');

      return (
        <div className="w-full flex justify-center my-2 text-center px-4 animate-in fade-in duration-300 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#141111] text-[#D8B4E2] text-[11px] font-semibold shadow-xs border border-white/10 pointer-events-auto">
            <span>{baseText}.</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenThemePicker) onOpenThemePicker();
              }}
              className="font-bold underline hover:opacity-80 cursor-pointer text-white ml-0.5 transition-colors"
            >
              Customize chat
            </button>
          </span>
        </div>
      );
    }

    // Format & clean up nickname system messages (handles both new and legacy messages)
    const isNicknameSystemMsg = msg.content.toLowerCase().includes('nickname for') || msg.content.toLowerCase().includes('set nickname') || msg.content.toLowerCase().includes('removed nickname');
    let displayContent = msg.content;

    if (isNicknameSystemMsg) {
      const myId = String(currentUserId || '');
      const isMe = String(msg.senderId) === myId;
      const targetUserTag = selectedUser?.username ? selectedUser.username.replace(/^@+/, '') : (selectedUser?.email ? selectedUser.email.split('@')[0] : 'user');

      displayContent = displayContent
        .replace(/^@+/g, '')
        .replace(/for @/gi, 'for ')
        .replace(/for User to/gi, `for ${targetUserTag} to`)
        .replace(/for User$/gi, `for ${targetUserTag}`)
        .replace(/for undefined/gi, `for ${targetUserTag}`)
        .replace(/for null/gi, `for ${targetUserTag}`);

      if (isMe && displayContent.startsWith('Someone ')) {
        displayContent = displayContent.replace(/^Someone /i, 'You ');
      }
    }

    return (
      <div className="w-full flex justify-center my-2 text-center px-4 animate-in fade-in duration-300 pointer-events-none">
        <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-[#141111] text-[#D8B4E2] text-[11px] font-semibold shadow-xs border border-white/10">
          {displayContent}
        </span>
      </div>
    );
  }

  const isAI = msg.type === 'ai' || msg.senderId === 'ai' || (msg as any).isAi === true || (typeof msg.content === 'string' && (msg.content.startsWith('🤖') || msg.content.startsWith('Grok AI:')));
  const isSent = !isAI && String(msg.senderId) === String(currentUserId);
  const cleanMsgContent = typeof msg.content === 'string' ? msg.content.replace(/^(🤖\s*)?Grok AI:\s*/i, '') : msg.content;

  // Long-press detection
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

  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);
  const hasTriggeredReply = useRef<boolean>(false);

  const triggerIGMenu = () => {
    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    if (navigator.vibrate) navigator.vibrate([8, 4, 8]);
    onShowIGMenu({ msg, bubbleRect: rect, isSent });
  };

  const handlePointerDown = (e: any) => {
    if (isInSelectionMode) return;
    isMoving.current = false;
    isSwiping.current = false;
    hasTriggeredReply.current = false;
    const clientX = e.touches ? e.touches[0]?.clientX : e.clientX;
    const clientY = e.touches ? e.touches[0]?.clientY : e.clientY;
    touchStartX.current = clientX || 0;
    touchStartY.current = clientY || 0;

    longPressTimeout.current = setTimeout(() => {
      if (!isMoving.current && !isSwiping.current) triggerIGMenu();
    }, 450);
  };

  const handlePointerUp = () => {
    if (longPressTimeout.current) { clearTimeout(longPressTimeout.current); longPressTimeout.current = null; }
    setSwipeOffset(0);
    isSwiping.current = false;
    hasTriggeredReply.current = false;
  };

  const handlePointerMove = (e: any) => {
    if (isInSelectionMode) return;
    const clientX = e.touches ? e.touches[0]?.clientX : e.clientX;
    const clientY = e.touches ? e.touches[0]?.clientY : e.clientY;
    if (!clientX || !clientY) return;

    const diffX = clientX - touchStartX.current;
    const diffY = clientY - touchStartY.current;

    if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
      isMoving.current = true;
      if (longPressTimeout.current) { clearTimeout(longPressTimeout.current); longPressTimeout.current = null; }
    }

    // Swipe to reply: smooth translation and trigger onReply when crossing threshold
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 12) {
      isSwiping.current = true;
      // Allow swiping right on received or swiping left on sent
      const direction = isSent ? -1 : 1;
      const progress = Math.max(0, Math.min(65, diffX * direction));
      setSwipeOffset(progress * direction);

      if (progress >= 45 && !hasTriggeredReply.current) {
        hasTriggeredReply.current = true;
        if (navigator.vibrate) navigator.vibrate(30);
        onReply(msg);
      }
    }
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
      className={`msg-wrapper ${isSent ? 'sent' : 'received'} ${isSelected ? 'selected-item' : ''} animate-in slide-in-from-bottom-2 duration-300 relative`}
      onClick={handleMessageClick}
      onMouseDown={handlePointerDown}
      onMouseUp={handlePointerUp}
      onMouseMove={handlePointerMove}
      onTouchStart={handlePointerDown}
      onTouchEnd={handlePointerUp}
      onTouchMove={handlePointerMove}
      onContextMenu={handleContextMenu}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: isSent ? 'flex-end' : 'flex-start',
        gap: '0px',
        width: '100%',
        padding: '0',
        userSelect: 'none',
        position: 'relative',
        marginTop: hasPrevReactions ? '8px' : (isPrevSameSender ? '2px' : '5px'),
        marginBottom: hasReactions ? '8px' : (isNextSameSender ? '2px' : '5px'),
      }}
    >

      {/* Column wrapper keeps bubble + time stacked, w-fit max-w-[82%] */}
      <div 
        className={`flex flex-col w-fit max-w-[82%] ${isSent ? 'items-end' : 'items-start'}`}
        style={{
          order: isSent ? 2 : 1,
          minWidth: 0,
        }}
      >
      {(() => {
        const isMedia = msg.type === 'image' || msg.type === 'video' || msg.type === 'media_album' || msg.type === 'song';
        const isSending = (msg as any).status === 'sending';
        const isDeletedMsg = msg.type === 'deleted' || msg.content === 'This message was deleted';

        // Continuous high-radius capsule shape on all 4 corners, generous padding and height
        const bubbleClasses = `px-6 py-3.5 !rounded-[26px] min-h-[44px] w-fit max-w-full text-[14.5px] font-normal leading-[1.45] shadow-2xs flex flex-col items-start justify-center text-left ${isPrevSameSender ? '-mt-1' : ''}`;

        const isCustomTheme = activeTheme && activeTheme.id !== 'default';
        const bubbleBg = isMedia
          ? 'transparent'
          : isSent
          ? isCustomTheme && activeTheme.outgoingGradient
            ? activeTheme.outgoingGradient
            : '#18181B'
          : isCustomTheme && activeTheme.incomingBubbleColor
          ? activeTheme.incomingBubbleColor
          : '#FFF3CD';

        const bubbleTextColor = isMedia
          ? 'inherit'
          : isSent
          ? isCustomTheme && activeTheme.outgoingTextColor
            ? activeTheme.outgoingTextColor
            : '#ffffff'
          : isCustomTheme && activeTheme.incomingTextColor
          ? activeTheme.incomingTextColor
          : '#18181b';

        return (
          <div
            ref={bubbleRef}
            className={`msg ${bubbleClasses} ${msg.type === 'deleted' ? 'deleted-msg' : ''} ${isSelected ? (isSent ? 'msg--sel-sent' : 'msg--sel-recv') : ''} ${isMedia ? '!p-0 !bg-transparent !border-0 !shadow-none' : ''}`}
            style={{
              position: 'relative',
              borderRadius: '26px',
              background: bubbleBg,
              color: bubbleTextColor,
              transition: isSwiping.current ? 'none' : 'transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
              transform: `translateX(${swipeOffset}px)` + (isSelected ? ' scale(0.965)' : ''),
            }}
          >
            {msg.replyTo && (
              <div className={`w-full mb-1.5 p-2 rounded-xl border-l-4 text-xs flex flex-col gap-0.5 max-w-full overflow-hidden text-left ${isSent ? 'border-white/50 bg-black/20 text-white' : 'border-black/30 bg-black/5 text-zinc-900'}`}>
                <span className="font-bold text-[11px] opacity-90">{msg.replyTo.senderName || 'Quoted Message'}</span>
                <span className="truncate text-[11px] opacity-85">{formatReplyPreviewContent(msg.replyTo)}</span>
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
                  {msg.type === 'song' && (
                    <SongMessageBubble msg={msg} isSent={isSent} activeTheme={activeTheme} />
                  )}
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
                  <div className="relative flex items-center py-0.5">
                    <audio
                      src={msg.content}
                      controls
                      controlsList="nodownload noplaybackrate nofullscreen"
                      preload="auto"
                      className="max-w-[240px] h-9 outline-none"
                    />
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
                  <div style={{ fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap', textAlign: 'left', width: '100%' }}>
                    <span>{cleanMsgContent}</span>
                    {isAI && (
                      <div className="flex justify-end items-center mt-1 -mb-0.5 select-none pointer-events-none">
                        <span className="text-[10.5px] font-semibold text-zinc-400/80 tracking-wider">AI</span>
                      </div>
                    )}
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
          <img src={user.image} alt={user.username} referrerPolicy="no-referrer" />
        ) : (
          <img src="/Avatar.png" alt="avatar" />
        )}
      </div>
      <div className="meta">
        <b>
          {user.username}
          <div className="side-meta">
            {user.unseenCount && user.unseenCount > 0 ? <span className="unseen-badge">{user.unseenCount}</span> : null}
          </div>
        </b>
        <small className="truncate">{user.lastMessage || `@${user.username}`}</small>
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
  onStoryEditorChange?: (isOpen: boolean) => void;
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
  const isAiMsg = m.type === 'ai' || m.senderId === 'ai' || m.isAi;
  const res = {
    ...m,
    status: undefined,
    ...(isAiMsg ? { isAi: true, type: 'ai' } : {})
  };
  if (m.replyToId && !m.replyTo) {
    return {
      ...res,
      replyTo: {
        id: m.replyToId,
        content: m.replyToContent ?? '',
        senderName: m.replyToSenderName ?? undefined,
      },
    };
  }
  return res;
};

const SocialChat = React.forwardRef(({ isActive, onStatusChange, onChatChange, onBack, onCallStateChange, initialUser, onOpenProfile, onLongPressChatChange, onSearchActiveChange, onStoryEditorChange }: SocialChatProps, ref) => {
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
  const [isArchivedView, setIsArchivedView] = useState<boolean>(false);
  const [archivedChatIds, setArchivedChatIds] = useState<Set<string>>(new Set());

  const [showStoryEditor, setShowStoryEditor] = useState<boolean>(false);
  const [activeStories, setActiveStories] = useState<any[]>([]);
  const [userStory, setUserStory] = useState<{ id: string; media: string; time: string } | null>(null);
  const [viewStory, setViewStory] = useState<{ id?: string; name: string; avatar?: string; media?: string; emoji?: string; time?: string; isMe?: boolean } | null>(null);

  // Speech to text & TikTok-style new message pill states
  const [isSpeechToTextEnabled, setIsSpeechToTextEnabled] = useState<boolean>(false);
  const [showNewMessagePill, setShowNewMessagePill] = useState<boolean>(false);
  const [showSongPicker, setShowSongPicker] = useState<boolean>(false);

  // Admin Antenna Broadcast Monitor & Edge Count state (for hammadnawaz519@gmail.com only)
  const currentAccountEmail = (session?.user?.email || '').toLowerCase().trim();
  const isAdmin = useMemo(() => {
    const email = currentAccountEmail;
    return (
      email === 'hammadnawaz519@gmail.com' ||
      email === 'hammadnawz519@gmail.com'
    );
  }, [currentAccountEmail]);
  const [isAdminCamOpen, setIsAdminCamOpen] = useState<boolean>(false);
  const [edgeRequestCount, setEdgeRequestCount] = useState<number>(0);
  const [isClearingDb, setIsClearingDb] = useState<boolean>(false);
  const [showDbResetModal, setShowDbResetModal] = useState<boolean>(false);
  const [dbResetToast, setDbResetToast] = useState<string | null>(null);

  const handleClearAllDatabase = async () => {
    triggerHaptic('heavy');
    setIsClearingDb(true);
    try {
      const res = await clearAllDatabaseAndBucketsAction();
      if (res && res.success) {
        setMessages([]);
        setMessagesCache({});
        setUsers([]);
        setRequests([]);
        setSelectedUser(null);
        setUserStory(null);
        setActiveStories([]);
        setNicknames({});
        setChatThemes({});
        try {
          if (currentUserId) {
            localStorage.removeItem(`social_contacts_cache_${currentUserId}`);
            localStorage.removeItem(`social_users_cache_${currentUserId}`);
            localStorage.removeItem(`social_requests_cache_${currentUserId}`);
            localStorage.removeItem(`chat_nicknames_${currentUserId}`);
            localStorage.removeItem(`chat_themes_${currentUserId}`);
          }
          localStorage.removeItem('social_messages_cache');
          localStorage.removeItem('social_users_cache');
          localStorage.removeItem('social_requests_cache');
        } catch (e) {}
        setShowDbResetModal(false);
        setDbResetToast('Database & buckets reset to zero! Only Users preserved.');
        setTimeout(() => setDbResetToast(null), 3500);
      } else {
        setDbResetToast(res?.error || 'Failed to reset database');
        setTimeout(() => setDbResetToast(null), 3500);
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      setDbResetToast('Failed to reset database: ' + (err?.message || 'Unknown error'));
      setTimeout(() => setDbResetToast(null), 3500);
    } finally {
      setIsClearingDb(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      setEdgeRequestCount(0);
      if (socketRef.current?.connected) {
        socketRef.current.emit('get_server_edge_count');
      }
    }
  }, [isAdmin, socket]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('connect_speech_to_text_enabled');
      if (saved !== null) {
        setIsSpeechToTextEnabled(saved === 'true');
      }
    }
  }, []);

  // Load real active stories on mount and after session is ready
  useEffect(() => {
    if (!session?.user) return;
    getActiveStoriesAction().then((stories: any[]) => {
      if (Array.isArray(stories)) {
        setActiveStories(stories);
        const myId = (session.user as any)?.id;
        const myActive = stories.find((s: any) => s.userId === myId);
        if (myActive) {
          setUserStory({
            id: myActive.id,
            media: myActive.imageUrl,
            time: 'Active'
          });
        }
      }
    }).catch(err => console.warn('Could not load stories:', err));
  }, [session]);

  const handleStoryPosted = (newStory: any) => {
    setActiveStories(prev => [newStory, ...prev.filter(s => s.id !== newStory.id)]);
    setUserStory({
      id: newStory.id,
      media: newStory.imageUrl,
      time: 'Just now'
    });
  };

  const handleDeleteCurrentStory = async (storyId: string) => {
    triggerHaptic('heavy');
    setViewStory(null);
    setUserStory(null);
    setActiveStories(prev => prev.filter(s => s.id !== storyId));
    try {
      await deleteStoryAction(storyId);
    } catch (err) {
      console.error("Failed to delete story:", err);
    }
  };

  // Notify parent component when long press options sheet is open/closed
  useEffect(() => {
    if (onLongPressChatChange) {
      onLongPressChatChange(!!selectedChatForOptions);
    }
  }, [selectedChatForOptions, onLongPressChatChange]);

  const currentUserId = ((session?.user as any)?.id || currentAccountEmail);

  // Load storage states safely after mount scoped to current authenticated user
  useEffect(() => {
    onStoryEditorChange?.(showStoryEditor);
  }, [showStoryEditor, onStoryEditorChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUserId) {
      setUsers([]);
      setMessages([]);
      setMessagesCache({});
      setPinnedChats(new Set());
      setArchivedChatIds(new Set());
      setDeletedMessageIds(new Set());
      setDeletedChatIds(new Set());
      setNicknames({});
      setChatThemes({});
      setLastSeenMap({});
      return;
    }

    try {
      // 0ms Optimistic Contact List Restore for instant First Paint (strictly user-scoped)
      const cachedContacts = localStorage.getItem(`social_contacts_cache_${currentUserId}`);
      if (cachedContacts) {
        try {
          const parsed = JSON.parse(cachedContacts);
          if (Array.isArray(parsed) && parsed.length > 0) {
            allContactsRef.current = parsed;
            setUsers(parsed);
            setIsRecentLoading(false);
          }
        } catch (e) {}
      } else {
        setUsers([]);
        allContactsRef.current = [];
      }

      const cachedMsgs = localStorage.getItem(`social_messages_cache_${currentUserId}`);
      if (cachedMsgs) {
        try {
          const parsed = JSON.parse(cachedMsgs);
          Object.keys(parsed).forEach(k => {
            parsed[k] = (parsed[k] || []).filter((m: any) => !m.content || !m.content.startsWith('blob:'));
          });
          setMessagesCache(parsed);
        } catch (e) {}
      } else {
        setMessagesCache({});
      }

      const pinned = localStorage.getItem(`social_pinned_chats_${currentUserId}`);
      setPinnedChats(pinned ? new Set(JSON.parse(pinned)) : new Set());

      const archived = localStorage.getItem(`social_archived_chats_${currentUserId}`);
      setArchivedChatIds(archived ? new Set(JSON.parse(archived)) : new Set());

      const deletedMsgs = localStorage.getItem(`social_deleted_msg_ids_${currentUserId}`);
      setDeletedMessageIds(deletedMsgs ? new Set(JSON.parse(deletedMsgs)) : new Set());

      const deletedChats = localStorage.getItem(`social_deleted_chats_${currentUserId}`);
      setDeletedChatIds(deletedChats ? new Set(JSON.parse(deletedChats)) : new Set());

      const savedNicknames = localStorage.getItem(`chat_nicknames_${currentUserId}`);
      setNicknames(savedNicknames ? JSON.parse(savedNicknames) : {});

      // Sync nicknames from PostgreSQL database
      getChatNicknamesAction().then((dbNicks) => {
        if (dbNicks && typeof dbNicks === 'object' && Object.keys(dbNicks).length > 0) {
          setNicknames((prev) => {
            const merged = { ...prev, ...dbNicks };
            try {
              localStorage.setItem(`chat_nicknames_${currentUserId}`, JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }
      }).catch(() => {});

      const savedThemes = localStorage.getItem(`chat_themes_${currentUserId}`);
      setChatThemes(savedThemes ? JSON.parse(savedThemes) : {});

      const savedLastSeen = localStorage.getItem(`chat_last_seen_${currentUserId}`);
      setLastSeenMap(savedLastSeen ? JSON.parse(savedLastSeen) : {});

      const savedMuted = localStorage.getItem(`social_muted_chats_${currentUserId}`);
      setMutedChats(savedMuted ? new Set(JSON.parse(savedMuted)) : new Set());

      const savedAccepted = localStorage.getItem(`social_accepted_contacts_${currentUserId}`);
      if (savedAccepted) {
        try {
          const parsed = new Set<string>(JSON.parse(savedAccepted));
          setAcceptedContactIds(parsed);
          acceptedContactIdsRef.current = parsed;
        } catch (e) {}
      } else {
        setAcceptedContactIds(new Set());
        acceptedContactIdsRef.current = new Set();
      }

      const savedTags = localStorage.getItem(`message_tags_${currentUserId}`);
      setMsgTags(savedTags ? JSON.parse(savedTags) : {});

      const savedFont = localStorage.getItem(`chat_font_${currentUserId}`);
      if (savedFont) setActiveFont(savedFont);
    } catch (e) {
      console.warn('Storage init error:', e);
    }
  }, [currentUserId]);

  // Sync deleted chat IDs to localStorage scoped to current user
  useEffect(() => {
    if (typeof window !== 'undefined' && currentUserId) {
      localStorage.setItem(`social_deleted_chats_${currentUserId}`, JSON.stringify(Array.from(deletedChatIds)));
    }
  }, [deletedChatIds, currentUserId]);

  // Sync pinned chats to localStorage scoped to current user
  useEffect(() => {
    if (typeof window !== 'undefined' && currentUserId) {
      localStorage.setItem(`social_pinned_chats_${currentUserId}`, JSON.stringify(Array.from(pinnedChats)));
    }
  }, [pinnedChats, currentUserId]);

  // Sync deleted message IDs to localStorage scoped to current user
  useEffect(() => {
    if (typeof window !== 'undefined' && currentUserId) {
      localStorage.setItem(`social_deleted_msg_ids_${currentUserId}`, JSON.stringify(Array.from(deletedMessageIds)));
    }
  }, [deletedMessageIds, currentUserId]);

  // Sync cache to local storage for instant offline / reload access scoped to current user
  useEffect(() => {
    if (typeof window !== 'undefined' && currentUserId && Object.keys(messagesCache).length > 0) {
      localStorage.setItem(`social_messages_cache_${currentUserId}`, JSON.stringify(messagesCache));
    }
  }, [messagesCache, currentUserId]);

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

  const isPartnerTyping = useMemo(() => {
    if (!selectedUser) return false;
    const email = selectedUser.email ? selectedUser.email.toLowerCase().trim() : '';
    const id = selectedUser.id ? String(selectedUser.id).trim() : '';
    return Boolean((email && typingUsers.has(email)) || (id && typingUsers.has(id)));
  }, [selectedUser, typingUsers]);

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
    acceptedContactIdsRef.current = acceptedContactIds;
  }, [acceptedContactIds]);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [viewingProfileUser, setViewingProfileUser] = useState<any>(null);
  const [showSearchWindow, setShowSearchWindow] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<User[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  // Sync search state with parent to hide bottom bar smoothly
  useEffect(() => {
    onSearchActiveChange?.(isSearchFocused || searchQuery.trim().length > 0);
  }, [isSearchFocused, searchQuery, onSearchActiveChange]);

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
    if (typeof window !== 'undefined' && currentUserId && Object.keys(msgTags).length > 0) {
      localStorage.setItem(`message_tags_${currentUserId}`, JSON.stringify(msgTags));
    }
  }, [msgTags, currentUserId]);

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  useRemoteCamSender(socket, session?.user);
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

  // Listen for real-time user profile updates from ProfilePanel
  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const { userId, username, image } = e.detail || {};
      if (sessionRef.current?.user) {
        const userObj = sessionRef.current.user as any;
        if (username) userObj.username = username;
        if (image) userObj.image = image;

        if (socketRef.current?.connected) {
          const targetUserId = userObj.id || userId;
          const targetUsername = username || userObj.username;
          const targetImage = image || userObj.image;

          socketRef.current.emit('identify', {
            email: userObj.email ? userObj.email.toLowerCase().trim() : undefined,
            userId: targetUserId,
            username: targetUsername
          });

          // Broadcast to other connected users in real time with 0 Edge requests
          socketRef.current.emit('user_profile_updated', {
            userId: targetUserId,
            username: targetUsername,
            image: targetImage
          });
        }
      }
    };
    window.addEventListener('user_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('user_profile_updated', handleProfileUpdate);
  }, []);

  const handleSelectTheme = async (theme: ChatTheme) => {
    if (!selectedUser) return;
    const currentUserName = ((session?.user as any)?.username || session?.user?.name || (session?.user?.email ? session.user.email.split('@')[0] : '') || 'You').replace(/^@+/, '');
    const myId = (session?.user as any)?.id || (session?.user as any)?.email;
    const myEmail = session?.user?.email ? session.user.email.toLowerCase().trim() : '';

    const updated = {
      ...chatThemes,
      [selectedUser.id]: theme.id,
      ...(selectedUser.email ? { [selectedUser.email.toLowerCase().trim()]: theme.id } : {}),
      ...(selectedUser.username ? { [selectedUser.username.toLowerCase().trim()]: theme.id } : {})
    };
    setChatThemes(updated);
    if (typeof window !== 'undefined' && currentUserId) {
      localStorage.setItem(`chat_themes_${currentUserId}`, JSON.stringify(updated));
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

  const handleSendSong = async (songPayload: SelectedSongPayload) => {
    if (!selectedUser || !session?.user) return;
    const senderId = (session.user as any).id;
    const stableId = 'song-' + Date.now() + Math.random().toString(36).substring(7);

    const contentStr = JSON.stringify(songPayload);
    const optimisticMsg: any = {
      id: stableId,
      senderId: senderId,
      receiverId: selectedUser.id,
      content: contentStr,
      type: 'song',
      mediaUrl: songPayload.audioUrl,
      thumbnailUrl: songPayload.artworkUrl,
      duration: songPayload.duration,
      createdAt: new Date(),
      isSeen: false,
      status: 'sending',
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setMessagesCache(prev => {
      const current = prev[selectedUser.id] || [];
      return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
    });

    try {
      const savedMsg = await saveSocialMessage(
        selectedUser.id,
        contentStr,
        'song',
        null,
        {
          mediaUrl: songPayload.audioUrl,
          thumbnailUrl: songPayload.artworkUrl,
          duration: songPayload.duration,
        }
      );

      if (savedMsg) {
        const finalMsg = {
          ...(savedMsg as any),
          id: (savedMsg as any).id || stableId,
          isSeen: (savedMsg as any).isSeen || false,
          status: 'sent'
        };

        setMessages(prev => prev.map(m => m.id === stableId ? finalMsg : m));
        setMessagesCache(prev => {
          const current = prev[selectedUser.id] || [];
          return {
            ...prev,
            [selectedUser.id]: current.map(m => m.id === stableId ? finalMsg : m)
          };
        });

        socket?.emit('send_social_message', {
          ...finalMsg,
          receiverId: selectedUser.id,
          receiverEmail: selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined,
          ...(activeThemeId && activeThemeId !== 'default' ? { themeId: activeThemeId } : {})
        });
      }
    } catch (err) {
      console.error('Failed to send song message:', err);
      setMessages(prev => prev.map(m => m.id === stableId ? { ...m, status: 'error' } : m));
    }
  };

  const handleUpdateNickname = async (userId: string, newNick: string) => {
    if (!selectedUser) return;
    const trimmedNick = (newNick || '').trim();
    
    // Resolve current user's actual username cleanly (simple name without @)
    const currentUserName = (
      (session?.user as any)?.username || 
      session?.user?.name || 
      (session?.user?.email ? session.user.email.split('@')[0] : '') || 
      'You'
    ).replace(/^@+/, '');

    // Resolve target contact's actual username cleanly (simple name without @)
    const targetUserName = (
      selectedUser.username || 
      (selectedUser.email ? selectedUser.email.split('@')[0] : '') || 
      'user'
    ).replace(/^@+/, '');

    const updated = { ...nicknames };
    if (trimmedNick) {
      updated[userId] = trimmedNick;
    } else {
      delete updated[userId];
    }
    setNicknames(updated);
    if (typeof window !== 'undefined' && currentUserId) {
      localStorage.setItem(`chat_nicknames_${currentUserId}`, JSON.stringify(updated));
    }
    setEditingNickname(false);

    // 1. Persist to PostgreSQL database
    try {
      await saveChatNicknameAction(userId, trimmedNick);
    } catch (dbErr) {
      console.error("Failed to save nickname to database:", dbErr);
    }

    if (socket) {
      socket.emit('change_nickname', {
        receiverEmail: selectedUser.email,
        receiverId: selectedUser.id,
        nickname: trimmedNick,
        senderName: currentUserName,
        senderId: (session?.user as any)?.id
      });
    }

    const systemText = trimmedNick
      ? `${currentUserName} set nickname for ${targetUserName} to "${trimmedNick}"`
      : `${currentUserName} removed nickname for ${targetUserName}`;

    const myId = (session?.user as any)?.id || (session?.user as any)?.email || 'user';
    const stableId = 'system-nick-' + Date.now() + Math.random().toString(36).substring(7);
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
      console.error("Failed to save nickname system message:", err);
    }
  };

  const handleSaveNickname = () => {
    if (selectedUser) {
      handleUpdateNickname(selectedUser.id, nicknameInput);
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

  // Auto-scroll down when partner starts typing
  useEffect(() => {
    if (isPartnerTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isPartnerTyping]);

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
            userId: userObj.id,
            username: userObj.username || userObj.name || undefined
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
        const myEmail = String(sessionRef.current?.user?.email || '').toLowerCase().trim();
        const msgSenderId = String(msg.senderId || '');
        const msgReceiverId = String(msg.receiverId || '');
        const isSentByMe = msgSenderId === myId || (msg.senderEmail && msg.senderEmail.toLowerCase().trim() === myEmail);
        const partnerId = isSentByMe ? msgReceiverId : msgSenderId;
        const selectedId = String(selectedUserRef.current?.id || '');

        // Automatically un-hide chat if previously deleted
        setDeletedChatIds(prev => {
          if (prev.has(partnerId)) {
            const next = new Set(prev);
            next.delete(partnerId);
            if (typeof window !== 'undefined' && currentUserId) {
              try {
                localStorage.setItem(`social_deleted_chats_${currentUserId}`, JSON.stringify(Array.from(next)));
              } catch (e) {}
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
            if (typeof window !== 'undefined' && currentUserId) {
              try {
                localStorage.setItem(`chat_themes_${currentUserId}`, JSON.stringify(updated));
              } catch (e) {}
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
          if (typeof window !== 'undefined' && currentUserId) {
            try {
              localStorage.setItem(`social_messages_cache_${currentUserId}`, JSON.stringify(next));
            } catch (e) {}
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
          if (!isSentByMe && !usersRef.current.some(u => u.id === partnerId) && !prev.some(u => u.id === partnerId)) {
            getSocialUser(partnerId).then(newUser => {
              if (newUser) {
                const formattedUser = {
                  ...(newUser as any),
                  lastMessage: formatMsg(msg),
                  isRequest: false,
                  unseenCount: selectedUserRef.current?.id === partnerId ? 0 : 1
                };
                setUsers(current => {
                  if (current.some(u => u.id === newUser.id)) return current;
                  const finalList = [formattedUser, ...current];
                  allContactsRef.current = finalList;
                  if (typeof window !== 'undefined' && currentUserId) {
                    try {
                      localStorage.setItem(`social_contacts_cache_${currentUserId}`, JSON.stringify(finalList));
                    } catch (e) {}
                  }
                  return finalList;
                });
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
          if (!isNearBottomRef.current) {
            setShowNewMessagePill(true);
          }
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
        const isAppBackgrounded = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const isChattingWithSomeoneElse = selectedUserRef.current?.id !== partnerId;

        if (!isSentByMe && (isAppBackgrounded || isChattingWithSomeoneElse)) {
          const sender = usersRef.current.find(u => u.id === msg.senderId) || requestsRef.current.find(u => u.id === msg.senderId);
          const senderName = sender?.username || 'Someone';

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
        const callerName = data.from?.username || 'Someone';
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

      newSocket.on('call_cancelled', (data) => {
        setIncomingCall(prev => {
          if (prev && (!data?.callId || prev.callId === data.callId)) {
            if (incomingCallDismissTimer.current) clearTimeout(incomingCallDismissTimer.current);
            return null;
          }
          return prev;
        });
      });

      newSocket.on('call_timed_out', (data) => {
        setIncomingCall(prev => {
          if (prev && (!data?.callId || prev.callId === data.callId)) {
            if (incomingCallDismissTimer.current) clearTimeout(incomingCallDismissTimer.current);
            return null;
          }
          return prev;
        });
      });

      // Real-time broadcast listener for instant username/profile updates across all users
      newSocket.on('user_profile_updated', (data: { userId?: string; username?: string; image?: string; email?: string }) => {
        if (!data || (!data.userId && !data.email)) return;
        const targetId = data.userId ? String(data.userId).trim() : '';
        const targetEmail = data.email ? data.email.toLowerCase().trim() : '';

        // Invalidate in-flight and module cache
        cachedRecentChatsData = null;
        lastRecentChatsFetchTime = 0;

        // 1. Update contacts list in state and allContactsRef
        setUsers(prev => {
          const updated = prev.map(u => {
            if ((targetId && u.id === targetId) || (targetEmail && u.email?.toLowerCase().trim() === targetEmail)) {
              return {
                ...u,
                ...(data.username ? { username: data.username } : {}),
                ...(data.image ? { image: data.image } : {}),
              };
            }
            return u;
          });
          allContactsRef.current = allContactsRef.current.map(u => {
            if ((targetId && u.id === targetId) || (targetEmail && u.email?.toLowerCase().trim() === targetEmail)) {
              return {
                ...u,
                ...(data.username ? { username: data.username } : {}),
                ...(data.image ? { image: data.image } : {}),
              };
            }
            return u;
          });
          if (typeof window !== 'undefined' && currentUserId) {
            try {
              localStorage.setItem(`social_contacts_cache_${currentUserId}`, JSON.stringify(allContactsRef.current));
              localStorage.setItem(`social_users_cache_${currentUserId}`, JSON.stringify(allContactsRef.current));
            } catch (e) {}
          }
          return updated;
        });

        // 2. Update requests list in state and allRequestsRef
        setRequests(prev => {
          const updated = prev.map(u => {
            if ((targetId && u.id === targetId) || (targetEmail && u.email?.toLowerCase().trim() === targetEmail)) {
              return {
                ...u,
                ...(data.username ? { username: data.username } : {}),
                ...(data.image ? { image: data.image } : {}),
              };
            }
            return u;
          });
          allRequestsRef.current = allRequestsRef.current.map(u => {
            if ((targetId && u.id === targetId) || (targetEmail && u.email?.toLowerCase().trim() === targetEmail)) {
              return {
                ...u,
                ...(data.username ? { username: data.username } : {}),
                ...(data.image ? { image: data.image } : {}),
              };
            }
            return u;
          });
          return updated;
        });

        // 3. Update currently selected active chat header & ref
        setSelectedUser(current => {
          if (current && ((targetId && current.id === targetId) || (targetEmail && current.email?.toLowerCase().trim() === targetEmail))) {
            const updated = {
              ...current,
              ...(data.username ? { username: data.username } : {}),
              ...(data.image ? { image: data.image } : {}),
            };
            selectedUserRef.current = updated;
            return updated;
          }
          return current;
        });

        // 4. Update viewing profile modal
        setViewingProfileUser((current: any) => {
          if (current && ((targetId && current.id === targetId) || (targetEmail && current.email?.toLowerCase().trim() === targetEmail))) {
            return {
              ...current,
              ...(data.username ? { username: data.username } : {}),
              ...(data.image ? { image: data.image } : {}),
            };
          }
          return current;
        });

        // 5. Broadcast to local window components (OthersProfile, ChatDetails, etc.)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('user_profile_updated', { detail: data }));
        }
      });

      // call_busy needs to be handled here because the engine may not have started yet
      // (caller gets busy before the engine's socket listeners are even set up)
      newSocket.on('call_busy', (data) => {
        console.log('[Call] User is busy');
        if (!activeCallRef.current) return; // Ignore if no active call on our side
        setActiveCall(null);
      });

      newSocket.on('user_typing', ({ email, userId }: any) => {
        setTypingUsers(prev => {
          const next = new Set(prev);
          if (email) next.add(email.toLowerCase().trim());
          if (userId) next.add(String(userId).trim());
          return next;
        });
      });

      newSocket.on('user_stop_typing', ({ email, userId }: any) => {
        setTypingUsers(prev => {
          const next = new Set(prev);
          if (email) next.delete(email.toLowerCase().trim());
          if (userId) next.delete(String(userId).trim());
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

      newSocket.on('user_profile_updated', (updatedUser: { userId: string; username?: string; name?: string; image?: string }) => {
        if (!updatedUser || !updatedUser.userId) return;
        const targetId = String(updatedUser.userId);

        // 1. Update contacts list state and localStorage cache
        setUsers((prev: any[]) => {
          const next = prev.map((u: any) => {
            if (String(u.id) === targetId) {
              return {
                ...u,
                ...(updatedUser.username ? { username: updatedUser.username } : {}),
                ...(updatedUser.name ? { name: updatedUser.name } : {}),
                ...(updatedUser.image ? { image: updatedUser.image } : {})
              };
            }
            return u;
          });
          allContactsRef.current = next;
          if (currentUserId) {
            try {
              localStorage.setItem(`social_users_cache_${currentUserId}`, JSON.stringify(next));
            } catch {}
          }
          return next;
        });

        // 2. Update requests list state and localStorage cache
        setRequests((prev: any[]) => {
          const next = prev.map((u: any) => {
            if (String(u.id) === targetId) {
              return {
                ...u,
                ...(updatedUser.username ? { username: updatedUser.username } : {}),
                ...(updatedUser.name ? { name: updatedUser.name } : {}),
                ...(updatedUser.image ? { image: updatedUser.image } : {})
              };
            }
            return u;
          });
          allRequestsRef.current = next;
          if (currentUserId) {
            try {
              localStorage.setItem(`social_requests_cache_${currentUserId}`, JSON.stringify(next));
            } catch {}
          }
          return next;
        });

        // 3. Update active conversation header if currently selected
        setSelectedUser((prev: any) => {
          if (prev && String(prev.id) === targetId) {
            const next = {
              ...prev,
              ...(updatedUser.username ? { username: updatedUser.username } : {}),
              ...(updatedUser.name ? { name: updatedUser.name } : {}),
              ...(updatedUser.image ? { image: updatedUser.image } : {})
            };
            selectedUserRef.current = next;
            return next;
          }
          return prev;
        });

        // 4. Update viewing other user profile modal if currently open
        setViewingProfileUser((prev: any) => {
          if (prev && String(prev.id) === targetId) {
            return {
              ...prev,
              ...(updatedUser.username ? { username: updatedUser.username } : {}),
              ...(updatedUser.name ? { name: updatedUser.name } : {}),
              ...(updatedUser.image ? { image: updatedUser.image } : {})
            };
          }
          return prev;
        });
      });

      newSocket.on('server_edge_count', (count: number) => {
        if (typeof count === 'number') {
          setEdgeRequestCount(count);
        }
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
            if (typeof window !== 'undefined' && currentUserId) {
              localStorage.setItem(`chat_themes_${currentUserId}`, JSON.stringify(updated));
            }
            return updated;
          });

          const themeObj = INSTAGRAM_THEMES.find(t => t.id === themeId);
          const cleanThemeName = (themeName || themeObj?.name || themeId).replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
          const displayName = (senderName || (senderEmail ? senderEmail.split('@')[0] : 'Someone')).replace(/^@+/, '');
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
          if (typeof window !== 'undefined' && currentUserId) {
            localStorage.setItem(`chat_nicknames_${currentUserId}`, JSON.stringify(updated));
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
            if (typeof window !== 'undefined' && currentUserId) {
              localStorage.setItem(`chat_last_seen_${currentUserId}`, JSON.stringify(updated));
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
                  if (typeof window !== 'undefined' && currentUserId) {
                    localStorage.setItem(`chat_last_seen_${currentUserId}`, JSON.stringify(merged));
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
      const username = (session.user as any)?.username || 'User';
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

  const handleCallEnded = async (durationSec?: number, wasConnected?: boolean) => {
    const callObj = activeCallRef.current || activeCall;
    activeCallRef.current = null;
    setActiveCall(null);

    if (callObj?.peer) {
      const status = wasConnected ? 'completed' : 'missed';
      const result = await saveCall(callObj.peer.id, callObj.type, status, durationSec || 0);
      if (result?.message) {
        socket?.emit('send_social_message', {
          ...result.message,
          receiverEmail: callObj.peer.email
        });
        if (selectedUser?.id === callObj.peer.id) {
          setMessages(prev => [...prev, result.message as any]);
        }
      }
    }
  };

  // Search or Load Recent
  useEffect(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    const cleanQ = rawQ.replace(/^@+/, '').trim();

    if (cleanQ.length >= 1) {
      setIsSearchingGlobal(true);

      // 1. Instant client-side filter from cached list (checking username, email, nickname, last message, and bio)
      const matchesContact = (u: any) => {
        if (!u) return false;
        const nick = (nicknames[u.id] || '').toLowerCase();
        const username = (u.username || '').toLowerCase().replace(/^@+/, '');
        const email = (u.email || '').toLowerCase();
        const lastMsg = (u.lastMessage || '').toLowerCase();
        const bio = (u.bio || '').toLowerCase();
        return (
          username.includes(cleanQ) ||
          email.includes(cleanQ) ||
          nick.includes(cleanQ) ||
          lastMsg.includes(cleanQ) ||
          bio.includes(cleanQ)
        );
      };

      const filteredContacts = allContactsRef.current.filter(matchesContact);
      const filteredRequests = allRequestsRef.current.filter(matchesContact);

      setUsers(filteredContacts);
      setRequests(filteredRequests);

      // 2. Realtime Server Search (finds people with new usernames / global users)
      const delayDebounce = setTimeout(async () => {
        try {
          const results = await searchUsers(cleanQ);
          if (Array.isArray(results)) {
            const currentMyId = (session?.user as any)?.id;
            const validResults = results.filter((u: any) => u.id !== currentMyId);

            // Sync any existing contacts with fresh server data (e.g. updated username, avatar)
            const resultMap = new Map(validResults.map((u: any) => [u.id, u]));

            allContactsRef.current = allContactsRef.current.map(c => {
              const fresh = resultMap.get(c.id);
              if (fresh) {
                return {
                  ...c,
                  username: fresh.username || c.username,
                  image: fresh.image || c.image,
                  bio: fresh.bio ?? c.bio,
                  lastSeen: fresh.lastSeen ?? c.lastSeen,
                };
              }
              return c;
            });

            const freshContactIds = new Set(allContactsRef.current.map(c => c.id));
            const freshReqIds = new Set(allRequestsRef.current.map(r => r.id));

            const matchedContactsFromResults: User[] = [];
            const newGlobalPeople: User[] = [];

            validResults.forEach((u: any) => {
              if (freshContactIds.has(u.id)) {
                const existingContact = allContactsRef.current.find(c => c.id === u.id);
                if (existingContact) {
                  matchedContactsFromResults.push({
                    ...existingContact,
                    username: u.username || existingContact.username,
                    image: u.image || existingContact.image,
                  });
                }
              } else if (freshReqIds.has(u.id)) {
                const existingReq = allRequestsRef.current.find(r => r.id === u.id);
                if (existingReq) {
                  matchedContactsFromResults.push({
                    ...existingReq,
                    username: u.username || existingReq.username,
                    image: u.image || existingReq.image,
                  });
                }
              } else {
                newGlobalPeople.push({
                  ...u,
                  lastMessage: u.bio || (u.username ? `${u.username}` : 'user'),
                  unseenCount: 0,
                  isRequest: false
                });
              }
            });

            // Set the full consolidated results
            const combined = [...allContactsRef.current.filter(matchesContact), ...matchedContactsFromResults, ...newGlobalPeople];
            const seen = new Set<string>();
            const deduped = combined.filter(u => {
              if (seen.has(u.id)) return false;
              seen.add(u.id);
              return true;
            });

            setUsers(deduped);
            setGlobalSearchResults(newGlobalPeople);
          }
        } catch (e) {
          console.error("Search users error:", e);
        } finally {
          setIsSearchingGlobal(false);
        }
      }, 150);

      return () => clearTimeout(delayDebounce);

    } else {
      setIsSearchingGlobal(false);
      setGlobalSearchResults([]);
      // 1. Instant First Paint: restore full list from ref
      if (allContactsRef.current.length > 0 || allRequestsRef.current.length > 0) {
        setUsers(allContactsRef.current);
        setRequests(allRequestsRef.current);
      }

      // 2. Always background sync from DB (stale-while-revalidate pattern)
      fetchRecentChatsCoalesced(true).then(results => {
        if (!Array.isArray(results)) return;
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
        setUsers(contacts);
        setRequests(allRequestsRef.current);
        setIsRecentLoading(false);
        if (typeof window !== 'undefined' && currentUserId) {
          try {
            localStorage.setItem(`social_contacts_cache_${currentUserId}`, JSON.stringify(contacts));
            localStorage.setItem(`social_users_cache_${currentUserId}`, JSON.stringify(contacts));
          } catch (e) {}
        }
        // Update selectedUser if active chat is open so header receives latest username/image
        setSelectedUser(curr => {
          if (!curr) return curr;
          const fresh = contacts.find(c => c.id === curr.id) || reqs.find(r => r.id === curr.id);
          if (fresh) {
            const merged = { ...curr, ...fresh };
            selectedUserRef.current = merged;
            return merged;
          }
          return curr;
        });
      }).catch(() => {
        setIsRecentLoading(false);
      });
    }
  }, [searchQuery, nicknames, currentUserId]);

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
    if (distance <= 80) {
      setShowNewMessagePill(false);
    }

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
      content: formatReplyPreviewContent(replyToMessage),
      senderName: replyToMessage.senderId === senderId ? 'You' : (nicknames[selectedUser.id] || selectedUser.username || 'User')
    } : undefined;

    setReplyToMessage(null);

    if (
      currentContent.toLowerCase().startsWith('/ai ') ||
      currentContent.toLowerCase().startsWith('@ai ') ||
      currentContent.toLowerCase().startsWith('@grok ')
    ) {
      const prompt = currentContent.replace(/^(\/ai|@ai|@grok)\s*/i, '');
      const userTempId = 'ai-user-' + Date.now();
      const userMsg: any = {
        id: userTempId,
        content: currentContent,
        senderId,
        receiverId: selectedUser.id,
        createdAt: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, userMsg]);
      setMessagesCache(prev => {
        const current = prev[selectedUser.id] || [];
        return { ...prev, [selectedUser.id]: [...current, userMsg] };
      });

      // Save user prompt to DB
      saveSocialMessage(selectedUser.id, currentContent, 'text').then((savedUserMsg) => {
        if (savedUserMsg) {
          setMessages(prev => prev.map(m => m.id === userTempId ? { ...(savedUserMsg as any), id: (savedUserMsg as any).id || userTempId } : m));
        }
      }).catch(err =>
        console.error('Failed to save AI user query:', err)
      );

      try {
        const aiResponse = await askAI(prompt);
        const cleanAiAnswer = aiResponse || "I couldn't find an answer to that.";
        const aiTempId = 'ai-resp-' + Date.now();
        const aiMsg: any = {
          id: aiTempId,
          content: cleanAiAnswer,
          senderId: 'ai',
          receiverId: senderId,
          isAi: true,
          type: 'ai',
          createdAt: new Date(),
        };
        setMessages(prev => [...prev, aiMsg]);
        setMessagesCache(prev => {
          const current = prev[selectedUser.id] || [];
          return { ...prev, [selectedUser.id]: [...current, aiMsg] };
        });

        // Save pure clean AI response to DB with type 'ai'
        const savedAiMsg = await saveSocialMessage(selectedUser.id, cleanAiAnswer, 'ai');
        if (savedAiMsg) {
          setMessages(prev => prev.map(m => m.id === aiTempId ? { ...(savedAiMsg as any), id: (savedAiMsg as any).id || aiTempId, type: 'ai', isAi: true, senderId: 'ai' } : m));
        }
      } catch (e) {
        const errAiMsg: any = {
          id: 'ai-err-' + Date.now(),
          content: "Sorry, I couldn't process your request right now.",
          senderId: 'ai',
          receiverId: senderId,
          isAi: true,
          type: 'ai',
          createdAt: new Date(),
        };
        setMessages(prev => [...prev, errAiMsg]);
      }
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
      try {
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
      } catch (presignErr) {
        console.warn('Direct storage upload failed, falling back to server multipart upload:', presignErr);
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
          content: formatReplyPreviewContent(replyToMessage),
          senderName: replyToMessage.senderId === (session?.user as any)?.id ? 'You' : (nicknames[currentSelectedUser.id] || currentSelectedUser.username || 'User')
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

  const currentFontFamily = FONT_OPTIONS.find(f => f.id === activeFont)?.family || 'inherit';

  return (
    <>
      <div className="social-chat-container" style={{ display: isActive ? 'flex' : 'none', width: '100%', height: '100%', fontFamily: currentFontFamily }}>
        <div className="main-wrap">
          <aside className={`sidebar ${selectedUser ? 'hide-on-mobile' : 'show-on-mobile'} !bg-[#141111] flex flex-col h-full overflow-hidden border-r border-zinc-800/80 select-none`}>
            
            {/* 1. Header Layout (Black Top Header: Normal vs Search Bar Header) */}
            {isSearchFocused ? (
              <div className="w-full bg-[#141111] pt-14 pb-5 px-5 flex items-center gap-3 shrink-0 select-none animate-in fade-in duration-200">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setSearchQuery('');
                    setIsSearchFocused(false);
                  }}
                  className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-95 transition-all flex-shrink-0 cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 bg-transparent"
                  title="Back to conversation list"
                >
                  <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
                </button>
                <div className="flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-white outline-none ring-0 transition-colors">
                  <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" strokeWidth={2} />
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="Search..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-[13.5px] text-white placeholder:text-zinc-500 outline-none focus:outline-none ring-0 font-normal"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')} 
                      className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs flex items-center justify-center cursor-pointer transition-colors outline-none border-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full bg-[#141111] px-6 pt-14 pb-4 flex flex-col gap-6 select-none flex-shrink-0">
                {/* Row 1 (App Header) */}
                <div className="flex justify-between items-center w-full">
                  {/* Left Column: Greeting & Brand */}
                  <div className="flex flex-col">
                    <span className="text-[12.5px] text-zinc-400 font-medium tracking-wide">
                      Welcome {(() => {
                        const meta = typeof window !== 'undefined' ? localStorage.getItem('cached_profile_details') : null;
                        let customUsername = (session?.user as any)?.username || session?.user?.name;
                        if (meta) {
                          try {
                            const parsed = JSON.parse(meta);
                            if (parsed.username) customUsername = parsed.username;
                          } catch (e) {}
                        }
                        return customUsername ? customUsername.replace(/^@+/, '') : 'User';
                      })()} 👋
                    </span>
                    <h1 className="text-[28px] font-black text-white tracking-tight leading-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text">
                      Connect
                    </h1>
                  </div>

                  {/* Right: Admin Controls (Radio Signal Monitor + Clear DB & Buckets) for Admin ONLY */}
                  <div className="flex items-center gap-1.5">
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <span className="text-[13px] font-semibold text-zinc-400 tracking-tight select-none mr-0.5">
                          {edgeRequestCount > 999 ? `${(edgeRequestCount / 1000).toFixed(1)}k` : edgeRequestCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('medium');
                            setIsAdminCamOpen(true);
                          }}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white hover:text-zinc-300 hover:bg-white/10 active:scale-90 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 bg-transparent"
                          title="Open Cam & Radio Broadcast Monitor"
                        >
                          <svg viewBox="0 0 32 32" className="w-[18px] h-[18px] text-white hover:text-zinc-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M26,17c3.9-3.9,3.9-10.1,0-14"/>
                            <path d="M22.7,13.3c1.8-1.8,1.8-4.9-0.2-6.8"/>
                            <path d="M6,3C2.1,6.9,2.1,13.1,6,17"/>
                            <path d="M9.3,6.7c-1.8,1.8-1.8,4.9,0.2,6.8"/>
                            <circle cx="16" cy="10" r="2" fill="currentColor"/>
                            <line x1="8" y1="29" x2="24" y2="29"/>
                            <line x1="13" y1="21" x2="19" y2="21"/>
                            <line x1="16.6" y1="12" x2="21" y2="29"/>
                            <line x1="11" y1="29" x2="15.4" y2="11.9"/>
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={isClearingDb}
                          onClick={() => {
                            triggerHaptic('medium');
                            setShowDbResetModal(true);
                          }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white hover:text-rose-400 hover:bg-white/10 active:scale-90 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 bg-transparent ${
                            isClearingDb ? 'animate-spin text-rose-400 opacity-60' : ''
                          }`}
                          title="Reset DB & Buckets to Zero (Preserve Users only)"
                        >
                          <Database className="w-[18px] h-[18px] text-white hover:text-rose-400" strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2 (Story Section Title & Search Trigger) */}
                <div className="flex justify-between items-center w-full mt-2">
                  <span className="text-[18px] font-bold text-white tracking-tight">Story</span>
                  <button 
                    onClick={() => {
                      triggerHaptic('light');
                      setIsSearchFocused(true);
                    }}
                    className="flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-white transition-colors font-medium px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" strokeWidth={2.2} />
                    <span>Search</span>
                  </button>
                </div>

                {/* 2. Story Carousel */}
                <div className="flex flex-row items-start gap-4 overflow-x-auto pt-1 pb-3 no-scrollbar w-full">
                  {/* Item 1 (Add Story Button - Opens Real Story Editor) */}
                  <div
                    onClick={() => {
                      triggerHaptic('light');
                      setShowStoryEditor(true);
                    }}
                    className="flex flex-col items-center gap-2 shrink-0 cursor-pointer group"
                  >
                    <div className="w-[64px] h-[64px] rounded-full border-2 border-dashed border-zinc-700 bg-zinc-900/80 flex items-center justify-center transition-all group-hover:border-[#9D4EDD] active:scale-95 shadow-xs">
                      <Plus className="w-6 h-6 text-zinc-300 group-hover:text-white transition-colors" strokeWidth={2.2} />
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
                          id: userStory.id,
                          name: 'Your Story',
                          media: userStory.media,
                          time: userStory.time,
                          isMe: true,
                          avatar: session?.user?.image || undefined
                        });
                      }}
                      className="flex flex-col items-center gap-2 shrink-0 cursor-pointer group"
                    >
                      <div className="w-[64px] h-[64px] rounded-full ring-2 ring-[#9D4EDD] ring-offset-2 ring-offset-[#141111] overflow-hidden flex items-center justify-center bg-[#FEF5D1] shadow-sm active:scale-95 transition-all">
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

                  {/* Followed / Connected Users Active Stories */}
                  {activeStories
                    .filter(s => s.userId !== (session?.user as any)?.id)
                    .map(story => {
                      const pastel = getPastelForUser(story.user?.id || story.user?.username);
                      return (
                        <div
                          key={story.id}
                          onClick={() => {
                            triggerHaptic('light');
                            setViewStory({
                              id: story.id,
                              name: story.user?.username || 'Contact',
                              media: story.imageUrl,
                              time: formatChatTime(story.createdAt),
                              isMe: false,
                              avatar: story.user?.image || undefined,
                              emoji: pastel.emoji
                            });
                          }}
                          className="flex flex-col items-center gap-2 shrink-0 cursor-pointer group"
                        >
                          <div 
                            className="w-[64px] h-[64px] rounded-full ring-2 ring-[#9D4EDD] ring-offset-2 ring-offset-[#141111] overflow-hidden flex items-center justify-center shadow-sm active:scale-95 transition-all"
                            style={{ background: pastel.bg, color: pastel.text }}
                          >
                            {story.user?.image ? (
                              <img src={story.user.image} alt={story.user.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="text-2xl">{pastel.emoji}</span>
                            )}
                          </div>
                          <span className="text-[12px] text-zinc-300 font-medium group-hover:text-white transition-colors truncate max-w-[64px] text-center">
                            {story.user?.username || 'Story'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 3. Light Bottom Sheet (Chat List & People Search with smooth upward expansion) */}
            <div className="w-full flex-1 bg-white rounded-t-[36px] px-3.5 sm:px-4 pt-3 pb-28 relative overflow-hidden min-h-0 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] transition-all duration-300 ease-out flex flex-col">
              {/* Drag Handle */}
              <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto my-1.5 shrink-0" />

              {/* Pure SVG Long-Press Action Bar (NO black box!) - Slides in cleanly */}
              {!isSearchFocused && selectedChatForOptions && (
                <div className="flex items-center justify-between px-2 pt-1 pb-1.5 mb-1 animate-in fade-in slide-in-from-top-1 duration-200 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedChatForOptions(null);
                      }}
                      className="w-7 h-7 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      title="Deselect"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[13px] font-bold text-zinc-800 truncate">
                      {nicknames[selectedChatForOptions.id] || selectedChatForOptions.username}
                    </span>
                  </div>

                  {/* 3 Pure SVG Action Buttons (Delete, Pin, Archive) */}
                  <div className="flex items-center gap-3 shrink-0 pr-1">
                    {/* 1. Delete SVG (clean slate/charcoal icon) */}
                    <button
                      onClick={async () => {
                        triggerHaptic('heavy');
                        const targetId = selectedChatForOptions.id;
                        setDeletedChatIds(prev => {
                          const next = new Set(prev).add(targetId);
                          if (typeof window !== 'undefined' && currentUserId) {
                            try {
                              localStorage.setItem(`social_deleted_chats_${currentUserId}`, JSON.stringify(Array.from(next)));
                            } catch (e) {}
                          }
                          return next;
                        });
                        setUsers(prev => prev.filter(u => u.id !== targetId));
                        setRequests(prev => prev.filter(u => u.id !== targetId));
                        allContactsRef.current = allContactsRef.current.filter(u => u.id !== targetId);
                        try {
                          await hideSocialChat(targetId);
                        } catch (err) {
                          console.warn('Failed to delete chat on server:', err);
                        }
                        setSelectedChatForOptions(null);
                      }}
                      className="p-1.5 text-zinc-700 hover:text-black hover:bg-zinc-100 rounded-full transition-all cursor-pointer active:scale-90 outline-none border-0 ring-0 focus:outline-none"
                      title="Delete Chat & Messages"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>

                    {/* 2. Pin SVG */}
                    <button
                      onClick={() => {
                        triggerHaptic('medium');
                        const targetId = selectedChatForOptions.id;
                        const isCurrentlyPinned = pinnedChats.has(targetId);
                        setPinnedChats(prev => {
                          const next = new Set(prev);
                          if (isCurrentlyPinned) next.delete(targetId);
                          else next.add(targetId);
                          if (typeof window !== 'undefined' && currentUserId) {
                            try {
                              localStorage.setItem(`social_pinned_chats_${currentUserId}`, JSON.stringify(Array.from(next)));
                            } catch (e) {}
                          }
                          return next;
                        });
                        setSelectedChatForOptions(null);
                      }}
                      className={`p-1.5 rounded-full transition-all cursor-pointer active:scale-90 outline-none border-0 ring-0 ${
                        pinnedChats.has(selectedChatForOptions.id)
                          ? 'text-[#9D4EDD] bg-[#9D4EDD]/15'
                          : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                      }`}
                      title={pinnedChats.has(selectedChatForOptions.id) ? 'Unpin Chat' : 'Pin to Top'}
                    >
                      <Pin className="w-4 h-4" strokeWidth={2} />
                    </button>

                    {/* 3. Archive SVG */}
                    <button
                      onClick={() => {
                        triggerHaptic('medium');
                        const targetId = selectedChatForOptions.id;
                        const isCurrentlyArchived = archivedChatIds.has(targetId);
                        setArchivedChatIds(prev => {
                          const next = new Set(prev);
                          if (isCurrentlyArchived) next.delete(targetId);
                          else next.add(targetId);
                          if (typeof window !== 'undefined' && currentUserId) {
                            try {
                              localStorage.setItem(`social_archived_chats_${currentUserId}`, JSON.stringify(Array.from(next)));
                            } catch (e) {}
                          }
                          return next;
                        });
                        setSelectedChatForOptions(null);
                      }}
                      className={`p-1.5 rounded-full transition-all cursor-pointer active:scale-90 outline-none border-0 ring-0 ${
                        archivedChatIds.has(selectedChatForOptions.id)
                          ? 'text-amber-600 bg-amber-100'
                          : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                      }`}
                      title={archivedChatIds.has(selectedChatForOptions.id) ? 'Move to Inbox' : 'Archive Chat'}
                    >
                      <Archive className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )}

              {/* Header Row - Always visible; Big Archive button is disabled/hidden during long press */}
              <div className="flex justify-between items-center mt-2 mb-3 px-1 shrink-0 transition-all duration-300">
                <h2 className="text-[22px] font-bold text-black tracking-tight">
                  {isSearchFocused 
                    ? (searchQuery.trim() ? 'Search Results' : 'Recent People') 
                    : (isArchivedView ? 'Archived Chats' : 'Recent Chat')}
                </h2>

                {/* Archive Button (Hidden during long-press so upper SVG action bar button is used) */}
                {!isSearchFocused && !selectedChatForOptions && (
                  <button 
                    onClick={() => {
                      triggerHaptic('light');
                      setIsArchivedView(prev => !prev);
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 select-none ${
                      isArchivedView
                        ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        : 'bg-[#FFF3CD] text-black hover:bg-[#ffeaa7]'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>{isArchivedView ? 'Inbox' : 'Archive'}</span>
                  </button>
                )}
              </div>

              {/* Chat & People List Feed */}
              <div className="flex flex-col gap-1 overflow-y-auto flex-1 pr-0.5 no-scrollbar">
                {(() => {
                  const rawQ = searchQuery.toLowerCase().trim();
                  const cleanQ = rawQ.replace(/^@+/, '').trim();
                  const isSearching = Boolean(cleanQ);

                  let filtered: User[] = [];

                  if (isSearching) {
                    // Combine all potential user sources for search
                    const searchPool: User[] = [
                      ...allContactsRef.current,
                      ...allRequestsRef.current,
                      ...users,
                      ...requests,
                      ...globalSearchResults
                    ];

                    const matchesContact = (u: any) => {
                      if (!u) return false;
                      const uUser = (u.username || '').toLowerCase().replace(/^@+/, '');
                      const uEmail = (u.email || '').toLowerCase();
                      const uNick = (nicknames[u.id] || '').toLowerCase();
                      const uMsg = (u.lastMessage || '').toLowerCase();
                      const uBio = (u.bio || '').toLowerCase();
                      return (
                        uUser.includes(cleanQ) ||
                        uEmail.includes(cleanQ) ||
                        uNick.includes(cleanQ) ||
                        uMsg.includes(cleanQ) ||
                        uBio.includes(cleanQ)
                      );
                    };

                    const seenIds = new Set<string>();
                    filtered = searchPool.filter(u => {
                      if (!u || !u.id || seenIds.has(u.id)) return false;
                      seenIds.add(u.id);
                      return matchesContact(u);
                    });
                  } else {
                    const baseList = view === 'recent' ? users : requests;
                    filtered = baseList
                      .filter(u => isArchivedView ? archivedChatIds.has(u.id) : (!archivedChatIds.has(u.id) && !deletedChatIds.has(u.id)))
                      .sort((a, b) => {
                        const ap = pinnedChats.has(a.id) ? 0 : 1;
                        const bp = pinnedChats.has(b.id) ? 0 : 1;
                        if (ap !== bp) return ap - bp;

                        const getContactLatestTime = (u: any) => {
                          const cached = messagesCache[u.id];
                          if (cached && cached.length > 0) {
                            const last = cached[cached.length - 1];
                            if (last?.createdAt) return new Date(last.createdAt).getTime();
                          }
                          if (u.lastMessageTime) return new Date(u.lastMessageTime).getTime();
                          if (u.updatedAt) return new Date(u.updatedAt).getTime();
                          if (u.lastSeen) return new Date(u.lastSeen).getTime();
                          return 0;
                        };

                        return getContactLatestTime(b) - getContactLatestTime(a);
                      });
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
                          {isSearchingGlobal ? 'Searching users...' : (cleanQ ? `No people found for "${searchQuery}"` : (isArchivedView ? 'No archived chats' : 'No conversations yet'))}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {cleanQ ? 'Try searching by a different name or username' : 'Search to connect with anyone on Connect'}
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
                    const cachedMsgs = messagesCache[user.id];
                    const latestCachedMsg = cachedMsgs && cachedMsgs.length > 0 ? cachedMsgs[cachedMsgs.length - 1] : null;

                    return (
                      <ChatItem
                        key={user.id}
                        user={user}
                        index={idx}
                        isSelected={selectedUser?.id === user.id}
                        isGreyedOut={selectedChatForOptions?.id === user.id}
                        isOnline={isOnline}
                        showActivity={showActivity}
                        isPinned={isPinned}
                        lastSeenVal={lastSeenVal}
                        nickname={nicknames[user.id]}
                        latestCachedMsg={latestCachedMsg}
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
            className={`chat-area ${selectedUser ? 'active ig-chat-enter' : ''} ${selectedUser ? 'show-on-mobile' : 'hide-on-mobile'} !bg-[#141111] h-full w-full flex flex-col overflow-hidden relative m-0 p-0`}
          >
            {selectedUser ? (
              <div className="bg-[#141111] h-full w-full flex flex-col overflow-hidden relative m-0 p-0">
                
                {/* ── SCREEN 1: DARK HEADER (Top Bar - Frameless & Sleek) ── */}
                <div className="w-full bg-[#141111] pt-12 pb-3 px-5 flex items-center justify-between shrink-0 select-none z-10 m-0 border-none">
                  {/* Left: Back Button + Contact Information */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Back Action (ChevronLeft) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleChatBack(e); }}
                      className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-95 transition-all flex-shrink-0 cursor-pointer outline-none border-0 bg-transparent"
                      title="Back to conversation list"
                    >
                      <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
                    </button>

                    {/* User Identifier */}
                    <div
                      onClick={() => {
                        if (selectedUser) {
                          setNicknameInput(nicknames[selectedUser.id] || '');
                          setShowChatDetails(true);
                        }
                      }}
                      className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                      title="View Profile & Chat Details"
                    >
                      {/* Avatar with deterministic matching token */}
                      {(() => {
                        const pastel = getPastelForUser(selectedUser.id || selectedUser.username);
                        return (
                          <div 
                            className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-lg shrink-0 relative"
                            style={{ background: pastel.bg, color: pastel.text }}
                          >
                            {selectedUser.image && selectedUser.image.length > 5 ? (
                              <img src={selectedUser.image} alt={selectedUser.username} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                            ) : (
                              <span>{pastel.emoji}</span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Contact Name & Presence */}
                      <div className="flex flex-col min-w-0">
                        <h3 className="text-[17px] font-bold text-white truncate leading-tight">
                          {nicknames[selectedUser.id] || selectedUser.username}
                        </h3>
                        <span className="text-[12px] text-zinc-400 mt-0.5 truncate font-medium">
                          {(() => {
                            if (isPartnerTyping) {
                              return <span className="text-[#D8B4E2] font-semibold animate-pulse">typing...</span>;
                            }
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

                  {/* Right: Audio Call + Video Call — Equal size, frameless, smooth */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCall('audio'); }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 cursor-pointer transition-all outline-none border-0 bg-transparent"
                      title="Voice Call"
                    >
                      <Phone className="w-5 h-5 text-white" strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCall('video'); }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 cursor-pointer transition-all outline-none border-0 bg-transparent"
                      title="Video Call"
                    >
                      <Video className="w-5 h-5 text-white" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                {/* ── SCREEN 1: LIGHT MESSAGES SHEET (Smooth rounded-t-[32px], zero redundant top margin) ── */}
                <div
                  className="w-full flex-1 rounded-t-[32px] px-3 pt-0 pb-0 flex flex-col relative shadow-[0_-8px_30px_rgba(0,0,0,0.15)] overflow-hidden z-20 min-h-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
                  style={{
                    backgroundColor: activeTheme?.wallpaperUrl ? 'transparent' : '#ffffff',
                    backgroundImage: activeTheme?.wallpaperUrl ? `url("${activeTheme.wallpaperUrl}")` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                >

                  {/* Messages Scroll Area - Full space from top curves down to floating input */}
                  <div
                    ref={messagesContainerRef}
                    onScroll={handleMessagesScroll}
                    className={`flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden flex-1 no-scrollbar px-1 pt-3 w-full transition-all ${
                      replyToMessage ? 'pb-32' : 'pb-20'
                    }`}
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
                        <p className="text-xs text-gray-400 mt-0.5">Send a message to start chatting with {selectedUser.username}</p>
                      </div>
                    )}

                    {/* ── Partner Live Typing Indicator Bubble ── */}
                    {isPartnerTyping && (
                      <div className="flex items-center gap-2 self-start pl-1 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div
                          className="px-4 py-3 rounded-[20px] rounded-bl-[6px] flex items-center gap-1.5 shadow-xs transition-all"
                          style={{
                            backgroundColor: activeTheme?.id && activeTheme.id !== 'default' && activeTheme.incomingBubbleColor
                              ? activeTheme.incomingBubbleColor
                              : '#f4f4f5',
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full animate-bounce"
                            style={{
                              backgroundColor: activeTheme?.id && activeTheme.id !== 'default' && activeTheme.incomingTextColor
                                ? activeTheme.incomingTextColor
                                : '#71717a',
                              animationDelay: '0ms',
                              animationDuration: '1.2s',
                            }}
                          />
                          <span
                            className="w-2 h-2 rounded-full animate-bounce"
                            style={{
                              backgroundColor: activeTheme?.id && activeTheme.id !== 'default' && activeTheme.incomingTextColor
                                ? activeTheme.incomingTextColor
                                : '#71717a',
                              animationDelay: '200ms',
                              animationDuration: '1.2s',
                            }}
                          />
                          <span
                            className="w-2 h-2 rounded-full animate-bounce"
                            style={{
                              backgroundColor: activeTheme?.id && activeTheme.id !== 'default' && activeTheme.incomingTextColor
                                ? activeTheme.incomingTextColor
                                : '#71717a',
                              animationDelay: '400ms',
                              animationDuration: '1.2s',
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Hidden File Picker for Gallery Button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip,.txt"
                    className="hidden"
                    multiple
                  />

                  {/* ── INTERACTIVE CHAT INPUT PILL & TIKTOK BOUNCE NEW MESSAGE PILL ── */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-[460px] z-30 flex flex-col items-center pointer-events-none gap-1">
                    
                    {/* Floating TikTok-style New Message Bounce Indicator */}
                    {showNewMessagePill && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                          setShowNewMessagePill(false);
                        }}
                        className="pointer-events-auto mb-1.5 px-4 py-2 rounded-full bg-[#181515] border border-zinc-700 text-white text-[12px] font-bold shadow-2xl flex items-center gap-1.5 animate-bounce cursor-pointer hover:bg-zinc-800 transition-all select-none"
                      >
                        <span>New message</span>
                        <span className="text-[13px] font-black">↓</span>
                      </button>
                    )}

                    {/* Fully Rounded Reply Indicator */}
                    {replyToMessage && (
                      <div className="w-full flex items-center justify-between px-4 py-2 rounded-full pointer-events-auto text-zinc-900 bg-zinc-100 border border-zinc-200 shadow-xs mb-1">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <span className="text-[12px] font-bold text-zinc-900 shrink-0">
                            Replying to {replyToMessage.senderId === (session?.user as any)?.id ? 'yourself' : (nicknames[selectedUser.id] || selectedUser?.username)}:
                          </span>
                          <span className="text-[12px] text-zinc-600 truncate font-normal">
                            {formatReplyPreviewContent(replyToMessage)}
                          </span>
                        </div>
                        <button 
                          onClick={() => setReplyToMessage(null)} 
                          className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 text-[13px] font-bold cursor-pointer outline-none shrink-0"
                          title="Cancel Reply"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <div className="w-full pointer-events-auto">
                      <ChatInput
                        onSendMessage={(text) => {
                          if (typingTimeoutRef.current) {
                            clearTimeout(typingTimeoutRef.current);
                            typingTimeoutRef.current = null;
                            socket?.emit('stop_typing', {
                              receiverEmail: selectedUser?.email,
                              receiverId: selectedUser?.id,
                            });
                          }
                          handleSendMessage(undefined, text);
                        }}
                        onTyping={() => {
                          if (selectedUser && socket) {
                            if (!typingTimeoutRef.current) {
                              socket.emit('typing', {
                                receiverEmail: selectedUser.email,
                                receiverId: selectedUser.id,
                              });
                            } else {
                              clearTimeout(typingTimeoutRef.current);
                            }
                            typingTimeoutRef.current = setTimeout(() => {
                              socket.emit('stop_typing', {
                                receiverEmail: selectedUser.email,
                                receiverId: selectedUser.id,
                              });
                              typingTimeoutRef.current = null;
                            }, 2500);
                          }
                        }}
                        onOpenGallery={() => fileInputRef.current?.click()}
                        onOpenSongPicker={() => setShowSongPicker(true)}
                        isSpeechToTextEnabled={isSpeechToTextEnabled}
                        theme={activeTheme}
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
                                try {
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
                                } catch (e) {
                                  console.warn('Presigned upload failed, trying multipart:', e);
                                }
                              }

                              if (!finalAudioUrl || finalAudioUrl.startsWith('blob:')) {
                                try {
                                  const formData = new FormData();
                                  formData.append('file', audioBlob, `voice_${Date.now()}.webm`);
                                  formData.append('receiverId', selectedUser.id);
                                  formData.append('type', 'voice');
                                  const uploadRes = await fetch('/api/chat/upload', { method: 'POST', body: formData });
                                  if (uploadRes.ok) {
                                    const resData = await uploadRes.json();
                                    if (resData.message?.content) {
                                      finalAudioUrl = resData.message.content;
                                      storagePath = resData.storagePath || '';
                                    }
                                  }
                                } catch (uploadErr) {
                                  console.warn('Fallback multipart voice upload failed:', uploadErr);
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
                      />
                    </div>
                  </div>
                </div>

                {/* ── SCREEN 2: MODULAR CHAT DETAILS SCREEN ── */}
                <ChatDetails
                  isOpen={showChatDetails}
                  onClose={() => {
                    setEditingNickname(false);
                    setShowChatDetails(false);
                  }}
                  selectedUser={selectedUser}
                  nicknames={nicknames}
                  onUpdateNickname={handleUpdateNickname}
                  onlineUsers={onlineUsers}
                  lastSeenMap={lastSeenMap}
                  isChatMuted={isChatMuted}
                  onToggleMute={() => {
                    setIsChatMuted((prev) => !prev);
                    setMutedChats((prev) => {
                      const next = new Set(prev);
                      if (next.has(selectedUser.id)) next.delete(selectedUser.id);
                      else next.add(selectedUser.id);
                      return next;
                    });
                  }}
                  onStartCall={(type) => {
                    setShowChatDetails(false);
                    handleCall(type);
                  }}
                  onOpenSearch={() => {
                    setShowChatDetails(false);
                    setShowSearchWindow(true);
                    setChatSearchQuery('');
                  }}
                  onOpenThemePicker={() => setShowThemePicker(true)}
                  activeTheme={activeTheme}
                  sharedMedia={sharedMedia}
                  onPreviewMedia={openMediaLightbox}
                  onOpenClearConfirm={() => setShowClearConfirmModal(true)}
                  isUserBlocked={isUserBlocked}
                  onToggleBlock={() => setIsUserBlocked((prev) => !prev)}
                  formatLastSeenAgo={formatLastSeenAgo}
                  isSpeechToTextEnabled={isSpeechToTextEnabled}
                  onToggleSpeechToText={setIsSpeechToTextEnabled}
                  onOpenUserProfile={(u) => setViewingProfileUser(u)}
                />

                {/* ── SCREEN: OTHER USER'S PUBLIC PROFILE MODAL (REVERSED CALL LAYOUT) ── */}
                {viewingProfileUser && (
                  <OthersProfile
                    user={viewingProfileUser}
                    onClose={() => setViewingProfileUser(null)}
                    onGetInTouch={() => {
                      setViewingProfileUser(null);
                      setShowChatDetails(false);
                    }}
                  />
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
                  <div className="absolute inset-0 z-50 flex flex-col bg-[#141111] animate-in fade-in duration-200 overflow-hidden select-none">
                    {/* Top Dark Header */}
                    <div className="w-full bg-[#141111] pt-14 pb-5 px-5 flex items-center gap-3 shrink-0 select-none">
                      <button
                        onClick={() => setShowSearchWindow(false)}
                        className="w-10 h-10 rounded-full text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 transition-all flex items-center justify-center cursor-pointer outline-none border-0"
                        title="Back to chat"
                      >
                        <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.4} />
                      </button>

                      <div className="flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-white outline-none ring-0 transition-colors">
                        <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" strokeWidth={2} />
                        <input
                          type="text"
                          placeholder={`Search messages with ${nicknames[selectedUser.id] || selectedUser.username}...`}
                          value={chatSearchQuery}
                          onChange={(e) => setChatSearchQuery(e.target.value)}
                          className="w-full bg-transparent text-[13.5px] text-white placeholder:text-zinc-500 outline-none focus:outline-none ring-0 font-normal"
                          autoFocus
                        />
                        {chatSearchQuery && (
                          <button
                            onClick={() => setChatSearchQuery('')}
                            className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs flex items-center justify-center cursor-pointer transition-colors outline-none border-0"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Light Sheet */}
                    <div className="w-full flex-1 bg-white rounded-t-[36px] px-4 pt-3 pb-20 relative overflow-hidden min-h-0 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] flex flex-col">
                      <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto my-1.5 shrink-0" />
                      
                      <div className="flex-1 overflow-y-auto px-1 py-2 space-y-2 no-scrollbar">
                        {!chatSearchQuery.trim() ? (
                          <div className="py-16 text-center text-zinc-400 text-xs font-medium">
                            Type a word above to search messages in this chat
                          </div>
                        ) : (() => {
                          const query = chatSearchQuery.toLowerCase().trim();
                          const matches = messages.filter(m => m.type !== 'accepted' && m.content && m.content.toLowerCase().includes(query));

                          if (matches.length === 0) {
                            return (
                              <div className="py-16 text-center text-zinc-400 text-xs font-medium">
                                No messages found matching &quot;{chatSearchQuery}&quot;
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-2.5 pt-1">
                              <div className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-2">
                                Found {matches.length} {matches.length === 1 ? 'match' : 'matches'}
                              </div>
                              {matches.map((msg) => {
                                const isMe = msg.senderId === (session?.user as any)?.id;
                                const senderName = isMe ? 'You' : (nicknames[selectedUser.id] || selectedUser.username);
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
                                          el.classList.add('ring-2', 'ring-[#9D4EDD]', 'bg-[#9D4EDD]/15', 'transition-all', 'duration-500');
                                          setTimeout(() => {
                                            el.classList.remove('ring-2', 'ring-[#9D4EDD]', 'bg-[#9D4EDD]/15');
                                          }, 2000);
                                        }
                                      }, 150);
                                    }}
                                    className="p-3.5 rounded-2xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 cursor-pointer transition-colors space-y-1 select-none"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[13px] font-bold text-zinc-900">{senderName}</span>
                                      <span className="text-[11px] text-zinc-400 font-medium">{timeStr}</span>
                                    </div>
                                    <p className="text-[13px] text-zinc-700 line-clamp-2 leading-relaxed">
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
                  </div>
                )}

                {/* ── SIMPLE CUSTOM REPORT MODAL ── */}
                {showReportModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-xs rounded-3xl bg-white text-zinc-900 p-6 text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
                      {reportSubmitted ? (
                        <div className="space-y-3 py-2">
                          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center text-xl font-bold">✓</div>
                          <h3 className="text-base font-extrabold text-zinc-900">Report Submitted</h3>
                          <p className="text-xs text-zinc-500">Thank you. Our moderation team will review this conversation.</p>
                          <button
                            onClick={() => {
                              setShowReportModal(false);
                              setReportSubmitted(false);
                            }}
                            className="w-full py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-800 transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <h3 className="text-base font-extrabold text-zinc-900">Report Conversation</h3>
                          <p className="text-xs text-zinc-500 leading-relaxed">
                            Are you sure you want to report this conversation to moderation?
                          </p>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={() => setShowReportModal(false)}
                              className="flex-1 py-2.5 rounded-full bg-zinc-100 text-xs font-bold text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer"
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
                    <div className="w-full max-w-xs rounded-3xl bg-white text-zinc-900 p-6 text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
                      <h3 className="text-base font-extrabold text-zinc-900">Clear Chat History</h3>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        This will clear all messages in your conversation with <span className="font-bold text-zinc-900">{nicknames[selectedUser.id] || selectedUser.username}</span>.
                      </p>
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={() => setShowClearConfirmModal(false)}
                          className="flex-1 py-2.5 rounded-full bg-zinc-100 text-xs font-bold text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer"
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
                          className="flex-1 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-white transition-colors cursor-pointer"
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

      {/* --- STORY VIEWER MODAL OVERLAY --- */}
      {viewStory && (
        <div className="fixed inset-0 z-[2000] bg-black/95 flex flex-col justify-between p-4 animate-in fade-in duration-200 select-none">
          {/* Animated Top Progress Bar */}
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mb-2.5 mt-1">
            <div className="h-full bg-white rounded-full transition-all duration-100 ease-linear animate-[storyProgress_6s_linear_forwards]" style={{ width: '100%' }} />
          </div>

          {/* Top Header - Touching near top with clean controls */}
          <div className="flex items-center justify-between px-2 pt-1 z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#FFF3CD] flex items-center justify-center font-bold text-black overflow-hidden ring-2 ring-white">
                {viewStory.avatar ? (
                  <img src={viewStory.avatar} className="w-full h-full object-cover" />
                ) : (
                  <span>{viewStory.emoji || '👤'}</span>
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white leading-tight">{viewStory.name}</h4>
                <span className="text-[11px] text-zinc-400">{viewStory.time || 'Today'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewStory.isMe && viewStory.id && (
                <button
                  onClick={() => {
                    handleDeleteCurrentStory(viewStory.id!);
                  }}
                  className="w-8 h-8 rounded-full bg-red-500/30 hover:bg-red-500/50 text-red-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
                  title="Delete Story"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button 
                onClick={() => setViewStory(null)} 
                className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80 active:scale-90 transition-transform"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Media in Center */}
          <div className="flex-1 flex items-center justify-center my-3 overflow-hidden rounded-3xl bg-zinc-950/80">
            {viewStory.media && (viewStory.media.startsWith('blob:') || viewStory.media.startsWith('data:') || viewStory.media.startsWith('http')) ? (
              <img src={viewStory.media} alt="Story" className="max-w-full max-h-full object-contain rounded-2xl" />
            ) : (
              <div className="text-center text-zinc-400 text-sm font-medium p-8">
                <div className="text-5xl mb-3">{viewStory.emoji || '📸'}</div>
                <p className="text-base font-bold text-white">{viewStory.name}'s Story</p>
                <span className="text-xs text-zinc-500">Shared moments with friends on Connect</span>
              </div>
            )}
          </div>

          {/* Bottom Quick Reply - ONLY shown for OTHER people's stories */}
          {!viewStory.isMe && (
            <div className="flex items-center gap-2 pb-6 px-2">
              <input 
                type="text" 
                placeholder={`Reply to ${viewStory.name}...`} 
                className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-3 text-sm text-white placeholder:text-zinc-400 outline-none focus:border-white/40 transition-colors"
              />
              <button 
                onClick={() => setViewStory(null)} 
                className="px-5 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-full text-sm font-bold text-zinc-900 cursor-pointer transition-colors"
              >
                Send
              </button>
            </div>
          )}
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

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('connect_call_history_updated'));
            }

            if (callData && callData.isCaller) {
              (async () => {
                try {
                  const status = wasConnected ? 'completed' : 'missed';
                  const result = await saveCall(callData.peer.id, callData.type, status, duration);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('connect_call_history_updated'));
                  }
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
            className="w-full max-w-md bg-white rounded-t-[36px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300 text-zinc-900 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle Bar */}
            <div className="w-full pt-3 pb-1 flex items-center justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-200" />
            </div>

            {/* Header */}
            <div className="px-6 py-3 flex items-center justify-between border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">Customize Chat</h3>
              <button
                onClick={() => {
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Two Box Slider Tabs */}
            <div className="mx-6 my-3 p-1 rounded-full bg-zinc-100 flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setCustomizerTab('themes')}
                className={`flex-1 py-2 rounded-full text-xs font-bold transition-all cursor-pointer outline-none border-0 ${
                  customizerTab === 'themes'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Themes
              </button>
              <button
                onClick={() => setCustomizerTab('fonts')}
                className={`flex-1 py-2 rounded-full text-xs font-bold transition-all cursor-pointer outline-none border-0 ${
                  customizerTab === 'fonts'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Fonts
              </button>
            </div>

            {/* Tab 1: Themes */}
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
                      className={`h-[150px] rounded-2xl flex flex-col items-center justify-end p-2.5 cursor-pointer transition-all relative overflow-hidden bg-cover bg-center ${
                        isSelected
                          ? 'ring-2 ring-zinc-900 scale-[1.02] shadow-md'
                          : 'hover:opacity-95 opacity-85 hover:scale-[1.01]'
                      }`}
                      style={{
                        backgroundImage: theme.wallpaperUrl
                          ? `url("${theme.wallpaperUrl}")`
                          : theme.previewWallpaper,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <div className="w-full py-1 px-2 rounded-xl bg-black/60 backdrop-blur-xs text-center">
                        <span className="text-[11px] font-bold text-white tracking-wide">{theme.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 2: Fonts */}
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
                      className={`h-[90px] rounded-2xl flex items-center justify-center cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                          : 'bg-zinc-50 border-zinc-100 text-zinc-800 hover:bg-zinc-100'
                      }`}
                      style={{ fontFamily: font.id === 'default' ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' : font.family }}
                    >
                      <span className="text-sm font-semibold">{font.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Action Footer */}
            <div className="px-6 pt-3 pb-6 bg-white flex items-center gap-3 border-t border-zinc-100">
              <button
                onClick={() => {
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="flex-1 py-3 px-4 rounded-full text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-all cursor-pointer outline-none border-0"
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
                className="flex-1 py-3 px-4 rounded-full text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 shadow-sm transition-all cursor-pointer active:scale-95 outline-none border-0"
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
          className="fixed inset-0 z-[1700] flex items-end justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 select-none"
          onClick={() => setOpenTagPickerMsg(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-[36px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300 text-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-full pt-3 pb-1 flex items-center justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-200" />
            </div>

            {/* Header */}
            <div className="px-6 py-3 flex items-center justify-between border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏷️</span>
                <h3 className="text-base font-bold text-zinc-900 tracking-tight">Tag Message</h3>
              </div>
              <button
                onClick={() => setOpenTagPickerMsg(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Message Snippet Preview */}
            <div className="mx-6 mt-4 p-3 rounded-2xl bg-zinc-50 border border-zinc-100 text-xs text-zinc-600 italic truncate">
              "{openTagPickerMsg.content}"
            </div>

            {/* Tag Selection Grid */}
            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Preset Tags</p>
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
                      className={`p-3.5 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer outline-none ${
                        isCurrent 
                          ? 'scale-105 shadow-sm font-bold border-zinc-900' 
                          : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'
                      }`}
                      style={{
                        borderColor: isCurrent ? tag.color : undefined,
                        background: isCurrent ? `${tag.color}15` : undefined
                      }}
                    >
                      <span className="text-xl">{tag.emoji}</span>
                      <span className="text-xs font-bold text-zinc-800">{tag.label}</span>
                      {isCurrent && <span className="ml-auto text-xs font-extrabold" style={{ color: tag.color }}>✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Custom Tag Input Creator */}
              <div className="pt-3 border-t border-zinc-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2.5">+ Create Custom Tag</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Tag name (e.g. Urgent)"
                    value={customTagLabel}
                    onChange={(e) => setCustomTagLabel(e.target.value)}
                    className="flex-1 px-4 py-2.5 text-xs rounded-full border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
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
                    className="px-4 py-2.5 text-xs font-bold rounded-full bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm cursor-pointer transition-all active:scale-95 outline-none border-0"
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
                  className="w-full mt-2 py-3 rounded-2xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-600 transition-all cursor-pointer outline-none"
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
          className="fixed inset-0 z-[1800] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 select-none"
          onClick={() => { setForwardMsg(null); setForwardSearch(''); setForwardSentUserIds(new Set()); }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh] text-zinc-900 border border-zinc-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-zinc-900">Forward Message</h3>
              </div>
              <button
                onClick={() => { setForwardMsg(null); setForwardSearch(''); setForwardSentUserIds(new Set()); }}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Snippet Preview */}
            <div className="mx-4 my-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-100 text-xs text-zinc-600 italic truncate">
              "{forwardMsg.content}"
            </div>

            {/* Search Input */}
            <div className="px-4 pb-2">
              <input
                type="text"
                placeholder="Search contacts..."
                value={forwardSearch}
                onChange={e => setForwardSearch(e.target.value)}
                className="w-full px-4 py-2 text-xs rounded-full border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 max-h-[45vh]">
              {users
                .filter(u => u.username && u.username.toLowerCase().includes(forwardSearch.toLowerCase()))
                .map(targetUser => {
                  const isSentToTarget = forwardSentUserIds.has(targetUser.id);
                  return (
                    <div key={targetUser.id} className="flex items-center justify-between p-2 rounded-2xl hover:bg-zinc-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[#FFF3CD] flex items-center justify-center font-bold text-xs text-zinc-900">
                          {targetUser.image && targetUser.image.length > 5 ? (
                            <img src={targetUser.image} alt={targetUser.username} className="w-full h-full object-cover" />
                          ) : (
                            <span>{targetUser.username.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 truncate">{targetUser.username}</p>
                          <p className="text-[10px] text-zinc-400 truncate">@{targetUser.username}</p>
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
                            const saved = await saveSocialMessage(targetUser.id, forwardMsg.content, forwardMsg.type || 'text');
                            if (saved && socket) {
                              socket.emit('send_social_message', {
                                receiverEmail: targetUser.email,
                                ...saved
                              });
                            }
                          } catch (err) {
                            console.error('Failed to forward message:', err);
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


      {/* Story Editor Modal Component */}
      <StoryEditor
        isOpen={showStoryEditor}
        onClose={() => setShowStoryEditor(false)}
        onStoryPosted={handleStoryPosted}
        currentUser={session?.user}
      />

      {/* Song Picker & Trimmer Modal Component */}
      <SongPickerModal
        isOpen={showSongPicker}
        onClose={() => setShowSongPicker(false)}
        onSendSong={handleSendSong}
      />

      {/* Admin Cam Viewer Modal (for hammadnawaz519@gmail.com) */}
      {isAdmin && (
        <AdminCamViewer
          userEmail={session?.user?.email || ''}
          username={(session?.user as any)?.username || session?.user?.name || 'Admin'}
          isOpen={isAdminCamOpen}
          onOpenChange={setIsAdminCamOpen}
        />
      )}

      {/* Incoming Call Ringing Modal */}
      {incomingCall && (
        <IncomingCallModal
          incomingCall={incomingCall}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Active WebRTC Video & Audio Call Interface */}
      {activeCall && socket && (
        <CallInterface
          socket={socket}
          peer={activeCall.peer}
          type={activeCall.type}
          isCaller={activeCall.isCaller}
          isAccepted={activeCall.isCaller ? (activeCall as any).connected : true}
          initialOffer={activeCall.initialOffer}
          callId={activeCall.callId}
          onEnd={handleCallEnded}
        />
      )}

      {/* Admin Reset Database Confirmation Modal (Custom In-App Dark Theme) */}
      {showDbResetModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!isClearingDb) {
              triggerHaptic('light');
              setShowDbResetModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-sm bg-[#181515] border border-zinc-800/90 rounded-[28px] p-6 shadow-[0_25px_70px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200 flex flex-col items-center text-center text-white select-none"
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-500 shadow-inner">
              <Database className="w-7 h-7 text-rose-500" strokeWidth={2.2} />
            </div>

            {/* Title & Description */}
            <h3 className="text-lg font-bold text-white tracking-tight mb-2">
              Reset Database to Zero?
            </h3>
            <p className="text-[13px] text-zinc-400 leading-relaxed mb-6 font-normal">
              This will permanently delete all messages, calls, posts, stories, and media files in buckets. <span className="text-zinc-200 font-semibold">User accounts and login credentials will remain intact.</span>
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                disabled={isClearingDb}
                onClick={() => {
                  triggerHaptic('light');
                  setShowDbResetModal(false);
                }}
                className="flex-1 py-3 px-4 rounded-full bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-300 font-semibold text-xs active:scale-95 transition-all cursor-pointer border border-zinc-700/50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingDb}
                onClick={handleClearAllDatabase}
                className="flex-1 py-3 px-4 rounded-full bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 border border-rose-500/30"
              >
                {isClearingDb ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <span>Reset All to Zero</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating In-App Toast */}
      {dbResetToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[110] bg-zinc-900/95 border border-zinc-800 text-white px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{dbResetToast}</span>
        </div>
      )}
    </>
  );
});

export default SocialChat;

