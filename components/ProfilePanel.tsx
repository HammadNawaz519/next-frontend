'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { triggerHaptic } from '@/lib/haptics';
import {
  Camera,
  ChevronLeft,
  LogOut,
  Trash2,
  Check,
  Edit3,
  UserPlus,
  UserCheck,
  MessageCircle,
  Users,
  Heart,
  Calendar,
  Copy,
  Share2
} from 'lucide-react';
import {
  updateProfileImageAction,
  updateProfileDetails,
  toggleFollowUser,
  deleteAccountAction,
  getUserPublicProfile,
} from '@/app/dashboard/actions';
import { renderApiClient } from '@/lib/render-api-client';
import { optimizeImageClient } from '@/lib/media-optimizer';
import { DeviceAccountStore } from '@/lib/deviceAccountStore';

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
  onEditingChange?: (editing: boolean) => void;
  onAccountSheetChange?: (isOpen: boolean) => void;
  onOpenUpload?: (type: 'single_image' | 'reel') => void;
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

function generateEmojiAvatarDataUrl(emoji: string, bgColor: string): string {
  if (typeof document === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = '120px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 128, 136);
    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

function getPastelForUser(userIdOrName?: string) {
  if (!userIdOrName) return PASTEL_PALETTES[0];
  const sum = String(userIdOrName).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PASTEL_PALETTES[Math.abs(sum) % PASTEL_PALETTES.length];
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
  onEditingChange,
}: Props) {
  const { update: updateSession } = useSession();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [websiteInput, setWebsiteInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Followers / Following list view tab ('followers' | 'following' | null)
  const [listTab, setListTab] = useState<'followers' | 'following' | null>(null);

  // Follow State for Other User
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasSentRequest, setHasSentRequest] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  // Live Counts
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);

  // Feedback states
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const activeUserData = targetUser || fullUser;
  const isSelf = !targetUser || targetUser.id === (session?.user as any)?.id;

  const curEmail = (activeUserData?.email || session?.user?.email || '').toLowerCase().trim();
  const curUsername = activeUserData?.username || (session?.user as any)?.username || 'User';
  const [localUsername, setLocalUsername] = useState(curUsername);
  const [localImage, setLocalImage] = useState<string | null | undefined>(undefined);
  const curImage = localImage !== undefined ? (localImage || '') : (activeUserData?.image || session?.user?.image || '');

  const [selectedEmojiIdx, setSelectedEmojiIdx] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user_random_emoji_idx');
      if (saved !== null && !isNaN(Number(saved))) {
        setSelectedEmojiIdx(Number(saved));
      }
    }
  }, []);

  const followersList: any[] = activeUserData?.followers || [];
  const followingList: any[] = activeUserData?.following || [];

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Sync counts and details on mount or user change
  useEffect(() => {
    if (activeUserData) {
      setLocalImage(undefined);
      const followers = activeUserData.followers || [];
      const following = activeUserData.following || [];
      setFollowerCount(followers.length);
      setFollowingCount(following.length);

      const initialLikes =
        activeUserData?.stats?.likes ??
        activeUserData?.likesCount ??
        activeUserData?._count?.profileLikesReceived ??
        0;
      setLikesCount(initialLikes);

      const resolvedUsername = activeUserData?.username || (session?.user as any)?.username || 'User';
      setLocalUsername(resolvedUsername);
      setUsernameInput(resolvedUsername);
      setBioInput(activeUserData.bio || '');
      setWebsiteInput(activeUserData.website || '');

      if (!isSelf && session?.user) {
        const myId = (session.user as any)?.id;
        setIsFollowing(followers.some((f: any) => f.id === myId));
      }
    }
  }, [activeUserData, isSelf, session, curEmail]);

  // Fetch authoritative stats including Likes received from database
  useEffect(() => {
    let isMounted = true;
    const lookupTarget = activeUserData?.id || activeUserData?.email || session?.user?.email;
    if (!lookupTarget) return;

    getUserPublicProfile(lookupTarget)
      .then((data) => {
        if (isMounted && data) {
          if (data.stats?.likes !== undefined) {
            setLikesCount(data.stats.likes);
          }
          if (data.stats?.followers !== undefined) {
            setFollowerCount(data.stats.followers);
          }
          if (data.stats?.following !== undefined) {
            setFollowingCount(data.stats.following);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [activeUserData?.id, activeUserData?.email, session?.user?.email]);

  // Real-time socket & window listeners for profile likes
  useEffect(() => {
    const handleProfileLiked = (data: any) => {
      if (!data) return;
      const targetId = data.targetUserId;
      const targetEmail = data.targetEmail;
      const myId = activeUserData?.id || (session?.user as any)?.id;
      const myEmail = activeUserData?.email || session?.user?.email;

      if ((myId && String(targetId) === String(myId)) || (myEmail && targetEmail === myEmail)) {
        if (typeof data.count === 'number') {
          setLikesCount(data.count);
        }
      }
    };

    const handleWindowLiked = (e: any) => {
      handleProfileLiked(e.detail);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('profile_liked', handleWindowLiked);
      window.addEventListener('profile_liked_notification', handleWindowLiked);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile_liked', handleWindowLiked);
        window.removeEventListener('profile_liked_notification', handleWindowLiked);
      }
    };
  }, [activeUserData?.id, activeUserData?.email, session?.user]);

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
          setLocalImage(res.image || base64);
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

  const handleRemoveAvatar = async () => {
    triggerHaptic('medium');
    setIsUploadingAvatar(true);

    const fallbackIndex = Math.abs(String(activeUserData?.id || displayName).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % PASTEL_PALETTES.length;
    const currentIdx = selectedEmojiIdx !== null ? selectedEmojiIdx : fallbackIndex;

    let nextIdx = Math.floor(Math.random() * PASTEL_PALETTES.length);
    if (nextIdx === currentIdx) {
      nextIdx = (currentIdx + 1) % PASTEL_PALETTES.length;
    }

    setSelectedEmojiIdx(nextIdx);
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_random_emoji_idx', String(nextIdx));
    }

    const nextPalette = PASTEL_PALETTES[nextIdx];
    const generatedDataUrl = generateEmojiAvatarDataUrl(nextPalette.emoji, nextPalette.bg);

    setLocalImage(generatedDataUrl || '');
    try {
      const myId = (session?.user as any)?.id || (session?.user?.email ? (session.user.email as string).toLowerCase().trim() : '');
      const myEmail = session?.user?.email ? (session.user.email as string).toLowerCase().trim() : undefined;

      const res = await updateProfileImageAction(generatedDataUrl || '');
      const finalImage = res?.image || generatedDataUrl || '';
      try {
        await renderApiClient.updateProfile({ image: finalImage }, myId, myEmail);
      } catch (err) {}

      if (session?.user) {
        (session.user as any).image = finalImage;
        updateSession({ image: finalImage }).catch(() => {});
      }
      if (fullUser) {
        fullUser.image = finalImage;
      }

      if (typeof window !== 'undefined') {
        if (myId) {
          const cached = localStorage.getItem(`cached_profile_details_${myId}`);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              parsed.image = finalImage;
              localStorage.setItem(`cached_profile_details_${myId}`, JSON.stringify(parsed));
            } catch (e) {}
          }
        }
        window.dispatchEvent(new CustomEvent('user_profile_updated', {
          detail: { userId: myId, email: myEmail, username: localUsername || curUsername, image: finalImage }
        }));
      }
      refreshProfile?.();
      showToast(`Avatar changed to ${nextPalette.emoji}`);
    } catch (err) {
      console.error('Error removing/randomizing avatar:', err);
      showToast('Failed to change emoji avatar');
    } finally {
      setIsUploadingAvatar(false);
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

  const handleSaveProfile = async () => {
    const cleaned = usernameInput.trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
    if (!cleaned || cleaned.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return;
    }
    if (cleaned.length > 30) {
      setUsernameError('Username cannot exceed 30 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleaned)) {
      setUsernameError('Username can only contain letters, numbers, and underscores');
      return;
    }

    triggerHaptic('medium');
    setIsSavingUsername(true);
    setUsernameError(null);

    try {
      const myId = (session?.user as any)?.id || (session?.user?.email ? (session.user.email as string).toLowerCase().trim() : '');
      const myEmail = session?.user?.email ? (session.user.email as string).toLowerCase().trim() : undefined;
      const profileData = {
        username: cleaned,
        bio: bioInput.trim().slice(0, 150),
        website: websiteInput.trim().slice(0, 100),
      };

      let res: any;
      try {
        res = await renderApiClient.updateProfile(profileData, myId, myEmail);
      } catch (err) {
        res = await updateProfileDetails(profileData);
      }

      if (res.error) {
        setUsernameError(res.error);
        showToast(res.error);
      } else {
        setLocalUsername(cleaned);
        setIsEditing(false);
        onEditingChange?.(false);
        showToast('Profile updated successfully!');

        const updatedUserId = res.user?.id || (session?.user as any)?.id || (session?.user?.email ? (session.user.email as string).toLowerCase().trim() : '');

        try {
          if (updatedUserId) {
            const cached = localStorage.getItem(`cached_profile_details_${updatedUserId}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.username = cleaned;
              parsed.bio = bioInput;
              parsed.website = websiteInput;
              localStorage.setItem(`cached_profile_details_${updatedUserId}`, JSON.stringify(parsed));
            }
          }
          const currentMeta = DeviceAccountStore.getCurrentAccount();
          if (currentMeta) {
            DeviceAccountStore.addOrUpdateAccount({
              ...currentMeta,
              username: cleaned,
            }, false).catch(() => {});
          }
        } catch (e) {}

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('user_profile_updated', {
            detail: {
              userId: updatedUserId,
              username: cleaned,
              bio: bioInput,
              website: websiteInput,
            }
          }));
        }

        refreshProfile?.();
      }
    } catch (err: any) {
      console.error(err);
      setUsernameError('Failed to save profile');
      showToast('Failed to save profile');
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleCopyHandle = async () => {
    triggerHaptic('light');
    const handleText = `@${localUsername || curUsername}`;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(handleText);
        setCopiedHandle(true);
        setTimeout(() => setCopiedHandle(false), 2000);
        showToast(`Copied ${handleText}`);
      } catch {}
    }
  };

  const handleShareProfile = async () => {
    triggerHaptic('light');
    const profileUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/@${localUsername || curUsername}`
      : '';
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(profileUrl);
        showToast('🔗 Profile link copied to clipboard!');
      } catch {
        showToast('Profile link ready to share');
      }
    }
  };

  const handleLogout = () => {
    triggerHaptic('light');
    try {
      localStorage.removeItem('has_active_session');
      localStorage.removeItem('last_logged_user');
      localStorage.removeItem('social_messages_cache');
      localStorage.removeItem('social_contacts_cache');
      localStorage.removeItem('da_current_id');
      localStorage.setItem('user_logged_out', 'true');
    } catch (e) {}
    signOut({ callbackUrl: '/accounts' });
  };

  const handleDeleteAccount = async () => {
    triggerHaptic('heavy');
    setIsDeletingAccount(true);
    try {
      const res = await deleteAccountAction();
      if (res && res.error) {
        showToast(res.error || 'Failed to delete account');
        setIsDeletingAccount(false);
        setShowDeleteConfirm(false);
        return;
      }

      const myId = (session?.user as any)?.id;
      const myEmail = session?.user?.email;
      if (myId) {
        await DeviceAccountStore.removeAccount(myId).catch(() => {});
      }
      if (myEmail) {
        await DeviceAccountStore.removeAccount(myEmail).catch(() => {});
      }

      try {
        localStorage.removeItem('has_active_session');
        localStorage.removeItem('last_logged_user');
        localStorage.removeItem('cached_profile_details');
        localStorage.removeItem('cached_user_meta');
        localStorage.removeItem('social_messages_cache');
        localStorage.removeItem('social_contacts_cache');
        localStorage.removeItem('social_users_cache');
        localStorage.removeItem('social_requests_cache');
        localStorage.removeItem('connected_accounts');
        localStorage.removeItem('da_current_id');
        localStorage.setItem('user_logged_out', 'true');
      } catch (e) {}

      signOut({ callbackUrl: '/accounts' });
    } catch (err: any) {
      console.error('Delete account error:', err);
      showToast('Failed to delete account');
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  const displayName = isSelf ? (localUsername || curUsername) : (activeUserData?.username || curUsername);
  const fallbackIndex = Math.abs(String(activeUserData?.id || displayName).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % PASTEL_PALETTES.length;
  const activeEmojiIndex = selectedEmojiIdx !== null ? selectedEmojiIdx : fallbackIndex;
  const pastel = PASTEL_PALETTES[activeEmojiIndex % PASTEL_PALETTES.length];

  return (
    <div
      data-profile-open="true"
      className="fixed inset-0 z-30 h-screen w-full flex flex-col bg-[#141111] overflow-hidden font-sans select-none animate-in fade-in duration-200"
    >
      {/* Hidden File Input for Avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFileChange}
      />

      {/* ── 1. DARK TOP HEADER BAR (Exact Chat UI Alignment) ── */}
      <div className="w-full bg-[#141111] pt-12 pb-3 px-5 flex items-center justify-between shrink-0 select-none z-10 m-0 border-none">
        {/* Left: Frameless Back Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-95 transition-all flex-shrink-0 cursor-pointer outline-none border-0 ring-0 bg-transparent"
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
        </button>

        {/* Center: Spacer for Alignment */}
        <div className="flex-1" />

        {/* Right: Actions (Save in edit mode, Share & Edit in view mode) */}
        <div className="flex items-center gap-1">
          {isSelf && isEditing ? (
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSavingUsername}
              className="px-3 py-1 rounded-full bg-white text-zinc-900 font-bold text-xs hover:bg-zinc-200 active:scale-95 transition-all cursor-pointer border-0 outline-none"
            >
              {isSavingUsername ? 'Saving...' : 'Save'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleShareProfile}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 transition-all cursor-pointer border-0 outline-none bg-transparent"
                title="Share Profile"
              >
                <Share2 className="w-5 h-5 text-white" strokeWidth={2.2} />
              </button>

              {isSelf && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setListTab(null);
                    setUsernameInput(localUsername || curUsername);
                    setBioInput(activeUserData?.bio || '');
                    setWebsiteInput(activeUserData?.website || '');
                    setUsernameError(null);
                    setIsEditing(true);
                    onEditingChange?.(true);
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-zinc-300 hover:bg-white/5 active:scale-90 transition-all cursor-pointer border-0 outline-none bg-transparent"
                  title="Edit Profile"
                >
                  <Edit3 className="w-5 h-5 text-white" strokeWidth={2.2} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 2. CURVED WHITE SHEET (All Content & DP in White Area) ── */}
      <div className="w-full flex-1 bg-white rounded-t-[32px] sm:rounded-t-[36px] px-5 pt-3.5 pb-36 sm:pb-40 flex flex-col gap-3.5 text-zinc-900 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar relative min-h-0">
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-1 mb-0.5 shrink-0" />

        {isEditing ? (
          /* ── EDIT MODE INSIDE WHITE AREA ── */
          <div className="w-full flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-lg font-black text-zinc-900 tracking-tight">Edit Profile</h3>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsEditing(false);
                  onEditingChange?.(false);
                  setUsernameError(null);
                }}
                className="text-xs font-bold text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer border-0 bg-transparent"
              >
                Cancel
              </button>
            </div>

            {/* Avatar changer */}
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="relative">
                <div
                  className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-4xl shadow-md border-4 border-white"
                  style={{ backgroundColor: pastel.bg, color: pastel.text }}
                >
                  {curImage ? (
                    <img src={curImage} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl select-none leading-none">{pastel.emoji}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#141111] hover:bg-zinc-800 text-white flex items-center justify-center shadow-md border-2 border-white cursor-pointer active:scale-90 transition-all outline-none"
                  title="Upload Photo"
                >
                  <Camera className="w-3.5 h-3.5 text-white" strokeWidth={2.4} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 active:scale-95 text-purple-700 text-xs font-bold transition-all cursor-pointer border-0"
                >
                  Change Photo
                </button>
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar}
                  className="px-3.5 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 text-xs font-bold transition-all cursor-pointer border-0 disabled:opacity-50"
                  title="Roll random emoji avatar"
                >
                  {isUploadingAvatar ? 'Updating...' : (curImage && !curImage.startsWith('data:image/png') ? 'Remove Profile Pic' : 'Random Emoji')}
                </button>
              </div>
            </div>

            {/* Username Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => {
                  setUsernameInput(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9_]/g, ''));
                  setUsernameError(null);
                }}
                placeholder="Enter username"
                className="w-full px-4 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 focus:border-zinc-900 outline-none text-[15px] font-semibold text-zinc-900 transition-all"
              />
              {usernameError && (
                <span className="text-xs font-semibold text-rose-500 mt-0.5">{usernameError}</span>
              )}
            </div>

            {/* Bio Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider">
                  Bio
                </label>
                <span className="text-[11px] font-medium text-zinc-400">{bioInput.length}/150</span>
              </div>
              <textarea
                value={bioInput}
                onChange={(e) => setBioInput(e.target.value.slice(0, 150))}
                placeholder="Tell others a little about yourself"
                rows={3}
                className="w-full resize-none px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200 focus:border-zinc-900 outline-none text-[15px] font-medium text-zinc-900 transition-all placeholder:text-zinc-400"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingUsername}
                className="flex-1 py-3.5 px-6 rounded-full bg-[#141111] hover:bg-zinc-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm border-0"
              >
                {isSavingUsername ? 'Saving...' : 'Save Profile'}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsEditing(false);
                  onEditingChange?.(false);
                  setUsernameError(null);
                }}
                className="py-3.5 px-6 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-sm transition-all cursor-pointer active:scale-95 border-0"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : listTab !== null ? (
          /* ── FOLLOWERS / FOLLOWING SUB-VIEW ── */
          <div className="w-full flex flex-col gap-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setListTab(null);
                  }}
                  className="p-1.5 -ml-1.5 text-zinc-800 hover:text-zinc-600 active:scale-95 transition-all cursor-pointer border-0 bg-transparent"
                  title="Back to profile"
                >
                  <ChevronLeft className="w-5 h-5 text-zinc-800" strokeWidth={2.4} />
                </button>
                <h3 className="text-[17px] font-bold text-zinc-900 tracking-tight">
                  {listTab === 'followers' ? 'Followers' : 'Following'}
                </h3>
              </div>

              <span className="text-xs font-bold text-zinc-400">
                {listTab === 'followers' ? followerCount : followingCount}
              </span>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto no-scrollbar">
              {(listTab === 'followers' ? followersList : followingList).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400">
                  <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mb-2.5">
                    <Users className="w-6 h-6 text-zinc-300" />
                  </div>
                  <span className="text-[14px] font-bold text-zinc-700">
                    {listTab === 'followers' ? 'No Followers Yet' : 'Not Following Anyone'}
                  </span>
                  <span className="text-xs text-zinc-400 mt-0.5">
                    {listTab === 'followers' ? 'When users follow you, they will appear here.' : 'Users you follow will appear here.'}
                  </span>
                </div>
              ) : (
                (listTab === 'followers' ? followersList : followingList).map((userItem: any) => {
                  const itemUsername = userItem.username || userItem.name || 'User';
                  const itemName = userItem.name || itemUsername;
                  const itemPastel = getPastelForUser(userItem.id || itemUsername);

                  return (
                    <div
                      key={userItem.id || itemUsername}
                      onClick={() => {
                        triggerHaptic('light');
                        onClose();
                        onOpenChat?.(userItem);
                      }}
                      className="w-full p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 active:scale-[0.99] border border-zinc-100 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-800 text-sm font-bold shrink-0 shadow-xs overflow-hidden"
                          style={{ backgroundColor: itemPastel.bg, color: itemPastel.text }}
                        >
                          {userItem.image ? (
                            <img src={userItem.image} alt={itemName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base select-none leading-none">{itemPastel.emoji}</span>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span className="text-[14.5px] font-bold text-zinc-900 truncate">
                            {itemUsername}
                          </span>
                          {itemName !== itemUsername && (
                            <span className="text-xs text-zinc-400 truncate font-medium">
                              {itemName}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                          onClose();
                          onOpenChat?.(userItem);
                        }}
                        className="px-3.5 py-1.5 rounded-full bg-[#141111] hover:bg-zinc-800 text-white text-xs font-bold transition-all active:scale-95 shrink-0 border-0 cursor-pointer"
                      >
                        Message
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ── NORMAL PROFILE VIEW INSIDE WHITE AREA ── */
          <>
            {/* Profile Hero: Avatar with Camera button, Display Name, Handle & Bio */}
            <div className="flex flex-col items-center text-center pt-1">
              <div className="relative">
                <div
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center text-4xl sm:text-5xl font-black text-zinc-900 shadow-[0_12px_28px_rgba(0,0,0,0.12)] border-4 border-white relative z-10"
                  style={{ backgroundColor: pastel.bg, color: pastel.text }}
                >
                  {curImage ? (
                    <img
                      src={curImage}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-4xl sm:text-5xl select-none leading-none">{pastel.emoji}</span>
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full z-20">
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Camera upload badge for own profile */}
                {isSelf && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 z-20 w-8 h-8 rounded-full bg-[#141111] hover:bg-zinc-800 text-white flex items-center justify-center shadow-md border-2 border-white cursor-pointer active:scale-90 transition-all outline-none"
                    title="Change Profile Photo"
                    aria-label="Change Profile Photo"
                  >
                    <Camera className="w-3.5 h-3.5 text-white" strokeWidth={2.4} />
                  </button>
                )}
              </div>

              {/* Display Name */}
              <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight mt-2.5">
                {displayName}
              </h2>

              {/* Copyable @username pill */}
              <button
                type="button"
                onClick={handleCopyHandle}
                className="inline-flex items-center gap-1 mt-1 px-3 py-0.5 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold tracking-wide transition-all cursor-pointer border-0 outline-none active:scale-95"
                title="Copy username"
              >
                <span>@{displayName}</span>
                {copiedHandle ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3 text-purple-500 opacity-60" />
                )}
              </button>

              {/* Bio */}
              {activeUserData?.bio ? (
                <p className="text-sm text-zinc-600 font-normal max-w-sm mt-2 leading-relaxed px-3">
                  {activeUserData.bio}
                </p>
              ) : isSelf ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setIsEditing(true);
                    onEditingChange?.(true);
                  }}
                  className="text-xs text-purple-600 hover:text-purple-700 font-semibold mt-1.5 underline cursor-pointer border-0 bg-transparent"
                >
                  + Add a bio
                </button>
              ) : null}
            </div>

            {/* ── 3-COLUMN STATISTICS ROW (Likes, Followers, Following) ── */}
            <div className="w-full bg-zinc-50 border border-zinc-100 rounded-[22px] py-3 px-4 flex items-center justify-around text-center shadow-2xs mt-3">
              {/* Column 1: Likes (Prominently displayed) */}
              <div className="flex-1 flex flex-col items-center">
                <div className="flex items-center gap-1.5 text-lg font-black text-zinc-900 tracking-tight">
                  <Heart className="w-4.5 h-4.5 fill-rose-500 text-rose-500 shrink-0" />
                  <span className="tabular-nums">
                    {likesCount > 999 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                  Likes
                </span>
              </div>

              <div className="w-px h-7 bg-zinc-200" />

              {/* Column 2: Followers (Clickable) */}
              <div
                onClick={() => {
                  triggerHaptic('light');
                  setListTab('followers');
                }}
                className="flex-1 flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className="text-lg font-black text-zinc-900 tracking-tight tabular-nums">
                  {followerCount > 999 ? `${(followerCount / 1000).toFixed(1)}k` : followerCount}
                </span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                  Followers
                </span>
              </div>

              <div className="w-px h-7 bg-zinc-200" />

              {/* Column 3: Following (Clickable) */}
              <div
                onClick={() => {
                  triggerHaptic('light');
                  setListTab('following');
                }}
                className="flex-1 flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className="text-lg font-black text-zinc-900 tracking-tight tabular-nums">
                  {followingCount > 999 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}
                </span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                  Following
                </span>
              </div>
            </div>

            {/* Follow / Message action for other user viewed via ProfilePanel */}
            {!isSelf && (
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={isFollowLoading}
                  className={`flex-1 py-3.5 px-6 rounded-full font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer outline-none border-0 ${
                    isFollowing
                      ? 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                      : hasSentRequest
                      ? 'bg-zinc-100 text-zinc-500'
                      : 'bg-[#9D4EDD] hover:bg-[#8A38CC] text-white shadow-[0_6px_20px_rgba(157,78,221,0.3)]'
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4 text-emerald-600" />
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
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenChat?.(targetUser);
                  }}
                  className="flex-1 py-3.5 px-4 rounded-full bg-[#141111] hover:bg-zinc-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer outline-none border-0"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Message</span>
                </button>
              </div>
            )}

            {/* ── ABOUT & DETAILS SECTION ── */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                About & Account Details
              </span>
              <div className="bg-zinc-50 border border-zinc-100 rounded-[20px] p-3.5 flex flex-col gap-2.5 text-sm divide-y divide-zinc-100/80 shadow-2xs">
                {/* Username */}
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-500">Username</span>
                  <span className="font-bold text-zinc-800">@{displayName}</span>
                </div>

                {/* Email (Without verified badge) */}
                {curEmail && (
                  <div className="flex items-center justify-between pt-2.5">
                    <span className="font-medium text-zinc-500">Email Address</span>
                    <span className="font-semibold text-zinc-800 truncate max-w-[200px]">
                      {curEmail}
                    </span>
                  </div>
                )}

                {/* Member Since */}
                <div className="flex items-center justify-between pt-2.5">
                  <span className="font-medium text-zinc-500">Member Since</span>
                  <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {activeUserData?.createdAt
                        ? new Date(activeUserData.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            year: 'numeric'
                          })
                        : 'Connect Member'}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* ── ACCOUNT ACTIONS (Both Dark Like Logout, Stacked Full Width) ── */}
            {isSelf && (
              <div className="flex flex-col gap-2 mt-0.5 pt-1">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                  Account Actions
                </span>

                {/* Sleek Dark Log Out Button */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-3.5 px-6 rounded-full bg-[#141111] hover:bg-zinc-800 active:bg-zinc-900 text-white font-bold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.98] shadow-sm border-0"
                  aria-label="Log Out of Account"
                >
                  <LogOut className="w-4 h-4" strokeWidth={2.2} />
                  <span>Log Out</span>
                </button>

                {/* Sleek Dark Delete Account Button (Styled exactly like Logout button) */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full py-3.5 px-6 rounded-full bg-[#141111] hover:bg-zinc-800 active:bg-zinc-900 text-white font-bold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.98] shadow-sm border-0"
                  aria-label="Delete Account"
                >
                  <Trash2 className="w-4 h-4 text-white" strokeWidth={2.2} />
                  <span>Delete Account</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs rounded-3xl bg-white text-zinc-900 p-6 text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6" strokeWidth={2} />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-zinc-900">Delete Account?</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                This will permanently delete your account, username, messages, media, and all profile data from the database. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-full bg-zinc-100 text-xs font-bold text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer outline-none border-0"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={handleDeleteAccount}
                className="flex-1 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition-colors cursor-pointer outline-none shadow-xs flex items-center justify-center gap-1.5 border-0"
              >
                {isDeletingAccount ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
