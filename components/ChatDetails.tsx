'use client';

import React, { useState } from 'react';
import {
  ChevronLeft,
  Phone,
  Video,
  Search,
  ImageIcon,
  FileText,
  Mic as LucideMic,
} from 'lucide-react';

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
}: ChatDetailsProps) {
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [detailsTab, setDetailsTab] = useState<'media' | 'files'>('media');
  const mediaDisplayLimit = 30;

  if (!isOpen || !selectedUser) return null;

  const userEmail = (selectedUser.email || '').toLowerCase().trim();
  const isOnline = (userEmail && onlineUsers.has(userEmail)) || onlineUsers.has(selectedUser.id);
  const lastSeenVal =
    (userEmail && lastSeenMap[userEmail]) ||
    lastSeenMap[selectedUser.id] ||
    (selectedUser as any).lastSeen ||
    (selectedUser as any).lastHeartbeat;
  const lastSeenText = formatLastSeenAgo
    ? formatLastSeenAgo(lastSeenVal)
    : '';

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#141111] animate-in slide-in-from-right-full duration-300 overflow-y-auto no-scrollbar font-sans select-none">
      {/* Top Header Bar */}
      <div className="pt-14 pb-4 px-5 flex items-center justify-between select-none flex-shrink-0 bg-[#141111] sticky top-0 z-20">
        <button
          onClick={() => {
            setEditingNickname(false);
            onClose();
          }}
          className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center cursor-pointer hover:bg-zinc-700 active:scale-95 transition-all text-white outline-none"
          title="Back to conversation"
          aria-label="Back"
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
              <img
                src={selectedUser.image}
                alt={selectedUser.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-zinc-300 font-bold">{selectedUser.name?.charAt(0) || 'U'}</span>
            )}
          </div>
        </div>

        <h2 className="text-[22px] font-bold text-white mt-4 tracking-tight text-center">
          {nicknames[selectedUser.id] || selectedUser.name}
        </h2>
        <span className="text-[13px] text-[#D8B4E2] font-medium mt-0.5">
          @{selectedUser.username || (selectedUser.name || 'user').toLowerCase().replace(/\s+/g, '')}
        </span>
        <span className="text-[12px] text-zinc-400 mt-1 font-medium">
          {isOnline ? 'Online' : lastSeenText ? `Active ${lastSeenText}` : 'Offline'}
        </span>

        {/* Quick Action Buttons Row */}
        <div className="grid grid-cols-4 gap-3 w-full max-w-sm mt-6">
          {/* 1. Message */}
          <button
            onClick={onClose}
            className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group outline-none"
          >
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
              <svg className="w-5 h-5 text-zinc-300" viewBox="-0.5 0 25 25" fill="none" stroke="currentColor">
                <path
                  d="M2.33045 8.38999C0.250452 11.82 9.42048 14.9 9.42048 14.9C9.42048 14.9 12.5005 24.07 15.9305 21.99C19.5705 19.77 23.9305 6.13 21.0505 3.27C18.1705 0.409998 4.55045 4.74999 2.33045 8.38999Z"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M15.1999 9.12L9.41992 14.9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-zinc-300">Message</span>
          </button>

          {/* 2. Voice Call */}
          <button
            onClick={() => {
              onClose();
              onStartCall('audio');
            }}
            className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group outline-none"
          >
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
              <Phone className="w-5 h-5 text-zinc-300" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-medium text-zinc-300">Audio</span>
          </button>

          {/* 3. Video Call */}
          <button
            onClick={() => {
              onClose();
              onStartCall('video');
            }}
            className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group outline-none"
          >
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-white transition-colors shadow-xs">
              <Video className="w-5 h-5 text-zinc-300" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-medium text-zinc-300">Video</span>
          </button>

          {/* 4. Search in Chat */}
          <button
            onClick={() => {
              onClose();
              onOpenSearch();
            }}
            className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform group outline-none"
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
        {/* Section 1: Preferences */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">Preferences</span>
          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-2 divide-y divide-zinc-100">
            {/* Notifications Mute Row */}
            <div
              onClick={onToggleMute}
              className="flex items-center justify-between py-3 px-2 cursor-pointer hover:bg-zinc-100/70 rounded-xl transition-colors"
            >
              <span className="text-[14px] font-semibold text-zinc-800">Notifications</span>
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
                    className="text-[13px] font-medium text-[#9D4EDD] hover:underline cursor-pointer outline-none"
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
                    className="flex-1 px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl outline-none text-zinc-900"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      onUpdateNickname(selectedUser.id, nicknameInput.trim());
                      setEditingNickname(false);
                    }}
                    className="px-3 py-2 bg-[#9D4EDD] text-white rounded-xl text-xs font-bold cursor-pointer outline-none"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNickname(false)}
                    className="px-3 py-2 bg-zinc-200 text-zinc-700 rounded-xl text-xs font-medium cursor-pointer outline-none"
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

        {/* Section 2: Shared Content Tabs (Media, Files, Voice) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider">Shared Content</span>
            <span className="text-[11px] text-zinc-400 font-medium">
              {sharedMedia.picsAndVideos.length + sharedMedia.files.length} items
            </span>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-zinc-100 gap-6 px-1">
            <button
              onClick={() => setDetailsTab('media')}
              className={`pb-2.5 cursor-pointer text-[13px] font-semibold transition-all outline-none ${
                detailsTab === 'media'
                  ? 'text-zinc-950 font-bold border-b-2 border-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-600 font-medium'
              }`}
            >
              Media ({sharedMedia.picsAndVideos.length})
            </button>
            <button
              onClick={() => setDetailsTab('files')}
              className={`pb-2.5 cursor-pointer text-[13px] font-semibold transition-all outline-none ${
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
            {detailsTab === 'media' &&
              (sharedMedia.picsAndVideos.length === 0 ? (
                <div className="bg-zinc-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-zinc-400">
                  <ImageIcon className="w-8 h-8 mb-2 text-zinc-300" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium">No photos or videos shared yet</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {sharedMedia.picsAndVideos.slice(0, mediaDisplayLimit).map((m) => (
                    <div
                      key={m.id}
                      className="aspect-square rounded-2xl overflow-hidden bg-black/10 cursor-pointer group relative shadow-xs"
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
              ))}

            {detailsTab === 'files' &&
              (sharedMedia.files.length === 0 ? (
                <div className="bg-zinc-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-zinc-400">
                  <FileText className="w-8 h-8 mb-2 text-zinc-300" strokeWidth={1.5} />
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
              ))}
          </div>
        </div>

        {/* Section 3: Privacy & Security */}
        <div className="flex flex-col gap-1.5 pt-2">
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
