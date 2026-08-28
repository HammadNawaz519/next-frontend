'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, Heart, Smile, Sparkles, Flame, Star, Compass } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

interface StoryStickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (emoji: string) => void;
}

interface StickerCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  emojis: string[];
}

const STICKER_CATEGORIES: StickerCategory[] = [
  {
    id: 'smiles',
    name: 'Smiles',
    icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥹', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙',
      '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
      '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
      '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤', '😠',
      '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
      '😓', '🫣', '🫡', '🤔', '🫣', '🤭', '🫢', '🤫', '🤥', '😶'
    ]
  },
  {
    id: 'love',
    name: 'Love & Hearts',
    icon: Heart,
    emojis: [
      '❤️', '🩷', '🧡', '💛', '💚', '💙', '🩵', '💜', '🤎', '🖤',
      '🩶', '🤍', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗',
      '💖', '💘', '💝', '💟', '💌', '💐', '🌹', '🥀', '🌺', '🌸',
      '✨', '🫶', '👐', '🙌', '👏', '🤝', '🫂', '💋', '🫦', '🫰'
    ]
  },
  {
    id: 'vibes',
    name: 'Vibes & Mood',
    icon: Flame,
    emojis: [
      '🔥', '⚡', '💫', '🌟', '⭐', '🌈', '☀️', '🌙', '🌊', '☕',
      '🍾', '🥂', '🍻', '🍸', '🍹', '🍕', '🍔', '🍟', '🍩', '🍦',
      '🎧', '🎵', '🎶', '🎤', '🎬', '📸', '🚀', '🛸', '🏝️', '✈️',
      '🌴', '🏕️', '🌇', '🌃', '🌌', '🎈', '🎉', '🎊', '🎁', '🏆'
    ]
  },
  {
    id: 'reactions',
    name: 'Reactions',
    icon: Sparkles,
    emojis: [
      '👀', '💯', '🔥', '👏', '🙌', '✨', '💀', '☠️', '🤡', '👻',
      '👽', '🤖', '👾', '🙈', '🙉', '🙊', '💤', '💥', '💢', '💨',
      '💫', '💭', '💬', '👁️‍🗨️', '🗯️', '👑', '💎', '🔑', '🪄', '🎯'
    ]
  },
  {
    id: 'badges',
    name: 'Badges',
    icon: Star,
    emojis: [
      '⭐', '🌟', '✨', '⚡', '💫', '🏆', '🥇', '🥈', '🥉', '🎖️',
      '🏵️', '🎗️', '🎫', '🏷️', '📌', '📍', '🚩', '🏁', '🪐', '🔮'
    ]
  }
];

export default function StoryStickerPicker({
  isOpen,
  onClose,
  onSelectSticker
}: StoryStickerPickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('smiles');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) {
      const cat = STICKER_CATEGORIES.find((c) => c.id === activeCategory);
      return cat ? cat.emojis : [];
    }
    // Return all matching emojis from all categories
    const all = STICKER_CATEGORIES.flatMap((c) => c.emojis);
    return Array.from(new Set(all));
  }, [activeCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop tap to close */}
      <div className="flex-1 w-full" onClick={onClose} />

      {/* Bottom Sheet Container */}
      <div className="w-full max-w-lg mx-auto bg-[#181515] border-t border-zinc-800 rounded-t-[32px] p-4 flex flex-col max-h-[60vh] shadow-[0_-12px_40px_rgba(0,0,0,0.6)] animate-in slide-in-from-bottom-6 duration-200">
        
        {/* Handle and Close */}
        <div className="w-full flex items-center justify-between pb-3 px-1">
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto -mr-2" />
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="w-full h-11 bg-zinc-900/90 border border-zinc-800 rounded-full px-4 flex items-center gap-2 mb-3 focus-within:border-[#9D4EDD] transition-colors">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            placeholder="Search emojis & stickers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-zinc-400 hover:text-white text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Categories Bar */}
        {!searchQuery && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-2 shrink-0">
            {STICKER_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveCategory(cat.id);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#9D4EDD] text-white shadow-xs'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Emojis Grid */}
        <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-6 sm:grid-cols-8 gap-3 p-2 min-h-[160px]">
          {filteredEmojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              onClick={() => {
                triggerHaptic('medium');
                onSelectSticker(emoji);
                onClose();
              }}
              className="w-12 h-12 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800/80 active:scale-90 flex items-center justify-center text-2xl transition-all cursor-pointer select-none"
            >
              {emoji}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
