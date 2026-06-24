'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
interface Story {
  id: number;
  name: string;
  isSelf?: boolean;
  hue: number;
}

interface PostData {
  id: number;
  user: string;
  hue: number;
  postHue: number;
  postHue2: number;
  likes: number;
  caption: string;
  time: string;
  liked: boolean;
  saved: boolean;
}

/* ─────────────────────────────────────────
   Seed Data
───────────────────────────────────────── */
const STORIES: Story[] = [
  { id: 0, name: 'Your Story', isSelf: true, hue: 220 },
  { id: 1, name: 'alex_ray', hue: 28 },
  { id: 2, name: 'sarah_k', hue: 145 },
  { id: 3, name: 'jay_p', hue: 268 },
  { id: 4, name: 'mia.ux', hue: 52 },
  { id: 5, name: 'dev_dan', hue: 188 },
  { id: 6, name: 'nina_m', hue: 318 },
  { id: 7, name: 'tomás', hue: 15 },
  { id: 8, name: 'zara_j', hue: 340 },
];

const SEED_POSTS: PostData[] = [
  {
    id: 1, user: 'alex_ray', hue: 28, postHue: 210, postHue2: 250,
    likes: 10547, caption: 'Golden hour vibes ✨ catching the light perfectly 🌅 #photography #travel #goldenhour',
    time: '2 hours ago', liked: true, saved: false,
  },
  {
    id: 2, user: 'sarah_k', hue: 145, postHue: 155, postHue2: 185,
    likes: 4821, caption: 'Exploring new trails every weekend 🌿 The mountains never get old 🏔️',
    time: '4 hours ago', liked: false, saved: true,
  },
  {
    id: 3, user: 'mia.ux', hue: 52, postHue: 42, postHue2: 65,
    likes: 7304, caption: 'Design thinking is everything ✨ Working on something big 🚀 #ux #design #productdesign',
    time: '6 hours ago', liked: false, saved: false,
  },
  {
    id: 4, user: 'dev_dan', hue: 188, postHue: 198, postHue2: 230,
    likes: 3210, caption: 'Ship it! 🚢 Another feature out the door. Building in public is the best decision I ever made.',
    time: '1 day ago', liked: false, saved: false,
  },
];

/* ─────────────────────────────────────────
   Avatar
───────────────────────────────────────── */
const Avatar = ({ hue, size = 32, style }: { hue: number; size?: number; style?: React.CSSProperties }) => (
  <div
    style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue},60%,68%), hsl(${hue + 55},65%,52%))`,
      ...style,
    }}
  />
);

/* ─────────────────────────────────────────
   Story Ring (gradient border)
───────────────────────────────────────── */
const StoryRing = ({ children, size = 60 }: { children: React.ReactNode; size?: number }) => (
  <div
    style={{
      width: size + 6, height: size + 6, borderRadius: '50%', padding: 2.5, flexShrink: 0,
      background: 'linear-gradient(to top right, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)',
    }}
  >
    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'white', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  </div>
);

/* ─────────────────────────────────────────
   Story Viewer Modal
───────────────────────────────────────── */
function StoryModal({ story, onClose }: { story: Story; onClose: () => void }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION = 3000;

  useEffect(() => {
    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const pct = Math.min(((ts - startRef.current) / DURATION) * 100, 100);
      setProgress(pct);
      if (pct < 100) rafRef.current = requestAnimationFrame(tick);
      else setTimeout(onClose, 200);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: `linear-gradient(160deg, hsl(${story.hue},70%,18%), hsl(${story.hue + 60},60%,10%))` }}>
      {/* Progress bar */}
      <div className="absolute top-3 left-3 right-3 h-[3px] rounded-full z-10" style={{ background: 'rgba(255,255,255,0.25)' }}>
        <div className="h-full rounded-full bg-white transition-none" style={{ width: `${progress}%` }} />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-8 pb-3 z-10">
        <div className="flex items-center gap-3">
          <Avatar hue={story.hue} size={34} style={{ border: '2px solid white' }} />
          <span className="text-white font-semibold text-[13px]">{story.name}</span>
          <span className="text-white/50 text-[12px]">1h</span>
        </div>
        <button onClick={onClose} className="text-white p-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} width={22} height={22}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {/* Tap zones */}
      <div className="flex-1 flex">
        <div className="flex-1" onClick={onClose} />
        <div className="flex-1" onClick={onClose} />
      </div>
      {/* Content center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <Avatar hue={story.hue} size={90} style={{ margin: '0 auto 16px', border: '3px solid rgba(255,255,255,0.4)' }} />
          <p className="text-white font-bold text-xl">{story.name}</p>
          <p className="text-white/40 text-sm mt-1">Tap anywhere to close</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Options Bottom Sheet
───────────────────────────────────────── */
function OptionsSheet({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-[201] rounded-t-[28px] overflow-hidden"
        style={{ background: isDark ? '#1c1c1e' : '#fff', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)', animation: 'hf-slideUp 0.35s cubic-bezier(0.25,1,0.5,1) forwards' }}
      >
        <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-1" style={{ background: isDark ? '#3a3a3c' : '#e5e7eb' }} />
        {[
          { label: 'Report', color: '#ef4444' },
          { label: 'Unfollow', color: isDark ? '#fff' : '#111' },
          { label: 'Add to Favorites', color: isDark ? '#fff' : '#111' },
          { label: 'Cancel', color: '#9ca3af' },
        ].map(({ label, color }, i, arr) => (
          <button
            key={label}
            onClick={onClose}
            className="w-full px-6 py-4 text-left text-[15px] font-medium transition-colors active:opacity-60"
            style={{ color, borderBottom: i < arr.length - 1 ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6'}` : 'none' }}
          >
            {label}
          </button>
        ))}
        <div className="h-6" />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   Share Overlay
───────────────────────────────────────── */
function ShareOverlay({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const friends = [
    { name: 'alex_ray', hue: 28 }, { name: 'sarah_k', hue: 145 }, { name: 'jay_p', hue: 268 },
    { name: 'mia.ux', hue: 52 }, { name: 'dev_dan', hue: 188 }, { name: 'nina_m', hue: 318 },
  ];
  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-[201] rounded-t-[28px] pb-8 overflow-hidden"
        style={{ background: isDark ? '#1c1c1e' : '#fff', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)', animation: 'hf-slideUp 0.35s cubic-bezier(0.25,1,0.5,1) forwards' }}
      >
        <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-3" style={{ background: isDark ? '#3a3a3c' : '#e5e7eb' }} />
        <p className="text-center font-semibold text-[15px] mb-4" style={{ color: isDark ? '#fff' : '#111' }}>Share to</p>
        <div className="flex gap-4 px-5 overflow-x-auto pb-1 hide-hf-scrollbar">
          {friends.map(f => (
            <button key={f.name} onClick={onClose} className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-90 transition-transform">
              <Avatar hue={f.hue} size={52} />
              <span className="text-[11px] font-medium" style={{ color: isDark ? '#a1a1aa' : '#52525b' }}>{f.name}</span>
            </button>
          ))}
        </div>
        <div className="px-5 mt-4">
          <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-semibold transition-colors active:opacity-70" style={{ background: isDark ? '#2c2c2e' : '#f3f4f6', color: isDark ? '#fff' : '#111' }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   Floating Heart Animation
───────────────────────────────────────── */
function FloatingHeart({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 850); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style={{ animation: 'hf-heartPop 0.85s cubic-bezier(0.25,1,0.5,1) forwards' }}>
      <svg viewBox="0 0 24 24" fill="#ef4444" width={96} height={96} style={{ filter: 'drop-shadow(0 4px 24px rgba(239,68,68,0.55))' }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────
   Comment Drawer
───────────────────────────────────────── */
function CommentDrawer({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [input, setInput] = useState('');
  const comments = [
    { user: 'jay_p', hue: 268, text: 'Amazing shot! 🔥', time: '1h' },
    { user: 'nina_m', hue: 318, text: 'This is beautiful ❤️', time: '2h' },
    { user: 'tomás', hue: 15, text: 'Where is this??', time: '3h' },
  ];
  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-[201] rounded-t-[28px] flex flex-col overflow-hidden"
        style={{ maxHeight: '70vh', background: isDark ? '#1c1c1e' : '#fff', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)', animation: 'hf-slideUp 0.35s cubic-bezier(0.25,1,0.5,1) forwards' }}
      >
        <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-1" style={{ background: isDark ? '#3a3a3c' : '#e5e7eb' }} />
        <div className="flex items-center justify-between px-5 py-2 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6' }}>
          <span className="font-semibold text-[15px]" style={{ color: isDark ? '#fff' : '#111' }}>Comments</span>
          <button onClick={onClose} style={{ color: isDark ? '#a1a1aa' : '#9ca3af' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 hide-hf-scrollbar">
          {comments.map(c => (
            <div key={c.user} className="flex items-start gap-3">
              <Avatar hue={c.hue} size={32} />
              <div>
                <span className="text-[13px] font-semibold mr-2" style={{ color: isDark ? '#fff' : '#111' }}>{c.user}</span>
                <span className="text-[13px]" style={{ color: isDark ? '#d4d4d8' : '#3f3f46' }}>{c.text}</span>
                <p className="text-[11px] mt-0.5" style={{ color: isDark ? '#71717a' : '#a1a1aa' }}>{c.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6' }}>
          <Avatar hue={220} size={30} />
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 outline-none text-[13px] bg-transparent"
            style={{ color: isDark ? '#fff' : '#111' }}
          />
          {input.trim() && (
            <button onClick={() => setInput('')} className="text-[13px] font-bold text-blue-500">Post</button>
          )}
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   Single Post
───────────────────────────────────────── */
function Post({ post, isDark }: { post: PostData; isDark: boolean }) {
  const [liked, setLiked] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [likes, setLikes] = useState(post.likes);
  const [showHeart, setShowHeart] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const lastTap = useRef(0);

  const triggerLike = useCallback((forceOn = false) => {
    const next = forceOn ? true : !liked;
    if (forceOn && liked) { setShowHeart(true); return; }
    setLiked(next);
    setLikes(n => next ? n + 1 : n - 1);
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 400);
    if (next) setShowHeart(true);
  }, [liked]);

  const handleTouch = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 330) triggerLike(true);
    lastTap.current = now;
  }, [triggerLike]);

  const bg = isDark ? '#18181b' : '#ffffff';
  const txt = isDark ? '#ffffff' : '#09090b';
  const sub = isDark ? '#71717a' : '#a1a1aa';
  const border = isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5';

  return (
    <>
      {showOptions && <OptionsSheet onClose={() => setShowOptions(false)} isDark={isDark} />}
      {showShare && <ShareOverlay onClose={() => setShowShare(false)} isDark={isDark} />}
      {showComments && <CommentDrawer onClose={() => setShowComments(false)} isDark={isDark} />}

      <article style={{ background: bg, borderBottom: `1px solid ${border}` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <StoryRing size={34}>
              <Avatar hue={post.hue} size={34} />
            </StoryRing>
            <div>
              <p className="text-[13px] font-semibold leading-tight" style={{ color: txt }}>{post.user}</p>
              <p className="text-[11px] leading-tight" style={{ color: sub }}>{post.time}</p>
            </div>
          </div>
          <button className="p-2 rounded-full active:opacity-50 transition-opacity" onClick={() => setShowOptions(true)}>
            <svg viewBox="0 0 24 24" fill={txt} width={18} height={18}>
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
        </div>

        {/* Image area */}
        <div
          className="w-full relative select-none overflow-hidden cursor-pointer"
          style={{ aspectRatio: '1/1' }}
          onDoubleClick={() => triggerLike(true)}
          onTouchEnd={handleTouch}
        >
          <div
            className="w-full h-full"
            style={{ background: `linear-gradient(135deg, hsl(${post.postHue},28%,${isDark ? '20' : '82'}%) 0%, hsl(${post.postHue2},22%,${isDark ? '16' : '88'}%) 50%, hsl(${post.postHue - 15},18%,${isDark ? '22' : '78'}%) 100%)` }}
          />
          {showHeart && <FloatingHeart onDone={() => setShowHeart(false)} />}
        </div>

        {/* Action bar */}
        <div className="px-3 pt-2.5 pb-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              {/* Heart */}
              <button
                onClick={() => triggerLike()}
                className="transition-transform active:scale-90"
                style={{ transform: likeAnim ? 'scale(1.28)' : 'scale(1)', transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}
              >
                <svg viewBox="0 0 24 24" fill={liked ? '#ef4444' : 'none'} stroke={liked ? '#ef4444' : txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              {/* Comment */}
              <button className="active:opacity-50 transition-opacity" onClick={() => setShowComments(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              {/* Share */}
              <button className="active:opacity-50 transition-opacity" onClick={() => setShowShare(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            {/* Bookmark */}
            <button className="active:opacity-50 transition-opacity" onClick={() => setSaved(s => !s)}>
              <svg viewBox="0 0 24 24" fill={saved ? txt : 'none'} stroke={txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>

          {/* Likes count */}
          <p className="text-[13px] font-bold leading-tight mb-1" style={{ color: txt }}>
            {likes.toLocaleString()} likes
          </p>

          {/* Caption */}
          <p className="text-[13px] leading-snug mb-1" style={{ color: txt }}>
            <span className="font-semibold">{post.user}</span>{' '}
            <span style={{ color: isDark ? '#d4d4d8' : '#3f3f46' }}>{post.caption}</span>
          </p>

          {/* View comments */}
          <button className="text-[12px] mb-2.5 block" style={{ color: sub }} onClick={() => setShowComments(true)}>
            View all comments
          </button>
        </div>
      </article>
    </>
  );
}

/* ─────────────────────────────────────────
   Stories Bar
───────────────────────────────────────── */
function StoriesBar({ isDark, onStoryClick }: { isDark: boolean; onStoryClick: (s: Story) => void }) {
  const bg = isDark ? '#18181b' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5';
  const sub = isDark ? '#71717a' : '#6b7280';

  return (
    <div style={{ background: bg, borderBottom: `1px solid ${border}` }}>
      <div className="flex gap-3 px-3 py-3 overflow-x-auto hide-hf-scrollbar" style={{ width: 'max-content', minWidth: '100%' }}>
        {STORIES.map(story => (
          <button
            key={story.id}
            onClick={() => {
              if (story.isSelf) console.log('Open Camera / Add Story');
              else onStoryClick(story);
            }}
            className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
            style={{ width: 66 }}
          >
            <div className="relative">
              {story.isSelf ? (
                <div className="rounded-full flex items-center justify-center" style={{ width: 66, height: 66, border: `2px solid ${border}` }}>
                  <Avatar hue={story.hue} size={62} />
                  <div
                    className="absolute flex items-center justify-center rounded-full"
                    style={{ width: 20, height: 20, background: '#0095f6', border: '2px solid white', bottom: 0, right: 0 }}
                  >
                    <svg viewBox="0 0 24 24" fill="white" width={11} height={11}><path d="M19 11H13V5h-2v6H5v2h6v6h2v-6h6z"/></svg>
                  </div>
                </div>
              ) : (
                <StoryRing size={62}>
                  <Avatar hue={story.hue} size={62} />
                </StoryRing>
              )}
            </div>
            <span className="text-[11px] font-medium w-full text-center truncate leading-tight" style={{ color: sub }}>
              {story.isSelf ? 'Your story' : story.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Main HomeFeed Component
───────────────────────────────────────── */
export default function HomeFeed({ isDark }: { isDark: boolean }) {
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const posts = SEED_POSTS;

  return (
    <>
      {/* Global keyframes injected once */}
      <style>{`
        .hide-hf-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
        .hide-hf-scrollbar::-webkit-scrollbar { display:none; }
        @keyframes hf-slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes hf-heartPop {
          0%   { opacity:0; transform:scale(0.3); }
          35%  { opacity:1; transform:scale(1.2); }
          60%  { transform:scale(0.9); }
          80%  { opacity:1; transform:scale(1.05); }
          100% { opacity:0; transform:scale(1.0); }
        }
      `}</style>

      {activeStory && <StoryModal story={activeStory} onClose={() => setActiveStory(null)} />}

      <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: isDark ? '#09090b' : '#fafafa' }}>
        {/* Scrollable feed */}
        <div className="flex-1 overflow-y-auto hide-hf-scrollbar">
          <StoriesBar isDark={isDark} onStoryClick={s => setActiveStory(s)} />
          {posts.map(post => (
            <Post key={post.id} post={post} isDark={isDark} />
          ))}
          {/* Bottom spacer for mobile nav */}
          <div style={{ height: 64 }} />
        </div>
      </div>
    </>
  );
}
