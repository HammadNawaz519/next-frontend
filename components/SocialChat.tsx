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
  askAI,
  saveCall,
  updateActivityStatus,
  toggleShowActivityStatus,
} from '@/app/dashboard/actions';
import CallInterface from './CallInterface';
import { LocalNotifications } from '@capacitor/local-notifications';
import './SocialChat.css';

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
}

export const INSTAGRAM_THEMES: ChatTheme[] = [
  { id: 'default', name: 'Default 🔮', category: 'Ambient', outgoingGradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'var(--dm-bg-hover)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'var(--dm-bg-main)', accentColor: '#6366f1', inputBorderColor: 'var(--dm-border)', reactionAccent: '#6366f1', previewWallpaper: 'radial-gradient(circle at center, #27272a 0%, #09090b 100%)' },
  { id: 'love', name: 'Love ❤️', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #ff3366 0%, #ff6b8b 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 51, 102, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(255, 51, 102, 0.12) 0%, rgba(255, 182, 193, 0.08) 100%)', accentColor: '#ff3366', inputBorderColor: 'rgba(255, 51, 102, 0.3)', reactionAccent: '#ff3366', previewWallpaper: 'linear-gradient(135deg, #ff3366 0%, #ff758c 100%)' },
  { id: 'monochrome', name: 'Monochrome 🖤', category: 'Ambient', outgoingGradient: 'linear-gradient(135deg, #4b5563 0%, #1f2937 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(156, 163, 175, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'var(--dm-bg-main)', accentColor: '#9ca3af', inputBorderColor: 'var(--dm-border)', reactionAccent: '#d1d5db', previewWallpaper: 'linear-gradient(135deg, #374151 0%, #111827 100%)' },
  { id: 'pride', name: 'Pride 🌈', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 25%, #10b981 50%, #3b82f6 75%, #8b5cf6 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(139, 92, 246, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)', accentColor: '#8b5cf6', inputBorderColor: 'rgba(139, 92, 246, 0.3)', reactionAccent: '#ec4899', previewWallpaper: 'linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%)' },
  { id: 'ocean', name: 'Ocean Breeze 🌊', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(14, 165, 233, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(14, 165, 233, 0.12) 0%, rgba(186, 230, 253, 0.08) 100%)', accentColor: '#0ea5e9', inputBorderColor: 'rgba(14, 165, 233, 0.3)', reactionAccent: '#38bdf8', previewWallpaper: 'linear-gradient(135deg, #0284c7 0%, #0c4a6e 100%)' },
  { id: 'sunset', name: 'Sunset Horizon 🌅', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #f97316 0%, #e11d48 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(249, 115, 22, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(249, 115, 22, 0.12) 0%, rgba(254, 215, 170, 0.08) 100%)', accentColor: '#f97316', inputBorderColor: 'rgba(249, 115, 22, 0.3)', reactionAccent: '#e11d48', previewWallpaper: 'linear-gradient(135deg, #f97316 0%, #9f1239 100%)' },
  { id: 'aurora', name: 'Aurora ✨', category: 'Gradients', outgoingGradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(6, 182, 212, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(6, 182, 212, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)', accentColor: '#06b6d4', inputBorderColor: 'rgba(6, 182, 212, 0.3)', reactionAccent: '#38bdf8', previewWallpaper: 'linear-gradient(135deg, #0891b2 0%, #4c1d95 100%)' },
  { id: 'lavender', name: 'Lavender Dream 💜', category: 'Gradients', outgoingGradient: 'linear-gradient(135deg, #c084fc 0%, #9333ea 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(192, 132, 252, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(192, 132, 252, 0.12) 0%, rgba(243, 232, 255, 0.08) 100%)', accentColor: '#c084fc', inputBorderColor: 'rgba(192, 132, 252, 0.3)', reactionAccent: '#e879f9', previewWallpaper: 'linear-gradient(135deg, #a855f7 0%, #581c87 100%)' },
  { id: 'rosegold', name: 'Rose Gold 🌸', category: 'Gradients', outgoingGradient: 'linear-gradient(135deg, #f472b6 0%, #fb7185 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(244, 114, 182, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(244, 114, 182, 0.12) 0%, rgba(251, 113, 133, 0.08) 100%)', accentColor: '#f472b6', inputBorderColor: 'rgba(244, 114, 182, 0.3)', reactionAccent: '#f472b6', previewWallpaper: 'linear-gradient(135deg, #f472b6 0%, #fb7185 100%)' },
  { id: 'emerald', name: 'Emerald Mint 🌿', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(16, 185, 129, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(5, 150, 105, 0.12) 0%, rgba(209, 250, 229, 0.08) 100%)', accentColor: '#10b981', inputBorderColor: 'rgba(16, 185, 129, 0.3)', reactionAccent: '#34d399', previewWallpaper: 'linear-gradient(135deg, #059669 0%, #047857 100%)' },
  { id: 'midnight', name: 'Midnight Sky 🌙', category: 'Ambient', outgoingGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(49, 46, 129, 0.2)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)', accentColor: '#6366f1', inputBorderColor: 'rgba(99, 102, 241, 0.3)', reactionAccent: '#818cf8', previewWallpaper: 'linear-gradient(135deg, #1e1b4b 0%, #020617 100%)' },
  { id: 'neon', name: 'Cyberpunk ⚡', category: 'Gradients', outgoingGradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(16, 185, 129, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(167, 243, 208, 0.08) 100%)', accentColor: '#10b981', inputBorderColor: 'rgba(16, 185, 129, 0.3)', reactionAccent: '#34d399', previewWallpaper: 'linear-gradient(135deg, #059669 0%, #3f6212 100%)' },
  { id: 'sky', name: 'Sky Blue ☁️', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(56, 189, 248, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(56, 189, 248, 0.1) 0%, rgba(224, 242, 254, 0.05) 100%)', accentColor: '#38bdf8', inputBorderColor: 'rgba(56, 189, 248, 0.3)', reactionAccent: '#38bdf8', previewWallpaper: 'linear-gradient(135deg, #38bdf8 0%, #0369a1 100%)' },
  { id: 'peach', name: 'Peach Glow 🍑', category: 'Gradients', outgoingGradient: 'linear-gradient(135deg, #fb923c 0%, #f43f5e 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(251, 146, 60, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(251, 146, 60, 0.1) 0%, rgba(255, 237, 213, 0.05) 100%)', accentColor: '#fb923c', inputBorderColor: 'rgba(251, 146, 60, 0.3)', reactionAccent: '#f43f5e', previewWallpaper: 'linear-gradient(135deg, #fb923c 0%, #e11d48 100%)' },
  { id: 'violet', name: 'Royal Violet 🔮', category: 'Gradients', outgoingGradient: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(124, 58, 237, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(124, 58, 237, 0.12) 0%, rgba(237, 233, 254, 0.05) 100%)', accentColor: '#7c3aed', inputBorderColor: 'rgba(124, 58, 237, 0.3)', reactionAccent: '#a78bfa', previewWallpaper: 'linear-gradient(135deg, #6d28d9 0%, #2e1065 100%)' },
  { id: 'mint', name: 'Fresh Mint 🍃', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #34d399 0%, #059669 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(52, 211, 153, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(52, 211, 153, 0.1) 0%, rgba(209, 250, 229, 0.05) 100%)', accentColor: '#34d399', inputBorderColor: 'rgba(52, 211, 153, 0.3)', reactionAccent: '#34d399', previewWallpaper: 'linear-gradient(135deg, #34d399 0%, #047857 100%)' },
  { id: 'forest', name: 'Deep Forest 🌲', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #15803d 0%, #14532d 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(21, 128, 61, 0.15)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(21, 128, 61, 0.1) 0%, rgba(5, 46, 22, 0.08) 100%)', accentColor: '#22c55e', inputBorderColor: 'rgba(34, 197, 94, 0.3)', reactionAccent: '#4ade80', previewWallpaper: 'linear-gradient(135deg, #15803d 0%, #052e16 100%)' },
  { id: 'galaxy', name: 'Cosmic Galaxy 🌌', category: 'Ambient', outgoingGradient: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(168, 85, 247, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(168, 85, 247, 0.12) 0%, rgba(233, 213, 255, 0.08) 100%)', accentColor: '#a855f7', inputBorderColor: 'rgba(168, 85, 247, 0.3)', reactionAccent: '#06b6d4', previewWallpaper: 'linear-gradient(135deg, #4c1d95 0%, #0891b2 100%)' },
  { id: 'cherry', name: 'Cherry Blossom 🍒', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(236, 72, 153, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(236, 72, 153, 0.1) 0%, rgba(252, 231, 243, 0.05) 100%)', accentColor: '#ec4899', inputBorderColor: 'rgba(236, 72, 153, 0.3)', reactionAccent: '#f472b6', previewWallpaper: 'linear-gradient(135deg, #db2777 0%, #831843 100%)' },
  { id: 'coral', name: 'Tropical Coral 🪸', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(255, 107, 107, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(255, 107, 107, 0.1) 0%, rgba(255, 241, 241, 0.05) 100%)', accentColor: '#ff6b6b', inputBorderColor: 'rgba(255, 107, 107, 0.3)', reactionAccent: '#ff8e53', previewWallpaper: 'linear-gradient(135deg, #ff6b6b 0%, #ee5253 100%)' },
  { id: 'royal', name: 'Royal Blue 👑', category: 'Gradients', outgoingGradient: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(29, 78, 216, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(29, 78, 216, 0.1) 0%, rgba(219, 234, 254, 0.05) 100%)', accentColor: '#2563eb', inputBorderColor: 'rgba(37, 99, 235, 0.3)', reactionAccent: '#60a5fa', previewWallpaper: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)' },
  { id: 'golden', name: 'Golden Hour 🌇', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(234, 179, 8, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(234, 179, 8, 0.1) 0%, rgba(254, 240, 138, 0.05) 100%)', accentColor: '#eab308', inputBorderColor: 'rgba(234, 179, 8, 0.3)', reactionAccent: '#fde047', previewWallpaper: 'linear-gradient(135deg, #ca8a04 0%, #854d0e 100%)' },
  { id: 'arctic', name: 'Arctic Frost 🧊', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(56, 189, 248, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(2, 132, 199, 0.1) 0%, rgba(240, 249, 255, 0.05) 100%)', accentColor: '#0284c7', inputBorderColor: 'rgba(2, 132, 199, 0.3)', reactionAccent: '#38bdf8', previewWallpaper: 'linear-gradient(135deg, #0369a1 0%, #0f172a 100%)' },
  { id: 'sakura', name: 'Sakura Blossom 🌸', category: 'Nature', outgoingGradient: 'linear-gradient(135deg, #f472b6 0%, #e11d48 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(244, 114, 182, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(244, 114, 182, 0.1) 0%, rgba(255, 241, 242, 0.05) 100%)', accentColor: '#f472b6', inputBorderColor: 'rgba(244, 114, 182, 0.3)', reactionAccent: '#fb7185', previewWallpaper: 'linear-gradient(135deg, #f472b6 0%, #881337 100%)' },
  { id: 'cyber', name: 'Cyber Matrix 🤖', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #10b981 0%, #000000 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(16, 185, 129, 0.15)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, #022c22 0%, #000000 100%)', accentColor: '#10b981', inputBorderColor: 'rgba(16, 185, 129, 0.4)', reactionAccent: '#34d399', previewWallpaper: 'linear-gradient(135deg, #065f46 0%, #000000 100%)' },
  { id: 'pastel', name: 'Pastel Dreams ☁️', category: 'Ambient', outgoingGradient: 'linear-gradient(135deg, #f472b6 0%, #818cf8 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(244, 114, 182, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(244, 114, 182, 0.08) 0%, rgba(129, 140, 248, 0.08) 100%)', accentColor: '#818cf8', inputBorderColor: 'rgba(129, 140, 248, 0.3)', reactionAccent: '#f472b6', previewWallpaper: 'linear-gradient(135deg, #f472b6 0%, #818cf8 100%)' },
  { id: 'winter', name: 'Winter Solstice ❄️', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #0284c7 0%, #475569 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(2, 132, 199, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)', accentColor: '#38bdf8', inputBorderColor: 'rgba(56, 189, 248, 0.3)', reactionAccent: '#94a3b8', previewWallpaper: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' },
  { id: 'halloween', name: 'Halloween Glow 🎃', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #ea580c 0%, #7c2d12 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(234, 88, 12, 0.15)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, #451a03 0%, #000000 100%)', accentColor: '#f97316', inputBorderColor: 'rgba(249, 115, 22, 0.4)', reactionAccent: '#fb923c', previewWallpaper: 'linear-gradient(135deg, #7c2d12 0%, #000000 100%)' },
  { id: 'holiday', name: 'Holiday Magic ✨', category: 'Special', outgoingGradient: 'linear-gradient(135deg, #dc2626 0%, #16a34a 100%)', outgoingTextColor: '#ffffff', incomingBubbleColor: 'rgba(220, 38, 38, 0.12)', incomingTextColor: 'var(--dm-text-primary)', chatBg: 'linear-gradient(180deg, rgba(220, 38, 38, 0.08) 0%, rgba(22, 163, 74, 0.08) 100%)', accentColor: '#dc2626', inputBorderColor: 'rgba(220, 38, 38, 0.3)', reactionAccent: '#22c55e', previewWallpaper: 'linear-gradient(135deg, #991b1b 0%, #14532d 100%)' }
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

  const d = typeof lastSeenRaw === 'string' ? new Date(lastSeenRaw) : lastSeenRaw;
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
}) => {
  const { msg, bubbleRect, isSent } = state;
  const overlayRef = useRef<HTMLDivElement>(null);
  const reactionBarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerEmoji, setPickerEmoji] = useState('');

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
  const REACTION_BAR_H = 48;
  const MENU_ITEMS_H = isSent ? 260 : 210;
  const GAP = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Clamp bubble rect to viewport
  const bTop = Math.max(0, bubbleRect.top);
  const bBottom = Math.min(vh, bubbleRect.bottom);
  const bLeft = Math.max(0, bubbleRect.left);
  const bRight = Math.min(vw, bubbleRect.right);
  const bCenterX = (bLeft + bRight) / 2;

  const spaceBelow = vh - bBottom;
  const spaceAbove = bTop;

  let reactionBarTop: number;
  let menuTop: number;

  if (spaceBelow >= MENU_ITEMS_H + 20) {
    // Ample space below: Reaction Bar ABOVE bubble, Menu BELOW bubble
    reactionBarTop = Math.max(12, bTop - REACTION_BAR_H - GAP);
    menuTop = Math.min(vh - MENU_ITEMS_H - 12, bBottom + GAP);
  } else if (spaceAbove >= REACTION_BAR_H + MENU_ITEMS_H + 16) {
    // Message is near bottom: both Reaction Bar and Menu go ABOVE bubble cleanly stacked
    reactionBarTop = bTop - REACTION_BAR_H - GAP;
    menuTop = reactionBarTop - MENU_ITEMS_H - GAP;
  } else {
    // Tight viewport: place Reaction Bar ABOVE bubble, Menu BELOW or clamped
    reactionBarTop = Math.max(12, bTop - REACTION_BAR_H - GAP);
    menuTop = Math.max(12, Math.min(vh - MENU_ITEMS_H - 12, bBottom + GAP));
    // Prevent overlap if menu covers reaction bar
    if (menuTop < reactionBarTop + REACTION_BAR_H && menuTop + MENU_ITEMS_H > reactionBarTop) {
      menuTop = Math.min(vh - MENU_ITEMS_H - 8, reactionBarTop + REACTION_BAR_H + GAP);
    }
  }

  // Horizontal Sizing & Centering
  const reactionBarW = Math.min(410, vw - 24);
  let reactionBarLeft = bCenterX - reactionBarW / 2;
  reactionBarLeft = Math.max(12, Math.min(reactionBarLeft, vw - reactionBarW - 12));

  const MENU_W = Math.min(300, vw - 24);
  let menuLeft = isSent ? bRight - MENU_W : bLeft;
  menuLeft = Math.max(12, Math.min(menuLeft, vw - MENU_W - 12));

  // Check if user already reacted with an emoji
  const myReactions = new Set<string>(
    (msg.reactions || [])
      .filter((r: any) => String(r.userId) === String(currentUserId))
      .map((r: any) => r.emoji)
  );

  const isDark = typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';

  const menuBg = isDark
    ? 'rgba(28, 28, 30, 0.97)'
    : 'rgba(255,255,255,0.97)';
  const menuBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const menuText = isDark ? '#fff' : '#000';
  const menuMuted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const dangerColor = '#ef4444';

  const reactionBg = isDark
    ? 'rgba(28,28,30,0.96)'
    : 'rgba(255,255,255,0.96)';

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
        fontWeight: 500,
        textAlign: 'left',
        borderRadius: '0',
        flexShrink: 0,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ width: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: danger ? 1 : 0.8 }}>{icon}</span>
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
          background: 'rgba(0,0,0,0.3)',
          opacity: mounted ? 1 : 0,
          transition: 'opacity 0.22s ease-out',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        }}
      />

      {/* Highlighted ghost of the message bubble */}
      <div
        style={{
          position: 'absolute',
          top: bubbleRect.top,
          left: bubbleRect.left,
          width: bubbleRect.width,
          height: bubbleRect.height,
          pointerEvents: 'none',
          transform: mounted ? 'scale(1.02)' : 'scale(1)',
          transformOrigin: isSent ? 'right center' : 'left center',
          transition: 'transform 0.22s ease-out',
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.25))',
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
          maxWidth: 'calc(100vw - 24px)',
          width: 'fit-content',
          height: '48px',
          background: reactionBg,
          borderRadius: '24px',
          border: `1px solid ${menuBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          padding: '0 8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
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
                background: alreadyReacted ? 'rgba(99,102,241,0.18)' : 'transparent',
                border: alreadyReacted ? '1.5px solid rgba(99,102,241,0.45)' : '1.5px solid transparent',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                fontSize: '20px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-out, background 0.15s',
                flexShrink: 0,
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
            background: 'transparent',
            border: '1.5px solid transparent',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
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
          borderRadius: '18px',
          border: `1px solid ${menuBorder}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
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

// ─── MessageItem ────────────────────────────────────────────────────────────

const MessageItem = memo(({ msg, currentUserId, selectedUser, onDelete, onReact, onRequestDelete, selectedMessageIds, toggleMessageSelection, onShowIGMenu, onReply, activeTheme, onPreviewImage, msgTag, onOpenTagPicker }: any) => {
  if (msg.type === 'system') {
    return (
      <div className="w-full flex justify-center my-3.5 text-center px-4 animate-in fade-in duration-300 pointer-events-none">
        <span className="text-[11px] font-medium py-1 px-4 rounded-full bg-black/20 dark:bg-white/10 text-[var(--dm-text-muted)] backdrop-blur-md">
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

  // Long-press
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
  const isMoving = useRef(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const triggerIGMenu = () => {
    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    if (navigator.vibrate) navigator.vibrate([8, 4, 8]);
    onShowIGMenu({ msg, bubbleRect: rect, isSent });
  };

  const handlePointerDown = (e: any) => {
    if (selectedMessageIds && selectedMessageIds.size > 0) return;
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwipingHorizontally.current = null;
    handlePointerDown(e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
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
        const clampedOffset = Math.min(diffX * 0.65, 100);
        setSwipeOffset(clampedOffset);
        if (clampedOffset > 50 && (e.currentTarget as any)._hapticsTriggered !== true) {
          if (navigator.vibrate) navigator.vibrate(30);
          (e.currentTarget as any)._hapticsTriggered = true;
        }
      }
    } else {
      handlePointerMove();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    handlePointerUp();
    (e.currentTarget as any)._hapticsTriggered = false;
    if (swipeOffset > 50 && onReply) onReply(msg);
    setIsSwiping(false);
    setSwipeOffset(0);
    isSwipingHorizontally.current = null;
  };

  // Right-click context menu (desktop)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    triggerIGMenu();
  };

  const isSelected = selectedMessageIds?.has(msg.id);
  const isInSelectionMode = selectedMessageIds && selectedMessageIds.size > 0;

  const handleMessageClick = (e: React.MouseEvent) => {
    if (isInSelectionMode) {
      e.stopPropagation();
      toggleMessageSelection(msg.id);
    }
  };

  // Reaction counts
  const reactionCounts: Record<string, number> = {};
  if (msg.reactions && msg.type !== 'deleted') {
    msg.reactions.forEach((r: any) => {
      reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
    });
  }

  return (
    <div
      className={`msg-wrapper ${isSent ? 'sent' : isAI ? 'ai' : 'received'} ${isSelected ? 'selected-item' : ''} animate-in slide-in-from-bottom-2 duration-300 relative`}
      onClick={handleMessageClick}
      onMouseDown={handlePointerDown}
      onMouseUp={handlePointerUp}
      onMouseMove={handlePointerMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={handleContextMenu}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isSent ? 'flex-end' : 'flex-start',
        marginLeft: isSent ? 'auto' : '0',
        marginRight: isSent ? '0' : 'auto',
        cursor: isInSelectionMode ? 'pointer' : 'default',
        width: '100%',
        maxWidth: '100%',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Swipe Reply Indicator */}
      {swipeOffset > 0 && (
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm font-bold transition-opacity z-10 text-indigo-500"
          style={{ opacity: Math.min(swipeOffset / 50, 1) }}
        >
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
          {swipeOffset > 50 && (
            <span className="text-[10px] uppercase tracking-wider font-extrabold animate-in zoom-in-50 duration-150">Reply</span>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        ref={bubbleRef}
        className={`msg ${isSent ? 'sent' : isAI ? 'ai' : 'received'} ${msg.type === 'deleted' ? 'deleted-msg' : ''} ${isSelected ? (isSent ? 'msg--sel-sent' : 'msg--sel-recv') : ''}`}
        style={{
          order: isSent ? 2 : 1,
          width: 'fit-content',
          maxWidth: '75%',
          marginLeft: isSent ? 'auto' : '0',
          marginRight: isSent ? '0' : 'auto',
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28), opacity 0.18s, background 0.3s ease, color 0.3s ease',
          transform: swipeOffset > 0
            ? `translateX(${swipeOffset}px)`
            : isSelected ? 'scale(0.965) translateX(' + (isSent ? '4px' : '-4px') + ')' : 'none',
          background: isSent ? (activeTheme?.outgoingGradient || 'linear-gradient(135deg, #18181b 0%, #000000 100%)') : (activeTheme?.incomingBubbleColor || undefined),
          color: isSent ? (activeTheme?.outgoingTextColor || '#ffffff') : (activeTheme?.incomingTextColor || undefined),
        }}
      >
        {msg.replyTo && (
          <div className={`mb-2 p-2 rounded-xl border-l-4 text-xs flex flex-col gap-0.5 max-w-full overflow-hidden ${isSent ? 'border-white/50 bg-black/25 text-white' : 'border-white/50 bg-black/10 dark:bg-white/10'}`}>
            <span className="font-bold text-[11px] opacity-90">{msg.replyTo.senderName || 'Quoted Message'}</span>
            <span className="truncate text-[11px] opacity-85">{msg.replyTo.content}</span>
          </div>
        )}
        {isAI && <div className="system-sender">AI Assistant</div>}
        {msg.type === 'image' && (
          <img
            src={msg.content}
            alt="media"
            className="cursor-pointer hover:opacity-95 transition-opacity"
            onClick={e => { e.stopPropagation(); if (onPreviewImage) onPreviewImage(msg.content); else window.open(msg.content, '_blank'); }}
          />
        )}
        {msg.type === 'video' && <video src={msg.content} controls />}
        {msg.type === 'voice' && <audio src={msg.content} controls />}
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
        {msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'voice' && msg.type !== 'file' && msg.type !== 'call' ? (
          <div style={{ fontSize: '0.98rem', lineHeight: '1.45', wordBreak: 'break-word', display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between' }}>
            <span style={{ flex: '1 1 auto' }}>{msg.content}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', opacity: 0.75, flexShrink: 0, marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: '1px' }}>
              <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              {isSent && (
                <span className={`seen-status ${msg.isSeen ? 'seen' : ''}`}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.24-4.24-1.41 1.41 5.66 5.66L23.66 7l-1.42-1.41z" />
                  </svg>
                </span>
              )}
            </span>
          </div>
        ) : (
          <div className="time-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '3px', fontSize: '0.68rem', opacity: 0.75 }}>
            <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            {isSent && (
              <span className={`seen-status ${msg.isSeen ? 'seen' : ''}`}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.24-4.24-1.41 1.41 5.66 5.66L23.66 7l-1.42-1.41z" />
                </svg>
              </span>
            )}
          </div>
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
      </div>

      {/* Reaction bubbles (below the message) */}
      {Object.keys(reactionCounts).length > 0 && (
        <div
          style={{
            order: isSent ? 3 : 3,
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            justifyContent: isSent ? 'flex-end' : 'flex-start',
            marginTop: '-6px',
            marginLeft: isSent ? 'auto' : '8px',
            marginRight: isSent ? '8px' : 'auto',
            zIndex: 1,
          }}
        >
          {Object.entries(reactionCounts).map(([emoji, count]) => (
            <span
              key={emoji}
              onClick={e => { e.stopPropagation(); onReact(msg.id, emoji); }}
              style={{
                background: 'var(--dm-bg-hover)',
                border: '1px solid var(--dm-border)',
                borderRadius: '12px',
                padding: '2px 7px',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontWeight: 600,
                color: 'var(--dm-text-secondary)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
                transition: 'transform 0.12s ease-out',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              {emoji}{count > 1 && <span style={{ fontSize: '11px' }}>{count}</span>}
            </span>
          ))}
        </div>
      )}
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
          <img src="/Avatar.avif" alt="avatar" />
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

const SocialChat = React.forwardRef(({ isActive, onStatusChange, onChatChange, onBack, onCallStateChange, initialUser, onOpenProfile }: SocialChatProps, ref) => {
  const { data: session } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Auto-select the user passed from another profile's Message button
  const initialUserRef = React.useRef<any>(null);
  useEffect(() => {
    if (initialUser && initialUser.id !== initialUserRef.current?.id) {
      initialUserRef.current = initialUser;
      setSelectedUser(initialUser);
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

  const handleChatBack = (e: React.MouseEvent) => {
    runCircleTransition(() => setSelectedUser(null), e.clientX, e.clientY, true);
  };

  const handleSelectUser = (user: any, e: React.MouseEvent) => {
    runCircleTransition(() => setSelectedUser(user), e.clientX, e.clientY, false);
  };

  const [view, setView] = useState<'recent' | 'requests'>('recent');
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({});
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(new Set());
  const [deletedMessageIds, setDeletedMessageIds] = useState<Set<string>>(new Set());
  const [deletedChatIds, setDeletedChatIds] = useState<Set<string>>(new Set());
  const [selectedChatForOptions, setSelectedChatForOptions] = useState<User | null>(null);

  // Load storage states safely after mount to prevent React hydration mismatch errors on Vercel
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cachedMsgs = sessionStorage.getItem('social_messages_cache');
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

  // Sync cache to session storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('social_messages_cache', JSON.stringify(messagesCache));
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
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [isVoiceToText, setIsVoiceToText] = useState(false);
  const voiceToTextRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Call States
  const [incomingCall, setIncomingCall] = useState<{ from: any, type: 'audio' | 'video', offer?: any } | null>(null);
  const [activeCall, setActiveCall] = useState<{ peer: any, type: 'audio' | 'video', isCaller: boolean, initialOffer?: any } | null>(null);
  const [showAIMention, setShowAIMention] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Instagram-style Chat Details, Theme, Tagging & Lightbox State
  const [showChatDetails, setShowChatDetails] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [liveThemeId, setLiveThemeId] = useState<string | null>(null);
  const [themeSearchQuery, setThemeSearchQuery] = useState('');
  const [themeCategoryFilter, setThemeCategoryFilter] = useState<'All' | 'Gradients' | 'Ambient' | 'Nature' | 'Special'>('All');
  const [lightboxImageSrc, setLightboxImageSrc] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<'photos' | 'reels' | 'files'>('photos');
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const activeThemeId = (selectedUser ? (chatThemes[selectedUser.id] || chatThemes[(selectedUser.email || '').toLowerCase().trim()]) : null) || 'default';
  const activeTheme = useMemo(() => {
    return INSTAGRAM_THEMES.find(t => t.id === activeThemeId) || INSTAGRAM_THEMES[0];
  }, [activeThemeId, selectedUser, chatThemes]);

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
      ...(selectedUser.email ? { [selectedUser.email.toLowerCase().trim()]: theme.id } : {})
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

    const systemText = `${currentUserName} set theme to ${theme.name}`;
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
      await saveSocialMessage(selectedUser.id, systemText, 'system');
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
  const ringtoneRef = useRef<AudioContext | null>(null);

  // Notify parent of active call status to free up camera locks
  useEffect(() => {
    if (onCallStateChange) {
      onCallStateChange(!!activeCall);
    }
  }, [activeCall, onCallStateChange]);

  // Ringing effect for incoming calls
  useEffect(() => {
    let ringInterval: NodeJS.Timeout;
    let audioCtx: AudioContext;

    if (incomingCall && !activeCall) {
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        ringtoneRef.current = audioCtx;

        const playRing = () => {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
          gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);

          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 1.5);
        };

        playRing();
        ringInterval = setInterval(playRing, 3000);
      } catch (e) {
        console.error("Audio API blocked");
      }
    }

    return () => {
      if (ringInterval) clearInterval(ringInterval);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => { });
      }
    };
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
        if (onStatusChange) onStatusChange(true);
        if (sessionRef.current?.user) {
          const userObj = sessionRef.current.user as any;
          newSocket.emit('identify', {
            email: userObj.email ? userObj.email.toLowerCase().trim() : undefined,
            userId: userObj.id
          });
        }
        // ── Refresh lastSeenMap from DB on connect ──────────────────────────
        // Catches any offline events that occurred while the socket was down
        getRecentChats().then(results => {
          const freshLastSeen: Record<string, string> = {};
          results.forEach((u: any) => {
            if (u.email && u.lastSeen) {
              freshLastSeen[u.email.toLowerCase().trim()] = u.lastSeen;
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
      });


      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
        if (onStatusChange) onStatusChange(false);
      });

      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setIsConnected(false);
        if (onStatusChange) onStatusChange(false);
      });

      newSocket.on('receive_social_message', async (msg: Message) => {
        const partnerId = msg.senderId === (sessionRef.current?.user as any)?.id ? msg.receiverId : msg.senderId;

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

        // 1. Update Message Stream
        setMessages((prev) => {
          if (selectedUserRef.current?.id !== partnerId) return prev; // Only append if we are looking at this user's chat!
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // 2. Update Sidebar (Users/Requests)
        const formatMsg = (m: Message) => {
          if (m.type === 'voice') return 'Voice Message';
          if (m.type === 'image') return 'Image';
          if (m.type === 'video') return 'Video';
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

        // 3. Update Cache
        setMessagesCache(prev => {
          const current = prev[partnerId] || [];
          if (current.some(m => m.id === msg.id)) return prev;
          return { ...prev, [partnerId]: [...current, msg] };
        });

        // 4. Mark as seen if active
        if (selectedUserRef.current?.id === partnerId) {
          markMessagesAsSeen(partnerId);
          newSocket.emit('mark_as_seen', { senderEmail: selectedUserRef.current.email });
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

      newSocket.on('messages_seen', () => {
        setMessages(prev => prev.map(m => ({ ...m, isSeen: true })));

        // Update cache as well
        setMessagesCache(prev => {
          const newCache = { ...prev };
          Object.keys(newCache).forEach(userId => {
            newCache[userId] = newCache[userId].map(m => ({ ...m, isSeen: true }));
          });
          return newCache;
        });
      });

      newSocket.on('incoming_call', (data) => {
        console.log("Incoming call received:", data);
        setIncomingCall(data);

        // Stunning Custom Call Notification Trigger (vibrates with custom cadence!)
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

      newSocket.on('call_accepted', (data) => {
        setActiveCall(prev => prev ? { ...prev, connected: true } as any : null);
      });

      newSocket.on('call_rejected', () => {
        setActiveCall(null);
        setIncomingCall(null);
        alert('Call was declined.');
      });

      newSocket.on('call_busy', () => {
        setActiveCall(null);
        alert('User is currently in another call.');
      });

      newSocket.on('call_ended', () => {
        console.log("Call ended by peer");
        setActiveCall(null);
        setIncomingCall(null);
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

      newSocket.on('receive_chat_theme', ({ themeId, senderId, senderEmail }: any) => {
        if (themeId) {
          setChatThemes(prev => {
            const updated = { ...prev };
            if (senderId) updated[senderId] = themeId;
            if (senderEmail) updated[senderEmail.toLowerCase().trim()] = themeId;
            if (typeof window !== 'undefined') {
              localStorage.setItem('chat_themes', JSON.stringify(updated));
            }
            return updated;
          });
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
          getSocialMessages(activeUser.id).then((history: any) => {
            setMessages(prev => {
              const deletedRef = deletedMessageIds;
              const dbMsgs = (history as any[]).filter(m => !deletedRef.has(m.id)).map(normalizeMsg);
              const now = Date.now();
              const inFlight = prev.filter(m =>
                !dbMsgs.some((dbM: any) => dbM.id === m.id || (dbM.content === m.content && String(dbM.senderId) === String(m.senderId))) &&
                (now - new Date(m.createdAt).getTime() < 30000)
              );
              return [...dbMsgs, ...inFlight].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              );
            });
            const normalizedHistory = (history as any[]).map(normalizeMsg);
            setMessagesCache((prev: any) => ({ ...prev, [activeUser.id]: normalizedHistory }));
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
          // Sync latest messages for active chat after returning to tab
          const activeUser = selectedUserRef.current;
          if (activeUser) {
            getSocialMessages(activeUser.id).then((history: any) => {
              setMessages(prev => {
                const deletedRef = deletedMessageIds;
                const dbMsgs = (history as any[]).filter(m => !deletedRef.has(m.id)).map(normalizeMsg);
                const now = Date.now();
                const inFlight = prev.filter(m =>
                  !dbMsgs.some((dbM: any) => dbM.id === m.id || (dbM.content === m.content && String(dbM.senderId) === String(m.senderId))) &&
                  (now - new Date(m.createdAt).getTime() < 30000)
                );
                return [...dbMsgs, ...inFlight].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
              });
              const normalizedHistory = (history as any[]).map(normalizeMsg);
              setMessagesCache((prev: any) => ({ ...prev, [activeUser.id]: normalizedHistory }));
            }).catch(() => {});
          }

          // ── Refresh lastSeenMap from DB so missed offline events are caught ──
          // If the app was closed/backgrounded when a user went offline, we missed
          // the activity_update socket event. Re-fetching contacts gives us the
          // freshest lastSeen timestamps from the database.
          getRecentChats().then(results => {
            const freshLastSeen: Record<string, string> = {};
            results.forEach((u: any) => {
              if (u.email && u.lastSeen) {
                freshLastSeen[u.email.toLowerCase().trim()] = u.lastSeen;
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
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      console.log("Cleaning up socket...");
      socketInstancePromise.then(s => s?.disconnect());
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.user?.email]); // Run when session loads

  // 2. Identify once when socket connects or session loads
  useEffect(() => {
    if (socket && socket.connected && session?.user?.email) {
      const email = session.user.email.toLowerCase().trim();
      const username = session.user.name || email.split('@')[0];
      socket.emit('identify', { email, userId: (session.user as any).id, username });
    }
  }, [socket, session]);

  const handleCall = async (type: 'audio' | 'video') => {
    if (!selectedUser || !session?.user || !socket) return;

    const targetEmail = selectedUser.email ? selectedUser.email.toLowerCase().trim() : undefined;
    const callId = `call-${Date.now()}`;

    const payload = {
      to: targetEmail,
      toUserId: selectedUser.id,
      from: session.user,
      type,
      callId
    };

    socket.emit('call_user', payload);
    socket.emit('call_request', payload);

    setActiveCall({ peer: { ...selectedUser, email: targetEmail }, type, isCaller: true });
  };

  const handleAcceptCall = () => {
    if (!incomingCall || !socket) return;

    const payload = {
      to: incomingCall.from.email?.toLowerCase().trim(),
      toUserId: incomingCall.from.id,
      from: session?.user
    };

    socket.emit('accept_call', payload);
    socket.emit('call_accept', payload);

    setActiveCall({
      peer: incomingCall.from,
      type: incomingCall.type,
      isCaller: false,
      initialOffer: incomingCall.offer
    });
    setIncomingCall(null);
  };

  const handleRejectCall = async () => {
    if (!incomingCall || !socket) return;

    const payload = {
      to: incomingCall.from.email?.toLowerCase().trim(),
      toUserId: incomingCall.from.id
    };

    socket.emit('reject_call', payload);
    socket.emit('call_decline', payload);

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

  const handleEndCall = () => {
    if (!activeCall || !socket) return;
    const payload = {
      to: activeCall.peer.email?.toLowerCase().trim(),
      toUserId: activeCall.peer.id
    };
    socket.emit('end_call', payload);
    socket.emit('call_end', payload);
  };

  // Search or Load Recent
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();

    if (q.length >= 1) {
      // 1. Instant client-side filter from cached list
      const filtered = allContactsRef.current.filter(
        u => u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
      );
      setUsers(filtered);

      // 2. Background server search (finds people not in recent list)
      const delayDebounce = setTimeout(async () => {
        const results = await searchUsers(searchQuery);
        if (Array.isArray(results) && results.length > 0) {
          const formatted = results.map((u: any) => ({
            ...u,
            lastMessage: u.bio || `@${u.username || 'user'}`,
            unseenCount: 0,
            isRequest: false
          }));
          setUsers(formatted as any);
        }
      }, 250);
      return () => clearTimeout(delayDebounce);

    } else if (q.length === 0) {
      // Restore full list from ref (no network call needed)
      if (allContactsRef.current.length > 0) {
        setUsers(allContactsRef.current);
        setRequests(allRequestsRef.current);
      } else {
        // First load — fetch from server
        getRecentChats().then(results => {
          const contacts: User[] = [];
          const reqs: User[] = [];
          const initialLastSeen: Record<string, string> = {};
          results.forEach((u: any) => {
            if (u.isRequest) reqs.push(u);
            else contacts.push(u);
            if (u.email && u.lastSeen) {
              initialLastSeen[u.email.toLowerCase().trim()] = u.lastSeen;
            }
          });
          if (Object.keys(initialLastSeen).length > 0) {
            setLastSeenMap(prev => ({ ...initialLastSeen, ...prev }));
          }
          allContactsRef.current = contacts;
          allRequestsRef.current = reqs.filter(r => !contacts.some(c => c.id === r.id));
          setUsers(allContactsRef.current);
          setRequests(allRequestsRef.current);
        });
      }
    }
  }, [searchQuery]);

  // ── Instagram-style Activity Status Lifecycle ─────────────────────────────
  useEffect(() => {
    if (!session?.user?.email) return;

    const myEmail = session.user.email.toLowerCase().trim();
    const myId = (session.user as any)?.id;

    // Mark online immediately — sets isOnline=true, lastSeen=now, lastHeartbeat=now in DB
    updateActivityStatus('online').catch(() => {});

    // Socket heartbeat every 25s (lightweight — just updates lastHeartbeat via socket)
    const heartbeatInterval = setInterval(() => {
      if (socket?.connected) {
        socket.emit('heartbeat', { userId: myId, email: myEmail });
      }
      // DB heartbeat every 25s too (lightweight — only writes lastHeartbeat)
      updateActivityStatus('heartbeat').catch(() => {});
    }, 25000);

    // Visibility: come back to foreground → go online again
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        updateActivityStatus('online').catch(() => {});
        if (socket?.connected) {
          socket.emit('heartbeat', { userId: myId, email: myEmail });
        }
      } else {
        // Going to background — mark offline immediately
        updateActivityStatus('offline').catch(() => {});
      }
    };

    // Page close / navigate away — use sendBeacon for fire-and-forget
    const handleUnload = () => {
      const blob = new Blob(
        [JSON.stringify({ action: 'offline' })],
        { type: 'application/json' }
      );
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/user/activity', blob);
      }
    };

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
      // Mark offline on component unmount (logout / route change)
      updateActivityStatus('offline').catch(() => {});
    };
  }, [session?.user?.email, socket]);

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
    async function loadMessages() {
      if (!selectedUser) return;
      setSelectedMessageIds(new Set());

      const cached = messagesCache[selectedUser.id];
      if (cached) {
        const filteredCached = cached
          .filter(m => !deletedMessageIds.has(m.id))
          .filter(m => !m.content || !m.content.startsWith('blob:'));
        setMessages(filteredCached);
        setIsLoadingMessages(false);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 30);
      } else {
        setIsLoadingMessages(true);
        setMessages([]); // Clear while loading if no cache
      }

      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, unseenCount: 0 } : u));

      try {
        const history = await getSocialMessages(selectedUser.id);
        // Filter out messages the user deleted locally (persisted in localStorage)
        const deletedRef = deletedMessageIds;
        const fresh = (history as any[]).filter(m => !deletedRef.has(m.id)).map(normalizeMsg);

        setMessages(fresh);
        setMessagesCache(prev => ({ ...prev, [selectedUser.id]: fresh }));

        markMessagesAsSeen(selectedUser.id);
        socket?.emit('mark_as_seen', { senderEmail: selectedUser.email });

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 60);
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoadingMessages(false);
      }
    }
    loadMessages();
  }, [selectedUser?.id]);

  // Always scroll to bottom when messages or active user change
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length, selectedUser?.id]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !selectedUser || !socket || !session?.user) return;

    const currentContent = inputValue;
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
      replyTo: currentReplyTo
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setMessagesCache(prev => {
      const current = prev[selectedUser.id] || [];
      return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
    });
    socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...optimisticMsg });

    try {
      // Background DB Save – pass replyTo so it's persisted in the database
      const savedMsg = await saveSocialMessage(selectedUser.id, currentContent, 'text', currentReplyTo ?? null);
      if (savedMsg) {
        const normalized = normalizeMsg(savedMsg as any);
        setMessages(prev => prev.map(m => m.id === stableId ? { ...normalized, id: normalized.id || stableId } : m));
        setMessagesCache(prev => {
          const current = prev[selectedUser.id] || [];
          return { ...prev, [selectedUser.id]: current.map(m => m.id === stableId ? { ...normalized, id: normalized.id || stableId } : m) };
        });
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
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (selectedUser && socket && session?.user) {
            const senderId = (session.user as any).id;

            // Immediate Update
            const stableId = 'voice-' + Date.now() + Math.random().toString(36).substring(7);
            const optimisticMsg: any = {
              id: stableId,
              senderId: senderId,
              receiverId: selectedUser.id,
              content: base64Audio,
              type: 'voice',
              createdAt: new Date(),
              isSeen: false
            };
            setMessages(prev => [...prev, optimisticMsg]);
            setMessagesCache(prev => {
              const current = prev[selectedUser.id] || [];
              return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
            });
            socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...optimisticMsg });

            try {
              const savedMsg = await saveSocialMessage(selectedUser.id, base64Audio, 'voice');
              if (savedMsg) {
                const finalMsg = { ...(savedMsg as any), id: (savedMsg as any).id || stableId };
                setMessages(prev => prev.map(m => m.id === stableId ? finalMsg : m));
                setMessagesCache(prev => {
                  const current = prev[selectedUser.id] || [];
                  return { ...prev, [selectedUser.id]: current.map(m => m.id === stableId ? finalMsg : m) };
                });
              }
            } catch (err) {
              console.error("Failed to save voice message:", err);
            }
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
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
    isCancelingRecordingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecording(false);
  };

  const startVoiceToText = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInputValue((finalText + interim).trim());
    };

    recognition.onerror = (e: any) => {
      console.error('Voice-to-text error:', e.error);
      if (e.error !== 'no-speech') {
        stopVoiceToText();
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in voice-to-text mode
      if (isVoiceToText) {
        try { recognition.start(); } catch (e) { }
      }
    };

    voiceToTextRef.current = recognition;
    setIsVoiceToText(true);
    try { recognition.start(); } catch (e) { console.error(e); }
  };

  const stopVoiceToText = () => {
    if (voiceToTextRef.current) {
      voiceToTextRef.current.onend = null;
      try { voiceToTextRef.current.stop(); } catch (e) { }
      voiceToTextRef.current = null;
    }
    setIsVoiceToText(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser || !socket || !session?.user) return;

    // Reset input so selecting the same file twice triggers change event
    e.target.value = '';

    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'voice' : 'file';
    const senderId = (session.user as any).id;
    const stableId = 'file-' + Date.now() + Math.random().toString(36).substring(7);

    // Read as Base64 for persistent optimistic preview that survives page refresh
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Preview = reader.result as string;

      const optimisticMsg: any = {
        id: stableId,
        senderId: senderId,
        receiverId: selectedUser.id,
        content: base64Preview,
        type: type,
        createdAt: new Date(),
        isSeen: false
      };

      setMessages(prev => [...prev, optimisticMsg]);
      setMessagesCache(prev => {
        const current = prev[selectedUser.id] || [];
        return { ...prev, [selectedUser.id]: [...current, optimisticMsg] };
      });

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('receiverId', selectedUser.id);
        formData.append('type', type);

        const res = await fetch('/api/chat/upload', {
          method: 'POST',
          body: formData
        });

        const resData = await res.json();

        if (resData?.success && resData?.message) {
          const savedMsg = resData.message;
          const finalMsg = { ...(savedMsg as any), id: (savedMsg as any).id || stableId };

          setMessages(prev => prev.map(m => m.id === stableId ? finalMsg : m));
          setMessagesCache(prev => {
            const current = prev[selectedUser.id] || [];
            return { ...prev, [selectedUser.id]: current.map(m => m.id === stableId ? finalMsg : m) };
          });

          // Emit real-time message with saved permanent file URL
          socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...finalMsg });
        } else {
          // Fallback to base64 via saveSocialMessage
          const savedMsg = await saveSocialMessage(selectedUser.id, base64Preview, type);
          if (savedMsg) {
            const finalMsg = { ...(savedMsg as any), id: (savedMsg as any).id || stableId };
            setMessages(prev => prev.map(m => m.id === stableId ? finalMsg : m));
            setMessagesCache(prev => {
              const current = prev[selectedUser.id] || [];
              return { ...prev, [selectedUser.id]: current.map(m => m.id === stableId ? finalMsg : m) };
            });
            socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...finalMsg });
          }
        }
      } catch (err) {
        console.error("Failed to upload media file:", err);
      }
    };
    reader.readAsDataURL(file);
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
    // Local optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        const existingReactions = m.reactions || [];
        const userHasReacted = existingReactions.find((r: any) => r.userId === (session?.user as any)?.id && r.emoji === emoji);
        let newReactions;
        if (userHasReacted) {
          // Remove reaction
          newReactions = existingReactions.filter((r: any) => !(r.userId === (session?.user as any)?.id && r.emoji === emoji));
        } else {
          // Add reaction
          newReactions = [...existingReactions, { emoji, userId: (session?.user as any)?.id }];
        }
        return { ...m, reactions: newReactions };
      }
      return m;
    }));
    socket?.emit('react_social_message', { messageId: msgId, emoji, receiverEmail: selectedUser?.email });
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

  return (
    <>
      <div className="social-chat-container" style={{ display: isActive ? 'flex' : 'none', width: '100%', height: '100%' }}>
        <div className="main-wrap">
          <aside className={`sidebar ${selectedUser ? 'hide-on-mobile' : 'show-on-mobile'}`}>
            <div className="search-wrap relative">
              <div className="flex items-center gap-3 mb-3 w-full">
                <button style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-primary)', cursor: 'pointer', flexShrink: 0 }} onClick={() => onBack && onBack()}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <h2 className="text-xl font-bold" style={{ color: 'var(--dm-text-primary)' }}>Messages</h2>
              </div>

              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="view-toggle">
                <button className={view === 'recent' ? 'active' : ''} onClick={() => setView('recent')}>
                  Chats
                </button>
                <button className={view === 'requests' ? 'active' : ''} onClick={() => setView('requests')}>
                  Requests {requests.length > 0 && <span className="count">{requests.length}</span>}
                </button>
              </div>
            </div>
            <div className="list">
              {/* Sort: pinned first, then by recent */}
              {(view === 'recent'
                ? [...users].filter(u => !deletedChatIds.has(u.id)).sort((a, b) => {
                    const ap = pinnedChats.has(a.id) ? 0 : 1;
                    const bp = pinnedChats.has(b.id) ? 0 : 1;
                    return ap - bp;
                  })
                : requests.filter(u => !deletedChatIds.has(u.id))
              ).map((user) => {
                const userEmail = (user.email || '').toLowerCase().trim();
                const showActivity = (user as any).showActivityStatus !== false;
                const isOnline = showActivity && ((userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(user.id));
                const isPinned = pinnedChats.has(user.id);
                const lastSeenVal = lastSeenMap[userEmail] || lastSeenMap[user.id] || (user as any).lastSeen;
                let chatLongPressTimer: ReturnType<typeof setTimeout> | null = null;
                const handleChatLongPress = () => {
                  setSelectedChatForOptions(user);
                };
                return (
                  <div
                    key={user.id}
                    className={`item ${selectedUser?.id === user.id ? 'active' : ''}`}
                    onClick={(e: React.MouseEvent) => handleSelectUser(user, e)}
                    onMouseDown={() => { chatLongPressTimer = setTimeout(() => { chatLongPressTimer = null; handleChatLongPress(); }, 600); }}
                    onMouseUp={() => { if (chatLongPressTimer) { clearTimeout(chatLongPressTimer); chatLongPressTimer = null; } }}
                    onMouseLeave={() => { if (chatLongPressTimer) { clearTimeout(chatLongPressTimer); chatLongPressTimer = null; } }}
                    onTouchStart={() => { chatLongPressTimer = setTimeout(() => { chatLongPressTimer = null; handleChatLongPress(); }, 600); }}
                    onTouchEnd={() => { if (chatLongPressTimer) { clearTimeout(chatLongPressTimer); chatLongPressTimer = null; } }}
                  >
                    {/* Avatar with online dot */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div className="user-pfp">
                        {user.image && user.image.length > 5
                          ? <img src={user.image} alt={user.name} referrerPolicy="no-referrer" />
                          : <img src="/Avatar.avif" alt="avatar" />
                        }
                      </div>
                      {showActivity && (
                        <span style={{
                          position: 'absolute', bottom: 2, right: 2,
                          width: '12px', height: '12px', borderRadius: '50%',
                          background: isOnline ? '#22c55e' : 'transparent',
                          border: isOnline ? '2px solid var(--dm-bg-sidebar)' : 'none',
                          display: 'block',
                          transition: 'background 0.3s'
                        }} />
                      )}
                    </div>

                    {/* Meta */}
                    <div className="meta">
                      <b>
                        {isPinned && <span style={{ marginRight: '4px', fontSize: '11px' }}>📌</span>}
                        {nicknames[user.id] || user.name}
                        {(user as any).unseenCount > 0 && (
                          <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, background: '#6366f1', color: '#fff', borderRadius: '20px', padding: '1px 6px' }}>
                            {(user as any).unseenCount}
                          </span>
                        )}
                      </b>
                      <small style={{ color: (user as any).unseenCount > 0 ? 'var(--dm-text-primary)' : 'var(--dm-text-secondary)', fontWeight: (user as any).unseenCount > 0 ? 600 : 400 }}>
                        {(user as any).lastMessage || (
                          showActivity
                            ? (isOnline ? '● Active now' : (formatLastSeenAgo(lastSeenVal) ? `Active ${formatLastSeenAgo(lastSeenVal)}` : ''))
                            : ''
                        )}
                      </small>
                    </div>
                  </div>
                );
              })}
              {(view === 'recent' ? users : requests).length === 0 && searchQuery.length < 2 && (
                <div className="empty-state">
                  <p>{view === 'recent' ? 'No recent conversations' : 'No message requests'}</p>
                </div>
              )}
            </div>
          </aside>

          <section
            className={`chat-area ${selectedUser ? 'active ig-chat-enter' : ''} ${selectedUser ? 'show-on-mobile' : 'hide-on-mobile'}`}
            style={{ background: activeTheme.chatBg, transition: 'background 300ms ease' }}
          >
            {selectedUser ? (
              <>
                <div
                  className="chat-header"
                  style={{
                    background: activeTheme.id !== 'default'
                      ? (activeTheme.incomingBubbleColor || 'var(--dm-bg-sidebar)')
                      : 'var(--dm-bg-sidebar)',
                    borderBottom: 'none',
                    transition: 'all 300ms ease'
                  }}
                >
                  <div
                    className="to cursor-pointer hover:opacity-85 transition-opacity"
                    onClick={() => {
                      if (selectedUser) {
                        setNicknameInput(nicknames[selectedUser.id] || '');
                        setShowChatDetails(true);
                      }
                    }}
                    title="View Chat Info & Details"
                  >
                    <button
                      style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-primary)', cursor: 'pointer', marginRight: '10px', flexShrink: 0 }}
                      onClick={(e) => { e.stopPropagation(); handleChatBack(e); }}
                    >
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div className="avatar">
                      {selectedUser.image && selectedUser.image.length > 5 ? (
                        <img src={selectedUser.image} alt={selectedUser.name} referrerPolicy="no-referrer" />
                      ) : (
                        <img src="/Avatar.avif" alt="avatar" />
                      )}
                    </div>
                    <div className="info">
                      <div className="name font-bold text-sm">
                        {nicknames[selectedUser.id] || selectedUser.name}
                      </div>
                      <div className="status-text">
                        {(() => {
                          const showActivity = (selectedUser as any).showActivityStatus !== false;
                          if (!showActivity) {
                            // User has disabled activity status — show nothing
                            return null;
                          }
                          const isOnline = (selectedUser.email && onlineUsers.has(selectedUser.email.toLowerCase().trim())) || onlineUsers.has(selectedUser.id);
                          if (isOnline) {
                            return (
                              <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
                                Active now
                              </span>
                            );
                          }
                          const lastSeenVal = lastSeenMap[(selectedUser.email || '').toLowerCase().trim()] || lastSeenMap[selectedUser.id] || (selectedUser as any).lastSeen;
                          const ago = formatLastSeenAgo(lastSeenVal);
                          if (!ago) return null;
                          return (
                            <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}>
                              Active {ago}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="chat-header-right">
                    {requests.some(r => r.id === selectedUser.id) && (
                      <button
                        title="Accept Request"
                        onClick={handleAcceptRequest}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--dm-bg-hover)',
                          border: '1px solid var(--dm-border)',
                          color: 'var(--dm-text-primary)',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--dm-bg-active)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--dm-bg-hover)'; }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      </button>
                    )}
                    {/* Monochrome Audio Call Button */}
                    <button className="call-btn" onClick={() => handleCall('audio')} title="Audio Call">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                    </button>
                    {/* Monochrome Video Call Button */}
                    <button className="call-btn" onClick={() => handleCall('video')} title="Video Call">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg>
                    </button>
                  </div>

                </div>

                <div className="messages" style={{ background: 'transparent' }}>
                  {messages.filter(msg => msg.type !== 'accepted').map((msg) => (
                    <div key={msg.id} id={`msg-item-${msg.id}`}>
                      <MessageItem
                        msg={msg}
                        currentUserId={(session?.user as any)?.id}
                        selectedUser={selectedUser}
                        onDelete={handleDelete}
                        onReact={handleReact}
                        onRequestDelete={handleRequestDelete}
                        selectedMessageIds={selectedMessageIds}
                        toggleMessageSelection={toggleMessageSelection}
                        onShowIGMenu={(st: any) => setIgMenu(st)}
                        onReply={(m: any) => setReplyToMessage(m)}
                        activeTheme={activeTheme}
                        onPreviewImage={(src: string) => setLightboxImageSrc(src)}
                        msgTag={msgTags[msg.id]}
                        onOpenTagPicker={(m: any) => setOpenTagPickerMsg(m)}
                      />
                    </div>
                  ))}
                  {!isLoadingMessages && messages.filter(msg => msg.type !== 'accepted').length === 0 && (
                    <div className="empty-chat-state">
                      <div className="empty-chat-pfp">
                        {selectedUser.image && selectedUser.image.length > 5 ? (
                          <img src={selectedUser.image} alt={selectedUser.name} referrerPolicy="no-referrer" />
                        ) : (
                          <img src="/Avatar.avif" alt="avatar" />
                        )}
                      </div>
                      <h3>Start a conversation</h3>
                      <p>Send a message to start chatting with <b>{selectedUser.name}</b></p>
                      <div className="empty-chat-hint">
                        Messages are encrypted and secure
                      </div>
                    </div>
                  )}
                  {typingUsers.has(selectedUser.email) && (
                    <div className="msg-wrapper received animate-in fade-in slide-in-from-bottom-2 duration-200 my-1" style={{ width: 'fit-content', marginLeft: 0 }}>
                      <div
                        className="msg received"
                        style={{
                          background: activeTheme?.incomingBubbleColor || 'var(--dm-bg-hover)',
                          color: activeTheme?.incomingTextColor || 'var(--dm-text-primary)',
                          borderRadius: '1.25rem',
                          padding: '12px 18px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-300 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-300 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-300 animate-bounce" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {replyToMessage && (
                  <div className="mx-4 mb-2 p-2.5 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-bg-hover)] flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[11px] font-bold text-[var(--dm-text-primary)] flex items-center gap-1">
                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                        Replying to {replyToMessage.senderId === (session?.user as any)?.id ? 'yourself' : selectedUser?.name}
                      </span>
                      <span className="text-xs text-[var(--dm-text-secondary)] truncate mt-0.5">
                        {replyToMessage.type === 'voice' ? '🎙️ Voice Clip' : replyToMessage.type === 'image' ? '📷 Photo' : replyToMessage.content}
                      </span>
                    </div>
                    <button
                      onClick={() => setReplyToMessage(null)}
                      className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--dm-bg-active)] text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)] transition-colors cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {selectedMessageIds.size === 0 ? (
                  <footer className="footer" style={{ borderTop: 'none', background: 'transparent', padding: '6px 16px 16px' }}>
                    {isVoiceToText ? (
                      <div
                        className="type-box"
                        style={{
                          position: 'relative',
                          borderRadius: '9999px',
                          background: activeTheme.incomingBubbleColor || 'var(--dm-bg-hover)',
                          borderColor: activeTheme.inputBorderColor || 'var(--dm-border)',
                          backdropFilter: 'blur(12px)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, padding: '8px 14px', borderRadius: '24px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', animation: 'pulse 2s infinite' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-primary)', flex: 1 }}>
                            {inputValue || 'Listening... speak now'}
                          </span>
                        </div>
                        <button
                          className="send-btn"
                          onClick={() => {
                            stopVoiceToText();
                            if (inputValue.trim()) {
                              handleSendMessage();
                            }
                          }}
                          style={{
                            background: activeTheme.accentColor || '#6366f1',
                            borderRadius: '9999px'
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                        </button>
                      </div>
                    ) : !isRecording ? (
                      <div
                        className="type-box"
                        style={{
                          borderRadius: '9999px',
                          background: activeTheme.id !== 'default'
                            ? (activeTheme.incomingBubbleColor || 'var(--dm-bg-sidebar)')
                            : 'var(--dm-bg-sidebar)',
                          borderColor: activeTheme.id !== 'default'
                            ? (activeTheme.inputBorderColor || 'var(--dm-border)')
                            : 'var(--dm-border)',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Send Media">
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                        </button>
                        {/* Gap between image and emoji */}
                        <div style={{ width: '6px', flexShrink: 0 }} />
                        <div className="hidden md:block" style={{ position: 'relative' }}>
                          <button className="icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji" style={{ color: showEmojiPicker ? 'var(--dm-text-primary)' : undefined }}>
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3.5-9c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>
                          </button>
                          {showEmojiPicker && (
                            <div className="emoji-picker-bar" style={{
                              position: 'absolute', bottom: '48px', left: '-8px',
                              background: 'var(--dm-bg-sidebar)', border: '1px solid var(--dm-border)',
                              borderRadius: '16px', padding: '12px 8px', zIndex: 999,
                              boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
                              animation: 'emojiBarIn 0.25s cubic-bezier(0.2,0.8,0.2,1) forwards',
                              display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px'
                            }}>
                              {[
                                { label: 'Smileys', emojis: ['😀', '😂', '😍', '🥰', '😎', '🤔', '😅', '😭', '🥹', '😇', '🤩', '😏', '😒', '🙄', '😤', '🤯', '😴', '🤢', '🥶', '😱'] },
                                { label: 'Gestures', emojis: ['👍', '👎', '👋', '🤝', '🙏', '👏', '🤜', '💪', '✌️', '🤞', '👌', '🤙', '☝️', '🖐️', '🫶', '🤲', '🫱', '🤟', '🤘', '👊'] },
                                { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💗', '💓', '💞', '💝', '❤️‍🔥', '💔', '❣️', '💟', '♥️', '🫀', '💕'] },
                                { label: 'Nature', emojis: ['🌟', '⭐', '🌙', '☀️', '🌈', '🌊', '🔥', '❄️', '⚡', '🌸', '🌺', '🍀', '🌿', '🐶', '🐱', '🦋', '🐝', '🌴', '🍁', '🌻'] },
                                { label: 'Food', emojis: ['🍕', '🍔', '🍜', '🍣', '🍰', '🎂', '🍩', '🍪', '☕', '🧋', '🍷', '🎉', '🎊', '🎈', '🎁', '🏆', '💯', '✅', '🔥', '⚡'] },
                              ].map(group => (
                                <div key={group.label}>
                                  <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--dm-text-muted)', marginBottom: '6px', paddingLeft: '4px' }}>{group.label}</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                    {group.emojis.map(emoji => (
                                      <button key={emoji} onClick={() => { setInputValue(prev => prev + emoji); setShowEmojiPicker(false); }} style={{ fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '8px', lineHeight: 1, transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--dm-bg-active)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <textarea
                          placeholder="Write a message..."
                          value={inputValue}
                          rows={1}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInputValue(val);
                            // Auto-resize
                            const t = e.target as HTMLTextAreaElement;
                            t.style.height = 'auto';
                            t.style.height = Math.min(t.scrollHeight, 84) + 'px';

                            // Typing Indicator Logic
                            if (socket && selectedUser) {
                              if (!typingTimeoutRef.current) {
                                socket.emit('typing', { receiverEmail: selectedUser.email });
                              } else {
                                clearTimeout(typingTimeoutRef.current);
                              }
                              typingTimeoutRef.current = setTimeout(() => {
                                socket.emit('stop_typing', { receiverEmail: selectedUser.email });
                                typingTimeoutRef.current = null;
                              }, 2000);
                            }

                            // Show popup if the last character is @ or if we're typing an @ mention
                            const lastWord = val.split(' ').pop() || '';
                            if (lastWord.startsWith('@')) {
                              setShowAIMention(true);
                            } else {
                              setShowAIMention(false);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                        />
                        {showAIMention && (
                          <div className="mention-popup animate-in slide-in-from-bottom-2 duration-200">
                            <div className="mention-item" onClick={() => { setInputValue(prev => prev + 'ai '); setShowAIMention(false); }}>
                              <div className="mention-avatar">AI</div>
                              <div className="mention-info">
                                <b>AI Assistant</b>
                                <span>Ask me anything</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          className="cancel-record-btn transition-all active:scale-90 animate-in fade-in zoom-in duration-200"
                          onClick={(e) => {
                            e.preventDefault();
                            cancelRecording();
                          }}
                          title="Cancel recording"
                          aria-label="Cancel recording"
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            cursor: 'pointer',
                            marginRight: '8px',
                            flexShrink: 0
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <div className="visualizer" style={{ flex: 1 }}>
                          {[...Array(13)].map((_, i) => <div key={i} className="bar" style={{ animationDelay: `${-0.1 * (i % 7)}s` }} />)}
                        </div>
                      </>
                    )}


                    <button
                      className={`send-btn${isRecording ? ' recording-pulse' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        if ((e.currentTarget as any)._touchHandled) {
                          (e.currentTarget as any)._touchHandled = false;
                          return;
                        }
                        if (inputValue.trim()) {
                          handleSendMessage();
                        } else if (isRecording) {
                          stopRecording();
                        } else {
                          startRecording();
                        }
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        (e.currentTarget as any)._touchHandled = true;
                        if (inputValue.trim()) {
                          handleSendMessage();
                        } else if (isRecording) {
                          stopRecording();
                        } else {
                          startRecording();
                        }
                      }}
                      title={isRecording ? 'Send voice note' : inputValue.trim() ? 'Send' : 'Voice message'}
                      style={
                        isRecording
                          ? {
                              background: activeTheme.accentColor || '#0095f6',
                              borderRadius: '9999px',
                              boxShadow: '0 4px 15px rgba(0, 149, 246, 0.3)',
                              transition: 'all 0.3s ease'
                            }
                          : {
                              background: activeTheme.accentColor || '#6366f1',
                              borderRadius: '9999px',
                              boxShadow: activeTheme.accentColor ? `0 4px 15px ${activeTheme.accentColor}40` : undefined,
                              transition: 'all 0.3s ease'
                            }
                      }
                    >
                      {inputValue.trim() || isRecording ? (
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                      ) : isVoiceToText ? (
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                      )}
                    </button>
                  </footer>
                ) : (
                  <footer className="sel-bar">
                    {/* Left — cancel + count */}
                    <div className="sel-bar__left">
                      <button className="sel-bar__cancel" onClick={() => setSelectedMessageIds(new Set())} aria-label="Cancel selection">
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                      <span className="sel-bar__count">
                        {selectedMessageIds.size} {selectedMessageIds.size === 1 ? 'message' : 'messages'}
                      </span>
                    </div>

                    {/* Right — icon-only delete buttons matching msg-action-btn style */}
                    <div className="sel-bar__actions">
                      <button
                        className="sel-bar__icon-btn sel-bar__icon-btn--ghost"
                        onClick={() => handleBulkDelete('me')}
                        title="Delete for me"
                        aria-label="Delete for me"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>
                        <span className="sel-bar__icon-label">Me</span>
                      </button>
                      <button
                        className="sel-bar__icon-btn sel-bar__icon-btn--danger"
                        onClick={() => handleBulkDelete('everyone')}
                        title="Delete for everyone"
                        aria-label="Delete for everyone"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>
                        <span className="sel-bar__icon-label">All</span>
                      </button>
                    </div>
                  </footer>
                )}



                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="*" />

                {/* ── PREMIUM REDESIGNED CHAT DETAILS VIEW OVERLAY ── */}
                {showChatDetails && selectedUser && (
                  <div className="absolute inset-0 z-40 flex flex-col bg-[var(--dm-bg-main)] text-[var(--dm-text-primary)] animate-in slide-in-from-right-full duration-300 overflow-y-auto no-scrollbar">
                    {/* Sticky Top Nav Bar */}
                    <div className="sticky top-0 z-20 flex items-center justify-between px-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-3 bg-[var(--dm-bg-sidebar)]/95 backdrop-blur-md">
                      <button
                        onClick={() => {
                          setEditingNickname(false);
                          setShowChatDetails(false);
                        }}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--dm-bg-hover)] hover:bg-[var(--dm-bg-active)] text-[var(--dm-text-primary)] active:scale-90 transition-all cursor-pointer"
                        title="Back to chat"
                      >
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h3 className="font-extrabold text-base tracking-tight">Chat Info</h3>
                      <div className="w-10" />
                    </div>

                    {/* Centered Profile Avatar & Name */}
                    <div className="flex flex-col items-center pt-4 pb-2 px-4 text-center">
                      <div className="w-24 h-24 rounded-full overflow-hidden mb-3 relative">
                        {selectedUser.image && selectedUser.image.length > 5 ? (
                          <img src={selectedUser.image} alt={selectedUser.name} className="w-full h-full object-cover" />
                        ) : (
                          <img src="/Avatar.avif" alt="avatar" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <h2 className="text-xl font-extrabold text-[var(--dm-text-primary)]">
                        {nicknames[selectedUser.id] || selectedUser.name}
                      </h2>
                      <p className="text-xs text-[var(--dm-text-muted)] mt-0.5 font-medium">
                        @{selectedUser.username || selectedUser.email?.split('@')[0]}
                      </p>

                      {/* 3 Simple Action Buttons under Profile Pic (No background, no boundaries) */}
                      <div className="flex items-center justify-center gap-6 mt-4 text-xs font-semibold">
                        <button
                          onClick={() => {
                            setShowChatDetails(false);
                            if (onOpenProfile) {
                              onOpenProfile(selectedUser);
                            }
                            if (typeof window !== 'undefined') {
                              window.dispatchEvent(new CustomEvent('open_user_profile', { detail: selectedUser }));
                            }
                          }}
                          className="text-[var(--dm-text-primary)] hover:text-indigo-500 transition-colors cursor-pointer"
                        >
                          Profile
                        </button>
                        <span className="text-[var(--dm-text-muted)] opacity-30">•</span>
                        <button
                          onClick={() => {
                            setShowChatDetails(false);
                            setShowSearchWindow(true);
                            setChatSearchQuery('');
                          }}
                          className="text-[var(--dm-text-primary)] hover:text-indigo-500 transition-colors cursor-pointer"
                        >
                          Search
                        </button>
                        <span className="text-[var(--dm-text-muted)] opacity-30">•</span>
                        <button
                          onClick={() => setIsUserBlocked(!isUserBlocked)}
                          className={`transition-colors cursor-pointer ${isUserBlocked ? 'text-rose-500 font-bold' : 'text-[var(--dm-text-primary)] hover:text-rose-500'}`}
                        >
                          {isUserBlocked ? 'Blocked' : 'Block'}
                        </button>
                      </div>

                      {/* Nickname Input Popup when editing */}
                      {editingNickname && (
                        <div className="flex items-center gap-2 mt-4 w-full max-w-xs animate-in zoom-in-95 duration-150">
                          <input
                            type="text"
                            placeholder="Enter nickname..."
                            value={nicknameInput}
                            onChange={(e) => setNicknameInput(e.target.value)}
                            className="flex-1 px-4 py-2 text-xs rounded-full bg-[var(--dm-bg-input)] text-[var(--dm-text-primary)] focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={handleSaveNickname}
                            className="px-3.5 py-2 text-xs font-bold rounded-full bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700 transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      )}

                      {/* All Options Above Media Section — Unboxed, No borders, No outlines */}
                      <div className="w-full max-w-sm mt-6 text-left space-y-1">
                        {/* Theme Selection Row */}
                        <button
                          onClick={() => {
                            setLiveThemeId(chatThemes[selectedUser.id] || 'default');
                            setShowThemePicker(true);
                          }}
                          className="w-full py-2.5 px-2 flex items-center justify-between text-xs transition-colors hover:bg-[var(--dm-bg-hover)] rounded-xl cursor-pointer"
                        >
                          <span className="font-semibold text-[var(--dm-text-primary)]">Chat Theme</span>
                          <span className="text-xs text-[var(--dm-text-secondary)]">
                            {(INSTAGRAM_THEMES.find(t => t.id === (chatThemes[selectedUser.id] || 'default')) || INSTAGRAM_THEMES[0]).name}
                          </span>
                        </button>

                        {/* Mute Notifications Row */}
                        <button
                          onClick={() => setIsChatMuted(!isChatMuted)}
                          className="w-full py-2.5 px-2 flex items-center justify-between text-xs transition-colors hover:bg-[var(--dm-bg-hover)] rounded-xl cursor-pointer"
                        >
                          <span className="font-semibold text-[var(--dm-text-primary)]">Mute Notifications</span>
                          <span className={`text-xs font-semibold ${isChatMuted ? 'text-rose-500' : 'text-[var(--dm-text-muted)]'}`}>
                            {isChatMuted ? 'Muted' : 'Off'}
                          </span>
                        </button>

                        {/* Nickname Row */}
                        <button
                          onClick={() => {
                            setNicknameInput(nicknames[selectedUser.id] || '');
                            setEditingNickname(!editingNickname);
                          }}
                          className="w-full py-2.5 px-2 flex items-center justify-between text-xs transition-colors hover:bg-[var(--dm-bg-hover)] rounded-xl cursor-pointer"
                        >
                          <span className="font-semibold text-[var(--dm-text-primary)]">Set Nickname</span>
                          <span className="text-xs text-[var(--dm-text-secondary)]">
                            {nicknames[selectedUser.id] || 'None'}
                          </span>
                        </button>

                        {/* Report Conversation Row */}
                        <button
                          onClick={() => {
                            setReportSubmitted(false);
                            setShowReportModal(true);
                          }}
                          className="w-full py-2.5 px-2 flex items-center justify-between text-xs transition-colors hover:bg-[var(--dm-bg-hover)] rounded-xl cursor-pointer"
                        >
                          <span className="font-semibold text-amber-500">Report Conversation</span>
                        </button>

                        {/* Clear History Row */}
                        <button
                          onClick={() => setShowClearConfirmModal(true)}
                          className="w-full py-2.5 px-2 flex items-center justify-between text-xs transition-colors hover:bg-[var(--dm-bg-hover)] rounded-xl cursor-pointer"
                        >
                          <span className="font-semibold text-rose-500">Clear Chat History</span>
                        </button>
                      </div>
                    </div>

                    {/* Shared Content Tab Navigation (Simple Text Tabs, No outlines) */}
                    <div className="px-4 pt-4 max-w-lg mx-auto w-full">
                      <div className="flex items-center justify-around pb-2 text-center">
                        <button
                          onClick={() => setDetailsTab('photos')}
                          className={`text-xs font-bold transition-all cursor-pointer ${
                            detailsTab === 'photos'
                              ? 'text-[var(--dm-text-primary)] font-extrabold'
                              : 'text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)]'
                          }`}
                        >
                          Photos
                        </button>
                        <button
                          onClick={() => setDetailsTab('reels')}
                          className={`text-xs font-bold transition-all cursor-pointer ${
                            detailsTab === 'reels'
                              ? 'text-[var(--dm-text-primary)] font-extrabold'
                              : 'text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)]'
                          }`}
                        >
                          Reels
                        </button>
                        <button
                          onClick={() => setDetailsTab('files')}
                          className={`text-xs font-bold transition-all cursor-pointer ${
                            detailsTab === 'files'
                              ? 'text-[var(--dm-text-primary)] font-extrabold'
                              : 'text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)]'
                          }`}
                        >
                          Voice & Files
                        </button>
                      </div>
                    </div>

                    {/* Shared Content Display Panel (No outlines on items) */}
                    <div className="px-4 py-4 space-y-6 max-w-lg mx-auto w-full flex-1">
                      {/* Tab 1: Photos & Images */}
                      {detailsTab === 'photos' && (
                        <div>
                          {messages.filter(m => m.type === 'image').length === 0 ? (
                            <div className="p-8 rounded-2xl bg-[var(--dm-bg-hover)] text-center text-xs text-[var(--dm-text-muted)] font-medium">
                              No photos shared in this chat yet
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {messages.filter(m => m.type === 'image').map(m => (
                                <div
                                  key={m.id}
                                  className="aspect-square rounded-2xl overflow-hidden bg-black/10 cursor-pointer group relative"
                                  onClick={() => window.open(m.content, '_blank')}
                                >
                                  <img src={m.content} alt="photo" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab 2: Reels & Videos */}
                      {detailsTab === 'reels' && (
                        <div>
                          {messages.filter(m => m.type === 'video').length === 0 ? (
                            <div className="p-8 rounded-2xl bg-[var(--dm-bg-hover)] text-center text-xs text-[var(--dm-text-muted)] font-medium">
                              No video reels shared in this chat yet
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3">
                              {messages.filter(m => m.type === 'video').map(m => (
                                <div
                                  key={m.id}
                                  className="aspect-[9/16] rounded-2xl overflow-hidden bg-black cursor-pointer group relative"
                                  onClick={() => window.open(m.content, '_blank')}
                                >
                                  <video src={m.content} controls className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab 3: Voice Clips & Files */}
                      {detailsTab === 'files' && (
                        <div>
                          {messages.filter(m => m.type === 'voice' || m.type === 'file').length === 0 ? (
                            <div className="p-8 rounded-2xl bg-[var(--dm-bg-hover)] text-center text-xs text-[var(--dm-text-muted)] font-medium">
                              No audio clips or documents shared yet
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {messages.filter(m => m.type === 'voice' || m.type === 'file').map(m => (
                                <div key={m.id} className="p-3.5 rounded-2xl bg-[var(--dm-bg-hover)] flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-8 h-8 rounded-full bg-[var(--dm-bg-active)] flex items-center justify-center text-xs font-bold">
                                        {m.type === 'voice' ? '🎙️' : '📄'}
                                      </div>
                                      <span className="text-xs font-semibold truncate text-[var(--dm-text-primary)]">
                                        {m.type === 'voice' ? 'Voice Clip' : m.content}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-[var(--dm-text-muted)]">
                                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {m.type === 'voice' && (
                                    <audio src={m.content} controls className="w-full h-8 mt-1" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
              </>
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
                  {incomingCall.from.image ? <img src={incomingCall.from.image} className="w-full h-full object-cover" /> : <img src="/Avatar.avif" className="w-full h-full object-cover" />}
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


      {activeCall && socket && (
        <CallInterface
          socket={socket}
          peer={activeCall.peer}
          type={activeCall.type}
          isCaller={activeCall.isCaller}
          isAccepted={(activeCall as any).connected}
          initialOffer={(activeCall as any).initialOffer}
          onEnd={(duration, wasConnected) => {
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
            className="w-full max-w-md mx-auto z-40 border-t border-x rounded-t-[2.5rem] p-7 md:p-8 pb-10 shadow-[0_-15px_40px_rgba(0,0,0,0.35)] max-h-[90vh] overflow-y-auto no-scrollbar transform animate-in slide-in-from-bottom duration-300 ease-out"
            style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border)', color: 'var(--dm-text-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Top Handle Bar */}
            <div className="w-12 h-1 rounded-full mx-auto mb-6 opacity-50" style={{ background: 'var(--dm-text-muted)' }} />

            {/* Header: User Avatar & Name on TOP of the action buttons */}
            <div className="flex items-center gap-4 pb-5 mb-5 border-b transition-colors" style={{ borderColor: 'var(--dm-border)' }}>
              <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border-2 shadow-md" style={{ borderColor: 'var(--dm-border)', background: 'var(--dm-bg-hover)' }}>
                <img
                  src={selectedChatForOptions.image || '/Avatar.avif'}
                  alt={selectedChatForOptions.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold tracking-tight truncate" style={{ color: 'var(--dm-text-primary)' }}>
                  {selectedChatForOptions.name}
                </h3>
                <p className="text-xs font-medium truncate mt-0.5" style={{ color: 'var(--dm-text-muted)' }}>
                  @{selectedChatForOptions.username || selectedChatForOptions.email?.split('@')[0] || 'user'}
                </p>
              </div>
              <button
                onClick={() => setSelectedChatForOptions(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105 cursor-pointer text-sm font-bold"
                style={{ background: 'var(--dm-bg-hover)', color: 'var(--dm-text-muted)', border: '1px solid var(--dm-border)' }}
              >
                ✕
              </button>
            </div>

            {/* Action Buttons List (Pill Buttons with Dynamic System Theme, NO EMOJIS) */}
            <div className="flex flex-col gap-3">
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
                className="w-full transition-all duration-200 active:scale-[0.98] rounded-full py-3.5 px-6 font-bold text-center text-sm flex items-center justify-between shadow-sm cursor-pointer hover:opacity-90"
                style={{ background: 'var(--dm-bg-input)', color: 'var(--dm-text-primary)', border: '1px solid var(--dm-border)' }}
              >
                <span>{pinnedChats.has(selectedChatForOptions.id) ? 'Unpin Chat' : 'Pin Chat to Top'}</span>
                {pinnedChats.has(selectedChatForOptions.id) && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'var(--dm-bg-hover)', color: 'var(--dm-text-secondary)' }}>
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
                className="w-full transition-all duration-200 active:scale-[0.98] rounded-full py-3.5 px-6 font-bold text-center text-sm flex items-center justify-between shadow-sm cursor-pointer hover:opacity-90"
                style={{ background: 'var(--dm-bg-input)', color: 'var(--dm-text-primary)', border: '1px solid var(--dm-border)' }}
              >
                <span>{mutedChats.has(selectedChatForOptions.id) ? 'Unmute Notifications' : 'Mute Notifications'}</span>
                {mutedChats.has(selectedChatForOptions.id) && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'var(--dm-bg-hover)', color: 'var(--dm-text-secondary)' }}>
                    Muted
                  </span>
                )}
              </button>

              {/* Delete Chat Button */}
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
                className="w-full bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 transition-all duration-200 active:scale-[0.98] rounded-full py-3.5 font-bold text-center text-sm shadow-sm cursor-pointer"
              >
                Delete Chat
              </button>

              {/* Cancel Button */}
              <button
                onClick={() => setSelectedChatForOptions(null)}
                className="w-full transition-all duration-200 active:scale-[0.98] rounded-full py-3.5 font-bold text-center text-sm shadow-md mt-1 cursor-pointer hover:opacity-90"
                style={{ background: 'var(--dm-text-primary)', color: 'var(--dm-bg-sidebar)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* --- IMAGE LIGHTBOX PREVIEW OVERLAY --- */}
      {lightboxImageSrc && (
        <div
          className="fixed inset-0 z-[2000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImageSrc(null)}
        >
          <button
            onClick={() => setLightboxImageSrc(null)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg font-bold cursor-pointer transition-all active:scale-90"
            title="Close image"
          >
            ✕
          </button>
          <img
            src={lightboxImageSrc}
            alt="Full preview"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {/* --- INSTAGRAM-STYLE PREMIUM CONVERSATION THEME PICKER BOTTOM SHEET --- */}
      {showThemePicker && selectedUser && (
        <div
          className="fixed inset-0 z-[1600] flex items-end justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => {
            setLiveThemeId(null);
            setShowThemePicker(false);
          }}
        >
          <div
            className="w-full max-w-xl bg-[var(--dm-bg-sidebar)] border-t border-x border-[var(--dm-border)] rounded-t-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-300 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle Bar */}
            <div className="w-full pt-3 pb-1 flex items-center justify-center">
              <div className="w-12 h-1.5 rounded-full bg-[var(--dm-border)]" />
            </div>

            {/* Header */}
            <div className="px-6 py-3 flex items-center justify-between border-b border-[var(--dm-border)]">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--dm-text-primary)] tracking-tight">Theme Gallery</h3>
                <p className="text-[11px] text-[var(--dm-text-secondary)] font-medium">Select a theme for this conversation</p>
              </div>
              <button
                onClick={() => {
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--dm-bg-hover)] text-[var(--dm-text-muted)] hover:text-[var(--dm-text-primary)] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* ── LARGE LIVE CONVERSATION PREVIEW BANNER ── */}
            {(() => {
              const currentPreviewThemeId = liveThemeId || chatThemes[selectedUser.id] || 'default';
              const previewTheme = INSTAGRAM_THEMES.find(t => t.id === currentPreviewThemeId) || INSTAGRAM_THEMES[0];
              return (
                <div className="px-6 pt-4 pb-2 flex-shrink-0">
                  <div
                    className="w-full h-36 rounded-2xl p-4 flex flex-col justify-between overflow-hidden shadow-2xl relative transition-all duration-300 border border-white/10"
                    style={{ background: previewTheme.previewWallpaper }}
                  >
                    {/* Header Mini Profile Bar */}
                    <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-white/20 flex-shrink-0">
                        {selectedUser.image && selectedUser.image.length > 5 ? (
                          <img src={selectedUser.image} alt={selectedUser.name} className="w-full h-full object-cover" />
                        ) : (
                          <img src="/Avatar.avif" alt="avatar" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-white drop-shadow-sm truncate">{selectedUser.name}</span>
                      <span className="ml-auto text-[9px] font-semibold text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active now
                      </span>
                    </div>

                    {/* Dummy Message Stream Preview */}
                    <div className="flex flex-col gap-2 my-auto">
                      {/* Incoming Bubble */}
                      <div
                        className="self-start max-w-[80%] px-3 py-1.5 rounded-2xl text-[11px] font-medium shadow-md transition-all duration-300"
                        style={{ background: previewTheme.incomingBubbleColor, color: previewTheme.incomingTextColor }}
                      >
                        How does this theme look? ✨
                      </div>

                      {/* Outgoing Bubble */}
                      <div
                        className="self-end max-w-[80%] px-3 py-1.5 rounded-2xl text-[11px] font-medium shadow-md transition-all duration-300"
                        style={{ background: previewTheme.outgoingGradient, color: previewTheme.outgoingTextColor }}
                      >
                        Looks amazing! Super clean 🚀
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Category Filter Pills & Search */}
            <div className="px-6 py-2 space-y-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {(['All', 'Gradients', 'Ambient', 'Nature', 'Special'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setThemeCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      themeCategoryFilter === cat
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-[var(--dm-bg-hover)] text-[var(--dm-text-secondary)] hover:text-[var(--dm-text-primary)]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Search 30+ themes..."
                value={themeSearchQuery}
                onChange={(e) => setThemeSearchQuery(e.target.value)}
                className="w-full px-4 py-2 text-xs rounded-full border border-[var(--dm-border)] bg-[var(--dm-bg-input)] text-[var(--dm-text-primary)] focus:outline-none"
              />
            </div>

            {/* Themes Grid */}
            <div className="px-6 py-3 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-h-[45vh] no-scrollbar">
              {INSTAGRAM_THEMES
                .filter(t => {
                  const matchesCat = themeCategoryFilter === 'All' || t.category === themeCategoryFilter;
                  const matchesQuery = t.name.toLowerCase().includes(themeSearchQuery.toLowerCase());
                  return matchesCat && matchesQuery;
                })
                .map(theme => {
                  const isSelected = (liveThemeId || chatThemes[selectedUser.id] || 'default') === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(20);
                        setLiveThemeId(theme.id);
                      }}
                      className={`relative p-2.5 rounded-2xl border-2 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-indigo-500 scale-[1.03] shadow-xl ring-2 ring-indigo-500/30 bg-[var(--dm-bg-hover)]' 
                          : 'border-[var(--dm-border)] bg-[var(--dm-bg-hover)] hover:border-zinc-500/50 hover:scale-[1.01]'
                      }`}
                    >
                      {/* Card Wallpaper Miniature */}
                      <div
                        className="w-full aspect-[4/3] rounded-xl p-2 flex flex-col justify-between overflow-hidden shadow-inner relative transition-all duration-300"
                        style={{ background: theme.previewWallpaper }}
                      >
                        <div
                          className="self-start max-w-[80%] px-2 py-1 rounded-lg text-[9px] font-medium shadow-sm truncate"
                          style={{ background: theme.incomingBubbleColor, color: theme.incomingTextColor }}
                        >
                          Hey! 👋
                        </div>
                        <div
                          className="self-end max-w-[80%] px-2 py-1 rounded-lg text-[9px] font-medium shadow-sm truncate"
                          style={{ background: theme.outgoingGradient, color: theme.outgoingTextColor }}
                        >
                          Awesome ✨
                        </div>
                      </div>

                      {/* Card Footer Name & Checkmark */}
                      <div className="mt-2 flex items-center justify-between px-0.5">
                        <span className="text-[11px] font-bold text-[var(--dm-text-primary)] truncate">{theme.name}</span>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-extrabold animate-in zoom-in-75 duration-200 shadow-md flex-shrink-0 ml-1">
                            ✓
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 border-t border-[var(--dm-border)] bg-[var(--dm-bg-sidebar)] flex items-center gap-3">
              <button
                onClick={() => {
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="flex-1 py-3 px-4 rounded-full text-xs font-bold text-[var(--dm-text-secondary)] bg-[var(--dm-bg-hover)] hover:bg-[var(--dm-bg-active)] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const targetThemeId = liveThemeId || chatThemes[selectedUser.id] || 'default';
                  const themeObj = INSTAGRAM_THEMES.find(t => t.id === targetThemeId) || INSTAGRAM_THEMES[0];
                  handleSelectTheme(themeObj);
                  setLiveThemeId(null);
                  setShowThemePicker(false);
                }}
                className="flex-1 py-3 px-4 rounded-full text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
              >
                Apply Theme
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
                            <img src="/Avatar.avif" alt="avatar" className="w-full h-full object-cover" />
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
        />
      )}
    </>
  );
});

export default SocialChat;

