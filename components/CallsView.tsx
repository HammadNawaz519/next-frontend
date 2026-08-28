'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  X,
  MessageCircle,
  Clock,
  Calendar,
  Trash2,
  Check,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { getCallHistory } from '@/app/dashboard/actions';
import { triggerHaptic } from '@/lib/haptics';

export interface CallRecord {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'audio' | 'video';
  status: 'received' | 'sent' | 'missed';
  duration?: number; // seconds
  createdAt: string | Date;
  contactName: string;
  contactImage?: string;
  contactUsername?: string;
  partnerUser?: any;
}

interface CallsViewProps {
  currentUserId?: string;
  onOpenChat?: (user: any) => void;
  onNavigate?: (view: 'chat' | 'calls') => void;
  onOpenProfile?: () => void;
  onStartCall?: (user: any, type: 'audio' | 'video') => void;
  onSearchActiveChange?: (isSearching: boolean) => void;
}

const PASTEL_AVATAR_BGS = ['#FFF3CD', '#E0F2FE', '#FCE7F3', '#FEF9C3', '#EDE9FE', '#DCFCE7'];

export function getDeterministicAvatarBg(key: string): string {
  if (!key) return PASTEL_AVATAR_BGS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PASTEL_AVATAR_BGS.length;
  return PASTEL_AVATAR_BGS[index];
}

const SEED_CALLS: CallRecord[] = [
  {
    id: 'seed-1',
    callerId: 'u2',
    receiverId: 'me',
    type: 'audio',
    status: 'received',
    duration: 272, // 4m 32s
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(), // 25 mins ago
    contactName: 'Rehan Wangsaff',
    contactUsername: 'rehan_w',
    partnerUser: { id: 'u2', name: 'Rehan Wangsaff', username: 'rehan_w' }
  },
  {
    id: 'seed-2',
    callerId: 'u3',
    receiverId: 'me',
    type: 'video',
    status: 'missed',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2.5).toISOString(), // 2.5 hrs ago
    contactName: 'Aleeza Khan',
    contactUsername: 'aleeza_k',
    partnerUser: { id: 'u3', name: 'Aleeza Khan', username: 'aleeza_k' }
  },
  {
    id: 'seed-3',
    callerId: 'me',
    receiverId: 'u4',
    type: 'audio',
    status: 'sent',
    duration: 890, // 14m 50s
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(), // 18 hrs ago
    contactName: 'Bilal Farooq',
    contactUsername: 'bilal_f',
    partnerUser: { id: 'u4', name: 'Bilal Farooq', username: 'bilal_f' }
  },
  {
    id: 'seed-4',
    callerId: 'u5',
    receiverId: 'me',
    type: 'video',
    status: 'received',
    duration: 1450, // 24m 10s
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(), // Yesterday
    contactName: 'Sara Daniyal',
    contactUsername: 'sara_d',
    partnerUser: { id: 'u5', name: 'Sara Daniyal', username: 'sara_d' }
  },
  {
    id: 'seed-5',
    callerId: 'u6',
    receiverId: 'me',
    type: 'audio',
    status: 'missed',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
    contactName: 'Hamza Sheikh',
    contactUsername: 'hamza_s',
    partnerUser: { id: 'u6', name: 'Hamza Sheikh', username: 'hamza_s' }
  }
];

export default function CallsView({
  currentUserId,
  onOpenChat,
  onNavigate,
  onOpenProfile,
  onStartCall,
  onSearchActiveChange
}: CallsViewProps) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'All' | 'Received' | 'Sent' | 'Missed'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Synchronize search state with parent for bottom bar hiding
  const handleOpenSearch = () => {
    triggerHaptic('light');
    setIsSearchOpen(true);
    onSearchActiveChange?.(true);
  };

  const handleCloseSearch = () => {
    triggerHaptic('light');
    setSearchQuery('');
    setIsSearchOpen(false);
    onSearchActiveChange?.(false);
  };

  // Load call history
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        // Load local custom calls
        let localCalls: CallRecord[] = [];
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('connect_call_history');
          if (stored) {
            try {
              localCalls = JSON.parse(stored);
            } catch (e) {}
          }
        }

        // Fetch DB calls if available
        let dbCalls: CallRecord[] = [];
        try {
          const fetched = await getCallHistory();
          if (Array.isArray(fetched)) {
            dbCalls = fetched.map((item: any) => {
              const isCaller = String(item.callerId) === String(currentUserId);
              const partner = isCaller ? item.receiver : item.caller;
              let status: 'received' | 'sent' | 'missed' = 'received';
              if (item.status === 'MISSED') {
                status = 'missed';
              } else if (isCaller) {
                status = 'sent';
              } else {
                status = 'received';
              }

              return {
                id: item.id,
                callerId: item.callerId,
                receiverId: item.receiverId,
                type: item.type === 'VIDEO' ? 'video' : 'audio',
                status,
                duration: item.duration || 0,
                createdAt: item.createdAt,
                contactName: partner?.name || 'User',
                contactImage: partner?.image || '',
                contactUsername: partner?.username || '',
                partnerUser: partner
              };
            });
          }
        } catch (err) {
          console.warn('DB call history fetch error, using local fallback:', err);
        }

        if (!isMounted) return;

        // Combine DB, local, and seeds
        const map = new Map<string, CallRecord>();
        [...localCalls, ...dbCalls].forEach((c) => {
          if (c && c.id) map.set(c.id, c);
        });

        if (map.size === 0) {
          SEED_CALLS.forEach((c) => map.set(c.id, c));
        }

        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCalls(merged);
      } catch (e) {
        console.error('Call log load failed:', e);
        if (isMounted) setCalls(SEED_CALLS);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  // Filtered calls based on activeTab and searchQuery
  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.contactName?.toLowerCase().includes(q);
        const matchesUser = c.contactUsername?.toLowerCase().includes(q);
        if (!matchesName && !matchesUser) return false;
      }

      if (activeTab === 'Received' && c.status !== 'received') return false;
      if (activeTab === 'Sent' && c.status !== 'sent') return false;
      if (activeTab === 'Missed' && c.status !== 'missed') return false;

      return true;
    });
  }, [calls, activeTab, searchQuery]);

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const formatCallDate = (dateVal: string | Date) => {
    const d = new Date(dateVal);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${timeStr}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return `Yesterday, ${timeStr}`;

    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  const getStatusIcon = (status: 'received' | 'sent' | 'missed') => {
    switch (status) {
      case 'received':
        return <PhoneIncoming className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.4} />;
      case 'sent':
        return <PhoneOutgoing className="w-3.5 h-3.5 text-[#9D4EDD]" strokeWidth={2.4} />;
      case 'missed':
        return <PhoneMissed className="w-3.5 h-3.5 text-rose-500" strokeWidth={2.4} />;
    }
  };

  const handleStartCall = (call: CallRecord, overrideType?: 'audio' | 'video') => {
    triggerHaptic('medium');
    const targetType = overrideType || call.type;
    const userToCall = call.partnerUser || {
      id: call.callerId === currentUserId ? call.receiverId : call.callerId,
      name: call.contactName,
      username: call.contactUsername,
      image: call.contactImage
    };

    if (onStartCall) {
      onStartCall(userToCall, targetType);
    }
  };

  const handleClearHistory = () => {
    triggerHaptic('heavy');
    setCalls([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('connect_call_history');
    }
    setShowClearConfirm(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#141111] overflow-hidden select-none relative font-sans">
      
      {/* ── 1. DARK HEADER (TITLES & SEGMENTED TABS) ── */}
      <div className="w-full bg-[#141111] pt-14 pb-3 px-6 flex flex-col gap-3 shrink-0 select-none">
        
        {/* Top Bar */}
        <div className="flex justify-between items-center w-full">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-zinc-400 tracking-wider uppercase">
              Activity & Logs
            </span>
            <h1 className="text-[26px] font-bold text-white tracking-tight leading-tight">
              Call History
            </h1>
          </div>

          {/* Frameless Borderless Search Icon */}
          <button
            onClick={handleOpenSearch}
            className="w-10 h-10 rounded-full text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 flex items-center justify-center transition-all cursor-pointer outline-none border-0"
            title="Search Calls"
          >
            <Search className="w-5 h-5 text-zinc-300 hover:text-white" strokeWidth={2.2} />
          </button>
        </div>

        {/* Segmented Filter Tabs */}
        <div className="w-full bg-zinc-900/80 p-1.5 rounded-full flex items-center border border-zinc-800/60 mt-0.5">
          {(['All', 'Received', 'Sent', 'Missed'] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(tab);
                }}
                className={`flex-1 py-2 rounded-full text-[12.5px] font-semibold transition-all cursor-pointer outline-none border-0 ring-0 ${
                  isActive
                    ? 'bg-zinc-800 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. LIGHT BOTTOM SHEET CONTAINER ── */}
      <div className="w-full flex-1 bg-white rounded-t-[32px] px-3.5 sm:px-6 pt-3 pb-28 relative overflow-hidden min-h-0 shadow-[0_-12px_30px_rgba(0,0,0,0.15)] flex flex-col">
        
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1.5 bg-zinc-200 rounded-full mx-auto my-1 shrink-0" />

        {/* Section Header */}
        <div className="flex justify-between items-center mt-2.5 mb-2 px-1 shrink-0">
          <h2 className="text-[18px] font-bold text-zinc-900 tracking-tight">
            {activeTab === 'All' ? 'All Records' : `${activeTab} Calls`}
          </h2>
          {calls.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-[12px] font-semibold text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
            >
              Clear History
            </button>
          )}
        </div>

        {/* Call Log Feed List */}
        <div className="flex flex-col gap-1 overflow-y-auto flex-1 no-scrollbar divide-y divide-zinc-100 pr-0.5">
          {loading ? (
            <div className="flex flex-col gap-3 py-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-200" />
                    <div className="space-y-1.5">
                      <div className="w-28 h-4 bg-zinc-200 rounded" />
                      <div className="w-20 h-3 bg-zinc-100 rounded" />
                    </div>
                  </div>
                  <div className="w-12 h-3 bg-zinc-100 rounded" />
                </div>
              ))}
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-2">
                <Phone className="w-6 h-6" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-bold text-zinc-800">No call records found</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {activeTab === 'All'
                  ? 'Your incoming and outgoing call history will appear here.'
                  : `No ${activeTab.toLowerCase()} calls recorded.`}
              </p>
            </div>
          ) : (
            filteredCalls.map((call) => {
              const avatarKey =
                call.partnerUser?.id ||
                call.partnerUser?.username ||
                call.callerId ||
                call.contactName;
              const avatarBg = getDeterministicAvatarBg(avatarKey);

              return (
                <div
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className="flex items-center justify-between py-3 px-1.5 rounded-2xl hover:bg-zinc-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm text-zinc-800 shrink-0 overflow-hidden shadow-xs"
                      style={{ backgroundColor: avatarBg }}
                    >
                      {call.contactImage ? (
                        <img
                          src={call.contactImage}
                          alt={call.contactName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{call.contactName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-[15px] font-bold truncate ${
                          call.status === 'missed' ? 'text-rose-600' : 'text-zinc-900'
                        }`}
                      >
                        {call.contactName}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-500">
                        {getStatusIcon(call.status)}
                        <span className="capitalize">{call.status}</span>
                        <span>•</span>
                        <span>{formatCallDate(call.createdAt)}</span>
                        {call.duration && call.duration > 0 ? (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-zinc-600">
                              {formatDuration(call.duration)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartCall(call, 'audio');
                      }}
                      className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center cursor-pointer active:scale-90 transition-all outline-none"
                      title="Audio Call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartCall(call, 'video');
                      }}
                      className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center cursor-pointer active:scale-90 transition-all outline-none"
                      title="Video Call"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── 3. FULL-SCREEN CALL SEARCH OVERLAY (MATCHING CHAT DETAILS SEARCH UI) ── */}
      {isSearchOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#141111] animate-in fade-in duration-200 overflow-hidden select-none">
          {/* Top Dark Header */}
          <div className="w-full bg-[#141111] pt-14 pb-4 px-5 flex items-center gap-3 shrink-0 select-none">
            {/* Back button: borderless, outline-free */}
            <button
              onClick={handleCloseSearch}
              className="w-10 h-10 rounded-full text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 transition-all flex items-center justify-center cursor-pointer outline-none border-0"
              title="Back to call history"
            >
              <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.4} />
            </button>

            {/* Search Input Pill */}
            <div className="flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-white outline-none ring-0 transition-colors">
              <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" strokeWidth={2} />
              <input
                type="text"
                autoFocus
                placeholder="Search calls, contacts..."
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

          {/* Bottom White Container */}
          <div className="w-full flex-1 bg-white rounded-t-[32px] px-4 pt-4 pb-20 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden min-h-0">
            <div className="flex flex-col gap-1 overflow-y-auto flex-1 no-scrollbar divide-y divide-zinc-100 pr-0.5">
              {!searchQuery.trim() ? (
                <div className="py-16 text-center text-zinc-400 text-xs font-medium">
                  Type a name or username to search call logs
                </div>
              ) : filteredCalls.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 text-xs font-medium">
                  No call logs found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredCalls.map((call) => {
                  const avatarKey =
                    call.partnerUser?.id ||
                    call.partnerUser?.username ||
                    call.callerId ||
                    call.contactName;
                  const avatarBg = getDeterministicAvatarBg(avatarKey);

                  return (
                    <div
                      key={call.id}
                      onClick={() => {
                        handleCloseSearch();
                        setSelectedCall(call);
                      }}
                      className="flex items-center justify-between py-3 px-1.5 rounded-2xl hover:bg-zinc-50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm text-zinc-800 shrink-0 overflow-hidden shadow-xs"
                          style={{ backgroundColor: avatarBg }}
                        >
                          {call.contactImage ? (
                            <img
                              src={call.contactImage}
                              alt={call.contactName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{call.contactName.charAt(0).toUpperCase()}</span>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span
                            className={`text-[15px] font-bold truncate ${
                              call.status === 'missed' ? 'text-rose-600' : 'text-zinc-900'
                            }`}
                          >
                            {call.contactName}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-500">
                            {getStatusIcon(call.status)}
                            <span className="capitalize">{call.status}</span>
                            <span>•</span>
                            <span>{formatCallDate(call.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseSearch();
                            handleStartCall(call, 'audio');
                          }}
                          className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center cursor-pointer active:scale-90 transition-all outline-none"
                          title="Audio Call"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseSearch();
                            handleStartCall(call, 'video');
                          }}
                          className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center cursor-pointer active:scale-90 transition-all outline-none"
                          title="Video Call"
                        >
                          <Video className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. CALL DETAILS MODAL ── */}
      {selectedCall && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedCall(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-zinc-900 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Call Information
              </span>
              <button
                onClick={() => setSelectedCall(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3.5 py-2">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg text-zinc-800 shrink-0 overflow-hidden shadow-xs"
                style={{
                  backgroundColor: getDeterministicAvatarBg(
                    selectedCall.partnerUser?.id || selectedCall.contactName
                  )
                }}
              >
                {selectedCall.contactImage ? (
                  <img
                    src={selectedCall.contactImage}
                    alt={selectedCall.contactName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{selectedCall.contactName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-lg font-bold text-zinc-900 truncate">
                  {selectedCall.contactName}
                </span>
                <span className="text-xs text-zinc-500">
                  {selectedCall.contactUsername ? `@${selectedCall.contactUsername}` : 'Connect User'}
                </span>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-2xl p-3.5 space-y-2 border border-zinc-100 text-xs text-zinc-600">
              <div className="flex justify-between items-center">
                <span>Call Type</span>
                <span className="font-semibold text-zinc-900 capitalize">
                  {selectedCall.type} Call
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Status</span>
                <span
                  className={`font-semibold capitalize ${
                    selectedCall.status === 'missed' ? 'text-rose-600' : 'text-zinc-900'
                  }`}
                >
                  {selectedCall.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Duration</span>
                <span className="font-semibold text-zinc-900">
                  {formatDuration(selectedCall.duration)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Date & Time</span>
                <span className="font-semibold text-zinc-900">
                  {formatCallDate(selectedCall.createdAt)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => {
                  setSelectedCall(null);
                  handleStartCall(selectedCall, 'audio');
                }}
                className="py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Audio</span>
              </button>
              <button
                onClick={() => {
                  setSelectedCall(null);
                  handleStartCall(selectedCall, 'video');
                }}
                className="py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video</span>
              </button>
              <button
                onClick={() => {
                  setSelectedCall(null);
                  if (onOpenChat) {
                    onOpenChat(
                      selectedCall.partnerUser || {
                        id:
                          selectedCall.callerId === currentUserId
                            ? selectedCall.receiverId
                            : selectedCall.callerId,
                        name: selectedCall.contactName,
                        username: selectedCall.contactUsername,
                        image: selectedCall.contactImage
                      }
                    );
                  }
                }}
                className="py-2.5 rounded-full bg-[#9D4EDD] hover:bg-[#8A38CC] text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Message</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
