'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Share2, UserPlus, UserCheck, Clock, Star, Heart } from 'lucide-react';
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
  const [hasSentRequest, setHasSentRequest] = useState<boolean>(false);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [rating, setRating] = useState<string>('—');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadingFollow, setLoadingFollow] = useState<boolean>(false);

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
          setIsFollowing(fullData.isFollowing || false);
          setHasSentRequest(fullData.hasSentRequest || false);
          setFollowersCount(fullData.stats?.followers || 0);
          setFollowingCount(fullData.stats?.following || 0);
          setLikesCount(fullData.stats?.likes || 0);
          setRating(fullData.stats?.rating || '—');
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

    const prevFollowing = isFollowing;
    const prevRequested = hasSentRequest;
    const prevFollowersCount = followersCount;

    // Safe optimistic update
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
        // Reconcile with authoritative database counts
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
        // Revert on error
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

  const handleToggleLike = () => {
    triggerHaptic('light');
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    showToast(nextLiked ? 'Liked profile' : 'Unliked profile');
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
        showToast('Profile link copied to clipboard!');
      } catch {
        showToast('Profile link ready to share');
      }
    } else {
      showToast('Profile link ready to share');
    }
  };

  const displayName = profileData?.name || profileData?.username || 'User';
  const displayHeadline =
    profileData?.bio || (profileData?.username ? `@${profileData.username}` : 'Connect Member');
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

      {/* ── 1. UPPER WHITE CONTAINER (REVERSED CALL LAYOUT, BALANCED PROPORTIONS) ── */}
      <div className="w-full flex-1 bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_15px_45px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between p-5 min-h-0">
        {/* Top Header Bar Inside White Card (Completely Borderless & Outline-Free) */}
        <div className="w-full flex items-center justify-between z-20 shrink-0 mb-3">
          {/* Borderless Transparent Back Button */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent hover:bg-zinc-100 text-zinc-800 active:scale-90 transition-all cursor-pointer border-0 outline-none ring-0 focus:outline-none focus:ring-0 shadow-none"
            title="Back"
          >
            <ChevronLeft className="w-6 h-6 text-zinc-800" strokeWidth={2.4} />
          </button>

          <span className="text-[12px] font-bold tracking-wider text-zinc-400 uppercase">
            Profile
          </span>

          {/* Clean spacer on right */}
          <div className="w-10 h-10" />
        </div>

        {/* ── CARD CONTENT (GOLDEN LEAF ON COBALT CANVAS + AVATAR + DETAILS + STATS + LIKE BUTTON) ── */}
        <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar py-1 min-h-0">
          {/* ── Golden Autumn Leaf on Deep Cobalt Blue Canvas Artwork (No Text) ── */}
          <div className="w-full flex-1 min-h-[150px] sm:min-h-[190px] rounded-[28px] overflow-hidden relative shadow-inner bg-gradient-to-tr from-[#1E3A8A] via-[#1D4ED8] to-[#2563EB] flex items-center justify-center shrink-0">
            {/* Painted ultramarine texture background strokes */}
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#60A5FA_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="absolute -left-10 -top-10 w-48 h-48 rounded-full bg-blue-400/20 blur-2xl" />
            <div className="absolute right-0 bottom-0 w-40 h-40 rounded-full bg-indigo-900/40 blur-xl" />

            {/* Stylized Golden Leaf Artwork */}
            <div className="relative z-10 w-44 h-32 flex items-center justify-center transform -rotate-12 hover:scale-105 transition-transform duration-500">
              <svg viewBox="0 0 200 120" className="w-full h-full drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)]">
                <defs>
                  <linearGradient id="leafGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDE68A" />
                    <stop offset="45%" stopColor="#F59E0B" />
                    <stop offset="85%" stopColor="#D97706" />
                    <stop offset="100%" stopColor="#B45309" />
                  </linearGradient>
                  <linearGradient id="leafStem" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#92400E" />
                    <stop offset="100%" stopColor="#78350F" />
                  </linearGradient>
                </defs>
                {/* Main Leaf Body */}
                <path
                  d="M10 60 C40 15, 140 10, 185 55 C190 60, 188 62, 182 65 C135 105, 45 100, 10 60 Z"
                  fill="url(#leafGold)"
                />
                {/* Central Leaf Stem */}
                <path
                  d="M5 60 Q90 58 195 56"
                  stroke="url(#leafStem)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
                {/* Delicate leaf side veins */}
                <path d="M45 59 Q65 42 85 30" stroke="#B45309" strokeWidth="1" strokeOpacity="0.5" fill="none" />
                <path d="M75 59 Q100 42 125 28" stroke="#B45309" strokeWidth="1" strokeOpacity="0.5" fill="none" />
                <path d="M115 58 Q140 44 160 38" stroke="#B45309" strokeWidth="1" strokeOpacity="0.5" fill="none" />
                <path d="M45 61 Q65 78 85 90" stroke="#B45309" strokeWidth="1" strokeOpacity="0.5" fill="none" />
                <path d="M75 60 Q100 78 125 92" stroke="#B45309" strokeWidth="1" strokeOpacity="0.5" fill="none" />
                <path d="M115 59 Q140 76 160 82" stroke="#B45309" strokeWidth="1" strokeOpacity="0.5" fill="none" />
              </svg>
            </div>
          </div>

          {/* Overlapping Avatar */}
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

          {/* Name & Headline (Moved comfortably down with clean vertical separation) */}
          <div className="px-4 pt-2 pb-1 space-y-0.5 mb-2.5 shrink-0">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight truncate">
              {displayName}
            </h2>
            <p className="text-sm sm:text-base font-normal text-zinc-500 truncate">
              {displayHeadline}
            </p>
          </div>

          {/* 3-Column Stats Row (Light, Clean Typography for Stats) */}
          <div className="w-full bg-zinc-50/80 border border-zinc-100 rounded-2xl p-3.5 sm:p-4 flex items-center justify-around text-center mb-3 shadow-2xs shrink-0">
            {/* Column 1: Real Rating */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-center gap-1 text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
                <span>{rating}</span>
              </div>
              <span className="text-[11px] font-normal text-zinc-500 mt-0.5">
                rating
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-zinc-200" />

            {/* Column 2: Followers Count */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
                {followersCount > 999 ? `${(followersCount / 1000).toFixed(1)}k` : followersCount}
              </span>
              <span className="text-[11px] font-normal text-zinc-500 mt-0.5">
                followers
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-zinc-200" />

            {/* Column 3: Following Count */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
                {followingCount > 999 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}
              </span>
              <span className="text-[11px] font-normal text-zinc-500 mt-0.5">
                following
              </span>
            </div>
          </div>

          {/* Big Like Button at the bottom of the white card */}
          <button
            onClick={handleToggleLike}
            className={`w-full py-4 rounded-full font-bold text-[15px] transition-all shadow-md flex items-center justify-center gap-2.5 cursor-pointer border-0 outline-none ring-0 active:scale-98 shrink-0 ${
              isLiked
                ? 'bg-zinc-900 text-[#EC4899]'
                : 'bg-zinc-950 hover:bg-zinc-800 text-white'
            }`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-[#EC4899] text-[#EC4899]' : 'text-white'}`} />
            <span>{isLiked ? 'Liked' : 'Like Profile'}</span>
            {likesCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/15 ml-1">
                {likesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 2. LOWER DARK ZINC CONTAINER (LARGE BORDERLESS SHARE & FOLLOW BUTTONS) ── */}
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

        {/* Right: Big Follow / Unfollow / Requested Button (No light background, dark zinc theme) */}
        <button
          type="button"
          onClick={handleToggleFollow}
          disabled={loadingFollow}
          className="flex-1 py-4 sm:py-4.5 rounded-full text-[15px] font-bold flex items-center justify-center gap-2.5 transition-all cursor-pointer border-0 outline-none ring-0 shadow-none active:scale-95 bg-zinc-800 hover:bg-zinc-700 text-white"
          title={hasSentRequest ? 'Cancel Request' : isFollowing ? 'Unfollow' : 'Follow'}
        >
          {hasSentRequest ? (
            <>
              <Clock className="w-4.5 h-4.5 text-zinc-300" />
              <span>Requested</span>
            </>
          ) : isFollowing ? (
            <>
              <UserCheck className="w-4.5 h-4.5 text-zinc-300" />
              <span>Following</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4.5 h-4.5 text-white" />
              <span>Follow</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
