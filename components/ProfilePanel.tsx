'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { 
  updateProfileDetails, 
  updateProfileImageAction, 
  getFollowRequests, 
  respondToFollowRequest, 
  createPostAction, 
  deletePostAction,
  toggleProfilePrivacy
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

export interface Highlight {
  id: string;
  title: string;
  coverImageUrl?: string;
  emoji?: string;
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
  highlights?: Highlight[];
  posts?: Post[];
  reels?: Post[];
  tagged?: Post[];
  refreshProfile?: () => void;
  onToggleFollow?: (targetUserId: string) => void;
}

/* ─── Default data ─── */
const DEFAULT_HIGHLIGHTS: Highlight[] = [
  { id: '1', title: 'Morning', emoji: '🌅' },
  { id: '2', title: 'Travel',  emoji: '✈️' },
  { id: '3', title: 'Food',    emoji: '🍕' },
  { id: '4', title: 'Work',    emoji: '💼' },
  { id: '5', title: 'Friends', emoji: '👥' },
];

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

/* ─── Story Viewer overlay ─── */
function StoryViewer({ highlight, onClose, isDark }: { highlight: Highlight; onClose: () => void; isDark: boolean }) {
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200, display:'flex', flexDirection:'column',
      background:'#000', color:'#fff', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{position:'absolute', top:16, right:16}}>
        <button onClick={onClose} style={{background:'none',border:'none',color:'#fff',fontSize:28,cursor:'pointer'}}>✕</button>
      </div>
      <div style={{fontSize:64, textAlign: 'center', marginTop: 120}}>{highlight.emoji || '⭐'}</div>
      <p style={{marginTop:16, fontSize:20, fontWeight:700, textAlign: 'center'}}>{highlight.title}</p>
      <p style={{fontSize:13, opacity:0.5, marginTop:8, textAlign: 'center'}}>No stories yet</p>
    </div>
  );
}

/* ─── Main component ─── */
export default function ProfilePanel({
  isOpen, isClosing, onClose, session, fullUser, targetUser, isDark,
  onEditName, onInstall,
  hasUnreadNotifications = false,
  highlights = DEFAULT_HIGHLIGHTS,
  refreshProfile,
  onToggleFollow,
}: Props) {
  const [activeTab, setActiveTab]         = useState<'grid'|'reels'|'tagged'>('grid');
  const [activeStory, setActiveStory]     = useState<Highlight | null>(null);
  const [copyToast, setCopyToast]         = useState(false);

  /* Multi-page Navigation States */
  const [subView, setSubView]             = useState<'profile' | 'followers' | 'following' | 'edit_profile' | 'follow_requests' | 'settings'>('profile');
  const [searchQuery, setSearchQuery]     = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarInputUrl, setAvatarInputUrl] = useState('');
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
      setEditName(fullUser.name || '');
      setEditUsername(fullUser.username || '');
      setEditBio(fullUser.bio || '');
      setEditWebsite(fullUser.website || '');
    }
  }, [fullUser]);

  /* Profile ownership */
  const isOwnProfile = !targetUser || targetUser.isCurrentUser;

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
      className={isClosing ? 'animate-profile-out' : 'animate-profile-in'}
      style={{
        position:'absolute', inset:0, zIndex:50, display:'flex',
        flexDirection:'column', overflow:'hidden',
        background: isDark ? '#0e0e11' : '#fff',
        borderLeft: `1px solid ${border}`,
      }}
    >
      {/* ── Story Viewer Overlay ── */}
      {activeStory && (
        <StoryViewer highlight={activeStory} onClose={() => setActiveStory(null)} isDark={isDark} />
      )}

      {/* ── Center Avatar Changing Modal ── */}
      {showAvatarModal && isOwnProfile && (
        <div 
          style={{
            position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          }} 
          onClick={() => setShowAvatarModal(false)}
        >
          <div 
            style={{
              width: '85%', maxWidth: 360, background: isDark ? '#1c1c1e' : '#fff', borderRadius: 24, padding: 24,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 18,
            }} 
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{margin: 0, fontSize: 18, fontWeight: 700, color: txt, textAlign: 'center'}}>Change Profile Picture</h3>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              {/* File upload option */}
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px',
                background: isDark ? '#3a3a3c' : '#e5e7eb', color: txt, borderRadius: 14,
                fontWeight: 600, fontSize: 14, cursor: 'pointer', textAlign: 'center', border: `1px solid ${border}`
              }}>
                Choose from Library
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{display: 'none'}} />
              </label>
              
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0', color: sub, fontSize: 11}}>
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
                    flex: 1, padding: '12px 14px', borderRadius: 14, border: `1px solid ${border}`,
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', color: txt, fontSize: 13,
                    outline: 'none'
                  }}
                />
                <button
                  onClick={() => handleUpdateAvatar(avatarInputUrl)}
                  style={{
                    padding: '0 16px', background: txt, color: isDark ? '#000' : '#fff',
                    border: 'none', borderRadius: 14, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Set
                </button>
              </div>
            </div>
            
            <div style={{borderTop: `1px solid ${border}`, paddingTop: 14, display: 'flex', justifyContent: 'center'}}>
              <button onClick={() => setShowAvatarModal(false)} style={{
                background: 'none', border: 'none', color: '#ef4444', fontWeight: 600, fontSize: 14, cursor: 'pointer'
              }}>
                Cancel
              </button>
            </div>
          </div>
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
              width: '80%', maxWidth: 300, background: isDark ? '#1c1c1e' : '#fff', borderRadius: 24, padding: 24,
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
                  borderRadius: 14, fontWeight: 600, cursor: 'pointer', borderStyle: 'solid'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePost}
                style={{
                  flex: 1, padding: '12px', background: '#ef4444', border: 'none', color: '#fff',
                  borderRadius: 14, fontWeight: 600, cursor: 'pointer',
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
            <button onClick={onClose} style={{
              width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: btnBg, color:txt,
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>@{username}</span>

            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              {/* Notification bell - only for own profile */}
              {isOwnProfile && (
                <button onClick={() => {}} style={{position:'relative', background:'none', border:'none', cursor:'pointer', color:txt, padding:4}}>
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                  {hasUnreadNotifications && (
                    <span style={{
                      position:'absolute', top:2, right:2,
                      width:8, height:8, borderRadius:'50%', background:'#ef4444',
                      border:`2px solid ${isDark ? '#0e0e11':'#fff'}`,
                    }}/>
                  )}
                </button>
              )}

              {/* Options/Settings trigger - only for own profile */}
              {isOwnProfile && (
                <button onClick={() => setSubView('settings')} style={{background:'none', border:'none', cursor:'pointer', color:txt, padding:4}}>
                  <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div style={{flex:1, overflowY:'auto'}}>
            {/* Header (Stats) */}
            <div style={{display:'flex', alignItems:'center', padding:'16px 16px 8px', gap:24}}>
              <div 
                onClick={() => { if (isOwnProfile) setShowAvatarModal(true); }}
                style={{
                  width:80, height:80, borderRadius:'50%', flexShrink:0,
                  background: isDark ? '#26262d':'#e5e7eb',
                  border:`3px solid ${isDark ? 'rgba(255,255,255,0.15)':'#d1d5db'}`,
                  overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
                  cursor: isOwnProfile ? 'pointer' : 'default', position: 'relative'
                }}
                title={isOwnProfile ? "Change profile picture" : ""}
              >
                {image
                  ? <img src={image} alt={name} style={{width:'100%',height:'100%',objectFit:'cover'}} referrerPolicy="no-referrer"/>
                  : <span style={{fontSize:28, fontWeight:700, color: isDark?'#fff':'#374151'}}>{name.charAt(0).toUpperCase()}</span>
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
              {bio ? (
                bio.split('\n').map((line: string, i: number) => (
                  <span key={i} style={{fontSize:13, color:sub}}>{line}</span>
                ))
              ) : (
                <span style={{fontSize:13, color:sub, fontStyle: 'italic'}}>No bio set yet.</span>
              )}
              
              {website && (
                <a
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{display:'flex', alignItems:'center', gap:4, textDecoration:'none', marginTop:2}}
                >
                  <svg width="12" height="12" fill="none" stroke="#6366f1" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                  </svg>
                  <span style={{fontSize:12, color:'#6366f1', fontWeight:600}}>{website}</span>
                </a>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{display:'flex', padding:'0 16px 12px', gap:8}}>
              {isOwnProfile ? (
                <>
                  <button onClick={() => setSubView('edit_profile')} style={{
                    flex:1, padding:'8px', borderRadius:10, fontWeight:600, fontSize:13,
                    background:btnBg, border:`1px solid ${btnBdr}`, color:txt, cursor:'pointer', transition:'all 0.2s',
                  }}>
                    Edit Profile
                  </button>
                  <button onClick={handleShare} style={{
                    flex:1, padding:'8px', borderRadius:10, fontWeight:600, fontSize:13,
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
                      flex:1, padding:'8px', borderRadius:10, fontWeight:600, fontSize:13,
                      background: targetUser?.isFollowing 
                        ? btnBg 
                        : targetUser?.hasSentRequest 
                          ? btnBg 
                          : '#6366f1',
                      border: targetUser?.isFollowing || targetUser?.hasSentRequest
                        ? `1px solid ${btnBdr}`
                        : 'none',
                      color: targetUser?.isFollowing || targetUser?.hasSentRequest
                        ? txt
                        : '#fff',
                      cursor:'pointer', transition:'all 0.2s',
                    }}
                  >
                    {targetUser?.isFollowing 
                      ? 'Following' 
                      : targetUser?.hasSentRequest 
                        ? 'Requested' 
                        : 'Follow'}
                  </button>
                  <button 
                    onClick={() => {
                      onClose();
                      if (typeof window !== 'undefined') {
                        window.location.href = `/dashboard?chat=${targetUser.id}`;
                      }
                    }} 
                    style={{
                      flex:1, padding:'8px', borderRadius:10, fontWeight:600, fontSize:13,
                      background:btnBg, border:`1px solid ${btnBdr}`, color:txt, cursor:'pointer', transition:'all 0.2s',
                    }}
                  >
                    Message
                  </button>
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
                {/* Highlights - only show if public */}
                <div style={{display:'flex', gap:16, padding:'8px 16px 16px', overflowX:'auto', scrollbarWidth:'none'}}>
                  {highlights.map((hl, i) => (
                    <div
                      key={hl.id}
                      onClick={() => setActiveStory(hl)}
                      style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6, flexShrink:0, cursor:'pointer'}}
                    >
                      <div style={{
                        width:64, height:64, borderRadius:'50%',
                        border:`2px solid ${isDark?'rgba(255,255,255,0.2)':'#d1d5db'}`, padding:3,
                      }}>
                        <div style={{
                          width:'100%', height:'100%', borderRadius:'50%',
                          background: hl.coverImageUrl
                            ? `url(${hl.coverImageUrl}) center/cover`
                            : isDark ? `hsl(${i*60},50%,20%)` : `hsl(${i*60},60%,90%)`,
                          display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden',
                        }}>
                          {!hl.coverImageUrl && <span style={{fontSize:20}}>{hl.emoji || '⭐'}</span>}
                        </div>
                      </div>
                      <span style={{fontSize:11, color:sub}}>{hl.title}</span>
                    </div>
                  ))}
                </div>

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
            padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
          }}>
            <button onClick={() => setSubView('profile')} style={{
              width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: btnBg, color:txt,
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
            </button>

            <span style={{fontWeight:700, fontSize:16, color:txt}}>Settings</span>

            <div style={{width: 36}} />
          </div>

          {/* Settings Options Scrollable Body */}
          <div style={{flex:1, overflowY:'auto', padding:'20px 16px'}}>
            
            {/* Account Privacy Card */}
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
              border: `1px solid ${border}`, borderRadius: 20, padding: 20, marginBottom: 20
            }}>
              <h3 style={{fontSize: 14, fontWeight: 700, color: txt, marginBottom: 4}}>Account Privacy</h3>
              <p style={{fontSize: 12, color: sub, marginBottom: 16}}>Customize who can see your shared posts and reels.</p>
              
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <span style={{fontSize: 13, fontWeight: 500, color: txt}}>Private Account</span>
                <button 
                  onClick={() => handleTogglePrivacy(!fullUser?.isPrivate)}
                  style={{
                    width: 50, height: 26, borderRadius: 100, border: 'none',
                    background: fullUser?.isPrivate ? '#6366f1' : (isDark ? '#3a3a3c' : '#d1d5db'),
                    position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, 
                    left: fullUser?.isPrivate ? 27 : 3,
                    transition: 'left 0.2s'
                  }} />
                </button>
              </div>
            </div>

            {/* Profile editing card */}
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
              border: `1px solid ${border}`, borderRadius: 20, padding: 20, marginBottom: 20,
              display: 'flex', flexDirection: 'column', gap: 14
            }}>
              <div>
                <h3 style={{fontSize: 14, fontWeight: 700, color: txt, marginBottom: 4}}>Profile Details</h3>
                <p style={{fontSize: 12, color: sub}}>Update display identity, account bio and links.</p>
              </div>
              <button 
                onClick={() => setSubView('edit_profile')}
                style={{
                  width: '100%', padding: '12px', background: btnBg, border: `1px solid ${btnBdr}`,
                  color: txt, borderRadius: 12, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                Edit Profile Details
              </button>
            </div>

            {/* Preferences Toggles */}
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
              border: `1px solid ${border}`, borderRadius: 20, padding: 20, marginBottom: 20,
              display: 'flex', flexDirection: 'column', gap: 18
            }}>
              <div>
                <h3 style={{fontSize: 14, fontWeight: 700, color: txt, marginBottom: 4}}>App Preferences</h3>
                <p style={{fontSize: 12, color: sub}}>Enable or disable specific features within Connect.</p>
              </div>

              {/* Toggle 1: Desktop Notifications */}
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <span style={{fontSize: 13, fontWeight: 500, color: txt}}>Desktop Notifications</span>
                <button 
                  onClick={() => savePreference('pref_notifications', !prefNotifications, setPrefNotifications)}
                  style={{
                    width: 50, height: 26, borderRadius: 100, border: 'none',
                    background: prefNotifications ? '#6366f1' : (isDark ? '#3a3a3c' : '#d1d5db'),
                    position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, 
                    left: prefNotifications ? 27 : 3,
                    transition: 'left 0.2s'
                  }} />
                </button>
              </div>

              {/* Toggle 2: Read Receipts */}
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <span style={{fontSize: 13, fontWeight: 500, color: txt}}>Read Receipts</span>
                <button 
                  onClick={() => savePreference('pref_read_receipts', !prefReadReceipts, setPrefReadReceipts)}
                  style={{
                    width: 50, height: 26, borderRadius: 100, border: 'none',
                    background: prefReadReceipts ? '#6366f1' : (isDark ? '#3a3a3c' : '#d1d5db'),
                    position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, 
                    left: prefReadReceipts ? 27 : 3,
                    transition: 'left 0.2s'
                  }} />
                </button>
              </div>

              {/* Toggle 3: Online Status */}
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <span style={{fontSize: 13, fontWeight: 500, color: txt}}>Online Status indicator</span>
                <button 
                  onClick={() => savePreference('pref_online_status', !prefOnlineStatus, setPrefOnlineStatus)}
                  style={{
                    width: 50, height: 26, borderRadius: 100, border: 'none',
                    background: prefOnlineStatus ? '#6366f1' : (isDark ? '#3a3a3c' : '#d1d5db'),
                    position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, 
                    left: prefOnlineStatus ? 27 : 3,
                    transition: 'left 0.2s'
                  }} />
                </button>
              </div>
            </div>

            {/* Sign Out Card */}
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
              border: `1px solid ${border}`, borderRadius: 20, padding: 20, marginBottom: 40,
              display: 'flex', flexDirection: 'column', gap: 14
            }}>
              <div>
                <h3 style={{fontSize: 14, fontWeight: 700, color: txt, marginBottom: 4}}>Account Session</h3>
                <p style={{fontSize: 12, color: sub}}>Logout of your active session on this device.</p>
              </div>
              <button 
                onClick={() => signOut({ callbackUrl: '/' })}
                style={{
                  width: '100%', padding: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)',
                  color: '#ef4444', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                Sign Out
              </button>
            </div>

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
              width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: btnBg, color:txt,
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
                background:'none', border:'none', color:'#6366f1', fontWeight:700, fontSize:14, cursor:'pointer',
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
                    padding: '12px 14px', borderRadius: 12, border: `1px solid ${border}`,
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
                  onChange={e => setEditUsername(e.target.value)}
                  style={{
                    padding: '12px 14px', borderRadius: 12, border: `1px solid ${border}`,
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
                    padding: '12px 14px', borderRadius: 12, border: `1px solid ${border}`,
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
                    padding: '12px 14px', borderRadius: 12, border: `1px solid ${border}`,
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
              width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: btnBg, color:txt,
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
                  width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: `1px solid ${border}`,
                  background: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6', color: txt, fontSize: 14, outline: 'none'
                }}
              />
              <svg style={{position: 'absolute', left: 12, color: sub}} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', borderRadius: 14,
                  border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                  <span>Follow Requests</span>
                </div>
                <div style={{
                  background: '#6366f1', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 10
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
                        : <span style={{fontWeight: 700}}>{(f.name || 'U').charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column'}}>
                      <span style={{fontSize: 14, fontWeight: 700, color: txt}}>{f.name}</span>
                      <span style={{fontSize: 12, color: sub}}>@{f.username || 'user'}</span>
                    </div>
                  </div>
                  {isOwnProfile && (
                    <button style={{
                      padding: '6px 12px', background: btnBg, border: `1px solid ${btnBdr}`,
                      color: txt, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer'
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
              width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: btnBg, color:txt,
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
                  width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: `1px solid ${border}`,
                  background: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6', color: txt, fontSize: 14, outline: 'none'
                }}
              />
              <svg style={{position: 'absolute', left: 12, color: sub}} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        : <span style={{fontWeight: 700}}>{(f.name || 'U').charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column'}}>
                      <span style={{fontSize: 14, fontWeight: 700, color: txt}}>{f.name}</span>
                      <span style={{fontSize: 12, color: sub}}>@{f.username || 'user'}</span>
                    </div>
                  </div>
                  {isOwnProfile && (
                    <button style={{
                      padding: '6px 12px', background: btnBg, border: `1px solid ${btnBdr}`,
                      color: txt, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer'
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
              width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: btnBg, color:txt,
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
                      : <span style={{fontWeight: 700}}>{(req.sender.name || 'U').charAt(0).toUpperCase()}</span>
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
                      padding: '6px 14px', background: '#6366f1', color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Accept
                  </button>
                  <button 
                    onClick={() => handleRespondRequest(req.id, 'decline')}
                    style={{
                      padding: '6px 14px', background: btnBg, border: `1px solid ${btnBdr}`,
                      color: txt, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer'
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

    </div>
  );
}
