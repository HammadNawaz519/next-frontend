'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  Share2,
  UserPlus,
  UserCheck,
  Clock,
  Heart,
  Phone,
  Video,
  Calendar,
  Globe,
  Copy,
  Check
} from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { getUserPublicProfile, toggleFollowUser, toggleProfileLike } from '@/app/dashboard/actions';

interface OthersProfileProps {
  user: any;
  onClose: () => void;
  onGetInTouch?: (user: any) => void;
  currentUserId?: string;
  currentUserName?: string;
  socket?: any;
  onStartCall?: (type: 'audio' | 'video') => void;
  activeTheme?: any;
}

const PASTEL_PALETTES = [
  { bg: '#FEF5D1', text: '#854D0E', emoji: '👨🏻' }, // Soft Pale Yellow
  { bg: '#E0F2FE', text: '#0369A1', emoji: '🐺' }, // Soft Pastel Blue
  { bg: '#FCE7F3', text: '#BE185D', emoji: '😍' }, // Soft Pastel Pink
  { bg: '#FEF9C3', text: '#A16207', emoji: '🦄' }, // Soft Pastel Cream
  { bg: '#EDE9FE', text: '#6D28D9', emoji: '✨' }, // Soft Lavender
  { bg: '#DCFCE7', text: '#15803D', emoji: '🦊' }, // Soft Mint
  { bg: '#FFEDD5', text: '#C2410C', emoji: '🚀' }, // Soft Peach
  { bg: '#F3E8FF', text: '#7E22CE', emoji: '🐼' }, // Soft Violet
  { bg: '#E0E7FF', text: '#4338CA', emoji: '⚡' }, // Soft Indigo
  { bg: '#FEE2E2', text: '#B91C1C', emoji: '😎' }, // Soft Rose
];

function getPastelForUser(userIdOrName?: string) {
  if (!userIdOrName) return PASTEL_PALETTES[0];
  const sum = String(userIdOrName).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PASTEL_PALETTES[Math.abs(sum) % PASTEL_PALETTES.length];
}

export default function OthersProfile({
  user,
  onClose,
  currentUserId,
  currentUserName,
  socket,
  onStartCall,
}: OthersProfileProps) {
  const [profileData, setProfileData] = useState<any>(user);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [hasSentRequest, setHasSentRequest] = useState<boolean>(false);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [topToast, setTopToast] = useState<string | null>(null);
  const [loadingFollow, setLoadingFollow] = useState<boolean>(false);
  const [loadingLike, setLoadingLike] = useState<boolean>(false);
  const [likeBurst, setLikeBurst] = useState<boolean>(false);
  const [copiedHandle, setCopiedHandle] = useState<boolean>(false);

  const showTopToast = useCallback((msg: string) => {
    setTopToast(msg);
    setTimeout(() => {
      setTopToast(prev => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Fetch full server-authoritative profile data & stats
  useEffect(() => {
    let isMounted = true;
    const lookupTarget = user?.id || user?.email || user?.username;
    if (!lookupTarget) return;

    async function loadProfile() {
      try {
        const fullData = await getUserPublicProfile(lookupTarget);
        if (isMounted && fullData) {
          setProfileData(fullData);
          setIsFollowing(Boolean(fullData.isFollowing));
          setHasSentRequest(Boolean(fullData.hasSentRequest));
          setFollowersCount(fullData.stats?.followers || 0);
          setFollowingCount(fullData.stats?.following || 0);
          setLikesCount(fullData.stats?.likes || 0);
          setIsLiked(Boolean(fullData.isLiked));
        }
      } catch (e) {
        console.warn('Failed to load public profile:', e);
      }
    }
    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.email, user?.username]);

  // Real-time socket & window listeners for profile likes
  useEffect(() => {
    const handleProfileLiked = (data: any) => {
      if (!data) return;
      const targetId = data.targetUserId;
      const myProfileId = profileData?.id || user?.id;
      if (myProfileId && String(targetId) === String(myProfileId)) {
        if (typeof data.count === 'number') {
          setLikesCount(data.count);
        }
        if (data.likerId && String(data.likerId) === String(currentUserId)) {
          setIsLiked(Boolean(data.isLiked));
        }
      }
    };

    const handleWindowLiked = (e: any) => {
      handleProfileLiked(e.detail);
    };

    if (socket) {
      socket.on('profile_liked', handleProfileLiked);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('profile_liked', handleWindowLiked);
    }

    return () => {
      if (socket) {
        socket.off('profile_liked', handleProfileLiked);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile_liked', handleWindowLiked);
      }
    };
  }, [socket, profileData?.id, user?.id, currentUserId]);

  const handleToggleFollow = async () => {
    const targetId = profileData?.id || user?.id;
    if (!targetId || loadingFollow) return;
    triggerHaptic('medium');
    setLoadingFollow(true);

    const prevFollowing = isFollowing;
    const prevRequested = hasSentRequest;
    const prevFollowersCount = followersCount;

    // Optimistic update
    if (isFollowing) {
      setIsFollowing(false);
      setHasSentRequest(false);
      setFollowersCount((c) => Math.max(0, c - 1));
    } else if (hasSentRequest) {
      setHasSentRequest(false);
    } else {
      setIsFollowing(!profileData?.isPrivate);
      setHasSentRequest(Boolean(profileData?.isPrivate));
      if (!profileData?.isPrivate) {
        setFollowersCount((c) => c + 1);
      }
    }

    try {
      const res: any = await toggleFollowUser(targetId);
      if (res && !res.error) {
        setIsFollowing(Boolean(res.isFollowing));
        setHasSentRequest(Boolean(res.hasSentRequest));
        if (typeof res.followersCount === 'number') {
          setFollowersCount(res.followersCount);
        }
        if (typeof res.followingCount === 'number') {
          setFollowingCount(res.followingCount);
        }
        showTopToast(
          res.hasSentRequest
            ? 'Follow request sent'
            : res.isFollowing
            ? `Following ${profileData?.username || 'user'}`
            : `Unfollowed ${profileData?.username || 'user'}`
        );
      } else {
        setIsFollowing(prevFollowing);
        setHasSentRequest(prevRequested);
        setFollowersCount(prevFollowersCount);
        showTopToast(res?.error || 'Action could not be completed');
      }
    } catch {
      setIsFollowing(prevFollowing);
      setHasSentRequest(prevRequested);
      setFollowersCount(prevFollowersCount);
      showTopToast('Network error, please try again');
    } finally {
      setLoadingFollow(false);
    }
  };

  const handleToggleLike = async () => {
    const targetId = profileData?.id || user?.id || user?.email;
    if (!targetId || loadingLike) return;
    triggerHaptic('medium');

    setLikeBurst(true);
    setTimeout(() => setLikeBurst(false), 700);

    const prevLiked = isLiked;
    const prevCount = likesCount;
    const nextLiked = !isLiked;
    const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);
    const targetName = profileData?.username || user?.username || 'User';

    // 1. Instant optimistic update
    setIsLiked(nextLiked);
    setLikesCount(nextCount);

    // 2. Instant top message banner
    if (nextLiked) {
      showTopToast(`❤️ You liked ${targetName}'s profile!`);
    } else {
      showTopToast(`Unliked ${targetName}'s profile`);
    }

    // 3. Real-time live socket broadcast to all connected clients & target user
    if (socket && socket.connected) {
      socket.emit('like_profile', {
        targetUserId: profileData?.id || user?.id,
        targetEmail: profileData?.email || user?.email,
        count: nextCount,
        likerId: currentUserId,
        likerName: currentUserName || 'Someone',
        isLiked: nextLiked
      });
    }

    // 4. Server-authoritative mutation in database
    try {
      setLoadingLike(true);
      const result: any = await toggleProfileLike(targetId);
      if (result && result.success) {
        setIsLiked(Boolean(result.isLiked));
        if (typeof result.likes === 'number') {
          setLikesCount(result.likes);
        }
      } else {
        // Revert on failure
        setIsLiked(prevLiked);
        setLikesCount(prevCount);
        showTopToast(result?.error || 'Could not update like');
      }
    } catch (err: any) {
      console.error('Like toggle error:', err);
      setIsLiked(prevLiked);
      setLikesCount(prevCount);
      showTopToast(err?.message || 'Could not update like');
    } finally {
      setLoadingLike(false);
    }
  };

  const handleCopyHandle = async () => {
    triggerHaptic('light');
    const handleText = `@${profileData?.username || user?.username || 'user'}`;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(handleText);
        setCopiedHandle(true);
        setTimeout(() => setCopiedHandle(false), 2000);
        showTopToast(`Copied ${handleText}`);
      } catch {}
    }
  };

  const handleShare = async () => {
    triggerHaptic('light');
    const profileUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/@${profileData?.username || user?.username || profileData?.id || ''}`
        : '';
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(profileUrl);
        showTopToast('🔗 Profile link copied to clipboard!');
      } catch {
        showTopToast('Profile link ready to share');
      }
    } else {
      showTopToast('Profile link ready to share');
    }
  };

  const displayName = profileData?.username || user?.username || 'User';
  const avatarKey = profileData?.id || user?.id || displayName;
  const pastel = getPastelForUser(avatarKey);

  return (
    <div className="fixed inset-0 z-[1600] flex flex-col bg-[#141111] animate-in slide-in-from-right duration-300 overflow-hidden font-sans select-none">
      
      {/* ── 1. DARK TOP HEADER BAR (Exact Match to Chat Header) ── */}
      <div className="w-full bg-[#141111] pt-12 pb-3 px-5 flex items-center justify-between shrink-0 select-none z-10 m-0 border-none">
        {/* Left: Back Action (ChevronLeft) */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-95 transition-all flex-shrink-0 cursor-pointer outline-none border-0 bg-transparent"
          title="Back"
        >
          <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
        </button>

        {/* Center: Spacer for Alignment */}
        <div className="flex-1" />

        {/* Right: Share Action */}
        <button
          type="button"
          onClick={handleShare}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 transition-all cursor-pointer outline-none border-0 bg-transparent"
          title="Share Profile"
        >
          <Share2 className="w-5 h-5 text-white" strokeWidth={2.2} />
        </button>
      </div>

      {/* ── 2. CURVED WHITE SHEET CONTAINER (Signature Connect Chat UI) ── */}
      <div className="w-full flex-1 bg-white rounded-t-[32px] sm:rounded-t-[36px] px-5 pt-6 pb-12 flex flex-col gap-6 text-zinc-900 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar relative">
        
        {/* Profile Hero: Avatar, Names, Online Dot & Bio */}
        <div className="flex flex-col items-center text-center pt-1">
          <div className="relative">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center text-4xl sm:text-5xl font-black text-zinc-900 shadow-[0_12px_28px_rgba(0,0,0,0.12)] border-4 border-white relative z-10"
              style={{ backgroundColor: pastel.bg, color: pastel.text }}
            >
              {profileData?.image && profileData.image.length > 5 ? (
                <img
                  src={profileData.image}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-4xl sm:text-5xl select-none leading-none">{pastel.emoji}</span>
              )}
            </div>

            {/* Live Online Dot */}
            {profileData?.isOnline && (
              <div
                className="absolute bottom-1 right-1 z-20 w-5 h-5 rounded-full bg-emerald-500 border-3 border-white shadow-xs"
                title="Online now"
              />
            )}
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight mt-3.5">
            {displayName}
          </h2>

          {/* Copyable @handle pill */}
          <button
            type="button"
            onClick={handleCopyHandle}
            className="inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold tracking-wide transition-all cursor-pointer border-0 outline-none active:scale-95"
            title="Copy username"
          >
            <span>@{profileData?.username || user?.username || 'user'}</span>
            {copiedHandle ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3 text-purple-500 opacity-60" />
            )}
          </button>

          {profileData?.bio && (
            <p className="text-sm text-zinc-600 font-normal max-w-sm mt-3 leading-relaxed px-3">
              {profileData.bio}
            </p>
          )}
        </div>

        {/* ── ACTION BAR (No Message Button, Just Calls & Follow) ── */}
        <div className="flex items-center justify-center gap-3 w-full max-w-sm mx-auto">
          {/* Voice Call */}
          {onStartCall && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onStartCall('audio');
              }}
              className="w-12 h-12 rounded-full bg-[#141111] hover:bg-zinc-800 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer border-0 shadow-sm shrink-0"
              title="Voice Call"
            >
              <Phone className="w-5 h-5" strokeWidth={2.2} />
            </button>
          )}

          {/* Video Call */}
          {onStartCall && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onStartCall('video');
              }}
              className="w-12 h-12 rounded-full bg-[#141111] hover:bg-zinc-800 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer border-0 shadow-sm shrink-0"
              title="Video Call"
            >
              <Video className="w-5 h-5" strokeWidth={2.2} />
            </button>
          )}

          {/* Follow / Following / Requested (Prominent Main Action) */}
          <button
            type="button"
            onClick={handleToggleFollow}
            disabled={loadingFollow}
            className={`flex-1 py-3.5 px-6 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer border-0 active:scale-95 shadow-sm ${
              isFollowing
                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800'
                : hasSentRequest
                ? 'bg-zinc-100 text-zinc-500'
                : 'bg-[#9D4EDD] hover:bg-[#8A38CC] text-white shadow-[0_6px_20px_rgba(157,78,221,0.3)]'
            }`}
          >
            {hasSentRequest ? (
              <>
                <Clock className="w-4 h-4" />
                <span>Requested</span>
              </>
            ) : isFollowing ? (
              <>
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Following</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Follow</span>
              </>
            )}
          </button>
        </div>

        {/* ── 3-COLUMN STATISTICS ROW ── */}
        <div className="w-full bg-zinc-50 border border-zinc-100 rounded-[24px] p-4 flex items-center justify-around text-center shadow-2xs mt-3">
          {/* Column 1: Likes */}
          <div className="flex-1 flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-lg font-black text-zinc-900 tracking-tight">
              <Heart className={`w-4.5 h-4.5 ${isLiked ? 'fill-rose-500 text-rose-500' : 'fill-pink-500 text-pink-500'} shrink-0`} />
              <span className="tabular-nums">
                {likesCount > 999 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
              </span>
            </div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
              Likes
            </span>
          </div>

          <div className="w-px h-8 bg-zinc-200" />

          {/* Column 2: Followers */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-lg font-black text-zinc-900 tracking-tight tabular-nums">
              {followersCount > 999 ? `${(followersCount / 1000).toFixed(1)}k` : followersCount}
            </span>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
              Followers
            </span>
          </div>

          <div className="w-px h-8 bg-zinc-200" />

          {/* Column 3: Following */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-lg font-black text-zinc-900 tracking-tight tabular-nums">
              {followingCount > 999 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}
            </span>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
              Following
            </span>
          </div>
        </div>

        {/* ── INTERACTIVE LIKE PROFILE BUTTON ── */}
        <div className="w-full relative">
          <button
            type="button"
            onClick={handleToggleLike}
            disabled={loadingLike}
            className={`w-full py-4 px-6 rounded-full font-black text-[15px] transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer border-0 outline-none active:scale-[0.98] select-none shadow-md ${
              isLiked
                ? 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 text-white shadow-[0_10px_30px_rgba(244,63,94,0.35)]'
                : 'bg-[#141111] hover:bg-zinc-800 text-white shadow-[0_6px_20px_rgba(0,0,0,0.2)]'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isLiked ? 'bg-white/20' : 'bg-white/10'}`}>
              <Heart
                className={`w-4.5 h-4.5 transition-all duration-300 ${
                  isLiked ? 'fill-white text-white scale-110' : 'text-pink-400'
                } ${likeBurst ? 'animate-ping' : ''}`}
              />
            </div>
            <span className="font-extrabold tracking-tight">
              {isLiked ? 'Liked Profile' : 'Like Profile'}
            </span>
          </button>
        </div>

        {/* ── ABOUT & DETAILS (Styled Exactly Like ChatDetails Preferences) ── */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">About & Details</span>
          <div className="bg-zinc-50 border border-zinc-100 rounded-[24px] p-4 flex flex-col gap-3 text-sm divide-y divide-zinc-100/80">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-500">Username</span>
              <span className="font-bold text-zinc-800">@{profileData?.username || user?.username || 'user'}</span>
            </div>

            {profileData?.website && (
              <div className="flex items-center justify-between pt-3">
                <span className="font-medium text-zinc-500">Website</span>
                <a
                  href={profileData.website.startsWith('http') ? profileData.website : `https://${profileData.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-purple-600 hover:underline flex items-center gap-1"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[180px]">{profileData.website.replace(/^https?:\/\//, '')}</span>
                </a>
              </div>
            )}

            {profileData?.createdAt && (
              <div className="flex items-center justify-between pt-3">
                <span className="font-medium text-zinc-500">Member Since</span>
                <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    {new Date(profileData.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
