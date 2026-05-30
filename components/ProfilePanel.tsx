'use client';

import React, { useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';

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
  isDark: boolean;
  onEditName: () => void;
  onInstall: () => void;
  hasUnreadNotifications?: boolean;
  highlights?: Highlight[];
  posts?: Post[];
  reels?: Post[];
  tagged?: Post[];
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
      <div style={{fontSize:64}}>{highlight.emoji || '📖'}</div>
      <p style={{marginTop:16, fontSize:20, fontWeight:700}}>{highlight.title}</p>
      <p style={{fontSize:13, opacity:0.5, marginTop:8}}>No stories yet</p>
    </div>
  );
}

/* ─── Menu bottom sheet ─── */
function MenuSheet({ onClose, onInstall, isDark }: { onClose: () => void; onInstall: () => void; isDark: boolean }) {
  const bg  = isDark ? '#1c1c1e' : '#fff';
  const txt = isDark ? '#fff'    : '#111';
  return (
    <div style={{position:'absolute',inset:0,zIndex:100,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: bg, borderRadius:'20px 20px 0 0', padding:'20px 0 32px',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        {[
          { label:'Install App 📲',  action: onInstall },
          { label:'Sign Out',        action: () => signOut({ callbackUrl:'/' }), danger: true },
        ].map(item => (
          <button key={item.label} onClick={() => { item.action(); onClose(); }} style={{
            width:'100%', padding:'16px 24px', background:'none', border:'none',
            textAlign:'left', fontSize:16, fontWeight:500, cursor:'pointer',
            color: (item as any).danger ? '#ef4444' : txt,
          }}>
            {item.label}
          </button>
        ))}
        <button onClick={onClose} style={{
          width:'100%', padding:'16px 24px', background:'none', border:'none',
          textAlign:'left', fontSize:16, color: isDark ? '#a1a1aa':'#9ca3af', cursor:'pointer',
        }}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Main component ─── */
export default function ProfilePanel({
  isOpen, isClosing, onClose, session, fullUser, isDark,
  onEditName, onInstall,
  hasUnreadNotifications = false,
  highlights = DEFAULT_HIGHLIGHTS,
  posts   = DEFAULT_POSTS,
  reels   = DEFAULT_REELS,
  tagged  = DEFAULT_TAGGED,
}: Props) {
  const [activeTab, setActiveTab]         = useState<'grid'|'reels'|'tagged'>('grid');
  const [isMenuOpen, setIsMenuOpen]       = useState(false);
  const [activeStory, setActiveStory]     = useState<Highlight | null>(null);
  const [copyToast, setCopyToast]         = useState(false);

  /* Derived profile data */
  const name     = fullUser?.name     || session?.user?.name  || 'User';
  const email    = fullUser?.email    || session?.user?.email || '';
  const image    = fullUser?.image    || session?.user?.image;
  const username = (fullUser?.username || email.split('@')[0] || 'user').toLowerCase().replace(/\s+/g,'');
  const bio      = fullUser?.bio      || 'ASL Communicator & Language Learner 🤟\nBreaking barriers, one sign at a time.\nBuilding inclusive communities worldwide.';
  const website  = fullUser?.website  || 'connect.app';
  const metrics  = {
    posts:     fullUser?.metrics?.posts     ?? posts.length,
    followers: fullUser?.metrics?.followers ?? 0,
    following: fullUser?.metrics?.following ?? 0,
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

  /* Grid content per tab */
  const gridItems = activeTab === 'reels' ? reels : activeTab === 'tagged' ? tagged : posts;

  if (!isOpen) return null;

  const border  = isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0';
  const txt     = isDark ? '#fff'    : '#111';
  const sub     = isDark ? '#a1a1aa' : '#6b7280';
  const btnBg   = isDark ? 'rgba(255,255,255,0.10)' : '#f3f4f6';
  const btnBdr  = isDark ? 'rgba(255,255,255,0.15)' : '#e5e7eb';

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

      {/* ── Menu Bottom Sheet ── */}
      {isMenuOpen && (
        <MenuSheet onClose={() => setIsMenuOpen(false)} onInstall={onInstall} isDark={isDark} />
      )}

      {/* ── Copy toast ── */}
      {copyToast && (
        <div style={{
          position:'absolute', bottom:80, left:'50%', transform:'translateX(-50%)',
          background:'#10b981', color:'#fff', padding:'8px 20px',
          borderRadius:100, fontSize:13, fontWeight:600, zIndex:99, whiteSpace:'nowrap',
        }}>
          Link copied to clipboard ✓
        </div>
      )}

      {/* ── 1. Top Nav Bar ── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 16px', borderBottom:`1px solid ${border}`, flexShrink:0,
      }}>
        {/* Back */}
        <button onClick={onClose} style={{
          width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6', color:txt,
        }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
        </button>

        {/* Username */}
        <span style={{fontWeight:700, fontSize:16, color:txt}}>@{username}</span>

        {/* Right: notification + menu */}
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          {/* Notification bell */}
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

          {/* Options (⋯) */}
          <button onClick={() => setIsMenuOpen(true)} style={{background:'none', border:'none', cursor:'pointer', color:txt, padding:4}}>
            <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{flex:1, overflowY:'auto'}}>

        {/* ── 2. Profile Header (Stats) ── */}
        <div style={{display:'flex', alignItems:'center', padding:'16px 16px 8px', gap:24}}>
          {/* Avatar */}
          <div style={{
            width:80, height:80, borderRadius:'50%', flexShrink:0,
            background: isDark ? '#26262d':'#e5e7eb',
            border:`3px solid ${isDark ? 'rgba(255,255,255,0.15)':'#d1d5db'}`,
            overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {image
              ? <img src={image} alt={name} style={{width:'100%',height:'100%',objectFit:'cover'}} referrerPolicy="no-referrer"/>
              : <span style={{fontSize:28, fontWeight:700, color: isDark?'#fff':'#374151'}}>{name.charAt(0).toUpperCase()}</span>
            }
          </div>

          {/* Stats */}
          <div style={{flex:1, display:'flex', justifyContent:'space-around'}}>
            {([
              { num: metrics.posts,     label:'Posts' },
              { num: metrics.followers, label:'Followers' },
              { num: metrics.following, label:'Following' },
            ] as {num:number,label:string}[]).map(s => (
              <div key={s.label} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer'}}>
                <span style={{fontWeight:700, fontSize:17, color:txt}}>{s.num}</span>
                <span style={{fontSize:12, color:sub}}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3. Bio Section ── */}
        <div style={{padding:'4px 16px 12px', display:'flex', flexDirection:'column', gap:3}}>
          <span style={{fontWeight:700, fontSize:14, color:txt}}>{name}</span>
          {/* Render line breaks from bio string */}
          {bio.split('\n').map((line: string, i: number) => (
            <span key={i} style={{fontSize:13, color:sub}}>{line}</span>
          ))}
          {/* Website link */}
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

        {/* ── 4. Action Buttons ── */}
        <div style={{display:'flex', padding:'0 16px 12px', gap:8}}>
          <button onClick={onEditName} style={{
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
        </div>

        {/* ── 5. Highlights ── */}
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

        {/* ── 6. Tab Navigation ── */}
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

        {/* ── 7. Image Grid ── */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2}}>
          {gridItems.map((post, i) => (
            <div
              key={post.id}
              onClick={() => { /* router.push(`/p/${post.id}`) — no router import needed here, use window */ if (typeof window !== 'undefined') window.location.href = `/p/${post.id}`; }}
              style={{
                aspectRatio:'1/1', position:'relative', overflow:'hidden', cursor:'pointer',
                background: post.thumbnailUrl
                  ? `url(${post.thumbnailUrl}) center/cover`
                  : isDark
                    ? `hsl(${post.hue??220},20%,${15+i*3}%)`
                    : `hsl(${post.hue??220},30%,${80-i*5}%)`,
              }}
            >
              <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,transparent 60%,rgba(0,0,0,.25))'}}/>
              <div style={{position:'absolute', top:6, right:6}}>
                {post.postType === 'carousel' && <CarouselIcon/>}
                {post.postType === 'reel'     && <ReelIcon/>}
              </div>
            </div>
          ))}
        </div>

        {gridItems.length === 0 && (
          <div style={{padding:'40px 16px', textAlign:'center', color:sub, fontSize:14}}>
            No {activeTab === 'reels' ? 'reels' : activeTab === 'tagged' ? 'tagged posts' : 'posts'} yet.
          </div>
        )}

        <div style={{height:24}}/>
      </div>
    </div>
  );
}
