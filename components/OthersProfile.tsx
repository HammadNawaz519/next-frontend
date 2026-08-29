'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Bookmark, Share2, UserPlus, UserCheck, Star, Sparkles } from 'lucide-react';
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
  const [rating, setRating] = useState<string>('4.9');
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadingFollow, setLoadingFollow] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Fetch full live profile data & follow state
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      if (!user?.id) return;
      try {
        const fullData = await getUserPublicProfile(user.id);
        if (isMounted && fullData) {
          setProfileData(fullData);
          setIsFollowing(fullData.isFollowing || false);
          setFollowersCount(fullData.stats?.followers || 0);
          setFollowingCount(fullData.stats?.following || 0);
          setRating(fullData.stats?.rating || '4.9');
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

  const handleToggleBookmark = () => {
    triggerHaptic('light');
    setIsBookmarked(!isBookmarked);
    showToast(!isBookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks');
  };

  const displayName = profileData?.name || profileData?.username || 'User';
  const displayHeadline = profileData?.bio || (profileData?.username ? `@${profileData.username}` : 'Connect Member');
  const avatarKey = profileData?.id || profileData?.username || displayName;
  const avatarBg = getDeterministicAvatarBg(avatarKey);

  return (
    <div className="fixed inset-0 z-[1600] flex flex-col justify-between bg-[#141111] p-4 sm:p-5 pt-12 pb-6 overflow-hidden select-none font-sans animate-in fade-in duration-300">
      
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          {toastMessage}
        </div>
      )}

      {/* ── 1. UPPER WHITE CONTAINER (MATCHING CALL UI REVERSED LAYOUT) ── */}
      <div className="w-full flex-1 bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_15px_45px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 min-h-0">
        
        {/* Top Header Bar Inside White Card */}
        <div className="w-full flex items-center justify-between z-20 shrink-0 mb-3">
          {/* Borderless Back Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-800 active:scale-90 transition-all cursor-pointer shadow-xs border-0 outline-none"
            title="Back"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-800" strokeWidth={2.5} />
          </button>

          <span className="text-[12px] font-bold tracking-wider text-zinc-400 uppercase">
            User Profile
          </span>

          {/* Bookmark / Favorite Action */}
          <button
            onClick={handleToggleBookmark}
            className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-xs border-0 outline-none ${
              isBookmarked ? 'bg-purple-50 text-[#9D4EDD]' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
            }`}
            title="Save Profile"
          >
            <Bookmark className={`w-4.5 h-4.5 ${isBookmarked ? 'fill-[#9D4EDD]' : ''}`} />
          </button>
        </div>

        {/* ── CARD CONTENT (COVER BANNER + OVERLAPPING AVATAR + DETAILS + STATS) ── */}
        <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar py-1">
          
          {/* Cover / Portfolio Art Banner */}
          <div className="w-full h-32 sm:h-36 rounded-[24px] overflow-hidden relative shadow-inner bg-gradient-to-tr from-[#8B5CF6] via-[#6366F1] to-[#EC4899] flex items-center justify-center shrink-0">
            {/* Abstract geometric 3D shapes decoration */}
            <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-orange-400/80 blur-xs" />
            <div className="absolute left-6 top-4 w-16 h-16 rounded-full bg-pink-300/40 blur-xs" />
            <div className="absolute right-12 top-6 w-12 h-12 rotate-45 bg-purple-300/30 backdrop-blur-md rounded-xl" />
            <div className="relative z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/25 backdrop-blur-md text-white text-[11px] font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>Connect Portfolio</span>
            </div>
          </div>

          {/* Overlapping Avatar & Action */}
          <div className="relative flex items-end justify-between px-2 -mt-10 mb-2">
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden flex items-center justify-center text-3xl font-bold text-zinc-900 shadow-xl border-4 border-white relative z-10 shrink-0"
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

            {/* Bookmark button beside info */}
            <button
              onClick={handleToggleBookmark}
              className="w-10 h-10 rounded-2xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 flex items-center justify-center text-zinc-600 active:scale-90 transition-all cursor-pointer shadow-2xs outline-none"
            >
              <Bookmark className={`w-4.5 h-4.5 ${isBookmarked ? 'fill-[#9D4EDD] text-[#9D4EDD]' : 'text-zinc-600'}`} />
            </button>
          </div>

          {/* Name & Headline */}
          <div className="px-2 space-y-0.5 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight truncate">
              {displayName}
            </h2>
            <p className="text-xs sm:text-sm font-medium text-zinc-500 truncate">
              {displayHeadline}
            </p>
          </div>

          {/* Tags / Badges */}
          <div className="flex items-center gap-2 px-2 mb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-[#9D4EDD] text-xs font-bold shadow-2xs">
              <span className="w-4 h-4 rounded-full bg-[#9D4EDD] text-white text-[9px] flex items-center justify-center font-black">
                Jt
              </span>
              <span>Jitter Expert</span>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-bold">
              +6
            </div>
          </div>

          {/* 3-Column Stats Row (Exact Layout from Design) */}
          <div className="w-full bg-zinc-50/90 border border-zinc-100 rounded-2xl p-3 flex items-center justify-around text-center mb-3 shadow-2xs">
            {/* Column 1: Rating */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-center gap-1 text-sm sm:text-base font-bold text-zinc-900">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{rating}</span>
              </div>
              <span className="text-[11px] font-medium text-zinc-400 mt-0.5">
                rating
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-zinc-200" />

            {/* Column 2: Followers */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-sm sm:text-base font-bold text-zinc-900">
                {followersCount > 999 ? `${(followersCount / 1000).toFixed(1)}k` : followersCount}
              </span>
              <span className="text-[11px] font-medium text-zinc-400 mt-0.5">
                followers
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-zinc-200" />

            {/* Column 3: Following / Rate */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-sm sm:text-base font-bold text-zinc-900">
                {followingCount > 999 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}
              </span>
              <span className="text-[11px] font-medium text-zinc-400 mt-0.5">
                following
              </span>
            </div>
          </div>

          {/* "Get In Touch" Action Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
              onGetInTouch?.(profileData);
            }}
            className="w-full py-3.5 rounded-full bg-zinc-950 hover:bg-zinc-800 active:scale-98 text-white font-bold text-[14px] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border-0 outline-none"
          >
            <span>Get In Touch</span>
          </button>

        </div>

      </div>

      {/* ── 2. LOWER DARK ZINC CONTAINER (SHARE & FOLLOW BUTTONS) ── */}
      <div className="w-full bg-[#141111] border border-zinc-800/80 rounded-[32px] sm:rounded-[36px] py-4 px-5 mt-4 shadow-[0_10px_35px_rgba(0,0,0,0.5)] flex items-center justify-between gap-3 shrink-0">
        
        {/* Left: Share Button */}
        <button
          onClick={handleShare}
          className="flex-1 py-3 rounded-full bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border border-zinc-700/60 shadow-md outline-none"
          title="Share Profile"
        >
          <Share2 className="w-4 h-4 text-zinc-300" />
          <span>Share</span>
        </button>

        {/* Right: Follow / Unfollow Button */}
        <button
          onClick={handleToggleFollow}
          disabled={loadingFollow}
          className={`flex-1 py-3 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md outline-none active:scale-95 ${
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
