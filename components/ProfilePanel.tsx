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
  Users,
} from 'lucide-react';
import {
  updateProfileImageAction,
  updateProfileDetails,
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

const PASTEL_AVATAR_BGS = ['#FFF3CD', '#E0F2FE', '#FCE7F3', '#FEF9C3', '#EDE9FE', '#DCFCE7'];
function getPastelAvatarBg(key: string): string {
  if (!key) return PASTEL_AVATAR_BGS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return PASTEL_AVATAR_BGS[Math.abs(hash) % PASTEL_AVATAR_BGS.length];
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

  // Edit Username State
  const [isEditing, setIsEditing] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Followers / Following list view tab ('followers' | 'following' | null)
  const [listTab, setListTab] = useState<'followers' | 'following' | null>(null);

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
  const [localUsername, setLocalUsername] = useState(curUsername);
  const curName = activeUserData?.name || session?.user?.name || 'User';
  const curImage = activeUserData?.image || session?.user?.image || '';

  const followersList: any[] = activeUserData?.followers || [];
  const followingList: any[] = activeUserData?.following || [];

  // Sync counts and username on user change
  useEffect(() => {
    if (activeUserData) {
      const followers = activeUserData.followers || [];
      const following = activeUserData.following || [];
      setFollowerCount(followers.length);
      setFollowingCount(following.length);

      const resolvedUsername = activeUserData?.username || (session?.user as any)?.username || (curEmail ? curEmail.split('@')[0] : 'user');
      setLocalUsername(resolvedUsername);
      setUsernameInput(resolvedUsername);

      if (!isSelf && session?.user) {
        const myId = (session.user as any)?.id;
        setIsFollowing(followers.some((f: any) => f.id === myId));
      }
    }
  }, [activeUserData, isSelf, session, curEmail]);

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

  const handleSaveUsername = async () => {
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
      const res = await updateProfileDetails({ username: cleaned });
      if (res.error) {
        setUsernameError(res.error);
        showToast(res.error);
      } else {
        setLocalUsername(cleaned);
        setIsEditing(false);
        showToast('Username updated successfully!');
        refreshProfile?.();
      }
    } catch (err) {
      setUsernameError('Failed to update username');
      showToast('Failed to update username');
    } finally {
      setIsSavingUsername(false);
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
    <div
      data-profile-open="true"
      className="fixed inset-0 z-[100] h-screen w-full flex flex-col bg-[#141111] overflow-hidden font-sans select-none animate-in fade-in duration-200"
    >
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
              {isSelf ? 'Profile' : (activeUserData?.username || curName)}
            </h1>
          </div>

          {/* Right side: Top Edit / Save button (No border, no outline) */}
          <div className="flex items-center">
            {isSelf && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  if (isEditing) {
                    handleSaveUsername();
                  } else {
                    setListTab(null);
                    setUsernameInput(localUsername || curUsername);
                    setUsernameError(null);
                    setIsEditing(true);
                  }
                }}
                className="p-2 text-white hover:text-zinc-300 active:scale-95 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none bg-transparent flex items-center justify-center"
                title={isEditing ? 'Save' : 'Edit'}
                aria-label={isEditing ? 'Save Username' : 'Edit Username'}
              >
                {isEditing ? (
                  <span className="text-sm font-bold text-white hover:text-zinc-200">
                    {isSavingUsername ? 'Saving...' : 'Save'}
                  </span>
                ) : (
                  <Edit3 className="w-5 h-5 text-white" strokeWidth={2} />
                )}
              </button>
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
                {(localUsername || curName).charAt(0).toUpperCase()}
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

        {/* User Details (Username displayed under profile pic) */}
        <h2 className="text-[20px] font-bold text-white mt-3 leading-tight text-center tracking-tight">
          {isSelf ? (localUsername || curUsername) : (activeUserData?.username || curName)}
        </h2>
      </div>

      {/* ── 2. Bottom Light Sheet ── */}
      <div className="w-full flex-1 bg-white rounded-t-[36px] px-6 pt-5 pb-28 flex flex-col gap-4 relative shadow-[0_-12px_35px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar min-h-0 text-zinc-900">
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-1 mb-1 shrink-0" />

        {isEditing ? (
          /* ── 1. EDIT MODE: Clean Username Input Field inside White Box ── */
          <div className="w-full flex flex-col gap-3.5 mt-2 animate-in fade-in duration-200">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-zinc-700 uppercase tracking-wider">
                Username
              </label>
              <div className="relative w-full">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => {
                    setUsernameInput(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9_]/g, ''));
                    setUsernameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveUsername();
                    }
                  }}
                  placeholder="Enter username"
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 focus:border-zinc-900 outline-none text-[15px] font-medium text-zinc-900 transition-all placeholder:text-zinc-400"
                />
              </div>
              {usernameError && (
                <span className="text-xs font-semibold text-rose-500 mt-1">
                  {usernameError}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleSaveUsername}
                disabled={isSavingUsername}
                className="flex-1 py-3.5 px-6 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-[13.5px] flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 outline-none border-0 ring-0 shadow-sm"
              >
                {isSavingUsername ? 'Saving...' : 'Save Username'}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsEditing(false);
                  setUsernameError(null);
                }}
                className="py-3.5 px-6 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-[13.5px] transition-all cursor-pointer active:scale-95 outline-none border-0 ring-0"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : listTab !== null ? (
          /* ── 2. FOLLOWERS / FOLLOWING LIST VIEW INSIDE WHITE BOX ── */
          <div className="w-full flex flex-col gap-3 animate-in fade-in duration-200">
            {/* Header inside White Box with Frameless Back Button */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setListTab(null);
                  }}
                  className="p-1.5 -ml-1.5 text-zinc-800 hover:text-zinc-600 active:scale-95 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none bg-transparent"
                  title="Back to profile"
                  aria-label="Back to profile"
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

            {/* User List */}
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
                  const itemUsername = userItem.username || (userItem.email ? userItem.email.split('@')[0] : 'user');
                  const itemName = userItem.name || itemUsername;
                  const itemBg = getPastelAvatarBg(userItem.id || itemUsername);

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
                          style={{ backgroundColor: itemBg }}
                        >
                          {userItem.image ? (
                            <img src={userItem.image} alt={itemName} className="w-full h-full object-cover" />
                          ) : (
                            <span>{itemUsername.charAt(0).toUpperCase()}</span>
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
                        className="px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all active:scale-95 shrink-0"
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
          /* ── 3. NORMAL MODE: Followers/Following Capsules + Logout directly underneath ── */
          <>
            {/* Followers & Following Round Capsules */}
            <div className="flex items-center justify-center gap-4 w-full">
              <div
                onClick={() => {
                  triggerHaptic('light');
                  setListTab('followers');
                }}
                className="flex-1 py-4 px-6 rounded-full bg-zinc-50 hover:bg-zinc-100 active:scale-95 transition-all border border-zinc-100 flex flex-col items-center justify-center shadow-xs cursor-pointer"
              >
                <span className="text-[22px] font-black text-zinc-900 leading-tight">
                  {followerCount}
                </span>
                <span className="text-[12px] text-zinc-500 font-medium mt-0.5">Followers</span>
              </div>

              <div
                onClick={() => {
                  triggerHaptic('light');
                  setListTab('following');
                }}
                className="flex-1 py-4 px-6 rounded-full bg-zinc-50 hover:bg-zinc-100 active:scale-95 transition-all border border-zinc-100 flex flex-col items-center justify-center shadow-xs cursor-pointer"
              >
                <span className="text-[22px] font-black text-zinc-900 leading-tight">
                  {followingCount}
                </span>
                <span className="text-[12px] text-zinc-500 font-medium mt-0.5">Following</span>
              </div>
            </div>

            {/* Log Out Button directly under followers and following for Self */}
            {isSelf && (
              <div className="w-full mt-1">
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

            {/* Other User Actions (Follow & Message) */}
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
          </>
        )}
      </div>
    </div>
  );
}
