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
    callerId: 'me',
    receiverId: 'u3',
    type: 'video',
    status: 'sent',
    duration: 724, // 12m 04s
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(), // 3 hours ago
    contactName: 'Sarah Jenkins',
    contactUsername: 'sarah_j',
    partnerUser: { id: 'u3', name: 'Sarah Jenkins', username: 'sarah_j' }
  },
  {
    id: 'seed-3',
    callerId: 'u4',
    receiverId: 'me',
    type: 'audio',
    status: 'missed',
    duration: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(), // 6 hours ago
    contactName: 'Alex Rivera',
    contactUsername: 'arivera',
    partnerUser: { id: 'u4', name: 'Alex Rivera', username: 'arivera' }
  },
  {
    id: 'seed-4',
    callerId: 'u5',
    receiverId: 'me',
    type: 'video',
    status: 'received',
    duration: 515, // 8m 35s
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // Yesterday
    contactName: 'Elena Rostova',
    contactUsername: 'elena_r',
    partnerUser: { id: 'u5', name: 'Elena Rostova', username: 'elena_r' }
  },
  {
    id: 'seed-5',
    callerId: 'me',
    receiverId: 'u6',
    type: 'audio',
    status: 'sent',
    duration: 185, // 3m 05s
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    contactName: 'David Chen',
    contactUsername: 'david_c',
    partnerUser: { id: 'u6', name: 'David Chen', username: 'david_c' }
  },
  {
    id: 'seed-6',
    callerId: 'u7',
    receiverId: 'me',
    type: 'audio',
    status: 'missed',
    duration: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    contactName: 'Jessica Taylor',
    contactUsername: 'jess_t',
    partnerUser: { id: 'u7', name: 'Jessica Taylor', username: 'jess_t' }
  }
];

export default function CallsView({
  currentUserId,
  onOpenChat,
  onNavigate,
  onOpenProfile,
  onStartCall
}: CallsViewProps) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'All' | 'Received' | 'Sent' | 'Missed'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  // Fetch real call history from server action, fallback to seed
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getCallHistory();
        if (!mounted) return;
        if (Array.isArray(data) && data.length > 0) {
          const mapped: CallRecord[] = data.map((item: any) => {
            const isMe = currentUserId ? item.callerId === currentUserId : false;
            let status: 'received' | 'sent' | 'missed' = 'received';
            if (item.status === 'missed' || item.status === 'rejected') {
              status = 'missed';
            } else if (isMe) {
              status = 'sent';
            } else {
              status = 'received';
            }

            const partner = isMe ? item.receiver : item.caller;
            const partnerUser = isMe
              ? { id: item.receiverId, name: item.receiver?.name, image: item.receiver?.image }
              : { id: item.callerId, name: item.caller?.name, image: item.caller?.image };

            return {
              id: item.id,
              callerId: item.callerId,
              receiverId: item.receiverId,
              type: item.type || 'audio',
              status,
              duration: item.duration || 0,
              createdAt: item.createdAt,
              contactName: partner?.name || 'User',
              contactImage: partner?.image,
              partnerUser
            };
          });
          setCalls(mapped);
        } else {
          setCalls(SEED_CALLS);
        }
      } catch (err) {
        console.error('Failed to load call history:', err);
        setCalls(SEED_CALLS);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentUserId]);

  // Metric counts
  const metrics = useMemo(() => {
    let received = 0;
    let sent = 0;
    let missed = 0;
    calls.forEach((c) => {
      if (c.status === 'received') received++;
      else if (c.status === 'sent') sent++;
      else if (c.status === 'missed') missed++;
    });
    return { received, sent, missed };
  }, [calls]);

  // Filtered calls
  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      // Tab filter
      if (activeTab === 'Received' && c.status !== 'received') return false;
      if (activeTab === 'Sent' && c.status !== 'sent') return false;
      if (activeTab === 'Missed' && c.status !== 'missed') return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          c.contactName.toLowerCase().includes(q) ||
          (c.contactUsername || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [calls, activeTab, searchQuery]);

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${secs}s`;
  };

  const formatExactDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0 seconds';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins} minute${mins > 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
    }
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  };

  const formatTimeAgo = (dateInput: string | Date) => {
    const date = new Date(dateInput);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatExactDateTime = (dateInput: string | Date) => {
    const date = new Date(dateInput);
    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearHistory = () => {
    triggerHaptic('medium');
    setShowClearConfirm(true);
  };

  const confirmClearAll = () => {
    triggerHaptic('heavy');
    setCalls([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('connect_call_history');
    }
    setShowClearConfirm(false);
  };

  return (
    <div className="h-full w-full relative flex flex-col bg-[#141111] overflow-hidden font-sans select-none">
      
      {/* ── 2. Dark Header & History Filters (Compact & High) ── */}
      <div className={`w-full bg-[#141111] px-6 transition-all duration-300 ease-out select-none flex-shrink-0 ${
        isSearchOpen ? 'max-h-0 opacity-0 pt-0 pb-0 overflow-hidden pointer-events-none' : 'pt-14 pb-3 max-h-[240px] opacity-100 flex flex-col gap-3'
      }`}>
        
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

          {/* Frameless Search Icon */}
          <button
            onClick={() => {
              triggerHaptic('light');
              setIsSearchOpen(true);
            }}
            className="p-2 text-zinc-400 hover:text-white cursor-pointer active:scale-95 transition-all outline-none"
            title="Search Calls"
          >
            <Search className="w-5 h-5 text-zinc-300 hover:text-white" strokeWidth={2.2} />
          </button>
        </div>

        {/* Segmented Filter Tabs — Full round pills matching the whole app */}
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

      {/* ── 3. Light Bottom Sheet (Call History List with Animated Upward Expansion) ── */}
      <div className={`w-full flex-1 bg-white relative overflow-hidden min-h-0 shadow-[0_-12px_30px_rgba(0,0,0,0.15)] transition-all duration-300 ease-out flex flex-col ${
        isSearchOpen ? 'rounded-t-none sm:rounded-t-[32px] px-3.5 sm:px-6 pt-12 sm:pt-4 pb-12' : 'rounded-t-[32px] px-3.5 sm:px-6 pt-3 pb-28'
      }`}>
        
        {/* Sheet Drag Handle (Hidden when searching) */}
        {!isSearchOpen && (
          <div className="w-10 h-1.5 bg-zinc-200 rounded-full mx-auto my-1 shrink-0" />
        )}

        {/* Animated Search Bar / Top Search Controls */}
        {isSearchOpen && (
          <div className="pt-1 pb-3 px-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center cursor-pointer active:scale-95 transition-all shrink-0 shadow-2xs"
                title="Back to Call History"
              >
                <ChevronLeft className="w-5 h-5 text-zinc-800" strokeWidth={2.2} />
              </button>
              <div className="flex-1 flex items-center gap-2.5 px-4.5 py-2.5 rounded-full bg-zinc-100/90 border border-zinc-200/50 text-zinc-800 transition-all">
                <Search className="w-[18px] h-[18px] text-zinc-400 flex-shrink-0" strokeWidth={2} />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Search calls, contacts..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-[13.5px] text-zinc-900 placeholder:text-zinc-400 outline-none font-medium"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer p-1">✕</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section Header */}
        {!isSearchOpen && (
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
        )}

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
                {searchQuery
                  ? `No calls matching "${searchQuery}"`
                  : activeTab === 'All'
                  ? 'Your incoming and outgoing call history will appear here.'
                  : `No ${activeTab.toLowerCase()} calls recorded.`}
              </p>
            </div>
          ) : (
            filteredCalls.map((call) => {
              const avatarKey = call.partnerUser?.id || call.partnerUser?.username || call.callerId || call.contactName;
              const avatarBg = getDeterministicAvatarBg(avatarKey);

              return (
                <div
                  key={call.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedCall(call);
                  }}
                  className="flex items-center justify-between py-3.5 px-2 hover:bg-zinc-50/90 rounded-2xl transition-all cursor-pointer group"
                >
                  {/* Left Section (Avatar + Details) */}
                  <div className="flex items-center min-w-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 overflow-hidden font-bold text-zinc-800 shadow-sm"
                      style={{ backgroundColor: avatarBg }}
                    >
                      {call.contactImage ? (
                        <img
                          src={call.contactImage}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{call.contactName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 ml-3.5 min-w-0">
                      <span className="text-[15px] font-bold text-zinc-900 truncate leading-tight">
                        {call.contactName}
                      </span>

                      {/* Status Line */}
                      <div className="flex items-center gap-1.5 text-[12px] font-medium">
                        {call.status === 'received' && (
                          <>
                            <PhoneIncoming className="w-[13px] h-[13px] text-emerald-500" strokeWidth={2.5} />
                            <span className="text-zinc-500">
                              Received • {formatDuration(call.duration)}
                            </span>
                          </>
                        )}
                        {call.status === 'sent' && (
                          <>
                            <PhoneOutgoing className="w-[13px] h-[13px] text-indigo-500" strokeWidth={2.5} />
                            <span className="text-zinc-500">
                              Sent • {formatDuration(call.duration)}
                            </span>
                          </>
                        )}
                        {call.status === 'missed' && (
                          <>
                            <PhoneMissed className="w-[13px] h-[13px] text-zinc-400" strokeWidth={2.5} />
                            <span className="text-zinc-500 font-medium">Missed call</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Section (Timestamp & Media Tag) */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
                    <span className="text-[11px] font-medium text-zinc-400 text-right">
                      {formatTimeAgo(call.createdAt)}
                    </span>
                    <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center">
                      {call.type === 'video' ? (
                        <Video className="w-3.5 h-3.5 text-[#9D4EDD]" strokeWidth={2} />
                      ) : (
                        <Phone className="w-3.5 h-3.5 text-zinc-500" strokeWidth={2} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── 4. Record Detail Drawer (On Row Click) ── */}
      {selectedCall && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 shadow-2xl">
            
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-zinc-900 overflow-hidden shadow-xs"
                  style={{
                    backgroundColor: getDeterministicAvatarBg(
                      selectedCall.partnerUser?.id || selectedCall.partnerUser?.username || selectedCall.callerId || selectedCall.contactName
                    )
                  }}
                >
                  {selectedCall.contactName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 leading-tight">
                    {selectedCall.contactName}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    @{selectedCall.contactUsername || 'contact'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCall(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details Body */}
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-100">
                <span className="text-xs font-semibold text-zinc-500">Call Type</span>
                <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  {selectedCall.status === 'received' && (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <PhoneIncoming className="w-3.5 h-3.5" /> Incoming {selectedCall.type === 'video' ? 'Video' : 'Voice'} Call
                    </span>
                  )}
                  {selectedCall.status === 'sent' && (
                    <span className="text-indigo-600 flex items-center gap-1">
                      <PhoneOutgoing className="w-3.5 h-3.5" /> Outgoing {selectedCall.type === 'video' ? 'Video' : 'Voice'} Call
                    </span>
                  )}
                  {selectedCall.status === 'missed' && (
                    <span className="text-rose-600 flex items-center gap-1">
                      <PhoneMissed className="w-3.5 h-3.5" /> Missed {selectedCall.type === 'video' ? 'Video' : 'Voice'} Call
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-100">
                <span className="text-xs font-semibold text-zinc-500">Duration</span>
                <span className="text-xs font-bold text-zinc-900">
                  {formatExactDuration(selectedCall.duration)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-100">
                <span className="text-xs font-semibold text-zinc-500">Date & Time</span>
                <span className="text-xs font-semibold text-zinc-700">
                  {formatExactDateTime(selectedCall.createdAt)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  if (onStartCall && selectedCall.partnerUser) {
                    onStartCall(selectedCall.partnerUser, selectedCall.type);
                  }
                  setSelectedCall(null);
                }}
                className="w-full bg-[#9D4EDD] text-white py-3.5 rounded-2xl font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-md hover:bg-[#8338ec]"
              >
                {selectedCall.type === 'video' ? (
                  <Video className="w-4 h-4" strokeWidth={2} />
                ) : (
                  <Phone className="w-4 h-4" strokeWidth={2} />
                )}
                <span>Call Back ({selectedCall.type === 'video' ? 'Video' : 'Voice'})</span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('light');
                  if (onOpenChat && selectedCall.partnerUser) {
                    onOpenChat(selectedCall.partnerUser);
                  } else if (onNavigate) {
                    onNavigate('chat');
                  }
                  setSelectedCall(null);
                }}
                className="w-full bg-[#141111] text-white py-3.5 rounded-2xl font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2} />
                <span>Send Message</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear History Confirmation Modal ── */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] bg-white rounded-3xl p-5 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-3">
              <Trash2 className="w-6 h-6" strokeWidth={2} />
            </div>
            <h3 className="text-[17px] font-bold text-zinc-900 leading-tight">Clear Call History?</h3>
            <p className="text-[13px] text-zinc-500 mt-1.5 leading-relaxed">
              All incoming, outgoing, and missed call logs will be removed from your activity.
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full mt-5">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowClearConfirm(false);
                }}
                className="py-2.5 px-4 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-[13.5px] transition-colors cursor-pointer active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearAll}
                className="py-2.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold text-[13.5px] transition-colors cursor-pointer active:scale-95 shadow-xs"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
