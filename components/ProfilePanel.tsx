'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signOut, signIn } from 'next-auth/react';
import { useTheme } from '@/app/components/ThemeProvider';
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
}

/* ─── Default data ─── */
const mkPost = (i: number, type: Post['postType']): Post => ({
  id: String(i), postType: type, hue: 220 + i * 18,
});

const DEFAULT_POSTS: Post[]   = [0,1,2,3,4,5].map(i => mkPost(i, i===1||i===4 ? 'carousel' : i===2 ? 'reel' : 'single_image'));
const DEFAULT_REELS: Post[]   = [0,1,2].map(i => mkPost(i+10, 'reel'));
const DEFAULT_TAGGED: Post[]  = [0,1,2].map(i => mkPost(i+20, 'single_image'));

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
  const [savedAccounts, setSavedAccounts] = useState<any[]>([]);

  // Switch account form fields
  const [switchEmail, setSwitchEmail] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchUsername, setSwitchUsername] = useState('');
  const [switchOtp, setSwitchOtp] = useState(['', '', '', '', '', '']);
  const [switchError, setSwitchError] = useState('');
  const [switchLoading, setSwitchLoading] = useState(false);
  const [switchCooldown, setSwitchCooldown] = useState(0);

  const switchOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Sync saved accounts
  useEffect(() => {
    if (typeof window !== 'undefined' && (fullUser || session?.user)) {
      const curUsername = fullUser?.username || session?.user?.username || (fullUser?.email || session?.user?.email || '').split('@')[0] || 'user';
      const curEmail = fullUser?.email || session?.user?.email || '';
      const curImage = fullUser?.image || session?.user?.image || '';
      const curName = fullUser?.name || session?.user?.name || 'User';
      const curProvider = session?.user?.provider || 'credentials';

      try {
        const stored = localStorage.getItem('connected_accounts');
        let list = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(list)) list = [];
        
        const idx = list.findIndex((acc: any) => acc.email === curEmail);
        const accInfo = { username: curUsername, email: curEmail, image: curImage, name: curName, provider: curProvider };
        if (idx === -1) {
          if (curEmail) list.push(accInfo);
        } else {
          list[idx] = { ...list[idx], ...accInfo };
        }
        localStorage.setItem('connected_accounts', JSON.stringify(list));
        setSavedAccounts(list);
      } catch (e) {
        console.error(e);
      }
    }
  }, [fullUser, session]);

  // Sync sheet state with parent is handled below variables declaration

  // Transition helper
  const triggerAccountSheetTransition = (nextSheet: typeof activeAccountSheet) => {
    setTargetAccountSheet(nextSheet);
    setActiveAccountSheet('none');
    setTimeout(() => {
      setActiveAccountSheet(nextSheet);
    }, 250);
  };

  const handleAccountSwitch = async (acc: any) => {
    const curUsername = fullUser?.username || session?.user?.username || (fullUser?.email || session?.user?.email || '').split('@')[0] || 'user';
    if (acc.username === curUsername) {
      triggerAccountSheetTransition('none');
      return;
    }
    
    if (acc.password) {
      setSwitchLoading(true);
      try {
        const res = await signIn('credentials', { redirect: false, email: acc.email, password: acc.password });
        if (res?.ok) {
          if (refreshProfile) refreshProfile();
          triggerAccountSheetTransition('none');
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
          return;
        } else {
          setSwitchError('Please sign in again.');
        }
      } catch (err) {
        setSwitchError('Failed to sign in.');
      } finally {
        setSwitchLoading(false);
      }
    }
    
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

        if (refreshProfile) refreshProfile();
        triggerAccountSheetTransition('none');
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
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
    if (!url.trim()) return;
    try {
      await updateProfileImageAction(url.trim());
      if (refreshProfile) refreshProfile();
      setShowAvatarModal(false);
      setAvatarInputUrl('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        await updateProfileImageAction(base64String);
        if (refreshProfile) refreshProfile();
        setShowAvatarModal(false);
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePost = async (type: 'single_image' | 'carousel' | 'reel') => {
    try {
      await createPostAction('', type);
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
      style={{
        position:'absolute', inset:0, zIndex:50, display:'flex',
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
        <h2 style={{ fontSize: 18, fontWeight: 800, color: txt, marginBottom: 16, textAlign: 'center' }}>Change Profile Picture</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {/* File upload option */}
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px',
            background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6', 
            color: txt, 
            borderRadius: '100px',
            fontWeight: 700, 
            fontSize: 13, 
            cursor: 'pointer', 
            textAlign: 'center', 
            border: `1px solid ${border}`,
            transition: 'background-color 0.2s'
          }}>
            Choose from Library
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{display: 'none'}} />
          </label>
          
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0', color: sub, fontSize: 11, fontWeight: 600}}>
            — OR —
          </div>

          {/* URL paste option */}
          <div style={{display: 'flex', gap: 8}}>
            <input
              type="text"
              placeholder="Paste avatar URL..."
              value={avatarInputUrl}
              onChange={e => setAvatarInputUrl(e.target.value)}
              style={{
                flex: 1, 
                padding: '12px 20px', 
                borderRadius: '100px', 
                border: `1px solid ${border}`,
                background: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb', 
                color: txt, 
                fontSize: 13,
                outline: 'none'
              }}
            />
            <button
              onClick={() => handleUpdateAvatar(avatarInputUrl)}
              style={{
                padding: '0 24px', 
                background: txt, 
                color: isDark ? '#000' : '#fff',
                border: 'none', 
                borderRadius: '100px', 
                fontWeight: 700, 
                fontSize: 13, 
                cursor: 'pointer',
              }}
            >
              Set
            </button>
          </div>
        </div>

        <button 
          onClick={() => setShowAvatarModal(false)} 
          style={{
            width: '100%', 
            padding: '12px 0', 
            background: 'none', 
            color: '#ef4444', 
            fontWeight: 700, 
            fontSize: 13, 
            cursor: 'pointer',
            border: 'none'
          }}
        >
          Cancel
        </button>
      </div>

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
              onClick={() => triggerAccountSheetTransition('accounts')}
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
                  transform: activeAccountSheet === 'accounts' ? 'rotate(180deg)' : 'none', 
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
                    background: 'none', color:txt,
                  }}
                >
                  <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="19" r="2.2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div style={{flex:1, overflowY:'auto'}}>
            {/* Header (Stats) */}
            <div style={{display:'flex', alignItems:'center', padding:'16px 16px 8px', gap:24}}>
              <div 
                onClick={isOwnProfile ? () => setShowAvatarModal(true) : undefined}
                style={{
                  width:80, height:80, borderRadius:'50%', flexShrink:0,
                  background: isDark ? '#26262d':'#e5e7eb',
                  border:`0.5px solid ${isDark ? 'rgba(255,255,255,0.15)':'#d1d5db'}`,
                  overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
                  cursor: isOwnProfile ? 'pointer' : 'default', position: 'relative'
                }}
                title={isOwnProfile ? "Change profile picture" : ""}
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
                        onClose();
                        if (onOpenChat) {
                          onOpenChat(targetUser);
                        } else if (typeof window !== 'undefined') {
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

            <span style={{fontWeight:700, fontSize:18, color:txt}}>Profile</span>

            <div style={{width: 22}} />
          </div>

          {/* Settings Options Scrollable Body */}
          <div style={{flex:1, overflowY:'auto', padding:'20px 20px'}}>
            
            {/* User Profile Header Card - Rounded & styled like attached picture */}
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
              border: `1px solid ${border}`, borderRadius: 20, padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
              boxShadow: isDark ? 'none' : '0 4px 12px rgba(0,0,0,0.02)'
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', overflow: 'hidden',
                background: isDark ? '#26262d' : '#e5e7eb', flexShrink: 0,
                border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'}`
              }}>
                {image 
                  ? <img src={image} alt={name} style={{width: '100%', height: '100%', objectFit: 'cover'}} referrerPolicy="no-referrer" />
                  : <DefaultAvatarSvg size={44} color={txt} />
                }
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                <span style={{fontSize: 16, fontWeight: 700, color: txt}}>{name}</span>
                <span style={{fontSize: 12, color: sub}}>{fullUser?.email || (username + '@gmail.com')}</span>
              </div>
            </div>

            {/* Settings Menu List */}
            <div style={{display: 'flex', flexDirection: 'column'}}>
              
              {/* Manage Profile */}
              <div 
                onClick={() => setSubView('edit_profile')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Manage Profile</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

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
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Saved Posts & Reels</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Private Account Switch Row */}
              <div 
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Private Account</span>
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
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Password & Security</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Notifications */}
              <div 
                onClick={() => setSubView('notifications')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Notifications</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Language */}
              <div 
                onClick={() => alert('Language is set to English (US).')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h2m0 0l-1.5-1.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Language</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* About Us */}
              <div 
                onClick={() => alert('Connect is a premium next-gen social network.')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>About Us</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Theme */}
              <div 
                onClick={toggleTheme}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Theme ({theme === 'dark' ? 'Dark' : 'Light'})</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Appointments */}
              <div 
                onClick={() => alert('No active appointments scheduled.')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Appointments</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Help Center */}
              <div 
                onClick={() => alert('Welcome to Help Center! Contact support@connect.net for issues.')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Help Center</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Contact Us */}
              <div 
                onClick={() => alert('Connect Support: +1 (800) 555-0199')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 8px', borderBottom: `1px solid ${border}`, cursor: 'pointer'
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: sub, display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 500, color: txt}}>Contact Us</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: sub}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>

              {/* Sign Out Row */}
              <div 
                onClick={() => signOut({ callbackUrl: '/accounts' })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '20px 8px', cursor: 'pointer', marginTop: 8
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{color: '#ef4444', display: 'flex', alignItems: 'center'}}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                  </span>
                  <span style={{fontSize: 14, fontWeight: 600, color: '#ef4444'}}>Sign Out</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color: '#ef4444'}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
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
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, maxHeight: 220, overflowY: 'auto' }}>
          {savedAccounts.map((acc, idx) => {
            const curUsername = fullUser?.username || session?.user?.username || (fullUser?.email || session?.user?.email || '').split('@')[0] || 'user';
            const isActive = acc.username === curUsername;
            return (
              <div 
                key={idx}
                onClick={() => handleAccountSwitch(acc)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: '16px', background: '#f9fafb',
                  cursor: 'pointer', border: isActive ? '1px solid #121214' : '1px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', background: '#e5e7eb',
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {acc.image 
                      ? <img src={acc.image} alt={acc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <DefaultAvatarSvg size={24} color="#374151" />
                    }
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#121214' }}>{acc.name || 'User'}</span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>@{acc.username}</span>
                  </div>
                </div>
                {isActive && (
                  <svg width="18" height="18" fill="none" stroke="#121214" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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

      {/* 2. Options (SignIn/SignUp chooser) sheet */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: '#ffffff', borderTop: '1px solid #e5e7eb', borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '24px 24px 32px', boxShadow: '0 -15px 40px rgba(0,0,0,0.15)',
          transform: activeAccountSheet === 'options' ? 'translateY(0)' : 'translateY(100%)',
          opacity: activeAccountSheet === 'options' ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: activeAccountSheet === 'options' ? 'auto' : 'none',
        }}
      >
        <div style={{ width: 48, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#121214', marginBottom: 4, textAlign: 'center' }}>Add Account</h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20, textAlign: 'center' }}>
          Choose whether to log in to an existing account or create a new one.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button
            onClick={() => triggerAccountSheetTransition('signIn')}
            style={{
              width: '100%', padding: '14px 0', background: '#121214', color: '#fff',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 13,
            }}
          >
            Log into Existing Account
          </button>
          <button
            onClick={() => triggerAccountSheetTransition('signUp')}
            style={{
              width: '100%', padding: '14px 0', background: '#f3f4f6', color: '#121214',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: '1px solid #e5e7eb', fontSize: 13,
            }}
          >
            Create New Account
          </button>
          <button
            onClick={() => triggerAccountSheetTransition('accounts')}
            style={{
              width: '100%', padding: '10px 0', background: 'none', color: '#6b7280',
              borderRadius: '100px', fontWeight: 600, cursor: 'pointer', border: 'none', fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* 3. Sign In form sheet */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: '#ffffff', borderTop: '1px solid #e5e7eb', borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '24px 24px 32px', boxShadow: '0 -15px 40px rgba(0,0,0,0.15)',
          transform: activeAccountSheet === 'signIn' ? 'translateY(0)' : 'translateY(100%)',
          opacity: activeAccountSheet === 'signIn' ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: activeAccountSheet === 'signIn' ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button 
            type="button"
            onClick={() => triggerAccountSheetTransition('options')}
            style={{ background: 'none', border: 'none', color: '#121214', cursor: 'pointer', padding: 0 }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div style={{ width: 48, height: 4, background: '#e5e7eb', borderRadius: 2 }} />
          <div style={{ width: 22 }} />
        </div>

        <form onSubmit={handleSwitchLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#121214', marginBottom: 4 }}>Sign In</h2>
          {switchError && <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>{switchError}</div>}
          
          <input
            type="email"
            placeholder="Email Address"
            required
            value={switchEmail}
            onChange={e => setSwitchEmail(e.target.value)}
            style={{
              width: '100%', borderRadius: '100px', background: '#f9fafb', color: '#121214', border: '1px solid #e5e7eb',
              padding: '12px 20px', outline: 'none', fontSize: 13
            }}
          />

          <input
            type="password"
            placeholder="Password"
            required
            value={switchPassword}
            onChange={e => setSwitchPassword(e.target.value)}
            style={{
              width: '100%', borderRadius: '100px', background: '#f9fafb', color: '#121214', border: '1px solid #e5e7eb',
              padding: '12px 20px', outline: 'none', fontSize: 13
            }}
          />

          <button
            type="submit"
            disabled={switchLoading}
            style={{
              width: '100%', padding: '14px 0', background: '#121214', color: '#fff',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 13,
              opacity: switchLoading ? 0.6 : 1, transition: 'all 0.2s', marginTop: 10
            }}
          >
            {switchLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* 4. Sign Up form sheet */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 100,
          background: '#ffffff', borderTop: '1px solid #e5e7eb', borderTopLeftRadius: '2.5rem', borderTopRightRadius: '2.5rem',
          padding: '24px 24px 32px', boxShadow: '0 -15px 40px rgba(0,0,0,0.15)',
          transform: activeAccountSheet === 'signUp' ? 'translateY(0)' : 'translateY(100%)',
          opacity: activeAccountSheet === 'signUp' ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: activeAccountSheet === 'signUp' ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button 
            type="button"
            onClick={() => triggerAccountSheetTransition('options')}
            style={{ background: 'none', border: 'none', color: '#121214', cursor: 'pointer', padding: 0 }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div style={{ width: 48, height: 4, background: '#e5e7eb', borderRadius: 2 }} />
          <div style={{ width: 22 }} />
        </div>

        <form onSubmit={handleSwitchSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#121214', marginBottom: 4 }}>Sign Up</h2>
          {switchError && <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>{switchError}</div>}

          <input
            type="text"
            placeholder="Username"
            required
            value={switchUsername}
            onChange={e => setSwitchUsername(e.target.value)}
            style={{
              width: '100%', borderRadius: '100px', background: '#f9fafb', color: '#121214', border: '1px solid #e5e7eb',
              padding: '12px 20px', outline: 'none', fontSize: 13
            }}
          />

          <input
            type="email"
            placeholder="Email Address"
            required
            value={switchEmail}
            onChange={e => setSwitchEmail(e.target.value)}
            style={{
              width: '100%', borderRadius: '100px', background: '#f9fafb', color: '#121214', border: '1px solid #e5e7eb',
              padding: '12px 20px', outline: 'none', fontSize: 13
            }}
          />

          <input
            type="password"
            placeholder="Password"
            required
            value={switchPassword}
            onChange={e => setSwitchPassword(e.target.value)}
            style={{
              width: '100%', borderRadius: '100px', background: '#f9fafb', color: '#121214', border: '1px solid #e5e7eb',
              padding: '12px 20px', outline: 'none', fontSize: 13
            }}
          />

          <button
            type="submit"
            disabled={switchLoading}
            style={{
              width: '100%', padding: '14px 0', background: '#121214', color: '#fff',
              borderRadius: '100px', fontWeight: 700, cursor: 'pointer', border: 'none', fontSize: 13,
              opacity: switchLoading ? 0.6 : 1, transition: 'all 0.2s', marginTop: 10
            }}
          >
            {switchLoading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
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
                maxLength={1}
                value={digit}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const next = [...switchOtp];
                  next[i] = raw;
                  setSwitchOtp(next);
                  if (raw && i < 5) switchOtpRefs.current[i + 1]?.focus();
                }}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && !switchOtp[i] && i > 0) {
                    switchOtpRefs.current[i - 1]?.focus();
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
