'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/components/ThemeProvider';
import { triggerHaptic } from '@/lib/haptics';
import { DeviceAccountStore, DeviceAccountMeta } from '@/lib/deviceAccountStore';
import {
  Bell,
  Camera,
  Sparkles,
  ShieldCheck,
  BellRing,
  FolderDown,
  Lock,
  Palette,
  ChevronRight,
  ChevronLeft,
  LogOut,
  User,
  Check,
  X,
  Moon,
  Sun,
  Share2,
  Edit3,
  UserPlus,
  UserCheck,
  MessageCircle,
  Users,
  Globe,
  Download,
  KeyRound,
} from 'lucide-react';
import {
  updateProfileDetails,
  updateProfileImageAction,
  toggleProfilePrivacy,
  toggleFollowUser,
  getOtherUserProfile,
} from '@/app/dashboard/actions';
import { optimizeImageClient } from '@/lib/media-optimizer';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
  session: any;
  fullUser: any;
  targetUser?: any;
  isDark: boolean;
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
  isClosing,
  onClose,
  session,
  fullUser,
  targetUser,
  isDark,
  onEditName,
  onInstall,
  refreshProfile,
  onToggleFollow,
  onOpenChat,
  onAccountSheetChange,
}: Props) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  // Active settings sub-modal: 'account' | 'editProfile' | 'followers' | 'following' | 'privacy' | null
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Name & Bio State
  const [editNameValue, setEditNameValue] = useState('');
  const [editBioValue, setEditBioValue] = useState('');
  const [editWebsiteValue, setEditWebsiteValue] = useState('');
  const [editUsernameValue, setEditUsernameValue] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Follow State for Other User
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasSentRequest, setHasSentRequest] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  // Live Followers & Following counts
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);

  // Saved accounts for Account & Security switcher
  const [savedAccounts, setSavedAccounts] = useState<DeviceAccountMeta[]>([]);

  const activeUserData = targetUser || fullUser;
  const isSelf = !targetUser || targetUser.id === (session?.user as any)?.id;

  const curEmail = (activeUserData?.email || session?.user?.email || '').toLowerCase().trim();
  const curUsername = activeUserData?.username || (session?.user as any)?.username || (curEmail ? curEmail.split('@')[0] : 'user');
  const curName = activeUserData?.name || session?.user?.name || 'User';
  const curImage = activeUserData?.image || session?.user?.image || '';
  const curBio = activeUserData?.bio || '';
  const curWebsite = activeUserData?.website || '';

  // Sync state on user change
  useEffect(() => {
    if (activeUserData) {
      setEditNameValue(activeUserData.name || '');
      setEditBioValue(activeUserData.bio || '');
      setEditWebsiteValue(activeUserData.website || '');
      setEditUsernameValue(activeUserData.username || '');

      const followers = activeUserData.followers || [];
      const following = activeUserData.following || [];
      setFollowersList(followers);
      setFollowingList(following);
      setFollowerCount(followers.length);
      setFollowingCount(following.length);

      if (!isSelf && session?.user) {
        const myId = (session.user as any)?.id;
        setIsFollowing(followers.some((f: any) => f.id === myId));
      }
    }
  }, [activeUserData, isSelf, session]);

  useEffect(() => {
    if (isOpen) {
      setSavedAccounts(DeviceAccountStore.getSavedAccounts());
    }
  }, [isOpen]);

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

  const handleSaveProfileDetails = async () => {
    if (!editNameValue.trim()) return;
    setIsSavingDetails(true);
    triggerHaptic('medium');
    try {
      const res = await updateProfileDetails({
        name: editNameValue.trim(),
        bio: editBioValue.trim(),
        website: editWebsiteValue.trim(),
        username: editUsernameValue.trim() || undefined,
      });
      if (res.success) {
        showToast('Profile updated!');
        setActiveModal(null);
        refreshProfile?.();
      } else {
        showToast(res.error || 'Failed to update profile');
      }
    } catch (err) {
      showToast('Failed to save profile');
    } finally {
      setIsSavingDetails(false);
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
              >
                <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
              </button>
            )}
            <h1 className="text-[24px] font-black text-white tracking-tight leading-tight">
              {isSelf ? 'Profile' : curName}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {isSelf && (
              <button
                onClick={() => setActiveModal('editProfile')}
                className="p-2 text-zinc-400 hover:text-white active:scale-95 transition-all cursor-pointer outline-none border-0 ring-0 bg-transparent"
                title="Edit Profile"
              >
                <Edit3 className="w-5 h-5 text-white" strokeWidth={2} />
              </button>
            )}
            <button
              onClick={() => showToast('No new notifications')}
              className="p-2 text-white hover:text-zinc-300 active:scale-95 transition-all cursor-pointer outline-none border-0 ring-0 bg-transparent relative"
              title="Notifications"
            >
              <Bell className="w-5 h-5 text-white" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Avatar Section */}
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

        {curBio && (
          <p className="text-[12.5px] text-zinc-400 mt-1.5 text-center max-w-xs leading-relaxed">
            {curBio}
          </p>
        )}

        {curWebsite && (
          <a
            href={curWebsite.startsWith('http') ? curWebsite : `https://${curWebsite}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11.5px] text-[#D8B4E2] hover:underline mt-1 font-medium"
          >
            <Globe className="w-3 h-3" />
            <span>{curWebsite.replace(/^https?:\/\//, '')}</span>
          </a>
        )}
      </div>

      {/* ── 2. Bottom Light Sheet ── */}
      <div className="w-full flex-1 bg-white rounded-t-[36px] px-6 pt-3 pb-32 flex flex-col gap-5 relative shadow-[0_-12px_35px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar min-h-0 text-zinc-900">
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto my-1.5 shrink-0" />

        {/* ── Followers & Following Stats Segmented Bar ── */}
        <div className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl p-3.5 flex items-center justify-around shadow-xs">
          <button
            onClick={() => setActiveModal('followers')}
            className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform"
          >
            <span className="text-[18px] font-black text-zinc-900 leading-tight">
              {followerCount}
            </span>
            <span className="text-[11.5px] text-zinc-500 font-medium">Followers</span>
          </button>

          <div className="w-[1px] h-8 bg-zinc-200" />

          <button
            onClick={() => setActiveModal('following')}
            className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform"
          >
            <span className="text-[18px] font-black text-zinc-900 leading-tight">
              {followingCount}
            </span>
            <span className="text-[11.5px] text-zinc-500 font-medium">Following</span>
          </button>
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex items-center gap-3">
          {isSelf ? (
            <>
              <button
                onClick={() => setActiveModal('editProfile')}
                className="flex-1 py-3 px-4 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-[13px] flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer outline-none border-0"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>

              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: curName,
                      text: `Connect with ${curName} on Connect!`,
                      url: window.location.href,
                    }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    showToast('Profile link copied!');
                  }
                }}
                className="py-3 px-4 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer outline-none border-0"
              >
                <Share2 className="w-4 h-4 text-zinc-700" />
                <span>Share</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFollowToggle}
                disabled={isFollowLoading}
                className={`flex-1 py-3 px-4 rounded-full font-semibold text-[13px] flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer outline-none border-0 ${
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
                className="flex-1 py-3 px-4 rounded-full bg-[#FFF3CD] hover:bg-[#ffeaa7] text-zinc-900 font-semibold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer outline-none border-0"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Message</span>
              </button>
            </>
          )}
        </div>

        {/* ── Settings & Preferences Group ── */}
        <div className="flex flex-col gap-2 mt-1">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider px-1">
            Preferences & Security
          </span>

          <div className="flex flex-col bg-zinc-50 border border-zinc-100 rounded-2xl overflow-hidden divide-y divide-zinc-100 shadow-xs">
            {/* 1. Account & Security */}
            <div
              onClick={() => setActiveModal('account')}
              className="flex items-center justify-between p-3.5 hover:bg-zinc-100/80 transition-colors cursor-pointer active:bg-zinc-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold text-zinc-900 leading-tight">
                    Account & Security
                  </p>
                  <p className="text-[11.5px] text-zinc-500 mt-0.5">Password, Accounts Switcher</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
            </div>

            {/* 2. Privacy & Activity */}
            <div
              onClick={() => setActiveModal('privacy')}
              className="flex items-center justify-between p-3.5 hover:bg-zinc-100/80 transition-colors cursor-pointer active:bg-zinc-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                  <Lock className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold text-zinc-900 leading-tight">
                    Privacy & Account
                  </p>
                  <p className="text-[11.5px] text-zinc-500 mt-0.5">Private Account, Activity</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
            </div>

            {/* 3. Appearance & Theme */}
            <div
              onClick={(e) => {
                toggleTheme(e);
                triggerHaptic('light');
                showToast(`Theme switched to ${theme === 'dark' ? 'Light' : 'Dark'}`);
              }}
              className="flex items-center justify-between p-3.5 hover:bg-zinc-100/80 transition-colors cursor-pointer active:bg-zinc-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                  <Palette className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold text-zinc-900 leading-tight">
                    Theme Mode
                  </p>
                  <p className="text-[11.5px] text-zinc-500 mt-0.5">
                    Currently: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
            </div>

            {/* 4. Download / Install PWA */}
            {onInstall && (
              <div
                onClick={onInstall}
                className="flex items-center justify-between p-3.5 hover:bg-zinc-100/80 transition-colors cursor-pointer active:bg-zinc-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                    <Download className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-[13.5px] font-semibold text-zinc-900 leading-tight">
                      Install App
                    </p>
                    <p className="text-[11.5px] text-zinc-500 mt-0.5">Add Connect to Home Screen</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
              </div>
            )}
          </div>
        </div>

        {/* Log Out Button */}
        {isSelf && (
          <div className="mt-2 mb-4">
            <button
              onClick={handleLogout}
              className="w-full py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.99] outline-none border-0"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
              <span>Log Out</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Sub-Modals ── */}

      {/* 1. Edit Profile Modal */}
      {activeModal === 'editProfile' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-[36px] sm:rounded-3xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto shadow-2xl text-zinc-900 animate-in slide-in-from-bottom duration-300">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-1 shrink-0 sm:hidden" />
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Edit Profile</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium focus:outline-none focus:border-zinc-900 text-zinc-900 bg-zinc-50"
                  placeholder="Your Name"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Username
                </label>
                <input
                  type="text"
                  value={editUsernameValue}
                  onChange={(e) => setEditUsernameValue(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium focus:outline-none focus:border-zinc-900 text-zinc-900 bg-zinc-50"
                  placeholder="username"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Bio / Status
                </label>
                <textarea
                  rows={2}
                  value={editBioValue}
                  onChange={(e) => setEditBioValue(e.target.value)}
                  placeholder="Tell people about yourself..."
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium focus:outline-none focus:border-zinc-900 text-zinc-900 bg-zinc-50 resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Website / Link
                </label>
                <input
                  type="url"
                  value={editWebsiteValue}
                  onChange={(e) => setEditWebsiteValue(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium focus:outline-none focus:border-zinc-900 text-zinc-900 bg-zinc-50"
                  placeholder="https://yourwebsite.com"
                />
              </div>

              <div className="pt-2">
                <button
                  disabled={isSavingDetails}
                  onClick={handleSaveProfileDetails}
                  className="w-full py-3 bg-zinc-900 text-white text-sm font-semibold rounded-full hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSavingDetails ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Followers List Modal */}
      {activeModal === 'followers' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-[36px] sm:rounded-3xl p-6 flex flex-col gap-3 max-h-[80vh] overflow-y-auto shadow-2xl text-zinc-900 animate-in slide-in-from-bottom duration-300">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-1 shrink-0 sm:hidden" />
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Followers ({followersList.length})</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 pt-1 overflow-y-auto max-h-[55vh] no-scrollbar">
              {followersList.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400 font-medium">
                  No followers yet
                </div>
              ) : (
                followersList.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[#FFF3CD] flex items-center justify-center font-bold text-xs text-zinc-900">
                        {user.image ? (
                          <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>{(user.name || 'U').charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{user.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">@{user.username || 'user'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setActiveModal(null);
                        onClose();
                        onOpenChat?.(user);
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition-all cursor-pointer outline-none border-0"
                    >
                      Message
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Following List Modal */}
      {activeModal === 'following' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-[36px] sm:rounded-3xl p-6 flex flex-col gap-3 max-h-[80vh] overflow-y-auto shadow-2xl text-zinc-900 animate-in slide-in-from-bottom duration-300">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-1 shrink-0 sm:hidden" />
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Following ({followingList.length})</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 pt-1 overflow-y-auto max-h-[55vh] no-scrollbar">
              {followingList.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400 font-medium">
                  Not following anyone yet
                </div>
              ) : (
                followingList.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[#FFF3CD] flex items-center justify-center font-bold text-xs text-zinc-900">
                        {user.image ? (
                          <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>{(user.name || 'U').charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{user.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">@{user.username || 'user'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setActiveModal(null);
                        onClose();
                        onOpenChat?.(user);
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition-all cursor-pointer outline-none border-0"
                    >
                      Message
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Account & Security Modal */}
      {activeModal === 'account' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-[36px] sm:rounded-3xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto shadow-2xl text-zinc-900 animate-in slide-in-from-bottom duration-300">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-1 shrink-0 sm:hidden" />
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Account & Security</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-100">
                <p className="text-xs font-semibold text-zinc-500">Registered Email</p>
                <p className="text-sm font-bold text-zinc-900 mt-0.5">{curEmail}</p>
              </div>

              <div
                onClick={() => {
                  setActiveModal(null);
                  router.push('/security');
                }}
                className="p-3.5 bg-zinc-50 hover:bg-zinc-100/80 rounded-2xl border border-zinc-100 flex items-center justify-between cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-sm font-bold text-zinc-900">Change Password</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Manage credentials & 2FA</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </div>

              {/* Saved Device Accounts Switcher */}
              {savedAccounts.length > 1 && (
                <div className="pt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Switch Connected Account
                  </p>
                  <div className="space-y-1.5">
                    {savedAccounts.map((acc) => (
                      <div
                        key={acc.userId}
                        onClick={async () => {
                          await DeviceAccountStore.setCurrentAccountId(acc.userId);
                          window.location.reload();
                        }}
                        className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                          acc.userId === (session?.user as any)?.id
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-100 text-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-200 flex items-center justify-center font-bold text-xs text-zinc-800">
                            {acc.profilePicture ? (
                              <img src={acc.profilePicture} alt={acc.displayName || acc.username} className="w-full h-full object-cover" />
                            ) : (
                              <span>{((acc.displayName || acc.username) || 'U').charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold truncate">{acc.displayName || acc.username}</p>
                            <p className="text-[10px] opacity-70 truncate">{acc.email}</p>
                          </div>
                        </div>
                        {acc.userId === (session?.user as any)?.id && (
                          <span className="text-xs font-bold pr-1">Active</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Privacy Settings Modal */}
      {activeModal === 'privacy' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-[36px] sm:rounded-3xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto shadow-2xl text-zinc-900 animate-in slide-in-from-bottom duration-300">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-1 shrink-0 sm:hidden" />
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Privacy Settings</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div
                onClick={async () => {
                  triggerHaptic('medium');
                  const currentPrivate = !!(fullUser as any)?.isPrivate;
                  const res = await toggleProfilePrivacy(!currentPrivate);
                  if (res.success) {
                    showToast(`Account is now ${!currentPrivate ? 'Private' : 'Public'}`);
                    refreshProfile?.();
                  }
                }}
                className="p-3.5 bg-zinc-50 hover:bg-zinc-100/80 rounded-2xl border border-zinc-100 flex items-center justify-between cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-sm font-bold text-zinc-900">Private Account</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Only approved followers can view your stories & posts</p>
                </div>
                <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center">
                  <Lock className="w-3.5 h-3.5 text-zinc-700" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
