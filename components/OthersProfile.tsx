'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Share2, UserPlus, UserCheck, Star, Heart, Trees } from 'lucide-react';
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
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-zinc-900/90 backdrop-blur-md border-0 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          {toastMessage}
        </div>
      )}

      {/* ── 1. UPPER WHITE CONTAINER (REVERSED CALL LAYOUT, CLEAN, BALANCED & SPACIOUS) ── */}
      <div className="w-full flex-1 bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_15px_45px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between p-5 min-h-0">
        
        {/* Top Header Bar Inside White Card (Borderless, No Outline) */}
        <div className="w-full flex items-center justify-between z-20 shrink-0 mb-3">
          {/* Borderless Back Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 active:scale-90 transition-all cursor-pointer border-0 outline-none ring-0"
            title="Back"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-800" strokeWidth={2.5} />
          </button>

          <span className="text-[12px] font-bold tracking-wider text-zinc-400 uppercase">
            Profile
          </span>

          {/* Clean spacer on right */}
          <div className="w-11 h-11" />
        </div>

        {/* ── CARD CONTENT (FOREST CANOPY COVER + AVATAR + DETAILS + LARGE STATS + LIKE BUTTON) ── */}
        <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar py-1 min-h-0">
          
          {/* Deep Emerald Forest Theme Banner (Takes Remaining Space Gracefully) */}
          <div className="w-full flex-1 min-h-[140px] sm:min-h-[180px] rounded-[28px] overflow-hidden relative shadow-inner bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#022C22] flex items-center justify-center shrink-0">
            {/* Ambient organic glowing tree canopies and emerald bokeh lights */}
            <div className="absolute -right-6 -bottom-10 w-44 h-44 rounded-full bg-emerald-400/30 blur-xl" />
            <div className="absolute left-6 -top-8 w-36 h-36 rounded-full bg-teal-300/25 blur-lg" />
            <div className="absolute right-12 top-6 w-20 h-20 rounded-full bg-lime-300/20 blur-md" />
            
            {/* Layered botanical / forest silhouettes */}
            <div className="absolute inset-0 opacity-15 flex items-end justify-between px-6 pb-2 pointer-events-none">
              <Trees className="w-16 h-16 text-emerald-200" />
              <Trees className="w-20 h-20 text-emerald-100" />
              <Trees className="w-14 h-14 text-emerald-200" />
            </div>

            {/* Glowing subtle center mist */}
            <div className="relative z-10 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/25 backdrop-blur-md text-emerald-100 text-xs font-semibold">
              <Trees className="w-3.5 h-3.5 text-emerald-300" />
              <span>Wilderness Atmosphere</span>
            </div>
          </div>

          {/* Overlapping Avatar (Moved down with breathing space) */}
          <div className="relative flex items-end px-4 -mt-12 mb-1 shrink-0">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center text-3xl sm:text-4xl font-black text-zinc-900 shadow-2xl border-4 border-white relative z-10 shrink-0"
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

          {/* Name & Headline (Moved comfortably down with clear vertical separation) */}
          <div className="px-4 pt-2 pb-1 space-y-1 mb-3 shrink-0">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight truncate">
              {displayName}
            </h2>
            <p className="text-sm sm:text-base font-medium text-zinc-500 truncate">
              {displayHeadline}
            </p>
          </div>

          {/* 3-Column Stats Row (Large, Prominent & Balanced) */}
          <div className="w-full bg-zinc-50/90 border border-zinc-100 rounded-2xl p-4 sm:p-4.5 flex items-center justify-around text-center mb-3.5 shadow-2xs shrink-0">
            {/* Column 1: Rating (Follower to Like ratio) */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xl sm:text-2xl font-black text-zinc-900">
                <Star className="w-4.5 h-4.5 fill-amber-400 text-amber-400" />
                <span>{rating}</span>
              </div>
              <span className="text-[12px] font-bold text-zinc-400 mt-1 uppercase tracking-wider">
                rating
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-9 bg-zinc-200" />

            {/* Column 2: Followers */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-zinc-900">
                {followersCount > 999 ? `${(followersCount / 1000).toFixed(1)}k` : followersCount}
              </span>
              <span className="text-[12px] font-bold text-zinc-400 mt-1 uppercase tracking-wider">
                followers
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-9 bg-zinc-200" />

            {/* Column 3: Following */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-zinc-900">
                {followingCount > 999 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}
              </span>
              <span className="text-[12px] font-bold text-zinc-400 mt-1 uppercase tracking-wider">
                following
              </span>
            </div>
          </div>

          {/* Big Like Button at the bottom of the white card */}
          <button
            onClick={handleToggleLike}
            className={`w-full py-4 sm:py-4.5 rounded-full font-bold text-[15px] sm:text-[16px] transition-all shadow-md flex items-center justify-center gap-2.5 cursor-pointer border-0 outline-none ring-0 active:scale-98 shrink-0 ${
              isLiked
                ? 'bg-zinc-900 text-[#EC4899]'
                : 'bg-zinc-950 hover:bg-zinc-800 text-white'
            }`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-[#EC4899] text-[#EC4899]' : 'text-white'}`} />
            <span>{isLiked ? 'Liked' : 'Like Profile'}</span>
            {likesCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/15 ml-1">
                {likesCount}
              </span>
            )}
          </button>

        </div>

      </div>

      {/* ── 2. LOWER DARK ZINC CONTAINER (LARGE SHARE & FOLLOW BUTTONS WITHOUT OUTLINES) ── */}
      <div className="w-full bg-[#141111] border-0 outline-none ring-0 rounded-[32px] sm:rounded-[36px] py-4 sm:py-5 px-5 mt-4 shadow-[0_10px_35px_rgba(0,0,0,0.5)] flex items-center justify-between gap-3.5 shrink-0">
        
        {/* Left: Big Share Button (No outline, no border) */}
        <button
          onClick={handleShare}
          className="flex-1 py-4 sm:py-4.5 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white text-[15px] font-bold flex items-center justify-center gap-2.5 transition-all cursor-pointer border-0 outline-none ring-0 shadow-none"
          title="Share Profile"
        >
          <Share2 className="w-4.5 h-4.5 text-zinc-300" />
          <span>Share</span>
        </button>

        {/* Right: Big Follow / Unfollow Button (No outline, no border) */}
        <button
          onClick={handleToggleFollow}
          disabled={loadingFollow}
          className={`flex-1 py-4 sm:py-4.5 rounded-full text-[15px] font-bold flex items-center justify-center gap-2.5 transition-all cursor-pointer border-0 outline-none ring-0 shadow-none active:scale-95 ${
            isFollowing
              ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'
          }`}
          title={isFollowing ? 'Unfollow' : 'Follow'}
        >
          {isFollowing ? (
            <>
              <UserCheck className="w-4.5 h-4.5 text-zinc-300" />
              <span>Following</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4.5 h-4.5 text-zinc-900" />
              <span>Follow</span>
            </>
          )}
        </button>

      </div>

    </div>
  );
}
