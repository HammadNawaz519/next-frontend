'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Share2,
  UserPlus,
  UserCheck,
  Clock,
  Heart,
  MessageCircle,
  Phone,
  Video,
  Calendar,
  Globe
} from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { getUserPublicProfile, toggleFollowUser, toggleProfileLike } from '@/app/dashboard/actions';

interface OthersProfileProps {
  user: any;
  onClose: () => void;
  onGetInTouch?: (user: any) => void;
  currentUserId?: string;
  socket?: any;
  onStartCall?: (type: 'audio' | 'video') => void;
  activeTheme?: any;
}

const PASTEL_AVATAR_BGS = ['#FFF3CD', '#E0F2FE', '#FCE7F3', '#FEF9C3', '#EDE9FE', '#DCFCE7'];

function getDeterministicAvatarBg(key: string): string {
  if (!key) return PASTEL_AVATAR_BGS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PASTEL_AVATAR_BGS.length;
  return PASTEL_AVATAR_BGS[index];
}

export default function OthersProfile({
  user,
  onClose,
  onGetInTouch,
  currentUserId,
  socket,
  onStartCall,
  activeTheme,
}: OthersProfileProps) {
  const [profileData, setProfileData] = useState<any>(user);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [hasSentRequest, setHasSentRequest] = useState<boolean>(false);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadingFollow, setLoadingFollow] = useState<boolean>(false);
  const [loadingLike, setLoadingLike] = useState<boolean>(false);
  const [likeBurst, setLikeBurst] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Fetch full live server-authoritative profile data & follow/stats state
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      if (!user?.id) return;
      try {
        const fullData = await getUserPublicProfile(user.id);
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
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Real-time socket & window listener for profile likes and updates
  useEffect(() => {
    const handleProfileLiked = (data: any) => {
      if (!data) return;
      const targetId = data.targetUserId;
      if (profileData?.id && String(targetId) === String(profileData.id)) {
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
  }, [socket, profileData?.id, currentUserId]);

  const handleToggleFollow = async () => {
    if (!profileData?.id || loadingFollow) return;
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
      setIsFollowing(!profileData.isPrivate);
      setHasSentRequest(profileData.isPrivate);
      if (!profileData.isPrivate) {
        setFollowersCount((c) => c + 1);
      }
    }

    try {
      const res: any = await toggleFollowUser(profileData.id);
      if (res && !res.error) {
        setIsFollowing(Boolean(res.isFollowing));
        setHasSentRequest(Boolean(res.hasSentRequest));
        if (typeof res.followersCount === 'number') {
          setFollowersCount(res.followersCount);
        }
        if (typeof res.followingCount === 'number') {
          setFollowingCount(res.followingCount);
        }
        showToast(
          res.hasSentRequest
            ? 'Follow request sent'
            : res.isFollowing
            ? 'Following user'
            : 'Unfollowed user'
        );
      } else {
        setIsFollowing(prevFollowing);
        setHasSentRequest(prevRequested);
        setFollowersCount(prevFollowersCount);
        showToast(res?.error || 'Action could not be completed');
      }
    } catch (e) {
      setIsFollowing(prevFollowing);
      setHasSentRequest(prevRequested);
      setFollowersCount(prevFollowersCount);
      showToast('Network error, please try again');
    } finally {
      setLoadingFollow(false);
    }
  };

  const handleToggleLike = async () => {
    if (!profileData?.id || loadingLike) return;
    triggerHaptic('medium');

    setLikeBurst(true);
    setTimeout(() => setLikeBurst(false), 600);

    const prevLiked = isLiked;
    const prevCount = likesCount;
    const nextLiked = !isLiked;
    const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

    // Instant optimistic increment
    setIsLiked(nextLiked);
    setLikesCount(nextCount);

    // Broadcast live socket event so other users viewing this profile see it increment in real-time
    if (socket) {
      socket.emit('like_profile', {
        targetUserId: profileData.id,
        count: nextCount,
        likerId: currentUserId,
        isLiked: nextLiked
      });
    }

    try {
      setLoadingLike(true);
      const result: any = await toggleProfileLike(profileData.id);
      if (result && result.success) {
        setIsLiked(Boolean(result.isLiked));
        if (typeof result.likes === 'number') {
          setLikesCount(result.likes);
        }
        showToast(result.isLiked ? '❤️ Liked profile!' : 'Unliked profile');
      } else {
        // Revert on error
        setIsLiked(prevLiked);
        setLikesCount(prevCount);
        showToast(result?.error || 'Could not update like');
      }
    } catch {
      setIsLiked(prevLiked);
      setLikesCount(prevCount);
      showToast('Network error, please try again');
    } finally {
      setLoadingLike(false);
    }
  };

  const handleShare = async () => {
    triggerHaptic('light');
    const profileUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/@${profileData.username || profileData.id}`
        : '';
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(profileUrl);
        showToast('🔗 Profile link copied to clipboard!');
      } catch {
        showToast('Profile link ready to share');
      }
    } else {
      showToast('Profile link ready to share');
    }
  };

  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const data = e.detail;
      if (data && profileData?.id && data.userId === profileData.id) {
        setProfileData((prev: any) => ({
          ...prev,
          ...(data.username ? { username: data.username } : {}),
          ...(data.image ? { image: data.image } : {}),
          ...(data.bio !== undefined ? { bio: data.bio } : {}),
          ...(data.website !== undefined ? { website: data.website } : {}),
        }));
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('user_profile_updated', handleProfileUpdate);
      return () => window.removeEventListener('user_profile_updated', handleProfileUpdate);
    }
  }, [profileData?.id]);

  const displayName = profileData?.username || 'User';
  const avatarKey = profileData?.id || profileData?.username || displayName;
  const avatarBg = getDeterministicAvatarBg(avatarKey);

  return (
    <div className="fixed inset-0 z-[1600] flex flex-col bg-[#141111] animate-in slide-in-from-right duration-300 overflow-hidden font-sans select-none">
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-zinc-900/95 backdrop-blur-md text-xs font-bold text-white shadow-2xl border border-white/10 animate-in fade-in slide-in-from-top-4 duration-200 flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── 1. TOP HEADER BAR (Matching Chat View & ChatDetails styling) ── */}
      <div className="pt-12 pb-3 px-5 flex items-center justify-between shrink-0 bg-[#141111] z-20">
        {/* Left: Back button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 transition-all cursor-pointer outline-none border-0 bg-transparent"
          title="Back"
        >
          <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
        </button>

        {/* Center: Contact Info */}
        <div className="flex flex-col items-center min-w-0 max-w-[200px]">
          <h2 className="text-[17px] font-bold text-white tracking-tight truncate text-center">
            {displayName}
          </h2>
          <span className="text-[11px] font-semibold text-zinc-400 truncate">
            @{profileData?.username || 'user'}
          </span>
        </div>

        {/* Right: Share Button */}
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
      <div className="w-full flex-1 bg-white rounded-t-[32px] px-5 pt-6 pb-12 flex flex-col gap-5 text-zinc-900 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar relative">
        
        {/* Profile Hero: Avatar, Names, Online Dot & Bio */}
        <div className="flex flex-col items-center text-center pt-1">
          <div className="relative">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center text-3xl sm:text-4xl font-black text-zinc-900 shadow-[0_12px_28px_rgba(0,0,0,0.12)] border-4 border-white relative z-10"
              style={{ backgroundColor: avatarBg }}
            >
              {profileData?.image && profileData.image.length > 5 ? (
                <img
                  src={profileData.image}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
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

          <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight mt-3">
            {displayName}
          </h2>
          <span className="text-xs font-bold text-purple-600 tracking-wide mt-0.5">
            @{profileData?.username || 'user'}
          </span>

          {profileData?.bio && (
            <p className="text-sm text-zinc-600 font-normal max-w-sm mt-2 leading-relaxed px-2">
              {profileData.bio}
            </p>
          )}
        </div>

        {/* Quick Interaction Buttons: Message, Calls, Follow */}
        <div className="flex items-center justify-center gap-2.5 w-full max-w-sm mx-auto">
          {/* Message / Chat */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onGetInTouch?.(profileData);
            }}
            className="flex-1 py-3 px-4 rounded-full bg-[#141111] hover:bg-zinc-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer border-0"
            title="Send Message"
          >
            <MessageCircle className="w-4 h-4 text-white" />
            <span>Message</span>
          </button>

          {/* Voice Call */}
          {onStartCall && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onStartCall('audio');
              }}
              className="w-11 h-11 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center active:scale-95 transition-all cursor-pointer border-0 shrink-0"
              title="Voice Call"
            >
              <Phone className="w-4.5 h-4.5" />
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
              className="w-11 h-11 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center active:scale-95 transition-all cursor-pointer border-0 shrink-0"
              title="Video Call"
            >
              <Video className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Follow / Unfollow */}
          <button
            type="button"
            onClick={handleToggleFollow}
            disabled={loadingFollow}
            className={`py-3 px-4 rounded-full font-bold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer border-0 active:scale-95 shrink-0 ${
              isFollowing
                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800'
                : hasSentRequest
                ? 'bg-zinc-100 text-zinc-500'
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
            }`}
          >
            {hasSentRequest ? (
              <>
                <Clock className="w-4 h-4" />
                <span>Requested</span>
              </>
            ) : isFollowing ? (
              <>
                <UserCheck className="w-4 h-4" />
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

        {/* 3-Column Statistics Row */}
        <div className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex items-center justify-around text-center shadow-2xs">
          {/* Column 1: Likes */}
          <div className="flex-1 flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : 'fill-pink-500 text-pink-500'} shrink-0`} />
              <span className="tabular-nums">
                {likesCount > 999 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mt-0.5">
              likes
            </span>
          </div>

          <div className="w-px h-8 bg-zinc-200" />

          {/* Column 2: Followers */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight tabular-nums">
              {followersCount > 999 ? `${(followersCount / 1000).toFixed(1)}k` : followersCount}
            </span>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mt-0.5">
              followers
            </span>
          </div>

          <div className="w-px h-8 bg-zinc-200" />

          {/* Column 3: Following */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight tabular-nums">
              {followingCount > 999 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}
            </span>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mt-0.5">
              following
            </span>
          </div>
        </div>

        {/* Interactive Big Like Profile Button */}
        <div className="w-full relative">
          <button
            type="button"
            onClick={handleToggleLike}
            disabled={loadingLike}
            className={`w-full py-4 rounded-full font-black text-[15px] transition-all duration-200 shadow-md flex items-center justify-center gap-3 cursor-pointer border-0 outline-none active:scale-[0.98] select-none ${
              isLiked
                ? 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 text-white shadow-[0_10px_30px_rgba(244,63,94,0.35)] scale-[1.01]'
                : 'bg-[#18181B] hover:bg-zinc-800 text-white shadow-[0_6px_20px_rgba(0,0,0,0.18)]'
            }`}
          >
            <Heart
              className={`w-5 h-5 transition-transform duration-300 ${
                isLiked ? 'fill-white text-white scale-125' : 'text-pink-400'
              } ${likeBurst ? 'animate-ping' : ''}`}
            />
            <span>{isLiked ? 'Liked Profile' : 'Like Profile'}</span>
            <span
              className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full transition-colors ${
                isLiked ? 'bg-white/25 text-white' : 'bg-white/10 text-zinc-300'
              }`}
            >
              {likesCount}
            </span>
          </button>
        </div>

        {/* About & Member Details */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">About</span>
          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex flex-col gap-3 text-sm divide-y divide-zinc-100/80">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-500">Username</span>
              <span className="font-bold text-zinc-800">@{profileData?.username || 'user'}</span>
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

            <div className="flex items-center justify-between pt-3">
              <span className="font-medium text-zinc-500">Status</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                {profileData?.isOnline ? 'Online now' : 'Connect Member'}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
