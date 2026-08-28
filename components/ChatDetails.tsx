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
  Sparkles,
  Shield,
  Trash2,
  Ban,
  Check
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
    <div className="absolute inset-0 z-50 flex flex-col bg-[#141111] animate-in slide-in-from-right-full duration-300 overflow-y-auto no-scrollbar font-sans select-none text-white">
      
      {/* ── 1. TOP HEADER BAR ── */}
      <div className="pt-14 pb-4 px-5 flex items-center justify-between shrink-0 bg-[#141111] sticky top-0 z-20 border-b border-zinc-800/60">
        <button
          onClick={() => {
            setEditingNickname(false);
            onClose();
          }}
          className="w-11 h-11 rounded-full bg-[#181515] border border-zinc-800 flex items-center justify-center cursor-pointer hover:bg-zinc-800 active:scale-90 transition-all text-white outline-none"
          title="Back to conversation"
        >
          <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
        </button>
        <span className="text-[17px] font-bold text-white tracking-tight">Details</span>
        <div className="w-11" />
      </div>

      {/* ── 2. HERO PROFILE SECTION ── */}
      <div className="flex flex-col items-center px-6 pt-5 pb-6">
        <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-[#181515] border-2 border-zinc-800 text-3xl shadow-xl">
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

        <h2 className="text-[20px] font-bold text-white mt-3.5 tracking-tight text-center">
          {nicknames[selectedUser.id] || selectedUser.name}
        </h2>
        <span className="text-[13px] text-[#D8B4E2] font-medium mt-0.5">
          @{selectedUser.username || (selectedUser.name || 'user').toLowerCase().replace(/\s+/g, '')}
        </span>
        <span className="text-[12px] text-zinc-400 mt-1 font-medium">
          {isOnline ? 'Online' : lastSeenText ? `Active ${lastSeenText}` : 'Offline'}
        </span>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-center gap-4 w-full max-w-xs mt-5">
          {/* Audio Call */}
          <button
            onClick={() => {
              onClose();
              onStartCall('audio');
            }}
            className="flex-1 h-12 rounded-full bg-[#181515] border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center gap-2 text-white transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            <Phone className="w-4 h-4 text-white" strokeWidth={2.2} />
            <span className="text-[13px] font-bold">Audio</span>
          </button>

          {/* Video Call */}
          <button
            onClick={() => {
              onClose();
              onStartCall('video');
            }}
            className="flex-1 h-12 rounded-full bg-[#181515] border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center gap-2 text-white transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            <Video className="w-4 h-4 text-white" strokeWidth={2.2} />
            <span className="text-[13px] font-bold">Video</span>
          </button>

          {/* Search */}
          <button
            onClick={() => {
              onClose();
              onOpenSearch();
            }}
            className="w-12 h-12 rounded-full bg-[#181515] border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
            title="Search in chat"
          >
            <Search className="w-4 h-4 text-white" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* ── 3. PREFERENCES & SETTINGS (CLEAN CONNECT DARK ROUND CARDS) ── */}
      <div className="px-5 pb-16 flex flex-col gap-5">
        
        {/* Section: Preferences */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider px-2">Preferences</span>
          <div className="bg-[#181515] border border-zinc-800/90 rounded-3xl p-2 divide-y divide-zinc-800/60 shadow-lg">
            
            {/* Voice Typing (Speech to Text) Toggle */}
            <div className="flex items-center justify-between py-3 px-3.5">
              <div className="flex flex-col pr-2">
                <span className="text-[14px] font-bold text-white">Voice Typing (Speech to Text)</span>
                <span className="text-[12px] text-zinc-400 mt-0.5">
                  Speak in English, Urdu, or any language to type automatically
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleVoiceTyping}
                className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                  speechToText ? 'bg-[#9D4EDD]' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    speechToText ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Notifications Mute Row */}
            <div
              onClick={onToggleMute}
              className="flex items-center justify-between py-3 px-3.5 cursor-pointer hover:bg-zinc-800/40 rounded-2xl transition-colors"
            >
              <div className="flex items-center gap-3">
                {isChatMuted ? (
                  <VolumeX className="w-4 h-4 text-zinc-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-zinc-300" />
                )}
                <span className="text-[14px] font-bold text-white">Notifications</span>
              </div>
              <span className="text-[13px] font-semibold text-zinc-400">
                {isChatMuted ? 'Muted' : 'Enabled'}
              </span>
            </div>

            {/* Nickname Row */}
            <div className="py-3 px-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-white">Nickname</span>
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
                <div className="flex items-center gap-2 mt-3 pt-1">
                  <input
                    type="text"
                    placeholder="Enter nickname..."
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    className="flex-1 px-4 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-full outline-none text-white focus:border-[#9D4EDD]"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      onUpdateNickname(selectedUser.id, nicknameInput.trim());
                      setEditingNickname(false);
                    }}
                    className="px-4 py-2 bg-[#9D4EDD] text-white rounded-full text-xs font-bold cursor-pointer outline-none hover:bg-[#8A38CC]"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNickname(false)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-full text-xs font-medium cursor-pointer outline-none"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Theme Row */}
            <div
              onClick={onOpenThemePicker}
              className="flex items-center justify-between py-3 px-3.5 cursor-pointer hover:bg-zinc-800/40 rounded-2xl transition-colors"
            >
              <span className="text-[14px] font-bold text-white">Chat Theme</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-zinc-400">{activeTheme.name}</span>
                <span className="text-zinc-500 font-bold">›</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Shared Content */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">Shared Content</span>
            <span className="text-[11px] text-zinc-500 font-medium">
              {sharedMedia.picsAndVideos.length + sharedMedia.files.length} items
            </span>
          </div>

          <div className="bg-[#181515] border border-zinc-800/90 rounded-3xl p-4 shadow-lg flex flex-col gap-3">
            {/* Tab switch */}
            <div className="flex items-center bg-zinc-900/90 p-1 rounded-full border border-zinc-800">
              <button
                onClick={() => setDetailsTab('media')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === 'media'
                    ? 'bg-[#9D4EDD] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Media ({sharedMedia.picsAndVideos.length})
              </button>
              <button
                onClick={() => setDetailsTab('files')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === 'files'
                    ? 'bg-[#9D4EDD] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Files & Voice ({sharedMedia.files.length})
              </button>
            </div>

            {/* Media list */}
            {detailsTab === 'media' && (
              sharedMedia.picsAndVideos.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  No photos or videos shared yet
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {sharedMedia.picsAndVideos.slice(0, 30).map((m) => (
                    <div
                      key={m.id}
                      className="aspect-square rounded-2xl overflow-hidden bg-zinc-900 cursor-pointer relative border border-zinc-800"
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

            {/* Files list */}
            {detailsTab === 'files' && (
              sharedMedia.files.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  No files or voice notes shared yet
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {sharedMedia.files.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#9D4EDD]/20 text-[#D8B4E2] flex items-center justify-center text-sm font-bold shrink-0">
                          {m.type === 'voice' ? <LucideMic className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <span className="text-xs font-semibold text-white truncate">
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

        {/* Section: Privacy & Security */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider px-2">Privacy & Security</span>
          <div className="bg-[#181515] border border-zinc-800/90 rounded-3xl p-2 divide-y divide-zinc-800/60 shadow-lg">
            
            {/* Clear Chat History */}
            <div
              onClick={onOpenClearConfirm}
              className="flex items-center justify-between py-3.5 px-3.5 cursor-pointer hover:bg-zinc-800/40 rounded-2xl transition-colors group"
            >
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-white group-hover:text-red-400 transition-colors">
                  Clear Chat History
                </span>
                <span className="text-[12px] text-zinc-400 mt-0.5">
                  Clear messages from your conversation
                </span>
              </div>
              <Trash2 className="w-4 h-4 text-zinc-500 group-hover:text-red-400 transition-colors" />
            </div>

            {/* Block / Unblock Contact */}
            <div
              onClick={onToggleBlock}
              className="flex items-center justify-between py-3.5 px-3.5 cursor-pointer hover:bg-zinc-800/40 rounded-2xl transition-colors group"
            >
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-white group-hover:text-red-400 transition-colors">
                  {isUserBlocked ? 'Unblock Contact' : 'Block Contact'}
                </span>
                <span className="text-[12px] text-zinc-400 mt-0.5">
                  {isUserBlocked ? 'User is currently blocked' : 'Stop receiving calls and messages'}
                </span>
              </div>
              <Ban className="w-4 h-4 text-zinc-500 group-hover:text-red-400 transition-colors" />
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
