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
  KeyRound,
  Trash2,
  Share2
} from 'lucide-react';
import {
  updateProfileDetails,
  updateProfileImageAction,
  toggleProfilePrivacy
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
  refreshProfile,
  onOpenChat,
  onAccountSheetChange
}: Props) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  // Active settings sub-modal
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Name & Bio State
  const [editNameValue, setEditNameValue] = useState('');
  const [editBioValue, setEditBioValue] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Saved accounts for Account & Security switcher
  const [savedAccounts, setSavedAccounts] = useState<DeviceAccountMeta[]>([]);

  const curEmail = (targetUser?.email || fullUser?.email || session?.user?.email || '').toLowerCase().trim();
  const curUsername = targetUser?.username || fullUser?.username || (session?.user as any)?.username || (curEmail ? curEmail.split('@')[0] : 'hammad');
  const curName = targetUser?.name || fullUser?.name || session?.user?.name || 'Muhammad Hammad';
  const curImage = targetUser?.image || fullUser?.image || session?.user?.image || '';
  const isSelf = !targetUser || targetUser.id === (session?.user as any)?.id;

  useEffect(() => {
    if (fullUser) {
      setEditNameValue(fullUser.name || '');
      setEditBioValue(fullUser.bio || '');
    }
  }, [fullUser]);

  useEffect(() => {
    if (isOpen) {
      DeviceAccountStore.getAllAccounts().then(setSavedAccounts).catch(() => {});
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
      const optimized = await optimizeImageClient(file, 600, 600, 0.85);

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
      reader.readAsDataURL(optimized);
    } catch (err) {
      console.error(err);
      setIsUploadingAvatar(false);
      showToast('Error uploading image');
    }
  };

  const handleSaveProfileDetails = async () => {
    if (!editNameValue.trim()) return;
    setIsSavingDetails(true);
    try {
      const res = await updateProfileDetails({
        name: editNameValue.trim(),
        bio: editBioValue.trim()
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
    <div className="fixed inset-0 z-50 h-screen w-full flex flex-col bg-[#141111] overflow-hidden font-sans select-none animate-in fade-in duration-200">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 bg-zinc-900/90 backdrop-blur-md text-white text-xs font-semibold rounded-full shadow-lg border border-white/10 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-3.5 h-3.5 text-green-400" />
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

      {/* ── 2. Dark Header & Profile Identity (Top 36%) ── */}
      <div className="w-full bg-[#141111] pt-14 px-6 pb-8 flex flex-col items-center relative select-none">
        
        {/* Header Nav Row */}
        <div className="w-full flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            {!isSelf && (
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-95 transition-transform mr-1 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <h1 className="text-[24px] font-bold text-white tracking-tight">
              Profile
            </h1>
          </div>

          {/* Right: Bell Icon Button */}
          <button 
            onClick={() => showToast('No new notifications')}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center relative cursor-pointer active:scale-95 transition-transform"
          >
            <Bell className="w-5 h-5 text-white" strokeWidth={2} />
          </button>
        </div>

        {/* Avatar Section */}
        <div className="relative mt-1">
          <div className="w-24 h-24 rounded-full ring-4 ring-white/10 ring-offset-4 ring-offset-[#141111] overflow-hidden bg-zinc-800 flex items-center justify-center">
            {curImage ? (
              <img 
                src={curImage} 
                alt={curName} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <img 
                src="/Avatar.png" 
                alt="Avatar" 
                className="w-full h-full object-cover" 
              />
            )}
            {isUploadingAvatar && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Edit Badge (Bottom Right) */}
          {isSelf && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#9D4EDD] text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-[#8338ec] active:scale-90 transition-all border-2 border-[#141111]"
              title="Change Profile Photo"
            >
              <Camera className="w-3.5 h-3.5 text-white" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* User Details */}
        <h2 className="text-[20px] font-bold text-white mt-3 leading-tight text-center">
          {curName}
        </h2>
        <p className="text-[13px] text-[#D8B4E2] font-medium mt-0.5 text-center">
          @{curUsername} • Online
        </p>
      </div>

      {/* ── 3. Light Settings Sheet (Bottom 64%) ── */}
      <div className="w-full flex-1 bg-white rounded-t-[32px] px-6 pt-6 pb-28 flex flex-col gap-5 relative shadow-[0_-12px_30px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar">
        
        {/* Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-2 mb-2 shrink-0" />

        {/* Status Card */}
        <div className="w-full bg-[#FFF3CD] border border-yellow-200/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-400/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-zinc-900" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-zinc-900 leading-tight">
                Connect Pro Active
              </h3>
              <p className="text-[12px] text-zinc-600 mt-0.5">
                High-speed cloud sync & AI chat
              </p>
            </div>
          </div>
          <button 
            onClick={() => setActiveModal('pro')}
            className="bg-zinc-950 text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl cursor-pointer active:scale-95 transition-transform shrink-0"
          >
            Manage
          </button>
        </div>

        {/* Settings List Group */}
        <div className="flex flex-col bg-zinc-50 border border-zinc-100 rounded-2xl overflow-hidden divide-y divide-zinc-100 shadow-sm">
          
          {/* 1. Account & Security */}
          <div 
            onClick={() => setActiveModal('account')}
            className="flex items-center justify-between p-3.5 hover:bg-zinc-100/70 transition-colors cursor-pointer active:bg-zinc-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-zinc-900">Account & Security</p>
                <p className="text-[12px] text-zinc-500">Password, 2FA, Email</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
          </div>

          {/* 2. Notifications & Sounds */}
          <div 
            onClick={() => setActiveModal('notifications')}
            className="flex items-center justify-between p-3.5 hover:bg-zinc-100/70 transition-colors cursor-pointer active:bg-zinc-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                <BellRing className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-zinc-900">Notifications & Sounds</p>
                <p className="text-[12px] text-zinc-500">Mute, Custom Tones</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
          </div>

          {/* 3. Media, Files & Storage */}
          <div 
            onClick={() => setActiveModal('storage')}
            className="flex items-center justify-between p-3.5 hover:bg-zinc-100/70 transition-colors cursor-pointer active:bg-zinc-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                <FolderDown className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-zinc-900">Saved Media & Storage</p>
                <p className="text-[12px] text-zinc-500">Auto-download, Cache</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
          </div>

          {/* 4. Privacy & Blocked */}
          <div 
            onClick={() => setActiveModal('privacy')}
            className="flex items-center justify-between p-3.5 hover:bg-zinc-100/70 transition-colors cursor-pointer active:bg-zinc-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                <Lock className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-zinc-900">Privacy & Blocked Users</p>
                <p className="text-[12px] text-zinc-500">Last seen, Read receipts</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
          </div>

          {/* 5. Appearance & Theme */}
          <div 
            onClick={() => {
              toggleTheme();
              triggerHaptic('light');
              showToast(`Theme switched to ${theme === 'dark' ? 'Light' : 'Dark'}`);
            }}
            className="flex items-center justify-between p-3.5 hover:bg-zinc-100/70 transition-colors cursor-pointer active:bg-zinc-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-200/60 flex items-center justify-center shrink-0">
                <Palette className="w-[18px] h-[18px] text-zinc-700" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-zinc-900">Chat Appearance</p>
                <p className="text-[12px] text-zinc-500">Theme: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2} />
          </div>
        </div>

        {/* Danger / Secondary Actions */}
        <div className="flex flex-col gap-2 mt-1 mb-2">
          <button 
            onClick={handleLogout}
            className="w-full py-3.5 rounded-2xl bg-zinc-100 hover:bg-red-50 text-red-600 font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.99]"
          >
            <LogOut className="w-4 h-4" strokeWidth={2} />
            <span>Log Out</span>
          </button>
        </div>
      </div>

      {/* ── 4. Floating Navigation Bar (Profile Active) ── */}
      <nav className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] h-[68px] bg-[#141111] rounded-full flex justify-around items-center px-4 shadow-[0_12px_24px_rgba(0,0,0,0.3)] z-50 border border-zinc-800/50">
        
        {/* Item 1 (Calls) */}
        <button
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="flex flex-col items-center justify-center gap-1 transition-all active:scale-95 px-4 py-1 outline-none cursor-pointer"
        >
          <div className="w-5 h-5 flex items-center justify-center text-zinc-400">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
            </svg>
          </div>
          <span className="text-[10px] text-zinc-400 font-medium">
            Calls
          </span>
        </button>

        {/* Item 2 (Messages) */}
        <button
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="flex flex-col items-center justify-center gap-1 transition-all active:scale-95 px-4 py-1 outline-none cursor-pointer"
        >
          <div className="w-5 h-5 flex items-center justify-center text-zinc-400">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path 
                fillRule="evenodd" 
                clipRule="evenodd" 
                d="M3.0132 9.15129C3 9.69022 3 10.3021 3 11V13C3 15.8284 3 17.2426 3.87868 18.1213C4.75736 19 6.17157 19 9 19H15C17.8284 19 19.2426 19 20.1213 18.1213C21 17.2426 21 15.8284 21 13V11C21 10.3021 21 9.69022 20.9868 9.15129L12.9713 13.6044C12.3672 13.9399 11.6328 13.9399 11.0287 13.6044L3.0132 9.15129ZM3.24297 7.02971C3.32584 7.05052 3.4074 7.08237 3.48564 7.12584L12 11.856L20.5144 7.12584C20.5926 7.08237 20.6742 7.05052 20.757 7.02971C20.6271 6.55619 20.4276 6.18491 20.1213 5.87868C19.2426 5 17.8284 5 15 5H9C6.17157 5 4.75736 5 3.87868 5.87868C3.57245 6.18491 3.37294 6.55619 3.24297 7.02971Z" 
              />
            </svg>
          </div>
          <span className="text-[10px] text-zinc-400 font-medium">
            Messages
          </span>
        </button>

        {/* Item 3 (Profile - Active) */}
        <button
          onClick={() => triggerHaptic('light')}
          className="flex flex-col items-center justify-center gap-1 transition-all active:scale-95 px-4 py-1 outline-none cursor-pointer"
        >
          <div className="w-5 h-5 flex items-center justify-center text-[#D8B4E2]">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 9a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-7 9a7 7 0 1114 0H3z" />
            </svg>
          </div>
          <span className="text-[10px] text-[#D8B4E2] font-semibold">
            Profile
          </span>
        </button>
      </nav>

      {/* ── Sub-Modals ── */}

      {/* Account & Security Modal */}
      {activeModal === 'account' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">Account & Security</h3>
              <button 
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Display Name</label>
                <input 
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium focus:outline-none focus:border-zinc-900 text-zinc-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Bio / Status</label>
                <textarea 
                  rows={3}
                  value={editBioValue}
                  onChange={(e) => setEditBioValue(e.target.value)}
                  placeholder="Tell people about yourself..."
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium focus:outline-none focus:border-zinc-900 text-zinc-900 resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  disabled={isSavingDetails}
                  onClick={handleSaveProfileDetails}
                  className="w-full py-3 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {isSavingDetails ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              {/* Saved Accounts Switcher */}
              {savedAccounts.length > 1 && (
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Switch Account</p>
                  <div className="space-y-2">
                    {savedAccounts.map((acc) => (
                      <div 
                        key={acc.userId}
                        onClick={() => {
                          if (acc.userId !== (session?.user as any)?.id) {
                            showToast(`Switching to ${acc.name}...`);
                            router.push('/accounts');
                          }
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl border ${acc.userId === (session?.user as any)?.id ? 'border-purple-200 bg-purple-50/50' : 'border-zinc-100 hover:bg-zinc-50'} cursor-pointer`}
                      >
                        <div className="flex items-center gap-3">
                          <img src={acc.image || '/Avatar.png'} alt="" className="w-8 h-8 rounded-full object-cover" />
                          <div>
                            <p className="text-sm font-semibold text-zinc-900">{acc.name}</p>
                            <p className="text-xs text-zinc-500">@{acc.username}</p>
                          </div>
                        </div>
                        {acc.userId === (session?.user as any)?.id && (
                          <span className="text-xs font-bold text-purple-600">Active</span>
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

      {/* Notifications Modal */}
      {activeModal === 'notifications' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">Notifications & Sounds</h3>
              <button 
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Push Notifications</p>
                  <p className="text-xs text-zinc-500">Receive alerts for new messages</p>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">In-App Sound</p>
                  <p className="text-xs text-zinc-500">Sound effects when receiving messages</p>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved Media & Storage Modal */}
      {activeModal === 'storage' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">Saved Media & Storage</h3>
              <button 
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Local Cache</p>
                  <p className="text-xs text-zinc-500">Optimistic messages & chats cache</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('social_messages_cache');
                    showToast('Cache cleared!');
                  }}
                  className="px-3 py-1 bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-lg hover:bg-zinc-300"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy & Blocked Modal */}
      {activeModal === 'privacy' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">Privacy & Security</h3>
              <button 
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">End-to-End Privacy</p>
                  <p className="text-xs text-zinc-500">Real-time encrypted WebRTC calls & chat</p>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connect Pro Modal */}
      {activeModal === 'pro' && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-bold text-zinc-900">Connect Pro Active</h3>
              </div>
              <button 
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-600">
              You are currently on Connect Pro with unlimited HD voice & video calls, cloud chat backups, and high-speed attachments.
            </p>
            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-3 bg-zinc-900 text-white text-sm font-semibold rounded-xl"
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
