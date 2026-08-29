'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Share2, UserPlus, UserCheck, Star, Heart } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { getUserPublicProfile, toggleFollowUser } from '@/app/dashboard/actions';

interface OthersProfileProps {
  user: any;
  onClose: () => void;
  onGetInTouch?: (user: any) => void;
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
}: OthersProfileProps) {
  const [profileData, setProfileData] = useState<any>(user);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [rating, setRating] = useState<string>('4.9');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadingFollow, setLoadingFollow] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Fetch full live profile data & follow/stats state
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      if (!user?.id) return;
      try {
        const fullData = await getUserPublicProfile(user.id);
        if (isMounted && fullData) {
          setProfileData(fullData);
          setIsFollowing(fullData.isFollowing || false);
          const fCount = fullData.stats?.followers || 0;
          const foCount = fullData.stats?.following || 0;
          const lCount = fullData.stats?.likes || 0;
          setFollowersCount(fCount);
          setFollowingCount(foCount);
          setLikesCount(lCount);

          // Calculate balanced follower-to-like engagement rating ratio (4.8 - 5.0)
          const baseRating = 4.7 + Math.min(0.29, (fCount > 0 ? (lCount / (fCount + 1)) * 0.15 : 0.1) + (fCount * 0.02));
          setRating(Math.min(5.0, baseRating).toFixed(1));
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

  const handleToggleFollow = async () => {
    if (!profileData?.id || loadingFollow) return;
    triggerHaptic('medium');
    setLoadingFollow(true);
    const nextFollowingState = !isFollowing;
    setIsFollowing(nextFollowingState);
    setFollowersCount((prev) => (nextFollowingState ? prev + 1 : Math.max(0, prev - 1)));

    try {
      const res: any = await toggleFollowUser(profileData.id);
      if (res && !res.error) {
        const isNowFollowing = res.isFollowing || res.hasSentRequest || false;
        setIsFollowing(isNowFollowing);
        if (typeof res.followersCount === 'number') {
          setFollowersCount(res.followersCount);
        }
        showToast(res.hasSentRequest ? 'Follow request sent' : isNowFollowing ? 'Following user' : 'Unfollowed user');
      } else {
        // Revert on failure
        setIsFollowing(!nextFollowingState);
        setFollowersCount((prev) => (!nextFollowingState ? prev + 1 : Math.max(0, prev - 1)));
      }
    } catch (e) {
      setIsFollowing(!nextFollowingState);
      setFollowersCount((prev) => (!nextFollowingState ? prev + 1 : Math.max(0, prev - 1)));
    } finally {
      setLoadingFollow(false);
    }
  };

  const handleToggleLike = () => {
    triggerHaptic('light');
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    showToast(nextLiked ? 'Liked profile' : 'Unliked profile');
  };

  const handleShare = async () => {
    triggerHaptic('light');
    const profileUrl = typeof window !== 'undefined' ? `${window.location.origin}/@${profileData.username || profileData.id}` : '';
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(profileUrl);
        showToast('Profile link copied to clipboard!');
      } catch {
        showToast('Profile link ready to share');
      }
    } else {
      showToast('Profile link ready to share');
    }
  };

  const displayName = profileData?.name || profileData?.username || 'User';
  const displayHeadline = profileData?.bio || (profileData?.username ? `@${profileData.username}` : 'Connect Member');
  const avatarKey = profileData?.id || profileData?.username || displayName;
  const avatarBg = getDeterministicAvatarBg(avatarKey);

  return (
    <div className="fixed inset-0 z-[1600] flex flex-col justify-between bg-[#141111] p-4 sm:p-5 pt-12 pb-6 overflow-hidden select-none font-sans animate-in fade-in duration-300">
      
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          {toastMessage}
        </div>
      )}

      {/* ── 1. UPPER WHITE CONTAINER (REVERSED CALL LAYOUT, CLEAN & BALANCED) ── */}
      <div className="w-full flex-1 bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_15px_45px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between p-5 min-h-0">
        
        {/* Top Header Bar Inside White Card (Borderless, No Outline) */}
        <div className="w-full flex items-center justify-between z-20 shrink-0 mb-2">
          {/* Borderless Back Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 active:scale-90 transition-all cursor-pointer shadow-xs border-0 outline-none"
            title="Back"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-800" strokeWidth={2.5} />
          </button>

          <span className="text-[12px] font-bold tracking-wider text-zinc-400 uppercase">
            Profile
          </span>

          {/* Clean spacer on right */}
          <div className="w-10 h-10" />
        </div>

        {/* ── CARD CONTENT (LARGE 3D BANNER + LARGE AVATAR + DETAILS + 3-COL STATS) ── */}
        <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar py-1">
          
          {/* Cover / Portfolio Art Banner */}
          <div className="w-full h-40 sm:h-48 rounded-[26px] overflow-hidden relative shadow-inner bg-gradient-to-tr from-[#8B5CF6] via-[#6366F1] to-[#EC4899] flex items-center justify-center shrink-0">
            {/* 3D abstract geometric sphere/torus shapes */}
            <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-orange-400/80 blur-xs" />
            <div className="absolute left-8 top-6 w-20 h-20 rounded-full bg-pink-300/40 blur-xs" />
            <div className="absolute right-14 top-8 w-14 h-14 rotate-45 bg-purple-300/30 backdrop-blur-md rounded-2xl" />
          </div>

          {/* Overlapping Avatar */}
          <div className="relative flex items-end px-3 -mt-14 mb-2">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center text-4xl font-black text-zinc-900 shadow-2xl border-4 border-white relative z-10 shrink-0"
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
          </div>

          {/* Name & Headline */}
          <div className="px-3 space-y-1 mb-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight truncate">
              {displayName}
            </h2>
            <p className="text-sm sm:text-base font-medium text-zinc-500 truncate">
              {displayHeadline}
            </p>
          </div>

          {/* 3-Column Stats Row (Exact Layout from Design with Balanced Large Numbers) */}
          <div className="w-full bg-zinc-50/90 border border-zinc-100 rounded-2xl p-3.5 flex items-center justify-around text-center mb-3 shadow-2xs">
            {/* Column 1: Rating (Follower to Like ratio) */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-lg sm:text-xl font-extrabold text-zinc-900">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{rating}</span>
              </div>
              <span className="text-[11px] font-semibold text-zinc-400 mt-0.5 tracking-wider">
                rating
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-zinc-200" />

            {/* Column 2: Followers */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-lg sm:text-xl font-extrabold text-zinc-900">
                {followersCount > 999 ? `${(followersCount / 1000).toFixed(1)}k` : followersCount}
              </span>
              <span className="text-[11px] font-semibold text-zinc-400 mt-0.5 tracking-wider">
                followers
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-zinc-200" />

            {/* Column 3: Following */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-lg sm:text-xl font-extrabold text-zinc-900">
                {followingCount > 999 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}
              </span>
              <span className="text-[11px] font-semibold text-zinc-400 mt-0.5 tracking-wider">
                following
              </span>
            </div>
          </div>

          {/* Big Like Button at the bottom of the white card */}
          <button
            onClick={handleToggleLike}
            className={`w-full py-4 rounded-full font-bold text-[15px] transition-all shadow-md flex items-center justify-center gap-2.5 cursor-pointer border-0 outline-none active:scale-98 ${
              isLiked
                ? 'bg-zinc-900 text-[#EC4899]'
                : 'bg-zinc-950 hover:bg-zinc-800 text-white'
            }`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-[#EC4899] text-[#EC4899]' : 'text-white'}`} />
            <span>{isLiked ? 'Liked' : 'Like'}</span>
            {likesCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 ml-1">
                {likesCount}
              </span>
            )}
          </button>

        </div>

      </div>

      {/* ── 2. LOWER DARK ZINC CONTAINER (SHARE & FOLLOW BUTTONS) ── */}
      <div className="w-full bg-[#141111] border border-zinc-800/80 rounded-[32px] sm:rounded-[36px] py-4 px-5 mt-4 shadow-[0_10px_35px_rgba(0,0,0,0.5)] flex items-center justify-between gap-3 shrink-0">
        
        {/* Left: Share Button */}
        <button
          onClick={handleShare}
          className="flex-1 py-3.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border border-zinc-700/60 shadow-md outline-none"
          title="Share Profile"
        >
          <Share2 className="w-4 h-4 text-zinc-300" />
          <span>Share</span>
        </button>

        {/* Right: Follow / Unfollow Button */}
        <button
          onClick={handleToggleFollow}
          disabled={loadingFollow}
          className={`flex-1 py-3.5 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md outline-none active:scale-95 ${
            isFollowing
              ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700/80'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-0'
          }`}
          title={isFollowing ? 'Unfollow' : 'Follow'}
        >
          {isFollowing ? (
            <>
              <UserCheck className="w-4 h-4 text-zinc-300" />
              <span>Following</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4 text-zinc-900" />
              <span>Follow</span>
            </>
          )}
        </button>

      </div>

    </div>
  );
}
