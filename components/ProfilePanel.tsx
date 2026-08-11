'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signOut, signIn } from 'next-auth/react';
import { useTheme } from '@/app/components/ThemeProvider';
import { DeviceAccountStore, DeviceAccountMeta } from '@/lib/deviceAccountStore';
import { 
  updateProfileDetails, 
  updateProfileImageAction, 
  getFollowRequests, 
  respondToFollowRequest, 
  createPostAction, 
  deletePostAction,
  toggleProfilePrivacy,
  getSavedPostsAction
} from '@/app/dashboard/actions';

/* ─── Types ─── */
export interface UserProfile {
  avatarUrl?: string;
  displayName: string;
  username: string;
  email?: string;
  bio?: string;
  website?: string;
  metrics: { posts: number; followers: number; following: number };
}

export interface Post {
  id: string;
  thumbnailUrl?: string;
  postType: 'single_image' | 'carousel' | 'reel';
  hue?: number;
}

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
  session: any;
  fullUser: any;
  targetUser?: any;
  isDark: boolean;
  onEditName: () => void;
  onInstall: () => void;
  hasUnreadNotifications?: boolean;
  posts?: Post[];
  reels?: Post[];
  tagged?: Post[];
  refreshProfile?: () => void;
  onToggleFollow?: (targetUserId: string) => void;
  onOpenChat?: (user: any) => void;
  onAccountSheetChange?: (isOpen: boolean) => void;
  onOpenUpload?: (type: 'single_image' | 'reel') => void;
}

/* ─── Default data ─── */
const DEFAULT_POSTS: Post[]   = [];
const DEFAULT_REELS: Post[]   = [];
const DEFAULT_TAGGED: Post[]  = [];

/* ─── Icon helpers ─── */
const CarouselIcon = () => (
  <svg width="16" height="16" fill="#fff" viewBox="0 0 24 24" style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,.5))'}}>
    <path d="M2 6a2 2 0 012-2h11a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm16 1.5v5a3.5 3.5 0 01-3.5 3.5H7A3.5 3.5 0 0110.5 19H18a3.5 3.5 0 003.5-3.5V9l-3.5-1.5z"/>
  </svg>
);
const ReelIcon = () => (
  <svg width="16" height="16" fill="#fff" viewBox="0 0 24 24" style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,.5))'}}>
    <path d="M8 5v14l11-7z"/>
  </svg>
);

const DefaultAvatarSvg = ({ size = 32, color, style }: { size?: number; color?: string; style?: React.CSSProperties }) => (
  <img 
    src="/Avatar.avif" 
    alt="Default Avatar" 
    style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', ...style }} 
  />
);

/* ─── Main component ─── */
export default function ProfilePanel({
  isOpen, isClosing, onClose, session, fullUser, targetUser, isDark,
  onEditName, onInstall,
  hasUnreadNotifications = false,
  refreshProfile,
  onToggleFollow,
  onOpenChat,
  onAccountSheetChange,
  onOpenUpload,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab]         = useState<'grid'|'reels'|'tagged'>('grid');
  const [copyToast, setCopyToast]         = useState(false);
  const [savedPostsList, setSavedPostsList] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved]     = useState(false);

  // Switch account state
  const [activeAccountSheet, setActiveAccountSheet] = useState<'none' | 'accounts' | 'options' | 'signIn' | 'signUp' | 'verify' | 'success'>('none');
  const [targetAccountSheet, setTargetAccountSheet] = useState<'none' | 'accounts' | 'options' | 'signIn' | 'signUp' | 'verify' | 'success'>('none');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarInputUrl, setAvatarInputUrl] = useState('');
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const avatarTouchTimer = useRef<NodeJS.Timeout | null>(null);

  const handleAvatarTouchStart = () => {
    if (avatarTouchTimer.current) clearTimeout(avatarTouchTimer.current);
    avatarTouchTimer.current = setTimeout(() => {
      setShowAvatarPreview(true);
    }, 450);
  };

  const handleAvatarTouchEnd = () => {
    if (avatarTouchTimer.current) {
      clearTimeout(avatarTouchTimer.current);
      avatarTouchTimer.current = null;
    }
  };
  const [savedAccounts, setSavedAccounts] = useState<DeviceAccountMeta[]>([]);

  const [showManualSignIn, setShowManualSignIn] = useState(false);
  const [switchEmail, setSwitchEmail] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchUsername, setSwitchUsername] = useState('');
  const [switchOtp, setSwitchOtp] = useState(['', '', '', '', '', '']);
  const [switchError, setSwitchError] = useState('');
  const [switchLoading, setSwitchLoading] = useState(false);
  const [switchCooldown, setSwitchCooldown] = useState(0);
  const switchOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const curUserId = (session?.user as any)?.id || '';
  const curEmail = (fullUser?.email || session?.user?.email || '').toLowerCase().trim();
  const curUsername = fullUser?.username || (session?.user as any)?.username || (curEmail ? curEmail.split('@')[0] : 'user');
  const curName = fullUser?.name || session?.user?.name || 'User';
  const curImage = fullUser?.image || session?.user?.image || '';
  const curProvider = (session?.user as any)?.provider || 'credentials';

  // ── Load saved accounts from DeviceAccountStore on mount and when session changes ──
  useEffect(() => {
    const accounts = DeviceAccountStore.getSavedAccounts();
    setSavedAccounts(accounts);
  }, [curUserId, curEmail]);

  // ── displayAccounts: current account first (active badge), then rest sorted by lastUsedAt ──
  const displayAccounts = React.useMemo(() => {
    return savedAccounts.map(acc => ({
      ...acc,
      isCurrent: acc.userId === curUserId || acc.email === curEmail,
    })).sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
    });
  }, [savedAccounts, curUserId, curEmail]);


  // Sync sheet state with parent is handled below variables declaration

  // Transition helper
  const triggerAccountSheetTransition = (nextSheet: typeof activeAccountSheet) => {
    setTargetAccountSheet(nextSheet);
    setActiveAccountSheet('none');
    setTimeout(() => {
      setActiveAccountSheet(nextSheet);
    }, 250);
  };

  const handleAccountSwitch = async (acc: DeviceAccountMeta) => {
    // If this is already the current account, just close the sheet
    if (acc.userId === curUserId || acc.email === curEmail) {
      triggerAccountSheetTransition('none');
      return;
    }

    // Check if this account has a valid saved credential on this device
    const hasCredential = await DeviceAccountStore.hasValidCredential(acc.userId);

    if (hasCredential && acc.isSavedOnDevice) {
      // ── RULE 6: Instant passwordless switch for saved accounts ──
      setSwitchLoading(true);
      try {
        const res = await signIn('credentials', {
          redirect: false,
          email: acc.email,
          // We sign in using email only — backend validates the existing JWT session
          // For a proper refresh-token flow, this would use the stored refresh token.
          // Since NextAuth uses HTTP-only cookies, re-signing forces a session swap.
          password: '__session_restore__',
        });

        if (res?.ok) {
          // Update the credential and current account
          await DeviceAccountStore.refreshCredential(acc.userId, acc.provider);
          DeviceAccountStore.setCurrentAccountId(acc.userId);
          // Reload to apply the new session cookie
          triggerAccountSheetTransition('none');
          window.location.reload();
          return;
        }
        // Credential exists but signIn failed — fall through to password prompt
      } catch (err) {
        // fall through
      } finally {
        setSwitchLoading(false);
      }
    }

    // ── RULE 7: No valid credential — show authentication screen ──
    setSwitchEmail(acc.email);
    setSwitchPassword('');
    setSwitchError('');
    triggerAccountSheetTransition('signIn');
  };

  const handleSwitchLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSwitchLoading(true);
    setSwitchError('');
    try {
      const res = await signIn('credentials', { redirect: false, email: switchEmail, password: switchPassword });
      if (res?.error === 'EMAIL_NOT_VERIFIED') {
        setSwitchOtp(['', '', '', '', '', '']);
        triggerAccountSheetTransition('verify');
        fetch('/api/resend-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: switchEmail }),
        });
        setSwitchCooldown(60);
      } else if (res?.error) {
        setSwitchError('Invalid email or password.');
      } else {
        // ── RULE 2 & RULE 10: Add this account to device store without removing others ──
        // We need to fetch the new session's userId. Use a temporary approach:
        // the dashboard useEffect will do the final upsert with real userId.
        try {
          const cleanEmail = switchEmail.toLowerCase().trim();
          const tempMeta = {
            userId: `pending_${cleanEmail}`,
            email: cleanEmail,
            username: cleanEmail.split('@')[0],
            displayName: cleanEmail.split('@')[0],
            profilePicture: '',
            provider: 'credentials' as const,
          };
          await DeviceAccountStore.addOrUpdateAccount(tempMeta, true);
        } catch (e) {}

        if (refreshProfile) refreshProfile();
        triggerAccountSheetTransition('none');
        window.location.reload();
      }
    } catch (err) {
      setSwitchError('An error occurred.');
    } finally {
      setSwitchLoading(false);
    }
  };

  const handleSwitchSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSwitchLoading(true);
    setSwitchError('');
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: switchUsername, email: switchEmail, password: switchPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSwitchError(data.message || 'Registration failed.');
      } else {
        setSwitchOtp(['', '', '', '', '', '']);
        setSwitchCooldown(60);
        triggerAccountSheetTransition('verify');
      }
    } catch (err) {
      setSwitchError('An error occurred.');
    } finally {
      setSwitchLoading(false);
    }
  };

  const handleSwitchVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = switchOtp.join('');
    if (code.length < 6) { setSwitchError('Please enter the full code.'); return; }
    setSwitchLoading(true);
    setSwitchError('');
    try {
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: switchEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSwitchError(data.message || 'Verification failed.');
      } else {
        const signInRes = await signIn('credentials', { redirect: false, email: switchEmail, password: switchPassword });
        if (signInRes?.ok) {
          try {
            const stored = localStorage.getItem('connected_accounts');
            let list = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(list)) list = [];
            const idx = list.findIndex((a: any) => a.email === switchEmail);
            if (idx !== -1) {
              list[idx].password = switchPassword;
            } else {
              list.push({ email: switchEmail, password: switchPassword, provider: 'credentials' });
            }
            localStorage.setItem('connected_accounts', JSON.stringify(list));
          } catch (e) {}
          triggerAccountSheetTransition('success');
        } else {
          setSwitchError('Verified! Please sign in.');
          triggerAccountSheetTransition('signIn');
        }
      }
    } catch (err) {
      setSwitchError('An error occurred.');
    } finally {
      setSwitchLoading(false);
    }
  };

  /* Multi-page Navigation States */
  const [subView, setSubView]             = useState<'profile' | 'followers' | 'following' | 'edit_profile' | 'follow_requests' | 'settings' | 'notifications' | 'saved'>('profile');
  const [searchQuery, setSearchQuery]     = useState('');
  const [longPressedPostId, setLongPressedPostId] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  /* Form edit states */
  const [editName, setEditName]           = useState('');
  const [editUsername, setEditUsername]   = useState('');
  const [editBio, setEditBio]             = useState('');
  const [editWebsite, setEditWebsite]     = useState('');
  const [profileError, setProfileError]   = useState('');

  /* Preferences toggles (no emojis) */
  const [prefNotifications, setPrefNotifications] = useState(true);
  const [prefReadReceipts, setPrefReadReceipts] = useState(true);
  const [prefOnlineStatus, setPrefOnlineStatus] = useState(true);

  // Sync preferences from local storage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPrefNotifications(localStorage.getItem('pref_notifications') !== 'false');
      setPrefReadReceipts(localStorage.getItem('pref_read_receipts') !== 'false');
      setPrefOnlineStatus(localStorage.getItem('pref_online_status') !== 'false');
    }
  }, []);

  const savePreference = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, String(value));
    }
  };

  useEffect(() => {
    if (fullUser) {
      setEditName(fullUser.name || 'User');
      setEditUsername(fullUser.username || '');
      setEditBio(fullUser.bio || '');
      setEditWebsite(fullUser.website || '');
    }
  }, [fullUser]);

  /* Profile ownership */
  const isOwnProfile = !targetUser || targetUser.isCurrentUser;

  // Sync sheet state with parent (accounts sheet, avatar picker sheet, subviews, target profile)
  useEffect(() => {
    if (onAccountSheetChange) {
      if (isClosing) {
        onAccountSheetChange(false);
      } else {
        const shouldHideBottomNav = 
          activeAccountSheet !== 'none' || 
          showAvatarModal || 
          subView !== 'profile' || 
          !isOwnProfile;
        onAccountSheetChange(shouldHideBottomNav);
      }
    }
  }, [activeAccountSheet, showAvatarModal, subView, isOwnProfile, isClosing, onAccountSheetChange]);

  /* Derived profile data from Database */
  const name     = fullUser?.name     || session?.user?.name  || 'User';
  const email    = fullUser?.email    || session?.user?.email || '';
  const image    = fullUser?.image    || session?.user?.image;
  const username = (fullUser?.username || email.split('@')[0] || 'user').toLowerCase().replace(/\s+/g,'');
  const bio      = fullUser?.bio      || '';
  const website  = fullUser?.website  || '';

  // Actual DB entries
  const dbPosts   = fullUser?.posts || [];
  const followersList = fullUser?.followers || [];
  const followingList = fullUser?.following || [];
  const followRequestsList = fullUser?.receivedFollowRequests || [];

  const metrics  = {
    posts:     dbPosts.length,
    followers: followersList.length,
    following: followingList.length,
  };

  /* Action callbacks */
  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setProfileError('');
    try {
      const res = await updateProfileDetails({
        name: editName,
        username: editUsername,
        bio: editBio,
        website: editWebsite
      });
      if (res.error) {
        setProfileError(res.error);
      } else {
        if (refreshProfile) refreshProfile();
        setSubView('profile');
      }
    } catch (err) {
      setProfileError('Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdateAvatar = async (url: string) => {
    if (!url.trim() || isAvatarUploading) return;
    setIsAvatarUploading(true);
    try {
      await updateProfileImageAction(url.trim());
      if (refreshProfile) refreshProfile();
      setShowAvatarModal(false);
      setAvatarInputUrl('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isAvatarUploading) return;
    setIsAvatarUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        await updateProfileImageAction(base64String);
        if (refreshProfile) refreshProfile();
        setShowAvatarModal(false);
      } catch (err) {
        console.error(err);
      } finally {
        setIsAvatarUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    if (isAvatarUploading) return;
    setIsAvatarUploading(true);
    try {
      await updateProfileImageAction('');
      if (refreshProfile) refreshProfile();
      setShowAvatarModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleCreatePost = async (type: 'single_image' | 'carousel' | 'reel') => {
    try {
      await createPostAction({ imageUrl: '', caption: '', postType: type as 'single_image' | 'reel' });
      if (refreshProfile) refreshProfile();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePost = async () => {
    if (!longPressedPostId) return;
    try {
      await deletePostAction(longPressedPostId);
      if (refreshProfile) refreshProfile();
      setLongPressedPostId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRespondRequest = async (reqId: string, action: 'accept' | 'decline') => {
    try {
      await respondToFollowRequest(reqId, action);
      if (refreshProfile) refreshProfile();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePrivacy = async (newVal: boolean) => {
    try {
      await toggleProfilePrivacy(newVal);
      if (refreshProfile) refreshProfile();
    } catch (err) {
      console.error(err);
    }
  };

  /* Share / copy handler */
  const handleShare = useCallback(async () => {
    const url  = typeof window !== 'undefined' ? window.location.href : '';
    const data = { title: name, text: `Check out ${name} on Connect!`, url };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2500);
    } catch {}
  }, [name]);

  /* Grid content per tab from DB */
  const gridItems = activeTab === 'reels' 
    ? dbPosts.filter((p: any) => p.postType === 'reel')
    : activeTab === 'tagged'
      ? []
      : dbPosts.filter((p: any) => p.postType !== 'reel');

  if (!isOpen) return null;

  const border  = isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0';
  const txt     = isDark ? '#fff'    : '#111';
  const sub     = isDark ? '#a1a1aa' : '#6b7280';
  const btnBg   = isDark ? 'rgba(255,255,255,0.10)' : '#f3f4f6';
  const btnBdr  = isDark ? 'rgba(255,255,255,0.15)' : '#e5e7eb';
  const bg      = isDark ? '#1c1c1e' : '#ffffff';

  /* Long press handler for touch & mouse */
  let pressTimer: NodeJS.Timeout;
  const startPress = (postId: string) => {
    if (!isOwnProfile) return; // Only allow deletion of own posts
    pressTimer = setTimeout(() => {
      setLongPressedPostId(postId);
    }, 600);
  };
  const cancelPress = () => {
    clearTimeout(pressTimer);
  };

  // Determine if other profile content is accessible
  const isPrivateAndUnfollowed = !isOwnProfile && targetUser?.isPrivate && !targetUser?.isFollowing;

  return (
    <div
      className={isClosing ? 'ig-profile-exit' : 'ig-profile-enter'}
      style={{
        position:'absolute', inset:0, zIndex:60, display:'flex',
        flexDirection:'column', overflow:'hidden',
        background: isDark ? '#0e0e11' : '#fff',
      }}
    >
      {/* Spacer for status bar/camera cutout safe area top */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', width: '100%', flexShrink: 0 }} />

      {/* ── Avatar Changing Bottom Sheet ── */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: isDark ? '#1c1c1e' : '#ffffff', 
          borderTop: `1px solid ${border}`, 
          borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '24px 24px 32px', 
          boxShadow: isDark ? '0 -15px 40px rgba(0,0,0,0.4)' : '0 -15px 40px rgba(0,0,0,0.15)',
          transform: (showAvatarModal && isOwnProfile) ? 'translateY(0)' : 'translateY(100%)',
          opacity: (showAvatarModal && isOwnProfile) ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: (showAvatarModal && isOwnProfile) ? 'auto' : 'none',
        }}
      >
        <div style={{ width: 48, height: 4, background: isDark ? '#3a3a3c' : '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: txt, marginBottom: 18, textAlign: 'center' }}>Change Profile Picture</h2>
        
        {isAvatarUploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 12 }}>
            <div className="w-8 h-8 rounded-full border-3 border-t-transparent border-blue-500 animate-spin" />
            <p style={{ fontSize: 14, fontWeight: 600, color: sub }}>Updating profile picture...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {/* Direct File Upload Option */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px',
              background: '#0095f6', 
              color: '#ffffff', 
              borderRadius: '100px',
              fontWeight: 700, 
              fontSize: 14, 
              cursor: 'pointer', 
              textAlign: 'center', 
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(0, 149, 246, 0.25)'
            }}>
              Upload New Photo
              <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isAvatarUploading} style={{display: 'none'}} />
            </label>

            {/* Remove Picture Option */}
            {image && (
              <button
                onClick={handleRemoveAvatar}
                disabled={isAvatarUploading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '100px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  background: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.06)',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Remove Current Picture
              </button>
            )}
          </div>
        )}

        <button 
          onClick={() => setShowAvatarModal(false)} 
          disabled={isAvatarUploading}
          style={{
            width: '100%', 
            padding: '12px 0', 
            background: 'none', 
            color: sub, 
            fontWeight: 600, 
            fontSize: 14, 
            cursor: 'pointer',
            border: 'none'
          }}
        >
          Cancel
        </button>
      </div>

      {/* ── Fullscreen Avatar Preview Lightbox Modal ── */}
      {showAvatarPreview && (
        <div 
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in"
          onClick={() => setShowAvatarPreview(false)}
        >
          {/* Header Bar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <span className="text-white font-bold text-base">{name}</span>
              <span className="text-white/60 text-xs">@{username}</span>
            </div>
            <button 
              onClick={() => setShowAvatarPreview(false)} 
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Large Avatar Card */}
          <div 
            className="w-72 h-72 md:w-80 md:h-80 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-zinc-900 flex items-center justify-center transition-transform transform hover:scale-[1.02]"
            onClick={e => e.stopPropagation()}
          >
            {image ? (
              <img src={image} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <DefaultAvatarSvg size={180} color="#ffffff" />
            )}
          </div>
          
          <p className="text-white/70 text-xs mt-6 font-medium">Tap anywhere to close</p>
        </div>
      )}

      {/* ── Center Confirm Delete Post Modal ── */}
      {longPressedPostId && isOwnProfile && (
        <div 
          style={{
            position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          }} 
          onClick={() => setLongPressedPostId(null)}
        >
          <div 
            style={{
              width: '80%', maxWidth: 300, background: isDark ? '#1c1c1e' : '#fff', borderRadius: '24px', padding: 24,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center'
            }} 
            onClick={e => e.stopPropagation()}
          >
            <h4 style={{margin: 0, fontSize: 16, fontWeight: 700, color: txt, textAlign: 'center'}}>Delete this post?</h4>
            <p style={{margin: 0, fontSize: 13, color: sub, textAlign: 'center'}}>This action is permanent and will remove it from the database.</p>
            <div style={{display: 'flex', gap: 12, width: '100%', marginTop: 8}}>
              <button
                onClick={() => setLongPressedPostId(null)}
                style={{
                  flex: 1, padding: '12px', background: btnBg, border: `1px solid ${btnBdr}`, color: txt,
                  borderRadius: '20px', fontWeight: 600, cursor: 'pointer', borderStyle: 'solid'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePost}
                style={{
                  flex: 1, padding: '12px', background: '#ef4444', border: 'none', color: '#fff',
                  borderRadius: '20px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Copy toast ── */}
      {copyToast && (
        <div style={{
          position:'absolute', bottom:80, left:'50%', transform:'translateX(-50%)',
          background:'#10b981', color:'#fff', padding:'8px 20px',
          borderRadius:100, fontSize:13, fontWeight:600, zIndex:99, whiteSpace:'nowrap',
        }}>
          Link copied to clipboard
        </div>
      )}

      {/* ========================================================
          VIEW: PROFILE PAGE
          ======================================================== */}
      {subView === 'profile' && (
        <>
          {/* Top Nav Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={(e) => (onClose as any)(e)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, padding: 0
            }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span 
              onClick={() => triggerAccountSheetTransition('options')}
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: txt,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {username}
              <svg 
                width="14" 
                height="14" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                viewBox="0 0 24 24" 
                style={{ 
                  transform: (activeAccountSheet === 'options' || activeAccountSheet === 'accounts') ? 'rotate(180deg)' : 'none', 
                  transition: 'transform 0.25s ease' 
                }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div style={{display:'flex', gap:3, alignItems:'center'}}>
              {/* Options/Settings trigger - only for own profile */}
              {isOwnProfile && (
                <button 
                  onClick={() => setSubView('settings')} 
                  style={{
                    width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background: isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6', color:txt,
                    transition:'all 0.2s'
                  }}
                  title="Settings & Privacy"
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div style={{flex:1, overflowY:'auto'}}>
            {/* Header (Stats) */}
            <div style={{display:'flex', alignItems:'center', padding:'16px 16px 8px', gap:24}}>
              <div 
                onMouseDown={handleAvatarTouchStart}
                onMouseUp={handleAvatarTouchEnd}
                onMouseLeave={handleAvatarTouchEnd}
                onTouchStart={handleAvatarTouchStart}
                onTouchEnd={handleAvatarTouchEnd}
                onTouchCancel={handleAvatarTouchEnd}
                onContextMenu={(e) => { e.preventDefault(); setShowAvatarPreview(true); }}
                onClick={() => {
                  if (isOwnProfile) setShowAvatarModal(true);
                  else setShowAvatarPreview(true);
                }}
                style={{
                  width:80, height:80, borderRadius:'50%', flexShrink:0,
                  background: isDark ? '#26262d':'#e5e7eb',
                  border:`0.5px solid ${isDark ? 'rgba(255,255,255,0.15)':'#d1d5db'}`,
                  overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
                  cursor: 'pointer', position: 'relative'
                }}
                title={isOwnProfile ? "Tap to change picture, hold to view full size" : "Hold to view full size"}
              >
                {image
                  ? <img src={image} alt={name} style={{width:'100%',height:'100%',objectFit:'cover'}} referrerPolicy="no-referrer"/>
                  : <DefaultAvatarSvg size={60} color={isDark ? '#fff' : '#374151'} />
                }
              </div>

              {/* Stats */}
              <div style={{flex:1, display:'flex', justifyContent:'space-around'}}>
                {[
                  { num: metrics.posts,     label:'Posts', action: () => {} },
                  { num: metrics.followers, label:'Followers', action: () => { if (!isPrivateAndUnfollowed) setSubView('followers'); } },
                  { num: metrics.following, label:'Following', action: () => { if (!isPrivateAndUnfollowed) setSubView('following'); } },
                ].map(s => (
                  <div key={s.label} onClick={s.action} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor: isPrivateAndUnfollowed ? 'default' : 'pointer'}}>
                    <span style={{fontWeight:700, fontSize:17, color:txt}}>{s.num}</span>
                    <span style={{fontSize:12, color:sub}}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bio Section */}
            <div style={{padding:'4px 16px 12px', display:'flex', flexDirection:'column', gap:3}}>
              <span style={{fontWeight:700, fontSize:14, color:txt}}>{name}</span>
              {bio && bio.split('\n').map((line: string, i: number) => (
                <span key={i} style={{fontSize:13, color:sub}}>{line}</span>
              ))}
              
              {website && (
                <a
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{display:'flex', alignItems:'center', gap:4, textDecoration:'none', marginTop:2}}
                >
                  <svg width="12" height="12" fill="none" stroke={sub} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                  </svg>
                  <span style={{fontSize:12, color:sub, fontWeight:600}}>{website}</span>
                </a>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{display:'flex', padding:'0 16px 12px', gap:8}}>
              {isOwnProfile ? (
                <>
                  <button onClick={() => setSubView('edit_profile')} style={{
                    flex:1, padding:'8px', borderRadius:'20px', fontWeight:600, fontSize:13,
                    background:btnBg, border:`1px solid ${btnBdr}`, color:txt, cursor:'pointer', transition:'all 0.2s',
                  }}>
                    Edit Profile
                  </button>
                  <button onClick={handleShare} style={{
                    flex:1, padding:'8px', borderRadius:'20px', fontWeight:600, fontSize:13,
                    background:btnBg, border:`1px solid ${btnBdr}`, color:txt, cursor:'pointer', transition:'all 0.2s',
                  }}>
                    Share Profile
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => onToggleFollow && onToggleFollow(targetUser.id)} 
                    style={{
                      flex:1, padding:'8px', borderRadius:'20px', fontWeight:600, fontSize:13,
                      background: targetUser?.isFollowing 
                        ? btnBg 
                        : targetUser?.hasSentRequest 
                          ? btnBg 
                          : (isDark ? '#fff' : '#111'),
                      border: targetUser?.isFollowing || targetUser?.hasSentRequest
                        ? `1px solid ${btnBdr}`
                        : 'none',
                      color: targetUser?.isFollowing || targetUser?.hasSentRequest
                        ? txt
                        : (isDark ? '#000' : '#fff'),
                      cursor:'pointer', transition:'all 0.2s',
                    }}
                  >
                    {targetUser?.isFollowing 
                      ? 'Following' 
                      : targetUser?.hasSentRequest 
                        ? 'Requested' 
                        : targetUser?.isPrivate
                          ? 'Request'
                          : 'Follow'}
                  </button>
                  {!isPrivateAndUnfollowed && (
                    <button 
                      onClick={() => {
                        if (onOpenChat) {
                          onOpenChat(targetUser);
                        } else if (typeof window !== 'undefined') {
                          onClose();
                          window.location.href = `/dashboard?chat=${targetUser.id}`;
                        }
                      }} 
                      style={{
                        flex:1, padding:'8px', borderRadius:'20px', fontWeight:600, fontSize:13,
                        background:btnBg, border:`1px solid ${btnBdr}`, color:txt, cursor:'pointer', transition:'all 0.2s',
                      }}
                    >
                      Message
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Private Profile Check Card */}
            {isPrivateAndUnfollowed ? (
              <div style={{
                padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', textAlign: 'center', gap: 12, borderTop: `1px solid ${border}`,
                marginTop: 20
              }}>
                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: sub }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: txt }}>This account is private</h3>
                <p style={{ fontSize: 13, color: sub, maxWidth: 260 }}>Follow this account to see their posts and reels.</p>
              </div>
            ) : (
              <>


                {/* Tab Navigation */}
                <div style={{
                  display:'flex', justifyContent:'space-around', alignItems:'center',
                  borderTop:`1px solid ${border}`, borderBottom:`1px solid ${border}`,
                }}>
                  {([
                    { id:'grid'   as const, icon:<svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z"/></svg> },
                    { id:'reels'  as const, icon:<svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg> },
                    { id:'tagged' as const, icon:<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        flex:1, display:'flex', justifyContent:'center', padding:'12px 0',
                        background:'none', border:'none', cursor:'pointer',
                        borderBottom: activeTab === tab.id ? `2px solid ${txt}` : '2px solid transparent',
                        color: activeTab === tab.id ? txt : sub,
                        transition:'all 0.2s',
                      }}
                    >
                      {tab.icon}
                    </button>
                  ))}
                </div>

                {/* Add Post/Reel Action Bar */}
                {isOwnProfile && (
                  <div style={{ display: 'flex', padding: '12px 16px', gap: 8 }}>
                    <button
                      onClick={() => onOpenUpload?.('single_image')}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '12px', border: `1px solid ${btnBdr}`,
                        background: btnBg, color: txt, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      Add Post
                    </button>
                    <button
                      onClick={() => onOpenUpload?.('reel')}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '12px', border: `1px solid ${btnBdr}`,
                        background: btnBg, color: txt, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      Add Reel
                    </button>
                  </div>
                )}

                {/* Dynamic Content Grid */}
                <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2}}>
                  {gridItems.map((post: any, i: number) => (
                    <div
                      key={post.id}
                      onMouseDown={() => startPress(post.id)}
                      onMouseUp={cancelPress}
                      onMouseLeave={cancelPress}
                      onTouchStart={() => startPress(post.id)}
                      onTouchEnd={cancelPress}
                      onClick={() => {
                        if (typeof window !== 'undefined') window.location.href = `/p/${post.id}`;
                      }}
                      style={{
                        aspectRatio:'1/1', position:'relative', overflow:'hidden', cursor:'pointer',
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                      }}
                    >
                      {post.thumbnailUrl ? (
                        <img 
                          src={post.thumbnailUrl} 
                          alt="thumbnail" 
                          style={{width:'100%',height:'100%',objectFit:'cover'}}
                        />
                      ) : (
                        <div style={{
                          width:'100%', height:'100%',
                          background: isDark ? `hsl(${post.hue || 200},40%,22%)` : `hsl(${post.hue || 200},60%,92%)`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          <span style={{fontSize:12, fontWeight:700, color: isDark ? '#fff':'#4b5563', textTransform:'uppercase'}}>
                            {post.postType}
                          </span>
                        </div>
                      )}

                      {/* Icon overlay depending on media type */}
                      <div style={{position:'absolute', top:8, right:8, zIndex:10}}>
                        {post.postType === 'carousel' && <CarouselIcon />}
                        {post.postType === 'reel' && <ReelIcon />}
                      </div>
                    </div>
                  ))}
                </div>

                {gridItems.length === 0 && (
                  <div style={{padding:'60px 20px', textAlign:'center', color:sub, fontSize:14}}>
                    No posts yet.
                  </div>
                )}
              </>
            )}

            <div style={{height: 100}} />
          </div>
        </>
      )}

      {/* ========================================================
          VIEW: SETTINGS PAGE (No emojis)
          ======================================================== */}
      {/* ========================================================
          VIEW: SETTINGS & PRIVACY PAGE
          ======================================================== */}
      {subView === 'settings' && (
        <>
          {/* Top Navigation Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'16px 20px', borderBottom:`1px solid ${border}`, flexShrink:0,
            background: isDark ? '#0e0e11' : '#fff'
          }}>
            <button onClick={() => setSubView('profile')} style={{
              background:'none', border:'none', color:txt, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', padding:0
            }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>

            <span style={{fontWeight:800, fontSize:17, color:txt, letterSpacing: '-0.02em'}}>Settings & Privacy</span>

            <div style={{width: 22}} />
          </div>

          {/* Settings Options Scrollable Body */}
          <div style={{flex:1, overflowY:'auto', padding:'20px 20px', display:'flex', flexDirection:'column', gap:20}}>
            
            {/* User Profile Header Card */}
            <div style={{
              background: isDark ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' : '#f9fafb',
              border: `1px solid ${border}`, borderRadius: 24, padding: '18px 20px',
              display: 'flex', alignItems: 'center', gap: 16,
              boxShadow: isDark ? '0 8px 30px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.04)'
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
                background: isDark ? '#26262d' : '#e5e7eb', flexShrink: 0,
                border: `2px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db'}`
              }}>
                {image 
                  ? <img src={image} alt={name} style={{width: '100%', height: '100%', objectFit: 'cover'}} referrerPolicy="no-referrer" />
                  : <DefaultAvatarSvg size={48} color={txt} />
                }
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
                <span style={{fontSize: 17, fontWeight: 800, color: txt}}>{name}</span>
                <span style={{fontSize: 12, color: sub, fontWeight: 500}}>@{username} · {fullUser?.email || (username + '@connect.app')}</span>
              </div>
            </div>

            {/* Account Settings Section */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
              <p style={{fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: sub, paddingLeft: 4, margin: 0}}>Account & Privacy</p>
              <div style={{
                background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                border: `1px solid ${border}`, borderRadius: 20, overflow: 'hidden'
              }}>
                {/* Manage Profile */}
                <div 
                  onClick={() => setSubView('edit_profile')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', borderBottom: `1px solid ${border}`, cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{color: txt, display: 'flex', alignItems: 'center'}}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                    </span>
                    <span style={{fontSize: 14, fontWeight: 600, color: txt}}>Edit Profile</span>
                  </div>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>

                {/* Private Account Switch Row */}
                <div 
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', borderBottom: `1px solid ${border}`
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{color: txt, display: 'flex', alignItems: 'center'}}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                      </svg>
                    </span>
                    <span style={{fontSize: 14, fontWeight: 600, color: txt}}>Private Account</span>
                  </div>
                  <button 
                    onClick={() => handleTogglePrivacy(!fullUser?.isPrivate)}
                    style={{
                      width: 44, height: 24, borderRadius: 100, border: 'none',
                      background: fullUser?.isPrivate ? (isDark ? '#fff' : '#111') : (isDark ? '#3a3a3c' : '#d1d5db'),
                      position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s'
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', 
                      background: fullUser?.isPrivate && isDark ? '#000' : '#fff',
                      position: 'absolute', top: 3, 
                      left: fullUser?.isPrivate ? 23 : 3,
                      transition: 'left 0.2s'
                    }} />
                  </button>
                </div>

                {/* Password & Security */}
                <div 
                  onClick={() => alert('Password & Security settings are synchronized with Prisma DB.')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', cursor: 'pointer'
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{color: txt, display: 'flex', alignItems: 'center'}}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                      </svg>
                    </span>
                    <span style={{fontSize: 14, fontWeight: 600, color: txt}}>Password & Security</span>
                  </div>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Content & Display Section */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
              <p style={{fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: sub, paddingLeft: 4, margin: 0}}>Content & Display</p>
              <div style={{
                background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                border: `1px solid ${border}`, borderRadius: 20, overflow: 'hidden'
              }}>
                {/* Saved Posts & Reels */}
                <div 
                  onClick={() => {
                    setSubView('saved');
                    setLoadingSaved(true);
                    getSavedPostsAction().then(res => {
                      if (Array.isArray(res)) {
                        setSavedPostsList(res.map((item: any) => item.post));
                      }
                      setLoadingSaved(false);
                    }).catch(e => {
                      console.error(e);
                      setLoadingSaved(false);
                    });
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{color: txt, display: 'flex', alignItems: 'center'}}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                      </svg>
                    </span>
                    <span style={{fontSize: 14, fontWeight: 600, color: txt}}>Saved Posts & Reels</span>
                  </div>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>

                {/* Dark Theme */}
                <div 
                  onClick={toggleTheme}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{color: txt, display: 'flex', alignItems: 'center'}}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                      </svg>
                    </span>
                    <span style={{fontSize: 14, fontWeight: 600, color: txt}}>Dark Theme</span>
                  </div>
                  <span style={{fontSize: 12, fontWeight: 600, color: sub}}>{theme === 'dark' ? 'On' : 'Off'}</span>
                </div>

                {/* Notifications */}
                <div 
                  onClick={() => setSubView('notifications')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', cursor: 'pointer'
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{color: txt, display: 'flex', alignItems: 'center'}}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                      </svg>
                    </span>
                    <span style={{fontSize: 14, fontWeight: 600, color: txt}}>Notifications</span>
                  </div>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Support & Sign Out Section */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
              <p style={{fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: sub, paddingLeft: 4, margin: 0}}>Session</p>
              <div style={{
                background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                border: `1px solid ${border}`, borderRadius: 20, overflow: 'hidden'
              }}>
                <div 
                  onClick={() => {
                    try {
                      localStorage.removeItem('has_active_session');
                      localStorage.removeItem('last_logged_user');
                      localStorage.removeItem('social_messages_cache');
                    } catch (e) {}
                    signOut({ callbackUrl: '/accounts' });
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', cursor: 'pointer'
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{color: '#ef4444', display: 'flex', alignItems: 'center'}}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                      </svg>
                    </span>
                    <span style={{fontSize: 14, fontWeight: 700, color: '#ef4444'}}>Log Out</span>
                  </div>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: '#ef4444'}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>

            <div style={{height: 60}} />
          </div>
        </>
      )}

      {/* ========================================================
          VIEW: EDIT PROFILE PAGE
          ======================================================== */}
      {subView === 'edit_profile' && (
        <>
          {/* Top Navigation Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={() => { setSubView(isOwnProfile ? 'profile' : 'settings'); setProfileError(''); }} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, padding: 0
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>Edit Profile</span>

            {/* Save Button */}
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              style={{
                background:'none', border:'none', color:txt, fontWeight:700, fontSize:14, cursor:'pointer',
                opacity: isSavingProfile ? 0.5 : 1
              }}
            >
              {isSavingProfile ? 'Saving...' : 'Done'}
            </button>
          </div>

          {/* Form scrollable area */}
          <div style={{flex:1, overflowY:'auto', padding:'20px 16px'}}>
            
            {profileError && (
              <div style={{color: '#ef4444', fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 12}}>
                {profileError}
              </div>
            )}

            <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
              {/* Name */}
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <label style={{fontSize: 12, fontWeight: 600, color: sub}}>Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{
                    padding: '12px 18px', borderRadius: '24px', border: `1px solid ${border}`,
                    background: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb', color: txt, fontSize: 14, outline: 'none'
                  }}
                />
              </div>

              {/* Username */}
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <label style={{fontSize: 12, fontWeight: 600, color: sub}}>Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g,''))}
                  style={{
                    padding: '12px 18px', borderRadius: '24px', border: `1px solid ${border}`,
                    background: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb', color: txt, fontSize: 14, outline: 'none'
                  }}
                />
              </div>

              {/* Website */}
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <label style={{fontSize: 12, fontWeight: 600, color: sub}}>Website</label>
                <input
                  type="text"
                  value={editWebsite}
                  placeholder="https://yourwebsite.com"
                  onChange={e => setEditWebsite(e.target.value)}
                  style={{
                    padding: '12px 18px', borderRadius: '24px', border: `1px solid ${border}`,
                    background: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb', color: txt, fontSize: 14, outline: 'none'
                  }}
                />
              </div>

              {/* Bio */}
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <label style={{fontSize: 12, fontWeight: 600, color: sub}}>Bio</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  rows={4}
                  placeholder="Tell us about yourself..."
                  style={{
                    padding: '12px 18px', borderRadius: '16px', border: `1px solid ${border}`,
                    background: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb', color: txt, fontSize: 14, outline: 'none',
                    resize: 'none', lineHeight: '1.4'
                  }}
                />
              </div>
            </div>
            <div style={{height:60}}/>
          </div>
        </>
      )}

      {/* ========================================================
          VIEW: FOLLOWERS PAGE
          ======================================================== */}
      {subView === 'followers' && (
        <>
          {/* Top Navigation Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={() => { setSubView('profile'); setSearchQuery(''); }} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, padding: 0
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>Followers</span>

            <div style={{width: 36}} />
          </div>

          {/* Search Box */}
          <div style={{padding: '12px 16px', borderBottom: `1px solid ${border}`}}>
            <div style={{position: 'relative', display: 'flex', alignItems: 'center'}}>
              <input
                type="text"
                placeholder="Search followers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px 10px 38px', borderRadius: '24px', border: `1px solid ${border}`,
                  background: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6', color: txt, fontSize: 14, outline: 'none'
                }}
              />
              <svg style={{position: 'absolute', left: 14, color: sub}} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Follow Requests Button - only for own profile */}
          {isOwnProfile && (
            <div style={{padding: '12px 16px'}}>
              <button
                onClick={() => setSubView('follow_requests')}
                style={{
                  width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', color: txt, borderRadius: '24px',
                  border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                  <span>Follow Requests</span>
                </div>
                <div style={{
                  background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', fontSize: 11, padding: '2px 8px', borderRadius: '12px'
                }}>
                  {followRequestsList.length}
                </div>
              </button>
            </div>
          )}

          {/* Followers List */}
          <div style={{flex: 1, overflowY: 'auto', padding: '0 16px'}}>
            {followersList
              .filter((f: any) => 
                (f.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                (f.username || '').toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((f: any) => (
                <div key={f.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${border}`}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', background: isDark ? '#26262d' : '#e5e7eb',
                      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {f.image 
                        ? <img src={f.image} alt={f.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                        : <DefaultAvatarSvg size={28} color={txt} />
                      }
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column'}}>
                      <span style={{fontSize: 14, fontWeight: 700, color: txt}}>{f.name}</span>
                      <span style={{fontSize: 12, color: sub}}>@{f.username || 'user'}</span>
                    </div>
                  </div>
                  {isOwnProfile && (
                    <button style={{
                      padding: '6px 14px', background: btnBg, border: `1px solid ${btnBdr}`,
                      color: txt, borderRadius: '20px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                    }}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            
            {followersList.length === 0 && (
              <div style={{padding: '40px 0', textAlign: 'center', color: sub, fontSize: 13}}>
                No followers yet.
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================
          VIEW: FOLLOWING PAGE
          ======================================================== */}
      {subView === 'following' && (
        <>
          {/* Top Navigation Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={() => { setSubView('profile'); setSearchQuery(''); }} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, padding: 0
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>Following</span>

            <div style={{width: 36}} />
          </div>

          {/* Search Box */}
          <div style={{padding: '12px 16px', borderBottom: `1px solid ${border}`}}>
            <div style={{position: 'relative', display: 'flex', alignItems: 'center'}}>
              <input
                type="text"
                placeholder="Search following..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px 10px 38px', borderRadius: '24px', border: `1px solid ${border}`,
                  background: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6', color: txt, fontSize: 14, outline: 'none'
                }}
              />
              <svg style={{position: 'absolute', left: 14, color: sub}} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Following List */}
          <div style={{flex: 1, overflowY: 'auto', padding: '16px'}}>
            {followingList
              .filter((f: any) => 
                (f.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                (f.username || '').toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((f: any) => (
                <div key={f.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${border}`}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', background: isDark ? '#26262d' : '#e5e7eb',
                      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {f.image 
                        ? <img src={f.image} alt={f.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                        : <DefaultAvatarSvg size={28} color={txt} />
                      }
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column'}}>
                      <span style={{fontSize: 14, fontWeight: 700, color: txt}}>{f.name}</span>
                      <span style={{fontSize: 12, color: sub}}>@{f.username || 'user'}</span>
                    </div>
                  </div>
                  {isOwnProfile && (
                    <button style={{
                      padding: '6px 14px', background: btnBg, border: `1px solid ${btnBdr}`,
                      color: txt, borderRadius: '20px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                    }}>
                      Following
                    </button>
                  )}
                </div>
              ))}

            {followingList.length === 0 && (
              <div style={{padding: '40px 0', textAlign: 'center', color: sub, fontSize: 13}}>
                Not following anyone yet.
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================
          VIEW: FOLLOW REQUESTS
          ======================================================== */}
      {subView === 'follow_requests' && (
        <>
          {/* Top Navigation Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={() => setSubView('followers')} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, padding: 0
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>Follow Requests</span>

            <div style={{width: 36}} />
          </div>

          {/* List of Requests */}
          <div style={{flex: 1, overflowY: 'auto', padding: '16px'}}>
            {followRequestsList.map((req: any) => (
              <div key={req.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${border}`}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', background: isDark ? '#26262d' : '#e5e7eb',
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {req.sender.image 
                      ? <img src={req.sender.image} alt={req.sender.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                      : <DefaultAvatarSvg size={28} color={txt} />
                    }
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column'}}>
                    <span style={{fontSize: 14, fontWeight: 700, color: txt}}>{req.sender.name}</span>
                    <span style={{fontSize: 12, color: sub}}>@{req.sender.username || 'user'}</span>
                  </div>
                </div>
                
                {/* Accept / Decline actions */}
                <div style={{display: 'flex', gap: 8}}>
                  <button 
                    onClick={() => handleRespondRequest(req.id, 'accept')}
                    style={{
                      padding: '6px 14px', background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff',
                      border: 'none', borderRadius: '20px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Accept
                  </button>
                  <button 
                    onClick={() => handleRespondRequest(req.id, 'decline')}
                    style={{
                      padding: '6px 14px', background: btnBg, border: `1px solid ${btnBdr}`,
                      color: txt, borderRadius: '20px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}

            {followRequestsList.length === 0 && (
              <div style={{padding: '40px 0', textAlign: 'center', color: sub, fontSize: 13}}>
                No pending requests.
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================
          VIEW: NOTIFICATIONS & SYSTEM ALERTS
          ======================================================== */}
      {subView === 'notifications' && (
        <>
          {/* Top Navigation Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={() => setSubView('profile')} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, padding: 0
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>Activity & Alerts</span>

            <div style={{width: 36}} />
          </div>

          {/* Activity Logs scrollable list */}
          <div style={{flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18}}>
            
            {/* Follow Requests inside notifications alert */}
            {followRequestsList.length > 0 && (
              <div style={{
                background: isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
                border: `1px solid ${border}`, borderRadius: '16px', padding: 16
              }}>
                <h3 style={{fontSize: 12, fontWeight: 700, color: txt, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                  Follow Requests ({followRequestsList.length})
                </h3>
                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                  {followRequestsList.map((req: any) => (
                    <div key={req.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: `1px solid ${border}`}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                        <div style={{
                          width: 38, height: 38, borderRadius: '50%', background: isDark ? '#26262d' : '#e5e7eb',
                          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {req.sender.image 
                            ? <img src={req.sender.image} alt={req.sender.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                            : <DefaultAvatarSvg size={24} color={txt} />
                          }
                        </div>
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                          <span style={{fontSize: 13, fontWeight: 700, color: txt}}>{req.sender.name}</span>
                          <span style={{fontSize: 11, color: sub}}>@{req.sender.username || 'user'}</span>
                        </div>
                      </div>
                      <div style={{display: 'flex', gap: 6}}>
                        <button 
                          onClick={() => handleRespondRequest(req.id, 'accept')}
                          style={{
                            padding: '6px 12px', background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff',
                            border: 'none', borderRadius: '20px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          Accept
                        </button>
                        <button 
                          onClick={() => handleRespondRequest(req.id, 'decline')}
                          style={{
                            padding: '6px 12px', background: btnBg, border: `1px solid ${btnBdr}`,
                            color: txt, borderRadius: '20px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Activity */}
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
              border: `1px solid ${border}`, borderRadius: '16px', padding: 16
            }}>
              <h3 style={{fontSize: 12, fontWeight: 700, color: txt, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                Recent Activity
              </h3>

              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                <div style={{display: 'flex', gap: 12, fontSize: 13, color: txt}}>
                  <span style={{width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0, marginTop: 7}} />
                  <div>
                    <span style={{fontWeight: 600}}>System Guard</span>
                    <p style={{fontSize: 12, color: sub, marginTop: 3, lineHeight: '1.4'}}>Your account privacy mode is fully synchronized with Connect PostgreSQL.</p>
                  </div>
                </div>

                <div style={{display: 'flex', gap: 12, fontSize: 13, color: txt}}>
                  <span style={{width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0, marginTop: 7}} />
                  <div>
                    <span style={{fontWeight: 600}}>Direct Messaging</span>
                    <p style={{fontSize: 12, color: sub, marginTop: 3, lineHeight: '1.4'}}>All chats are configured with secure low-latency WebSockets.</p>
                  </div>
                </div>

                {followersList.length > 0 && (
                  <div style={{display: 'flex', gap: 12, fontSize: 13, color: txt}}>
                    <span style={{width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0, marginTop: 7}} />
                    <div>
                      <span style={{fontWeight: 600}}>New Follower</span>
                      <p style={{fontSize: 12, color: sub, marginTop: 3, lineHeight: '1.4'}}>
                        @{followersList[0]?.username || 'user'} started following you recently.
                      </p>
                    </div>
                  </div>
                )}

                <div style={{display: 'flex', gap: 12, fontSize: 13, color: txt}}>
                  <span style={{width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0, marginTop: 7}} />
                  <div>
                    <span style={{fontWeight: 600}}>Welcome to Connect</span>
                    <p style={{fontSize: 12, color: sub, marginTop: 3, lineHeight: '1.4'}}>Your profile is live! Customize your avatar, web links, or bio anytime.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </>
      )}

      {/* ========================================================
          VIEW: SAVED POSTS PAGE
          ======================================================== */}
      {subView === 'saved' && (
        <>
          {/* Top Navigation Bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={() => setSubView('settings')} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, padding: 0
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>Saved</span>

            <div style={{width: 36}} />
          </div>

          {/* Grid area */}
          <div style={{flex: 1, overflowY: 'auto'}}>
            {loadingSaved ? (
              <div style={{padding: '40px 0', textAlign: 'center', color: sub, fontSize: 13}}>
                Loading saved items...
              </div>
            ) : savedPostsList.length === 0 ? (
              <div style={{
                padding: '80px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', textAlign: 'center', gap: 12
              }}>
                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: sub }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                </svg>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: txt }}>Save Photos and Videos</h3>
                <p style={{ fontSize: 13, color: sub, maxWidth: 260 }}>
                  When you save photos and videos, they will appear here. Only you can see what you've saved.
                </p>
              </div>
            ) : (
              <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2}}>
                {savedPostsList.map((post: any) => (
                  <div
                    key={post.id}
                    onClick={() => {
                      if (typeof window !== 'undefined') window.location.href = `/p/${post.id}`;
                    }}
                    style={{
                      aspectRatio:'1/1', position:'relative', overflow:'hidden', cursor:'pointer',
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                    }}
                  >
                    {post.thumbnailUrl || post.imageUrl ? (
                      <img 
                        src={post.thumbnailUrl || post.imageUrl} 
                        alt="saved thumbnail" 
                        style={{width:'100%',height:'100%',objectFit:'cover'}}
                      />
                    ) : (
                      <div style={{
                        width:'100%', height:'100%',
                        background: isDark ? `hsl(200,40%,22%)` : `hsl(200,60%,92%)`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        <span style={{fontSize: 12, fontWeight: 700, color: isDark ? '#fff':'#4b5563', textTransform:'uppercase'}}>
                          {post.postType}
                        </span>
                      </div>
                    )}

                    {/* Icon overlay depending on media type */}
                    <div style={{position:'absolute', top:8, right:8, zIndex:10}}>
                      {post.postType === 'carousel' && <CarouselIcon />}
                      {post.postType === 'reel' && <ReelIcon />}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{height: 80}} />
          </div>
        </>
      )}

      {/* ── Sheets Overlay & Backdrop ── */}
      {(activeAccountSheet !== 'none' || (showAvatarModal && isOwnProfile)) && (
        <div 
          onClick={() => {
            triggerAccountSheetTransition('none');
            setShowAvatarModal(false);
          }}
          style={{
            position: 'absolute', inset: 0, zIndex: 90,
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* 1. Accounts list sheet */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: '#ffffff', borderTop: '1px solid #e5e7eb', borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '24px 24px 32px', boxShadow: '0 -15px 40px rgba(0,0,0,0.15)',
          transform: activeAccountSheet === 'accounts' ? 'translateY(0)' : 'translateY(100%)',
          opacity: activeAccountSheet === 'accounts' ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: activeAccountSheet === 'accounts' ? 'auto' : 'none',
        }}
      >
        <div style={{ width: 48, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#121214', marginBottom: 16, textAlign: 'center' }}>Switch Account</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, maxHeight: 260, overflowY: 'auto' }}>
          {displayAccounts.map((acc) => {
            const isActive = acc.isCurrent;
            const accountName = acc.displayName || acc.username || acc.email.split('@')[0];
            const username = acc.username || acc.email.split('@')[0];
            return (
              <div 
                key={acc.userId || acc.email}
                onClick={() => {
                  if (isActive) {
                    setActiveAccountSheet('none');
                  } else {
                    handleAccountSwitch(acc);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: '16px',
                  background: isActive ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)') : (isDark ? '#1a1a1e' : '#f9fafb'),
                  cursor: isActive ? 'default' : 'pointer',
                  border: isActive ? '1.5px solid #3b82f6' : (isDark ? '1px solid #27272a' : '1px solid transparent'),
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: '#e5e7eb',
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: isActive ? '2px solid #3b82f6' : 'none'
                  }}>
                    {acc.profilePicture 
                      ? <img src={acc.profilePicture} alt={accountName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <DefaultAvatarSvg size={24} color="#374151" />
                    }
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#ffffff' : '#121214' }}>{accountName}</span>
                      {isActive && (
                        <span style={{ fontSize: 9, fontWeight: 700, background: '#3b82f6', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>
                          Active
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: isDark ? '#a1a1aa' : '#6b7280' }}>@{username}</span>
                      {!isActive && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                          background: acc.isSavedOnDevice ? 'rgba(34,197,94,0.15)' : 'rgba(161,161,170,0.2)',
                          color: acc.isSavedOnDevice ? '#16a34a' : '#6b7280',
                        }}>
                          {acc.isSavedOnDevice ? '✓ Saved' : 'Sign in required'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {isActive ? (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" fill="none" stroke="#ffffff" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : switchLoading ? (
                  <div style={{ width: 18, height: 18, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                ) : (
                  <svg width="16" height="16" fill="none" stroke={isDark ? '#71717a' : '#9ca3af'} strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        <div 
          onClick={() => triggerAccountSheetTransition('options')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderRadius: '16px', background: '#f3f4f6',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <div style={{
            width: 38, height: 38, borderRadius: '50%', background: '#121214',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#121214' }}>Add Account</span>
        </div>
      </div>

      {/* 2. Options Popup Sheet — Accounts List + Log into existing + Create new */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: isDark ? '#16161a' : '#ffffff',
          color: isDark ? '#ffffff' : '#121214',
          borderTop: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
          borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '24px 24px 32px', boxShadow: '0 -15px 40px rgba(0,0,0,0.3)',
          transform: activeAccountSheet === 'options' ? 'translateY(0)' : 'translateY(100%)',
          opacity: activeAccountSheet === 'options' ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: activeAccountSheet === 'options' ? 'auto' : 'none',
        }}
      >
        <div style={{ width: 48, height: 4, background: isDark ? '#3f3f46' : '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#ffffff' : '#121214', marginBottom: 16, textAlign: 'center' }}>
          Switch Account
        </h2>

        {/* Accounts List in Bottom Menu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, maxHeight: 260, overflowY: 'auto' }}>
          {displayAccounts.map((acc) => {
            const isActive = acc.isCurrent;
            const usernameOnly = acc.username 
              ? (acc.username.startsWith('@') ? acc.username : `@${acc.username}`)
              : (acc.displayName || (acc.email ? `@${acc.email.split('@')[0]}` : 'user'));

            return (
              <div 
                key={acc.userId || acc.email}
                onClick={() => {
                  if (isActive) {
                    setActiveAccountSheet('none');
                  } else {
                    handleAccountSwitch(acc);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 18px', borderRadius: '100px',
                  background: isDark ? '#16161a' : '#f9fafb',
                  border: isActive ? (isDark ? '1.5px solid #52525b' : '1.5px solid #18181b') : (isDark ? '1px solid #27272a' : '1px solid #e5e7eb'),
                  cursor: isActive ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: isDark ? '#27272a' : '#e5e7eb',
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none'
                  }}>
                    {acc.profilePicture 
                      ? <img src={acc.profilePicture} alt={usernameOnly} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <DefaultAvatarSvg size={24} color="#374151" />
                    }
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#ffffff' : '#121214' }}>
                      {usernameOnly}
                    </span>
                  </div>
                </div>

                {isActive ? (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: isDark ? '#3f3f46' : '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" fill="none" stroke="#ffffff" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : switchLoading ? (
                  <div style={{ width: 18, height: 18, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                ) : (
                  <svg width="16" height="16" fill="none" stroke={isDark ? '#71717a' : '#9ca3af'} strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        {/* Action buttons under the accounts list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button
            onClick={() => triggerAccountSheetTransition('signIn')}
            style={{
              width: '100%', padding: '14px 0',
              background: isDark ? '#27272a' : '#121214',
              color: '#ffffff',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 13,
            }}
          >
            Log into Existing Account
          </button>

          <button
            onClick={() => triggerAccountSheetTransition('signUp')}
            style={{
              width: '100%', padding: '14px 0',
              background: isDark ? '#1c1c22' : '#f3f4f6',
              color: isDark ? '#ffffff' : '#121214',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`, fontSize: 13,
            }}
          >
            Create New Account
          </button>
        </div>
      </div>

      {/* 3. Log into Existing Account — FULL PAGE View */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: isDark ? '#09090b' : '#ffffff',
          color: isDark ? '#ffffff' : '#121214',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px', overflowY: 'auto',
          transform: activeAccountSheet === 'signIn' ? 'scale(1)' : 'scale(0.95)',
          opacity: activeAccountSheet === 'signIn' ? 1 : 0,
          transition: 'transform 0.3s ease, opacity 0.3s ease',
          pointerEvents: activeAccountSheet === 'signIn' ? 'auto' : 'none',
        }}
      >
        {/* Top Header Back Button */}
        <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 10 }}>
          <button 
            type="button"
            onClick={() => { setShowManualSignIn(false); triggerAccountSheetTransition('options'); }}
            style={{
              background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
              border: 'none', color: isDark ? '#fff' : '#121214',
              borderRadius: '50%', width: 42, height: 42, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* Centered Card Content */}
        <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
          
          {/* IF SAVED ACCOUNTS EXIST & NOT MANUAL SIGN IN MODE -> SHOW ACCOUNT CENTER LIST */}
          {displayAccounts.length > 0 && !showManualSignIn ? (
            <div>
              <img
                src="/logo.png"
                alt="Connect Logo"
                style={{
                  width: 56, height: 56, objectFit: 'contain', borderRadius: 16,
                  margin: '0 auto 16px', background: '#000', padding: 4
                }}
              />

              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Log Into Existing Account</h1>
              <p style={{ fontSize: 13, color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 24 }}>
                Select a saved account from your device to switch
              </p>

              {switchError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px 16px', borderRadius: 14, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
                  {switchError}
                </div>
              )}

              {/* Account Center Saved Accounts List — Uniform & Clean */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, maxHeight: 320, overflowY: 'auto' }}>
                {displayAccounts.map((acc) => {
                  const usernameOnly = acc.username 
                    ? (acc.username.startsWith('@') ? acc.username : `@${acc.username}`)
                    : (acc.displayName || (acc.email ? `@${acc.email.split('@')[0]}` : 'user'));
                  return (
                    <div
                      key={acc.userId || acc.email}
                      onClick={() => handleAccountSwitch(acc)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 20px', borderRadius: '100px',
                        background: isDark ? '#16161a' : '#f9fafb',
                        border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                        cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: 'none' }}>
                          {acc.profilePicture ? (
                            <img src={acc.profilePicture} alt={usernameOnly} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <DefaultAvatarSvg size={28} color="#374151" />
                          )}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, display: 'block' }}>{usernameOnly}</span>
                        </div>
                      </div>

                      <svg width="18" height="18" fill="none" stroke={isDark ? '#a1a1aa' : '#6b7280'} strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Action Buttons in Same Theme */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowManualSignIn(true)}
                  style={{
                    width: '100%', padding: '14px 0', background: isDark ? '#1c1c22' : '#f3f4f6',
                    color: isDark ? '#ffffff' : '#121214', border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                    borderRadius: '100px', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Log Into Another Account
                </button>

                <button
                  type="button"
                  onClick={() => triggerAccountSheetTransition('signUp')}
                  style={{
                    width: '100%', padding: '14px 0', background: isDark ? '#1c1c22' : '#f3f4f6',
                    color: isDark ? '#ffffff' : '#121214', border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                    borderRadius: '100px', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Create a New Account
                </button>
              </div>
            </div>
          ) : (
            /* IF NO SAVED ACCOUNTS OR USER CLICKED "LOG INTO ANOTHER ACCOUNT" -> SHOW CENTERED INPUT FIELDS */
            <div>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.12)',
                color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', border: '1.5px solid rgba(59, 130, 246, 0.25)'
              }}>
                <svg width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </div>

              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Log Into Existing Account</h1>
              <p style={{ fontSize: 13, color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 24 }}>
                Enter your username or email and password
              </p>

              {switchError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px 16px', borderRadius: 14, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
                  {switchError}
                </div>
              )}

              <form onSubmit={handleSwitchLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#a1a1aa' : '#4b5563', marginBottom: 6, display: 'block' }}>Username or Email</label>
                  <input
                    type="text"
                    placeholder="Username or email address"
                    required
                    value={switchEmail}
                    onChange={e => setSwitchEmail(e.target.value)}
                    style={{
                      width: '100%', borderRadius: '16px', background: isDark ? '#16161a' : '#f9fafb',
                      color: isDark ? '#ffffff' : '#121214', border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                      padding: '14px 18px', outline: 'none', fontSize: 14
                    }}
                  />
                </div>

                <div style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#a1a1aa' : '#4b5563', marginBottom: 6, display: 'block' }}>Password</label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    required
                    value={switchPassword}
                    onChange={e => setSwitchPassword(e.target.value)}
                    style={{
                      width: '100%', borderRadius: '16px', background: isDark ? '#16161a' : '#f9fafb',
                      color: isDark ? '#ffffff' : '#121214', border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                      padding: '14px 18px', outline: 'none', fontSize: 14
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={switchLoading}
                  style={{
                    width: '100%', padding: '16px 0', background: '#3b82f6', color: '#ffffff',
                    borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 14,
                    opacity: switchLoading ? 0.6 : 1, transition: 'all 0.2s', marginTop: 10,
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)'
                  }}
                >
                  {switchLoading ? 'Signing In...' : 'Log In'}
                </button>
              </form>

              {displayAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowManualSignIn(false)}
                  style={{
                    background: 'none', border: 'none', color: '#3b82f6', fontSize: 13,
                    fontWeight: 600, cursor: 'pointer', marginTop: 20
                  }}
                >
                  ← Back to Account Center saved accounts
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Create New Account — FULL PAGE View */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: isDark ? '#09090b' : '#ffffff',
          color: isDark ? '#ffffff' : '#121214',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px', overflowY: 'auto',
          transform: activeAccountSheet === 'signUp' ? 'scale(1)' : 'scale(0.95)',
          opacity: activeAccountSheet === 'signUp' ? 1 : 0,
          transition: 'transform 0.3s ease, opacity 0.3s ease',
          pointerEvents: activeAccountSheet === 'signUp' ? 'auto' : 'none',
        }}
      >
        {/* Top Header Back Button */}
        <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 10 }}>
          <button 
            type="button"
            onClick={() => triggerAccountSheetTransition('options')}
            style={{
              background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
              border: 'none', color: isDark ? '#fff' : '#121214',
              borderRadius: '50%', width: 42, height: 42, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* Centered Form Content (NO Account Center list) */}
        <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.12)',
            color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', border: '1.5px solid rgba(34, 197, 94, 0.25)'
          }}>
            <svg width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Create New Account</h1>
          <p style={{ fontSize: 13, color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 24 }}>
            Enter your details to create a new Connect profile
          </p>

          {switchError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px 16px', borderRadius: 14, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
              {switchError}
            </div>
          )}

          <form onSubmit={handleSwitchSignup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#a1a1aa' : '#4b5563', marginBottom: 6, display: 'block' }}>Username</label>
              <input
                type="text"
                placeholder="Choose a username"
                required
                value={switchUsername}
                onChange={e => setSwitchUsername(e.target.value)}
                style={{
                  width: '100%', borderRadius: '16px', background: isDark ? '#16161a' : '#f9fafb',
                  color: isDark ? '#ffffff' : '#121214', border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                  padding: '14px 18px', outline: 'none', fontSize: 14
                }}
              />
            </div>

            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#a1a1aa' : '#4b5563', marginBottom: 6, display: 'block' }}>Email Address</label>
              <input
                type="email"
                placeholder="name@example.com"
                required
                value={switchEmail}
                onChange={e => setSwitchEmail(e.target.value)}
                style={{
                  width: '100%', borderRadius: '16px', background: isDark ? '#16161a' : '#f9fafb',
                  color: isDark ? '#ffffff' : '#121214', border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                  padding: '14px 18px', outline: 'none', fontSize: 14
                }}
              />
            </div>

            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#a1a1aa' : '#4b5563', marginBottom: 6, display: 'block' }}>Password</label>
              <input
                type="password"
                placeholder="Create a strong password"
                required
                value={switchPassword}
                onChange={e => setSwitchPassword(e.target.value)}
                style={{
                  width: '100%', borderRadius: '16px', background: isDark ? '#16161a' : '#f9fafb',
                  color: isDark ? '#ffffff' : '#121214', border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                  padding: '14px 18px', outline: 'none', fontSize: 14
                }}
              />
            </div>

            <button
              type="submit"
              disabled={switchLoading}
              style={{
                width: '100%', padding: '16px 0', background: '#22c55e', color: '#ffffff',
                borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 14,
                opacity: switchLoading ? 0.6 : 1, transition: 'all 0.2s', marginTop: 10,
                boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)'
              }}
            >
              {switchLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>

      {/* 5. OTP verification sheet */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: '#ffffff', borderTop: '1px solid #e5e7eb', borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '24px 24px 32px', boxShadow: '0 -15px 40px rgba(0,0,0,0.15)',
          transform: activeAccountSheet === 'verify' ? 'translateY(0)' : 'translateY(100%)',
          opacity: activeAccountSheet === 'verify' ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: activeAccountSheet === 'verify' ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button 
            type="button"
            onClick={() => triggerAccountSheetTransition('signUp')}
            style={{ background: 'none', border: 'none', color: '#121214', cursor: 'pointer', padding: 0 }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div style={{ width: 48, height: 4, background: '#e5e7eb', borderRadius: 2 }} />
          <div style={{ width: 22 }} />
        </div>

        <form onSubmit={handleSwitchVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#121214' }}>Verify Email</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '-10px 0 10px 0' }}>We sent a 6-digit code to {switchEmail}</p>
          {switchError && <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>{switchError}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {switchOtp.map((digit, i) => (
              <input
                key={i}
                ref={el => { switchOtpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={i === 0 ? 6 : 1}
                value={digit}
                onFocus={(e) => { if (e.target.value) e.target.select(); }}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, '');
                  if (!raw) {
                    const next = [...switchOtp];
                    next[i] = '';
                    setSwitchOtp(next);
                    return;
                  }
                  if (raw.length >= 6) {
                    const digits = raw.slice(0, 6).split('');
                    const next = ['', '', '', '', '', ''];
                    digits.forEach((d, idx) => { if (idx < 6) next[idx] = d; });
                    setSwitchOtp(next);
                    requestAnimationFrame(() => switchOtpRefs.current[5]?.focus());
                    return;
                  }
                  const prefix = switchOtp.slice(0, i).join('');
                  if (i > 0 && prefix && raw.startsWith(prefix)) {
                    const remaining = raw.slice(prefix.length);
                    if (remaining.length > 0) {
                      const next = [...switchOtp];
                      remaining.split('').forEach((d, idx) => { if (i + idx < 6) next[i + idx] = d; });
                      setSwitchOtp(next);
                      const nextFocus = Math.min(i + remaining.length, 5);
                      requestAnimationFrame(() => switchOtpRefs.current[nextFocus]?.focus());
                      return;
                    }
                  }
                  if (raw.length > 1) {
                    const digits = raw.split('');
                    const next = [...switchOtp];
                    digits.forEach((d, idx) => { if (i + idx < 6) next[i + idx] = d; });
                    setSwitchOtp(next);
                    const nextFocus = Math.min(i + digits.length, 5);
                    requestAnimationFrame(() => switchOtpRefs.current[nextFocus]?.focus());
                    return;
                  }
                  const digit = raw.slice(-1);
                  const next = [...switchOtp];
                  next[i] = digit;
                  setSwitchOtp(next);
                  if (i < 5 && digit) requestAnimationFrame(() => switchOtpRefs.current[i + 1]?.focus());
                }}
                onKeyDown={e => {
                  if (e.key === 'Backspace') {
                    if (switchOtp[i]) {
                      const next = [...switchOtp];
                      next[i] = '';
                      setSwitchOtp(next);
                    } else if (i > 0) {
                      const next = [...switchOtp];
                      next[i - 1] = '';
                      setSwitchOtp(next);
                      switchOtpRefs.current[i - 1]?.focus();
                    }
                    e.preventDefault();
                  } else if (e.key === 'ArrowLeft' && i > 0) {
                    switchOtpRefs.current[i - 1]?.focus();
                    e.preventDefault();
                  } else if (e.key === 'ArrowRight' && i < 5) {
                    switchOtpRefs.current[i + 1]?.focus();
                    e.preventDefault();
                  }
                }}
                style={{
                  width: 40, height: 40, textAlign: 'center', fontSize: 18, fontWeight: 700,
                  background: '#f9fafb', color: '#121214', border: '1px solid #e5e7eb', borderRadius: '12px',
                  outline: 'none'
                }}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={switchLoading || switchOtp.some(d => !d)}
            style={{
              width: '100%', padding: '14px 0', background: '#121214', color: '#fff',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 13,
              opacity: switchLoading ? 0.6 : 1, transition: 'all 0.2s', marginTop: 10
            }}
          >
            {switchLoading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>
      </div>

      {/* 6. Success sheet */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: '#ffffff', borderTop: '1px solid #e5e7eb', borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '32px 24px 32px', boxShadow: '0 -15px 40px rgba(0,0,0,0.15)',
          transform: activeAccountSheet === 'success' ? 'translateY(0)' : 'translateY(100%)',
          opacity: activeAccountSheet === 'success' ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: activeAccountSheet === 'success' ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: '#10b981',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#121214' }}>Welcome!</h2>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Your account is verified and ready to go.</p>
          <button
            onClick={() => {
              triggerAccountSheetTransition('none');
              if (typeof window !== 'undefined') window.location.reload();
            }}
            style={{
              width: '100%', padding: '14px 0', background: '#121214', color: '#fff',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 13,
              marginTop: 10
            }}
          >
            Let's Go
          </button>
        </div>
      </div>
    </div>
  );
}
