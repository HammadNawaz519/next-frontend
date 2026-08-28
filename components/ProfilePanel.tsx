'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { triggerHaptic } from '@/lib/haptics';
import {
  Camera,
  ChevronLeft,
  LogOut,
  Check,
  Edit3,
  UserPlus,
  UserCheck,
  MessageCircle,
} from 'lucide-react';
import {
  updateProfileImageAction,
  toggleFollowUser,
} from '@/app/dashboard/actions';
import { optimizeImageClient } from '@/lib/media-optimizer';

interface Props {
  isOpen: boolean;
  isClosing?: boolean;
  onClose: (e?: any) => void;
  session: any;
  fullUser: any;
  targetUser?: any;
  isDark?: boolean;
  onEditName?: () => void;
  onInstall?: () => void;
  hasUnreadNotifications?: boolean;
  refreshProfile?: () => void;
  onToggleFollow?: (targetUserId: string) => void;
  onOpenChat?: (user: any) => void;
  onAccountSheetChange?: (isOpen: boolean) => void;
  onOpenUpload?: (type: 'single_image' | 'reel') => void;
}

export default function ProfilePanel({
  isOpen,
  onClose,
  session,
  fullUser,
  targetUser,
  refreshProfile,
  onToggleFollow,
  onOpenChat,
}: Props) {
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Follow State for Other User
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasSentRequest, setHasSentRequest] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  // Live Followers & Following counts
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const activeUserData = targetUser || fullUser;
  const isSelf = !targetUser || targetUser.id === (session?.user as any)?.id;

  const curEmail = (activeUserData?.email || session?.user?.email || '').toLowerCase().trim();
  const curUsername = activeUserData?.username || (session?.user as any)?.username || (curEmail ? curEmail.split('@')[0] : 'user');
  const curName = activeUserData?.name || session?.user?.name || 'User';
  const curImage = activeUserData?.image || session?.user?.image || '';

  // Sync counts on user change
  useEffect(() => {
    if (activeUserData) {
      const followers = activeUserData.followers || [];
      const following = activeUserData.following || [];
      setFollowerCount(followers.length);
      setFollowingCount(following.length);

      if (!isSelf && session?.user) {
        const myId = (session.user as any)?.id;
        setIsFollowing(followers.some((f: any) => f.id === myId));
      }
    }
  }, [activeUserData, isSelf, session]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      triggerHaptic('medium');
      const optimized = await optimizeImageClient(file, 600, 0.85);

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const res = await updateProfileImageAction(base64);
        if (res.success) {
          showToast('Profile photo updated!');
          refreshProfile?.();
        } else {
          showToast(res.error || 'Failed to update photo');
        }
        setIsUploadingAvatar(false);
      };
      reader.readAsDataURL(optimized.file);
    } catch (err) {
      console.error(err);
      setIsUploadingAvatar(false);
      showToast('Error uploading image');
    }
  };

  const handleFollowToggle = async () => {
    if (!targetUser?.id || isFollowLoading) return;
    triggerHaptic('medium');
    setIsFollowLoading(true);
    try {
      const res = await toggleFollowUser(targetUser.id);
      if (res.success) {
        setIsFollowing(res.isFollowing);
        setHasSentRequest(res.hasSentRequest || false);
        setFollowerCount((prev) => (res.isFollowing ? prev + 1 : Math.max(0, prev - 1)));
        onToggleFollow?.(targetUser.id);
        refreshProfile?.();
      }
    } catch (err) {
      showToast('Failed to update follow status');
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleLogout = async () => {
    triggerHaptic('medium');
    try {
      localStorage.removeItem('has_active_session');
      localStorage.removeItem('last_logged_user');
      localStorage.removeItem('social_messages_cache');
      localStorage.removeItem('social_contacts_cache');
    } catch (e) {}
    signOut({ callbackUrl: '/accounts' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 h-screen w-full flex flex-col bg-[#141111] overflow-hidden font-sans select-none animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 bg-zinc-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-full shadow-lg border border-white/10 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hidden File Input for Avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFileChange}
      />

      {/* ── 1. Top Dark Region: Header & Profile Identity ── */}
      <div className="w-full bg-[#141111] pt-14 px-6 pb-6 flex flex-col items-center relative select-none shrink-0">
        {/* Header Nav Row */}
        <div className="w-full flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            {!isSelf && (
              <button
                onClick={onClose}
                className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-95 transition-all flex-shrink-0 cursor-pointer outline-none border-0 ring-0 focus:outline-none bg-transparent"
                title="Back"
                aria-label="Back"
              >
                <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
              </button>
            )}
            <h1 className="text-[24px] font-black text-white tracking-tight leading-tight">
              {isSelf ? 'Profile' : curName}
            </h1>
          </div>

          {/* Right side: Top Edit SVG icon (visual only, no functions) */}
          <div className="flex items-center">
            {isSelf && (
              <div className="p-2 text-white/80 flex items-center justify-center">
                <Edit3 className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
            )}
          </div>
        </div>

        {/* Avatar / DP Section */}
        <div className="relative mt-2">
          <div className="w-24 h-24 rounded-full ring-4 ring-white/10 ring-offset-4 ring-offset-[#141111] overflow-hidden bg-zinc-900 flex items-center justify-center shadow-xl">
            {curImage ? (
              <img
                src={curImage}
                alt={curName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-3xl font-black text-white">
                {curName.charAt(0)}
              </span>
            )}
            {isUploadingAvatar && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Camera Upload Badge for Own Profile */}
          {isSelf && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white text-zinc-900 flex items-center justify-center shadow-md cursor-pointer hover:bg-zinc-200 active:scale-90 transition-all border-2 border-[#141111] outline-none"
              title="Change Photo"
              aria-label="Change Profile Photo"
            >
              <Camera className="w-3.5 h-3.5 text-zinc-900" strokeWidth={2.4} />
            </button>
          )}
        </div>

        {/* User Details */}
        <h2 className="text-[20px] font-bold text-white mt-3 leading-tight text-center tracking-tight">
          {curName}
        </h2>
        <p className="text-[13px] text-[#D8B4E2] font-medium mt-0.5 text-center">
          @{curUsername}
        </p>
      </div>

      {/* ── 2. Bottom Light Sheet ── */}
      <div className="w-full flex-1 bg-white rounded-t-[36px] px-6 pt-5 pb-28 flex flex-col gap-5 relative shadow-[0_-12px_35px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar min-h-0 text-zinc-900">
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-1 mb-1 shrink-0" />

        {/* ── Followers & Following Round Capsules ── */}
        <div className="flex items-center justify-center gap-4 w-full">
          <div className="flex-1 py-4 px-6 rounded-full bg-zinc-50 border border-zinc-100 flex flex-col items-center justify-center shadow-xs">
            <span className="text-[22px] font-black text-zinc-900 leading-tight">
              {followerCount}
            </span>
            <span className="text-[12px] text-zinc-500 font-medium mt-0.5">Followers</span>
          </div>

          <div className="flex-1 py-4 px-6 rounded-full bg-zinc-50 border border-zinc-100 flex flex-col items-center justify-center shadow-xs">
            <span className="text-[22px] font-black text-zinc-900 leading-tight">
              {followingCount}
            </span>
            <span className="text-[12px] text-zinc-500 font-medium mt-0.5">Following</span>
          </div>
        </div>

        {/* ── Other User Actions (Follow & Message) ── */}
        {!isSelf && (
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={handleFollowToggle}
              disabled={isFollowLoading}
              className={`flex-1 py-3.5 px-4 rounded-full font-semibold text-[13.5px] flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer outline-none border-0 ${
                isFollowing
                  ? 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  : hasSentRequest
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Following</span>
                </>
              ) : hasSentRequest ? (
                <span>Requested</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Follow</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenChat?.(targetUser);
              }}
              className="flex-1 py-3.5 px-4 rounded-full bg-[#FFF3CD] hover:bg-[#ffeaa7] text-zinc-900 font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer outline-none border-0"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Message</span>
            </button>
          </div>
        )}

        {/* ── Log Out Button for Self ── */}
        {isSelf && (
          <div className="mt-auto mb-4">
            <button
              onClick={handleLogout}
              className="w-full py-3 px-6 rounded-full bg-rose-50/80 hover:bg-rose-100 text-rose-600 border border-rose-100/60 font-semibold text-[13px] flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99] outline-none"
              aria-label="Log Out of Account"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
              <span>Log Out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
