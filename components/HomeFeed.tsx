'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  getHomeFeedPostsAction, 
  getActiveStoriesAction, 
  createStoryAction, 
  toggleLikeAction, 
  commentAction, 
  getCommentsAction, 
  toggleSaveAction 
} from '@/app/dashboard/actions';

/* ─────────────────────────────────────────
   Types
   ───────────────────────────────────────── */
interface Story {
  id: string;
  imageUrl: string;
  createdAt: Date;
}

interface PostData {
  id: string;
  user: string;
  userImage?: string;
  userId: string;
  image: string;
  likes: number;
  caption: string;
  time: string;
  liked: boolean;
  saved: boolean;
  comments?: {
    user: string;
    userImage?: string;
    text: string;
    time: string;
  }[];
}

/* ─────────────────────────────────────────
   Avatar
   ───────────────────────────────────────── */
const Avatar = ({ image, hue = 220, size = 32, style }: { image?: string; hue?: number; size?: number; style?: React.CSSProperties }) => (
  <div
    style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: image ? 'transparent' : `linear-gradient(135deg, hsl(${hue},60%,68%), hsl(${hue + 55},65%,52%))`,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid rgba(0,0,0,0.06)',
      ...style,
    }}
  >
    <img 
      src={image || "/Avatar.avif"} 
      alt="avatar" 
      className="w-full h-full object-cover" 
      onError={(e) => {
        (e.target as HTMLImageElement).src = "/Avatar.avif";
      }}
    />
  </div>
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
   Story Viewer Modal (Expanding Clip-Path Animation)
   ───────────────────────────────────────── */
function StoryModal({ stories, userName, userImage, onClose, clickCoords }: { stories: Story[]; userName: string; userImage?: string; onClose: () => void; clickCoords?: { x: number; y: number } | null }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION = 4000; // 4 seconds per story

  const activeStory = stories[activeIdx];

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 350); // wait for shrink animation
  };

  useEffect(() => {
    if (!activeStory) return;
    
    startRef.current = null; // reset progress clock on story index change
    
    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const pct = Math.min(((ts - startRef.current) / DURATION) * 100, 100);
      setProgress(pct);
      
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Go to next story or close if last
        if (activeIdx < stories.length - 1) {
          setActiveIdx(prev => prev + 1);
        } else {
          handleClose();
        }
      }
    };
    
    rafRef.current = requestAnimationFrame(tick);
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeIdx, stories.length]);

  if (!activeStory) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col bg-black overflow-hidden"
      style={{
        animation: isClosing ? 'storyShrink 0.35s cubic-bezier(0.25, 1, 0.5, 1) forwards' : 'storyExpand 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards',
        '--click-x': clickCoords ? `${clickCoords.x}px` : '50%',
        '--click-y': clickCoords ? `${clickCoords.y}px` : '50%',
      } as React.CSSProperties}
    >
      {/* Progress bars indicator */}
      <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
        {stories.map((_, idx) => (
          <div key={idx} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.25)' }}>
            <div 
              className="h-full bg-white transition-none" 
              style={{ 
                width: idx < activeIdx ? '100%' : idx === activeIdx ? `${progress}%` : '0%' 
              }} 
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-8 pb-3 z-20 relative bg-gradient-to-b from-black/55 to-transparent">
        <div className="flex items-center gap-3">
          <Avatar image={userImage} hue={220} size={36} style={{ border: '2px solid white' }} />
          <div className="text-left">
            <span className="text-white font-semibold text-[13px] block">{userName}</span>
            <span className="text-white/60 text-[11px]">Active Story</span>
          </div>
        </div>
        <button onClick={handleClose} className="text-white p-2 hover:bg-white/10 rounded-full transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={22} height={22}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Media Content */}
      <div className="flex-1 w-full relative flex items-center justify-center bg-zinc-950">
        <img 
          src={activeStory.imageUrl} 
          alt="story content" 
          className="max-w-full max-h-full object-contain w-full"
        />

        {/* Navigation tap zones */}
        <div className="absolute inset-0 flex">
          <div 
            className="w-1/3 h-full cursor-pointer" 
            onClick={() => {
              if (activeIdx > 0) setActiveIdx(prev => prev - 1);
            }} 
          />
          <div 
            className="w-2/3 h-full cursor-pointer" 
            onClick={() => {
              if (activeIdx < stories.length - 1) setActiveIdx(prev => prev + 1);
              else handleClose();
            }} 
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Story Creator Editor Modal
   ───────────────────────────────────────── */
function StoryCreatorModal({ isOpen, onClose, userAvatar, onStoryCreated }: { isOpen: boolean; onClose: () => void; userAvatar?: string; onStoryCreated: () => void }) {
  const [selectedImg, setSelectedImg] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const GALLERY_IMAGES = [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&h=450&q=80',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=300&h=450&q=80',
    'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=300&h=450&q=80',
    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=300&h=450&q=80',
    'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?auto=format&fit=crop&w=300&h=450&q=80',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=300&h=450&q=80'
  ];

  const handlePost = async () => {
    if (!selectedImg) return;
    setPosting(true);
    const res = await createStoryAction(selectedImg);
    setPosting(false);
    if (res.success) {
      onStoryCreated();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
      <div className="bg-zinc-900 border border-zinc-800 text-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <span className="font-semibold text-base">Select Story Photo</span>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-full transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Gallery grid */}
        <div className="p-5 overflow-y-auto flex-1 hide-hf-scrollbar">
          <p className="text-zinc-400 text-[13px] mb-4">Choose an image from your gallery to add to your story:</p>
          <div className="grid grid-cols-3 gap-3">
            {GALLERY_IMAGES.map((img, i) => (
              <button
                key={i}
                onClick={() => setSelectedImg(img)}
                className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all active:scale-95 ${selectedImg === img ? 'border-blue-500 scale-[0.98]' : 'border-transparent hover:border-zinc-700'}`}
              >
                <img src={img} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>

          {/* Preview */}
          {selectedImg && (
            <div className="mt-6 border border-zinc-800 rounded-2xl overflow-hidden aspect-[9/16] max-h-[300px] mx-auto relative bg-black">
              <img src={selectedImg} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20">
                  <img src={userAvatar || "/Avatar.avif"} className="w-full h-full object-cover" alt="avatar" />
                </div>
                <span className="text-[12px] font-semibold text-white drop-shadow-md">Your story</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div className="px-5 py-4 border-t border-zinc-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] rounded-xl text-sm font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handlePost}
            disabled={!selectedImg || posting}
            className="flex-1 py-3 bg-[#0095f6] hover:bg-[#18c2ff] disabled:opacity-40 disabled:hover:bg-[#0095f6] active:scale-[0.98] rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
          >
            {posting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Posting...
              </>
            ) : 'Share to Story'}
          </button>
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
    { name: 'alex_ray', hue: 28, image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80' },
    { name: 'sarah_k', hue: 145, image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80' },
    { name: 'jay_p', hue: 268, image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80' },
    { name: 'mia.ux', hue: 52, image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80' },
    { name: 'dev_dan', hue: 188, image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80' },
    { name: 'nina_m', hue: 318, image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80' },
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
              <Avatar image={f.image} hue={f.hue} size={52} />
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
   Comment Drawer (Connected to DB)
   ───────────────────────────────────────── */
interface CommentDrawerProps {
  postId: string;
  onClose: () => void;
  isDark: boolean;
  userAvatar?: string;
  onCommentAdded: () => void;
}

function CommentDrawer({ postId, onClose, isDark, userAvatar, onCommentAdded }: CommentDrawerProps) {
  const [input, setInput] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCommentsAction(postId).then(res => {
      if (Array.isArray(res)) {
        setComments(res.map(c => ({
          user: c.user?.username || c.user?.name || 'user',
          userImage: c.user?.image || undefined,
          text: c.content,
          time: 'Just now'
        })));
      }
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [postId]);

  const handlePost = async () => {
    if (!input.trim()) return;
    const res = await commentAction(postId, input);
    if (res.success) {
      setInput('');
      onCommentAdded();
      getCommentsAction(postId).then(res => {
        if (Array.isArray(res)) {
          setComments(res.map(c => ({
            user: c.user?.username || c.user?.name || 'user',
            userImage: c.user?.image || undefined,
            text: c.content,
            time: 'Just now'
          })));
        }
      });
    }
  };

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
          {loading ? (
            <p className="text-center text-xs text-zinc-500 py-6">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-6">No comments yet. Start the conversation!</p>
          ) : (
            comments.map((c, i) => (
              <div key={i} className="flex items-start gap-3">
                <Avatar image={c.userImage} hue={220} size={32} />
                <div className="text-left">
                  <span className="text-[13px] font-semibold mr-2" style={{ color: isDark ? '#fff' : '#111' }}>{c.user}</span>
                  <span className="text-[13px]" style={{ color: isDark ? '#d4d4d8' : '#3f3f46' }}>{c.text}</span>
                  <p className="text-[11px] mt-0.5" style={{ color: isDark ? '#71717a' : '#a1a1aa' }}>{c.time}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6' }}>
          <Avatar image={userAvatar} hue={220} size={30} />
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 outline-none text-[13px] bg-transparent"
            style={{ color: isDark ? '#fff' : '#111' }}
          />
          {input.trim() && (
            <button onClick={handlePost} className="text-[13px] font-bold text-blue-500">Post</button>
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
interface PostProps {
  post: PostData;
  isDark: boolean;
  userAvatar?: string;
}

function Post({ post, isDark, userAvatar }: PostProps) {
  const [liked, setLiked] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [likes, setLikes] = useState(post.likes);
  const [commentsCount, setCommentsCount] = useState(post.comments?.length || 0);
  const [showHeart, setShowHeart] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const lastTap = useRef(0);

  const triggerLike = useCallback(async (forceOn = false) => {
    const next = forceOn ? true : !liked;
    if (forceOn && liked) { setShowHeart(true); return; }
    
    // Optimistic UI updates
    setLiked(next);
    setLikes(n => next ? n + 1 : n - 1);
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 400);
    if (next) setShowHeart(true);

    // Call server action
    try {
      const res = await toggleLikeAction(post.id);
      if (res.success && res.liked !== undefined) {
        setLiked(res.liked);
      }
    } catch (e) {
      console.error(e);
    }
  }, [liked, post.id]);

  const handleTouch = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 330) triggerLike(true);
    lastTap.current = now;
  }, [triggerLike]);

  const handleToggleSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      const res = await toggleSaveAction(post.id);
      if (res.success && res.saved !== undefined) {
        setSaved(res.saved);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const bg = isDark ? '#18181b' : '#ffffff';
  const txt = isDark ? '#ffffff' : '#09090b';
  const sub = isDark ? '#71717a' : '#a1a1aa';
  const border = isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5';

  return (
    <>
      {showOptions && <OptionsSheet onClose={() => setShowOptions(false)} isDark={isDark} />}
      {showShare && <ShareOverlay onClose={() => setShowShare(false)} isDark={isDark} />}
      {showComments && (
        <CommentDrawer 
          postId={post.id} 
          onClose={() => setShowComments(false)} 
          isDark={isDark} 
          userAvatar={userAvatar} 
          onCommentAdded={() => setCommentsCount(c => c + 1)}
        />
      )}

      <article style={{ background: bg, borderBottom: `1px solid ${border}` }} className="md:rounded-2xl md:border md:border-zinc-200 md:dark:border-zinc-800/40 overflow-hidden mb-4 md:mb-6">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <StoryRing size={34}>
              <Avatar image={post.userImage} hue={220} size={34} />
            </StoryRing>
            <div className="text-left">
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
          className="w-full relative select-none overflow-hidden cursor-pointer bg-zinc-100 dark:bg-zinc-900"
          style={{ aspectRatio: '1/1' }}
          onDoubleClick={() => triggerLike(true)}
          onTouchEnd={handleTouch}
        >
          <img 
            src={post.image} 
            alt="post content" 
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.02]"
            loading="lazy"
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
                <svg viewBox="0 0 24 24" fill={liked ? '#ef4444' : 'none'} stroke={liked ? '#ef4444' : txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
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
            <button className="active:opacity-50 transition-opacity" onClick={handleToggleSave}>
              <svg viewBox="0 0 24 24" fill={saved ? txt : 'none'} stroke={txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>

          {/* Likes count */}
          <p className="text-[13px] font-bold leading-tight mb-1 text-left" style={{ color: txt }}>
            {likes.toLocaleString()} likes
          </p>

          {/* Caption */}
          <p className="text-[13px] leading-snug mb-1 text-left" style={{ color: txt }}>
            <span className="font-semibold">{post.user}</span>{' '}
            <span style={{ color: isDark ? '#d4d4d8' : '#3f3f46' }}>{post.caption}</span>
          </p>

          {/* View comments */}
          <button className="text-[12px] mb-2.5 block text-left" style={{ color: sub }} onClick={() => setShowComments(true)}>
            View all {commentsCount > 0 ? commentsCount : ''} comments
          </button>
        </div>
      </article>
    </>
  );
}

/* ─────────────────────────────────────────
   Stories Bar (Only User Story Circle)
   ───────────────────────────────────────── */
function StoriesBar({ isDark, userAvatar, hasActiveStories, onClick, bubbleRef }: { isDark: boolean; userAvatar?: string; hasActiveStories: boolean; onClick: (e: React.MouseEvent) => void; bubbleRef: React.RefObject<HTMLButtonElement | null> }) {
  const bg = isDark ? '#18181b' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5';
  const sub = isDark ? '#71717a' : '#6b7280';

  return (
    <div className="md:rounded-2xl" style={{ background: bg, borderBottom: `1px solid ${border}`, overflow: 'hidden' }}>
      <div className="flex gap-3 px-3 py-3 overflow-x-auto hide-hf-scrollbar">
        <button
          ref={bubbleRef as any}
          onClick={onClick}
          className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
          style={{ width: 66 }}
        >
          <div className="relative">
            {hasActiveStories ? (
              <StoryRing size={62}>
                <Avatar image={userAvatar} hue={220} size={62} />
              </StoryRing>
            ) : (
              <div className="rounded-full flex items-center justify-center" style={{ width: 66, height: 66, border: `2px solid ${border}` }}>
                <Avatar image={userAvatar} hue={220} size={62} />
                <div
                  className="absolute flex items-center justify-center rounded-full"
                  style={{ width: 20, height: 20, background: '#0095f6', border: '2px solid white', bottom: 0, right: 0 }}
                >
                  <svg viewBox="0 0 24 24" fill="white" width={11} height={11}><path d="M19 11H13V5h-2v6H5v2h6v6h2v-6h6z"/></svg>
                </div>
              </div>
            )}
          </div>
          <span className="text-[11px] font-medium w-full text-center truncate leading-tight" style={{ color: sub }}>
            Your story
          </span>
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Main HomeFeed Component
   ───────────────────────────────────────── */
interface HomeFeedProps {
  isDark: boolean;
  session?: any;
  onNavigate?: (viewId: 'home' | 'chat' | 'search') => void;
}

const SUGGESTIONS = [
  { id: 1, username: 'sarah_k', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80', hue: 145, description: 'Followed by alex_ray + 3 more' },
  { id: 2, username: 'mia.ux', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80', hue: 52, description: 'Followed by dev_dan' },
  { id: 3, username: 'tomás', image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&h=150&q=80', hue: 15, description: 'Suggested for you' },
  { id: 4, username: 'zara_j', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80', hue: 340, description: 'New to Connect' },
  { id: 5, username: 'dev_dan', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80', hue: 188, description: 'Followed by sarah_k' },
];

export default function HomeFeed({ isDark, session, onNavigate }: HomeFeedProps) {
  const [activeStories, setActiveStories] = useState<Story[]>([]);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [clickCoords, setClickCoords] = useState<{ x: number; y: number } | null>(null);
  
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [followingMap, setFollowingMap] = useState<Record<number, boolean>>({});
  
  const bubbleRef = useRef<HTMLButtonElement>(null);

  // Load feed posts and stories on mount/session load
  const loadFeedData = useCallback(async () => {
    try {
      const postsRes = await getHomeFeedPostsAction();
      if (Array.isArray(postsRes)) {
        setPosts(postsRes as any);
      }
      const storiesRes = await getActiveStoriesAction();
      if (Array.isArray(storiesRes)) {
        setActiveStories(storiesRes as any);
      }
      setLoadingPosts(false);
    } catch (e) {
      console.error("Error loading feed data:", e);
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    loadFeedData();
  }, [loadFeedData]);

  const toggleFollow = (id: number) => {
    setFollowingMap(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleStoryBubbleClick = (e: React.MouseEvent) => {
    // Record click coordinates for expanding zoom animation
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (rect) {
      setClickCoords({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    } else {
      setClickCoords({ x: e.clientX, y: e.clientY });
    }

    if (activeStories.length > 0) {
      setShowStoryModal(true);
    } else {
      setShowCreatorModal(true);
    }
  };

  const userObj = session?.user;
  const userAvatar = userObj?.image || "/Avatar.avif";
  const userDisplayName = userObj?.name || userObj?.email?.split('@')[0] || "User";
  const userHandle = userObj?.email?.split('@')[0] || "user";

  return (
    <>
      {/* Global keyframes and Satisfy Google Font injected */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Satisfy&display=swap');
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
        @keyframes storyExpand {
          from {
            clip-path: circle(30px at var(--click-x) var(--click-y));
            opacity: 0.5;
            background: rgba(0,0,0,0.9);
          }
          to {
            clip-path: circle(150% at var(--click-x) var(--click-y));
            opacity: 1;
            background: #000;
          }
        }
        @keyframes storyShrink {
          from {
            clip-path: circle(150% at var(--click-x) var(--click-y));
            opacity: 1;
            background: #000;
          }
          to {
            clip-path: circle(30px at var(--click-x) var(--click-y));
            opacity: 0;
            background: rgba(0,0,0,0.9);
          }
        }
      `}</style>

      {showStoryModal && activeStories.length > 0 && (
        <StoryModal 
          stories={activeStories} 
          userName="Your story" 
          userImage={userAvatar}
          clickCoords={clickCoords}
          onClose={() => {
            setShowStoryModal(false);
            setClickCoords(null);
          }} 
        />
      )}

      <StoryCreatorModal 
        isOpen={showCreatorModal}
        onClose={() => setShowCreatorModal(false)}
        userAvatar={userAvatar}
        onStoryCreated={loadFeedData}
      />

      <div className="w-full h-full flex flex-col overflow-hidden animate-fade-in" style={{ background: isDark ? '#09090b' : '#fafafa' }}>
        {/* Mobile Top Header (hidden on desktop layouts) */}
        <header className="lg:hidden flex items-center justify-between px-4 pt-[env(safe-area-inset-top,0px)] h-[calc(50px+env(safe-area-inset-top,0px))] border-b flex-shrink-0" style={{ background: isDark ? '#09090b' : '#ffffff', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#f4f4f5' }}>
          <div className="flex items-center gap-1 cursor-pointer" onClick={() => onNavigate?.('home')}>
            <span className="text-[25px] font-semibold text-left select-none tracking-wide" style={{ fontFamily: "'Satisfy', cursive", color: isDark ? '#ffffff' : '#09090b' }}>
              Connect
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 opacity-60 mt-1">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          
          <div className="flex items-center gap-4" style={{ color: isDark ? '#ffffff' : '#09090b' }}>
            <button className="active:scale-95 transition-transform" onClick={() => onNavigate?.('search')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button className="relative active:scale-95 transition-transform" onClick={() => onNavigate?.('chat')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#0095f6] rounded-full animate-pulse" />
            </button>
          </div>
        </header>

        {/* Scrollable feed container */}
        <div className="flex-1 overflow-y-auto hide-hf-scrollbar">
          <div className="flex w-full justify-between xl:justify-center px-0 md:px-4 lg:px-8 py-0 md:py-4 lg:py-8 gap-0 md:gap-8 max-w-[1012px] mx-auto">
            {/* Left Feed Column */}
            <div className="flex-1 min-w-0 max-w-[630px] flex flex-col">
              <StoriesBar 
                isDark={isDark} 
                userAvatar={userAvatar}
                hasActiveStories={activeStories.length > 0}
                onClick={handleStoryBubbleClick}
                bubbleRef={bubbleRef}
              />
              <div className="space-y-4 mt-4">
                {loadingPosts ? (
                  // Premium skeleton loaders
                  <div className="space-y-6">
                    {[1, 2].map(n => (
                      <div key={n} className="animate-pulse bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/40 rounded-2xl p-4 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                          <div className="space-y-2">
                            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 w-24 rounded" />
                            <div className="h-3 bg-zinc-200 dark:bg-zinc-800 w-16 rounded" />
                          </div>
                        </div>
                        <div className="aspect-square bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
                      </div>
                    ))}
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800/40">
                    <p className="text-zinc-500 font-medium">No posts to display. Be the first to post!</p>
                  </div>
                ) : (
                  posts.map(post => (
                    <Post key={post.id} post={post} isDark={isDark} userAvatar={userAvatar} />
                  ))
                )}
              </div>
              {/* Bottom spacer for mobile nav */}
              <div className="h-20 lg:h-10" />
            </div>

            {/* Right Sidebar Suggestions Column */}
            <div className="hidden xl:block w-[320px] flex-shrink-0 pt-4">
              <div className="sticky top-6 space-y-4">
                {/* User profile row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900">
                      <img src={userAvatar} alt="profile" className="w-full h-full object-cover" />
                    </div>
                    <div className="text-left">
                      <p className="text-[14px] font-semibold tracking-tight" style={{ color: isDark ? '#fff' : '#09090b' }}>
                        {userHandle}
                      </p>
                      <p className="text-[12px] text-zinc-500 truncate max-w-[160px]">
                        {userDisplayName}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onNavigate?.('search')} 
                    className="text-[12px] font-semibold text-[#0095f6] hover:text-[#00376b] active:opacity-60 transition-colors"
                  >
                    Switch
                  </button>
                </div>

                {/* Suggestions header */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[13px] font-semibold text-zinc-500">Suggested for you</span>
                  <button className="text-[12px] font-semibold hover:opacity-60 transition-opacity" style={{ color: isDark ? '#fff' : '#09090b' }}>
                    See All
                  </button>
                </div>

                {/* Suggestions list */}
                <div className="space-y-3.5 pt-1">
                  {SUGGESTIONS.map(s => {
                    const isFollowing = followingMap[s.id];
                    return (
                      <div key={s.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar image={s.image} hue={s.hue} size={32} />
                          <div className="text-left">
                            <p className="text-[12px] font-semibold" style={{ color: isDark ? '#fff' : '#09090b' }}>
                              {s.username}
                            </p>
                            <p className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                              {s.description}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => toggleFollow(s.id)}
                          className={`text-[12px] font-semibold transition-colors ${
                            isFollowing 
                              ? 'text-zinc-500 dark:text-zinc-400' 
                              : 'text-[#0095f6] hover:text-[#00376b]'
                          }`}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Footer links */}
                <div className="pt-6 space-y-3 text-[11px] text-zinc-400 text-left leading-relaxed">
                  <p className="hover:underline cursor-pointer">
                    About · Help · Press · API · Jobs · Privacy · Terms · Locations · Language · Meta Verified
                  </p>
                  <p>© 2026 Connect from Meta</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
