'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Phone,
  Video,
  Search,
  ImageIcon,
  FileText,
  Mic as LucideMic,
  Volume2,
  VolumeX,
  Trash2,
  Ban
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
  onToggleSpeechToText
}: ChatDetailsProps) {
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [detailsTab, setDetailsTab] = useState<'media' | 'files'>('media');
  const [speechToText, setSpeechToText] = useState(isSpeechToTextEnabled);

  useEffect(() => {
    setSpeechToText(isSpeechToTextEnabled);
  }, [isSpeechToTextEnabled]);

  if (!isOpen || !selectedUser) return null;

  const userEmail = (selectedUser.email || '').toLowerCase().trim();
  const isOnline = (userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(selectedUser.id);
  const lastSeenVal =
    (userEmail && lastSeenMap[userEmail]) ||
    lastSeenMap[selectedUser.id] ||
    (selectedUser as any).lastSeen ||
    (selectedUser as any).lastHeartbeat;
  const lastSeenText = formatLastSeenAgo ? formatLastSeenAgo(lastSeenVal) : '';

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
    <div className="absolute inset-0 z-50 flex flex-col bg-[#141111] animate-in slide-in-from-right-full duration-300 overflow-y-auto no-scrollbar font-sans select-none">
      
      {/* ── TOP DARK BAR (HEADER & HERO) ── */}
      <div className="pt-14 pb-5 px-5 flex items-center justify-between shrink-0 bg-[#141111] sticky top-0 z-20">
        <button
          onClick={() => {
            setEditingNickname(false);
            onClose();
          }}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center cursor-pointer hover:bg-zinc-800 active:scale-90 transition-all text-white outline-none"
          title="Back to conversation"
        >
          <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.4} />
        </button>
        <span className="text-[16px] font-bold text-white tracking-tight">Details</span>
        <div className="w-10" />
      </div>

      {/* Hero Avatar, Name & Quick Call Actions */}
      <div className="flex flex-col items-center px-6 pb-6 select-none">
        <div className="w-22 h-22 rounded-full overflow-hidden flex items-center justify-center bg-zinc-900 border-2 border-zinc-800 text-3xl shadow-xl">
          {selectedUser.image && selectedUser.image.length > 5 ? (
            <img
              src={selectedUser.image}
              alt={selectedUser.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-white font-bold">{selectedUser.name?.charAt(0) || 'U'}</span>
          )}
        </div>

        {/* User Name (No @username) */}
        <h2 className="text-[20px] font-bold text-white mt-3 tracking-tight text-center">
          {nicknames[selectedUser.id] || selectedUser.name}
        </h2>
        <span className="text-[12px] text-zinc-400 mt-0.5 font-medium">
          {isOnline ? 'Online' : lastSeenText ? `Active ${lastSeenText}` : 'Offline'}
        </span>

        {/* Quick Action Buttons Row */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] mt-5">
          {/* Voice Call */}
          <button
            onClick={() => {
              onClose();
              onStartCall('audio');
            }}
            className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group outline-none"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
              <Phone className="w-5 h-5 text-zinc-200" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300">Audio</span>
          </button>

          {/* Video Call */}
          <button
            onClick={() => {
              onClose();
              onStartCall('video');
            }}
            className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group outline-none"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
              <Video className="w-5 h-5 text-zinc-200" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300">Video</span>
          </button>

          {/* Search in Chat */}
          <button
            onClick={() => {
              onClose();
              onOpenSearch();
            }}
            className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group outline-none"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
              <Search className="w-5 h-5 text-zinc-200" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300">Search</span>
          </button>
        </div>
      </div>

      {/* ── BOTTOM LIGHT SHEET (MATCHING CHAT UI DESIGN LANGUAGE) ── */}
      <div className="flex-1 bg-white rounded-t-[32px] px-5 pt-6 pb-24 flex flex-col gap-6 text-zinc-900 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        
        {/* Section 1: Preferences */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">Preferences</span>
          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-2 divide-y divide-zinc-100">
            
            {/* Voice Typing (Speech to Text) Toggle */}
            <div className="flex items-center justify-between py-3 px-2">
              <div className="flex flex-col pr-2">
                <span className="text-[14px] font-semibold text-zinc-800">Voice Typing (Speech to Text)</span>
                <span className="text-[12px] text-zinc-500 mt-0.5">
                  Speak in English, Urdu, or other languages to type
                </span>
              </div>
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

            {/* Notifications Mute Row */}
            <div
              onClick={onToggleMute}
              className="flex items-center justify-between py-3 px-2 cursor-pointer hover:bg-zinc-100/70 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {isChatMuted ? <VolumeX className="w-4 h-4 text-zinc-500" /> : <Volume2 className="w-4 h-4 text-zinc-700" />}
                <span className="text-[14px] font-semibold text-zinc-800">Notifications</span>
              </div>
              <span className="text-[13px] font-medium text-zinc-500">{isChatMuted ? 'Muted' : 'Sound & Banners'}</span>
            </div>

            {/* Nickname Row */}
            <div className="py-3 px-2">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-zinc-800">Nickname</span>
                {!editingNickname ? (
                  <button
                    onClick={() => {
                      setNicknameInput(nicknames[selectedUser.id] || '');
                      setEditingNickname(true);
                    }}
                    className="text-[13px] font-bold text-[#9D4EDD] hover:underline cursor-pointer outline-none"
                  >
                    {nicknames[selectedUser.id] || 'Set Nickname'}
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

        {/* Section 2: Shared Content */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider">Shared Content</span>
            <span className="text-[11px] text-zinc-400 font-medium">
              {sharedMedia.picsAndVideos.length + sharedMedia.files.length} items
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {/* Pill Tab Switcher */}
            <div className="flex items-center bg-zinc-100 p-1 rounded-full border border-zinc-200/60 max-w-sm">
              <button
                onClick={() => setDetailsTab('media')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === 'media'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Media ({sharedMedia.picsAndVideos.length})
              </button>
              <button
                onClick={() => setDetailsTab('files')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === 'files'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Files & Voice ({sharedMedia.files.length})
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
