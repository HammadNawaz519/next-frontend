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
  Globe,
  X,
  Loader2,
} from 'lucide-react';
import {
  updateProfileDetails,
  updateProfileImageAction,
  toggleFollowUser,
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
  refreshProfile,
  onToggleFollow,
  onOpenChat,
}: Props) {
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

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
  const curBio = activeUserData?.bio || '';
  const curWebsite = activeUserData?.website || '';

  // Sync state on user change
  useEffect(() => {
    if (activeUserData) {
      setEditName(activeUserData.name || session?.user?.name || '');
      setEditUsername(activeUserData.username || (session?.user as any)?.username || '');
      setEditBio(activeUserData.bio || '');
      setEditWebsite(activeUserData.website || '');

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

  const handleOpenEdit = () => {
    triggerHaptic('light');
    setEditName(curName);
    setEditUsername(curUsername.replace(/^@+/, ''));
    setEditBio(curBio);
    setEditWebsite(curWebsite);
    setEditError('');
    setIsEditing(true);
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = editName.trim();
    const cleanUsername = editUsername.trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');

    if (!cleanName || cleanName.length < 2) {
      setEditError('Display name must be at least 2 characters');
      return;
    }
    if (cleanName.length > 50) {
      setEditError('Display name cannot exceed 50 characters');
      return;
    }

    if (cleanUsername) {
      if (cleanUsername.length < 3) {
        setEditError('Username must be at least 3 characters');
        return;
      }
      if (cleanUsername.length > 30) {
        setEditError('Username cannot exceed 30 characters');
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        setEditError('Username can only contain letters, numbers, and underscores');
        return;
      }
    }

    setEditError('');
    setIsSaving(true);
    triggerHaptic('medium');

    try {
      const res = await updateProfileDetails({
        name: cleanName,
        username: cleanUsername || undefined,
        bio: editBio.trim(),
        website: editWebsite.trim(),
      });

      if (res.success) {
        showToast('Profile updated!');
        setIsEditing(false);
        refreshProfile?.();
      } else {
        setEditError(res.error || 'Failed to update profile');
      }
    } catch (err: any) {
      setEditError(err?.message || 'Server error saving profile');
    } finally {
      setIsSaving(false);
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

          {/* Right side: Clickable Edit Profile Button for Own Profile */}
          <div className="flex items-center">
            {isSelf && (
              <button
                onClick={handleOpenEdit}
                className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer outline-none border-0 flex items-center justify-center"
                aria-label="Edit Profile"
                title="Edit Profile"
              >
                <Edit3 className="w-5 h-5 text-white" strokeWidth={2} />
              </button>
            )}
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
      <div className="w-full flex-1 bg-white rounded-t-[36px] px-6 pt-5 pb-28 flex flex-col gap-5 relative shadow-[0_-12px_35px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar min-h-0 text-zinc-900">
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-1 mb-1 shrink-0" />

        {/* ── Followers & Following Capsules ── */}
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

        {/* ── Own Profile Actions ── */}
        {isSelf && (
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={handleOpenEdit}
              className="w-full py-3.5 px-6 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-[13.5px] flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98] cursor-pointer outline-none border-0"
              aria-label="Edit Profile Details"
            >
              <Edit3 className="w-4 h-4 text-white" />
              <span>Edit Profile</span>
            </button>
          </div>
        )}

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

        {/* ── Refined Log Out Button for Self ── */}
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

      {/* ── 3. Edit Profile Bottom Sheet (Mobile-Native Modal) ── */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200 select-none">
          <div
            className="w-full max-w-md bg-white rounded-t-[36px] sm:rounded-[32px] p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl text-zinc-900 animate-in slide-in-from-bottom duration-300"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-1 mb-1 shrink-0 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h2 id="edit-profile-title" className="text-[17px] font-bold text-zinc-900 tracking-tight">
                Edit Profile
              </h2>
              <button
                onClick={() => setIsEditing(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer outline-none border-0"
                aria-label="Close Edit Profile"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Avatar Preview & Quick Change */}
            <div className="flex flex-col items-center justify-center my-1 gap-2">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-100 ring-2 ring-zinc-200 flex items-center justify-center shadow-sm">
                  {curImage ? (
                    <img src={curImage} alt={curName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-black text-zinc-800">{curName.charAt(0)}</span>
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-zinc-800 active:scale-90 transition-all border-2 border-white"
                  title="Change Photo"
                  aria-label="Change Avatar Photo"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[12.5px] font-semibold text-zinc-600 hover:text-zinc-900 cursor-pointer outline-none transition-colors"
              >
                Change profile photo
              </button>
            </div>

            {/* Error Banner */}
            {editError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <span>{editError}</span>
              </div>
            )}

            {/* Form Fields */}
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5">
              {/* Display Name */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center px-1">
                  <label htmlFor="edit-name-input" className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Name
                  </label>
                  <span className="text-[10.5px] text-zinc-400 font-medium">
                    {editName.length}/50
                  </span>
                </div>
                <input
                  id="edit-name-input"
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (editError) setEditError('');
                  }}
                  maxLength={50}
                  placeholder="Your display name"
                  className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-2xl px-4 py-3 text-[14px] font-medium focus:border-zinc-900 focus:bg-white focus:outline-none transition-all placeholder:text-zinc-400"
                />
              </div>

              {/* Username */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center px-1">
                  <label htmlFor="edit-username-input" className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Username
                  </label>
                  <span className="text-[10.5px] text-zinc-400 font-medium">
                    {editUsername.length}/30
                  </span>
                </div>
                <div className="flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus-within:border-zinc-900 focus-within:bg-white transition-all">
                  <span className="text-[14px] font-semibold text-zinc-400 mr-0.5 select-none">@</span>
                  <input
                    id="edit-username-input"
                    type="text"
                    value={editUsername}
                    onChange={(e) => {
                      const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      setEditUsername(sanitized);
                      if (editError) setEditError('');
                    }}
                    maxLength={30}
                    placeholder="username"
                    className="w-full bg-transparent text-[14px] font-medium text-zinc-900 focus:outline-none placeholder:text-zinc-400"
                  />
                </div>
              </div>

              {/* Bio */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center px-1">
                  <label htmlFor="edit-bio-input" className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Bio
                  </label>
                  <span className="text-[10.5px] text-zinc-400 font-medium">
                    {editBio.length}/150
                  </span>
                </div>
                <textarea
                  id="edit-bio-input"
                  rows={2}
                  value={editBio}
                  onChange={(e) => {
                    setEditBio(e.target.value);
                    if (editError) setEditError('');
                  }}
                  maxLength={150}
                  placeholder="A short bio about yourself..."
                  className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-2xl px-4 py-3 text-[13.5px] font-medium focus:border-zinc-900 focus:bg-white focus:outline-none transition-all placeholder:text-zinc-400 resize-none"
                />
              </div>

              {/* Website */}
              <div className="flex flex-col gap-1">
                <label htmlFor="edit-website-input" className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 px-1">
                  Website
                </label>
                <input
                  id="edit-website-input"
                  type="url"
                  value={editWebsite}
                  onChange={(e) => {
                    setEditWebsite(e.target.value);
                    if (editError) setEditError('');
                  }}
                  maxLength={100}
                  placeholder="https://yourwebsite.com"
                  className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-2xl px-4 py-3 text-[14px] font-medium focus:border-zinc-900 focus:bg-white focus:outline-none transition-all placeholder:text-zinc-400"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSaving || !editName.trim()}
                  className="w-full py-3.5 px-6 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full text-[13.5px] font-semibold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer outline-none border-0"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="w-full py-2.5 text-zinc-500 hover:text-zinc-900 text-[13px] font-semibold transition-colors cursor-pointer outline-none border-0 bg-transparent"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
