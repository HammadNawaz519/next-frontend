'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ImageIcon,
  FileText,
  User,
  Mic as LucideMic
} from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

interface ChatDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  selectedUser: any;
  nicknames: Record<string, string>;
  onUpdateNickname: (userId: string, newNickname: string) => void;
  onlineUsers: Set<string>;
  lastSeenMap: Record<string, string>;
  isChatMuted: boolean;
  onToggleMute: () => void;
  onStartCall: (type: 'audio' | 'video') => void;
  onOpenSearch: () => void;
  onOpenThemePicker: () => void;
  activeTheme: { id: string; name: string };
  sharedMedia: { picsAndVideos: any[]; files: any[] };
  onPreviewMedia: (url: string, type: 'image' | 'video') => void;
  onOpenClearConfirm: () => void;
  isUserBlocked: boolean;
  onToggleBlock: () => void;
  formatLastSeenAgo?: (timestamp?: string) => string;
  isSpeechToTextEnabled?: boolean;
  onToggleSpeechToText?: (enabled: boolean) => void;
  onOpenUserProfile?: (user: any) => void;
}

export default function ChatDetails({
  isOpen,
  onClose,
  selectedUser,
  nicknames,
  onUpdateNickname,
  onlineUsers,
  lastSeenMap,
  isChatMuted,
  onToggleMute,
  onStartCall,
  onOpenSearch,
  onOpenThemePicker,
  activeTheme,
  sharedMedia,
  onPreviewMedia,
  onOpenClearConfirm,
  isUserBlocked,
  onToggleBlock,
  formatLastSeenAgo,
  isSpeechToTextEnabled = false,
  onToggleSpeechToText,
  onOpenUserProfile
}: ChatDetailsProps) {
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [detailsTab, setDetailsTab] = useState<'media' | 'files'>('media');
  const [speechToText, setSpeechToText] = useState(isSpeechToTextEnabled);

  useEffect(() => {
    setSpeechToText(isSpeechToTextEnabled);
  }, [isSpeechToTextEnabled]);

  if (!isOpen || !selectedUser) return null;

  const handleToggleVoiceTyping = () => {
    triggerHaptic('light');
    const nextVal = !speechToText;
    setSpeechToText(nextVal);
    onToggleSpeechToText?.(nextVal);
    try {
      localStorage.setItem('connect_speech_to_text_enabled', String(nextVal));
    } catch (e) {}
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#141111] animate-in slide-in-from-right-full duration-300 overflow-hidden font-sans select-none">
      
      {/* ── 1. TOP BAR (BACK BUTTON, NAME & SEARCH BUTTON ON TOP RIGHT - NO BORDER, NO OUTLINE) ── */}
      <div className="pt-14 pb-4 px-5 flex items-center justify-between shrink-0 bg-[#141111] z-20">
        
        {/* Left: Back button matching chat UI (no outline, no border) */}
        <button
          onClick={() => {
            setEditingNickname(false);
            onClose();
          }}
          className="w-10 h-10 rounded-full text-white hover:text-zinc-300 hover:bg-white/5 flex items-center justify-center cursor-pointer active:scale-90 transition-all outline-none border-0"
          title="Back to conversation"
        >
          <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.4} />
        </button>

        {/* Center: Contact Name (No Details heading, No activity status) */}
        <h2 className="text-[17px] font-bold text-white tracking-tight truncate max-w-[200px] text-center">
          {nicknames[selectedUser.id] || (selectedUser.email && nicknames[selectedUser.email.toLowerCase().trim()]) || selectedUser.username}
        </h2>

        {/* Right: Search button (no outline, no border) */}
        <button
          onClick={() => {
            onClose();
            onOpenSearch();
          }}
          className="w-10 h-10 rounded-full text-white hover:text-zinc-300 hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer active:scale-90 outline-none border-0"
          title="Search in chat"
        >
          <Search className="w-5 h-5 text-white" strokeWidth={2.2} />
        </button>
      </div>

      {/* ── 2. WHITE CONTAINER (MOVED FULL UP DIRECTLY UNDER TOP BAR) ── */}
      <div className="flex-1 bg-white rounded-t-[32px] px-5 pt-6 pb-24 flex flex-col gap-6 text-zinc-900 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] overflow-y-auto no-scrollbar">
        
        {/* Section 1: Preferences */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">Preferences</span>
          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-2 divide-y divide-zinc-100">
            
            {/* View Profile Button */}
            <div className="py-3 px-2 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-zinc-800">User Profile</span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenUserProfile?.(selectedUser);
                }}
                className="text-[13px] font-bold text-[#9D4EDD] hover:underline cursor-pointer outline-none flex items-center gap-1"
              >
                <span>View Profile</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Voice Typing (Speech to Text) Toggle */}
            <div className="flex items-center justify-between py-3.5 px-2">
              <span className="text-[14px] font-semibold text-zinc-800">Voice Typing (Speech to Text)</span>
              <button
                type="button"
                onClick={handleToggleVoiceTyping}
                className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                  speechToText ? 'bg-[#9D4EDD]' : 'bg-zinc-200'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    speechToText ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Nickname Row */}
            <div className="py-3 px-2">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-zinc-800">Nickname</span>
                {!editingNickname ? (
                  <button
                    onClick={() => {
                      const currentNick = nicknames[selectedUser.id] || (selectedUser.email && nicknames[selectedUser.email.toLowerCase().trim()]) || '';
                      setNicknameInput(currentNick);
                      setEditingNickname(true);
                    }}
                    className="text-[13px] font-bold text-[#9D4EDD] hover:underline cursor-pointer outline-none"
                  >
                    {nicknames[selectedUser.id] || (selectedUser.email && nicknames[selectedUser.email.toLowerCase().trim()]) || 'Set Nickname'}
                  </button>
                ) : null}
              </div>
              {editingNickname && (
                <div className="flex items-center gap-2 mt-2.5 pt-1">
                  <input
                    type="text"
                    placeholder="Enter nickname..."
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onUpdateNickname(selectedUser.id, nicknameInput.trim());
                        setEditingNickname(false);
                      } else if (e.key === 'Escape') {
                        setEditingNickname(false);
                      }
                    }}
                    className="flex-1 px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-full outline-none text-zinc-900 focus:border-[#9D4EDD]"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      onUpdateNickname(selectedUser.id, nicknameInput.trim());
                      setEditingNickname(false);
                    }}
                    className="px-4 py-2 bg-[#9D4EDD] hover:bg-[#8A38CC] text-white rounded-full text-xs font-bold cursor-pointer outline-none shadow-xs"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNickname(false)}
                    className="px-3.5 py-2 bg-zinc-200 text-zinc-700 rounded-full text-xs font-medium cursor-pointer outline-none"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Theme Row */}
            <div
              onClick={onOpenThemePicker}
              className="flex items-center justify-between py-3 px-2 cursor-pointer hover:bg-zinc-100/70 rounded-xl transition-colors"
            >
              <span className="text-[14px] font-semibold text-zinc-800">Chat Theme</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-zinc-500">{activeTheme.name}</span>
                <span className="text-zinc-400 font-bold">›</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Shared Content (No counts in title or tabs) */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">Shared Content</span>

          <div className="flex flex-col gap-3">
            {/* Pill Tab Switcher: Plain Text without counts */}
            <div className="flex items-center bg-zinc-100 p-1 rounded-full border border-zinc-200/60 max-w-sm">
              <button
                onClick={() => setDetailsTab('media')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === 'media'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Media
              </button>
              <button
                onClick={() => setDetailsTab('files')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === 'files'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Files & Voice
              </button>
            </div>

            {/* Media Content List */}
            {detailsTab === 'media' && (
              sharedMedia.picsAndVideos.length === 0 ? (
                <div className="bg-zinc-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-zinc-400">
                  <ImageIcon className="w-8 h-8 mb-1.5 text-zinc-300" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium">No photos or videos shared yet</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {sharedMedia.picsAndVideos.slice(0, 30).map((m) => (
                    <div
                      key={m.id}
                      className="aspect-square rounded-2xl overflow-hidden bg-zinc-100 cursor-pointer relative shadow-xs"
                      onClick={() => onPreviewMedia(m.content, m.type === 'video' ? 'video' : 'image')}
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

            {/* Files & Voice Content List */}
            {detailsTab === 'files' && (
              sharedMedia.files.length === 0 ? (
                <div className="bg-zinc-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-zinc-400">
                  <FileText className="w-8 h-8 mb-1.5 text-zinc-300" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium">No files or voice notes shared yet</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {sharedMedia.files.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-[#9D4EDD] flex items-center justify-center text-sm font-bold shrink-0">
                          {m.type === 'voice' ? <LucideMic className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <span className="text-xs font-semibold text-zinc-800 truncate">
                          {m.type === 'voice' ? 'Voice Message' : m.content}
                        </span>
                      </div>
                      {m.type === 'voice' ? (
                        <audio src={m.content} controls className="h-8 max-w-[140px]" />
                      ) : (
                        <a
                          href={m.content}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-[#9D4EDD] hover:underline shrink-0"
                        >
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

        {/* Section 3: Privacy & Security */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">Privacy & Security</span>
          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-2 divide-y divide-zinc-100">
            <div
              onClick={onOpenClearConfirm}
              className="flex items-center justify-between py-3 px-2 cursor-pointer hover:bg-zinc-100/70 rounded-xl transition-colors group"
            >
              <span className="text-[14px] font-semibold text-zinc-800 group-hover:text-red-500 transition-colors">
                Clear Chat History
              </span>
              <span className="text-xs text-zinc-400 font-medium">Delete messages</span>
            </div>

            <div
              onClick={onToggleBlock}
              className="flex items-center justify-between py-3 px-2 cursor-pointer hover:bg-zinc-100/70 rounded-xl transition-colors group"
            >
              <span className="text-[14px] font-semibold text-zinc-800 group-hover:text-red-500 transition-colors">
                {isUserBlocked ? 'Unblock Contact' : 'Block Contact'}
              </span>
              <span className="text-xs text-zinc-400 font-medium">{isUserBlocked ? 'Blocked' : 'Active'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
