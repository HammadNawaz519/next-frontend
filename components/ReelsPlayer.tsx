'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { 
  getReelsAction, 
  toggleLikeAction, 
  commentAction, 
  getCommentsAction, 
  toggleSaveAction, 
  toggleFollowUser 
} from '../app/dashboard/actions';

interface Reel {
  id: string;
  user: string;
  userImage?: string;
  userId: string;
  image: string; // Used as video URL
  likes: number;
  caption: string;
  time: string;
  liked: boolean;
  saved: boolean;
  comments: any[];
}

interface ReelsPlayerProps {
  onBack: () => void;
  onOpenProfile: (userId: string, fallbackUser?: any, e?: React.MouseEvent) => void;
  isDark: boolean;
}

export default function ReelsPlayer({ onBack, onOpenProfile, isDark }: ReelsPlayerProps) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReels();
  }, []);

  const loadReels = async () => {
    setIsLoading(true);
    try {
      const data = await getReelsAction();
      setReels(data as any[]);
    } catch (err) {
      console.error('Error loading reels:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const index = Math.round(scrollTop / height);
    if (index !== activeIndex && index >= 0 && index < reels.length) {
      setActiveIndex(index);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white">
        <div className="w-12 h-12 rounded-full border-4 border-t-orange-500 border-r-transparent border-b-transparent border-l-transparent animate-spin mb-4" />
        <p className="text-sm font-light text-zinc-400">Loading Reels...</p>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white p-6 text-center">
        {/* Back button top-left */}
        <button
          onClick={onBack}
          className="absolute top-[25px] left-[35px] w-10 h-10 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-md text-white border border-white/10 active:scale-90 transition-transform z-40"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Empty state content */}
        <div className="flex flex-col items-center gap-5 max-w-xs">
          <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <svg className="w-9 h-9 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <div className="space-y-2">
            <p className="text-xl font-bold tracking-tight">No reels here</p>
            <p className="text-sm text-zinc-400 leading-relaxed">Tap to upload your first reel and share it with the world.</p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={onBack}
              className="w-full px-5 py-3 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload a Reel
            </button>
            <button
              onClick={onBack}
              className="w-full px-5 py-3 rounded-full bg-white/10 border border-white/15 text-white text-sm font-semibold active:scale-95 transition-all"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="w-full h-full bg-black relative snap-y snap-mandatory overflow-y-scroll scrollbar-none"
      style={{ scrollBehavior: 'smooth' }}
    >
      {/* Top Header Controls (Back and Camera) */}
      <div className="absolute top-[25px] left-0 right-0 flex items-center justify-between px-[35px] z-40 pointer-events-none">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-md text-white border border-white/10 active:scale-90 transition-transform pointer-events-auto"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button 
          className="w-10 h-10 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-md text-white border border-white/10 active:scale-90 transition-transform pointer-events-auto"
          onClick={() => alert("Camera feature coming soon!")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316A2.192 2.192 0 0014.536 4H9.464c-.58 0-1.126.314-1.42.833l-.817 1.342z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Centered Static title with 250px upper content boundary margin */}
      <div className="absolute top-[250px] left-0 right-0 text-center z-30 pointer-events-none select-none">
        <h1 className="text-white/80 text-xl font-bold tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          Reels
        </h1>
      </div>

      {/* Content Safe Zone (Central Dashed Box representing boundaries) */}
      <div className="absolute inset-y-0 left-[35px] right-[35px] border-l border-r border-dashed border-white/10 pointer-events-none z-20" />

      {/* Feed list */}
      {reels.map((reel, idx) => (
        <ReelItem 
          key={reel.id} 
          reel={reel} 
          isActive={idx === activeIndex} 
          onOpenProfile={onOpenProfile}
          isDark={isDark}
        />
      ))}
    </div>
  );
}

/* Sub-component for individual Reel */
function ReelItem({ reel, isActive, onOpenProfile, isDark }: { 
  reel: Reel; 
  isActive: boolean; 
  onOpenProfile: (userId: string, fallbackUser?: any, e?: React.MouseEvent) => void;
  isDark: boolean;
  key?: string;
}) {
  const [liked, setLiked] = useState(reel.liked);
  const [likeCount, setLikeCount] = useState(reel.likes || 6720); // Default to 6720 if 0 or specified
  const [saved, setSaved] = useState(reel.saved);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [showHeartPop, setShowHeartPop] = useState(false);
  
  // Comments Drawer
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsList, setCommentsList] = useState<any[]>(reel.comments || []);
  const [newCommentText, setNewCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastClickRef = useRef(0);

  // Synchronize playback state based on active tab/scroll state
  useEffect(() => {
    if (videoRef.current) {
      if (isActive) {
        videoRef.current.play().catch(() => {
          // Fallback if browser blocks autoplay
        });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isActive]);

  const handleLikeToggle = async () => {
    // Optimistic toggle
    const nextState = !liked;
    setLiked(nextState);
    setLikeCount(prev => nextState ? prev + 1 : Math.max(0, prev - 1));

    try {
      const res = await toggleLikeAction(reel.id);
      if (res && res.success) {
        // Confirmed state
        setLiked(res.liked);
      }
    } catch (err) {
      console.error(err);
      // Revert state on error
      setLiked(!nextState);
      setLikeCount(prev => !nextState ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  const handleSaveToggle = async () => {
    const nextState = !saved;
    setSaved(nextState);

    try {
      const res = await toggleSaveAction(reel.id);
      if (res && res.success) {
        setSaved(res.saved);
      }
    } catch (err) {
      console.error(err);
      setSaved(!nextState);
    }
  };

  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isFollowing;
    setIsFollowing(nextState);

    try {
      const res = await toggleFollowUser(reel.userId);
      if (res && res.success) {
        setIsFollowing(res.isFollowing);
      }
    } catch (err) {
      console.error(err);
      setIsFollowing(!nextState);
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      // Double tap!
      handleDoubleTap();
    } else {
      // Toggle play/pause on single tap
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
      }
    }
    lastClickRef.current = now;
  };

  const handleDoubleTap = () => {
    setShowHeartPop(false);
    setTimeout(() => {
      setShowHeartPop(true);
    }, 10);
    if (!liked) {
      handleLikeToggle();
    }
  };

  // Open comments drawer and fetch latest comments
  const handleOpenComments = async () => {
    setIsCommentsOpen(true);
    try {
      const list = await getCommentsAction(reel.id);
      if (list) {
        setCommentsList(list);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || isPostingComment) return;

    setIsPostingComment(true);
    try {
      const res = await commentAction(reel.id, newCommentText);
      if (res && res.success && res.comment) {
        setCommentsList(prev => [...prev, res.comment]);
        setNewCommentText('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `@${reel.user} Reel`,
          text: reel.caption,
          url: window.location.href,
        });
      } catch (err) {
        console.error(err);
      }
    } else {
      // Custom copy dialog/modal
      navigator.clipboard.writeText(window.location.href);
      alert("Reel link copied to clipboard!");
    }
  };

  return (
    <div className="w-full h-full snap-start relative flex items-center justify-center bg-black overflow-hidden select-none">
      
      {/* Background/Foreground Video Element */}
      <div className="relative w-full h-full flex items-center justify-center" onClick={handleVideoClick}>
        <video 
          ref={videoRef}
          src={reel.image}
          className="w-full h-full object-cover max-w-[450px] aspect-[9/16] transition-transform duration-300"
          loop
          playsInline
          muted
          autoPlay={isActive}
        />
        
        {/* Dark Vignette Overlay for metadata legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
      </div>

      {/* Double Tap Heart Pop Animation */}
      {showHeartPop && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <svg 
            className="w-24 h-24 text-red-500 fill-current animate-heart-pop drop-shadow-2xl" 
            viewBox="0 0 24 24"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      )}

      {/* Left Metadata Zone — aligned strictly inside safe zone (left: 35px) */}
      <div className="absolute left-[35px] bottom-8 max-w-[calc(100%-120px)] flex flex-col gap-3.5 z-30 text-white text-left">
        {/* User Info Row */}
        <div className="flex items-center gap-2.5">
          <div 
            onClick={(e) => onOpenProfile(reel.userId, null, e)}
            className="w-10 h-10 rounded-full border-2 border-orange-500 overflow-hidden cursor-pointer active:scale-95 transition-transform"
          >
            {reel.userImage ? (
              <img src={reel.userImage} alt={reel.user} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-orange-500 flex items-center justify-center text-xs font-bold uppercase text-white">
                {reel.user.slice(0, 2)}
              </div>
            )}
          </div>
          <span 
            onClick={(e) => onOpenProfile(reel.userId, null, e)}
            className="text-sm font-semibold cursor-pointer active:opacity-80 transition-opacity"
          >
            @{reel.user}
          </span>
          
          <button 
            onClick={handleFollowToggle}
            className={`px-3 py-1 rounded-full text-xs font-semibold tracking-wide border active:scale-95 transition-all duration-300 ${
              isFollowing 
                ? 'bg-transparent border-white/40 text-white/95' 
                : 'bg-orange-500 border-orange-500 text-white'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>

        {/* Expandable Caption Description */}
        <div className="text-xs font-light leading-relaxed select-text">
          <div 
            onClick={() => setIsDescExpanded(!isDescExpanded)}
            className={`cursor-pointer ${isDescExpanded ? 'max-h-36 overflow-y-auto' : 'line-clamp-2'}`}
          >
            {reel.caption || "LA DESCRIPTION DE TON SUPER RÉEL"}
          </div>
          {!isDescExpanded && reel.caption && reel.caption.length > 60 && (
            <span 
              onClick={() => setIsDescExpanded(true)}
              className="text-[10px] text-zinc-400 font-medium block mt-1 hover:underline cursor-pointer"
            >
              ... see more
            </span>
          )}
        </div>

        {/* Audio Row */}
        <div 
          onClick={() => alert("Browsing reels by audio track...")}
          className="flex items-center gap-2 text-xs font-light text-zinc-300 cursor-pointer hover:text-white transition-colors py-0.5 inline-flex"
        >
          <svg className="w-4 h-4 animate-[spin_5s_linear_infinite]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span className="truncate max-w-[150px]">
            Original Audio • {reel.user}
          </span>
        </div>


      </div>

      {/* Right Interaction Sidebar — anchored to right: 15px, bottom: 20px */}
      <div 
        className="absolute right-[15px] flex flex-col items-center gap-6 z-30 pb-4"
        style={{ bottom: '20px' }}
      >
        {/* Heart (Like) Icon */}
        <div className="flex flex-col items-center gap-1.5">
          <button 
            onClick={handleLikeToggle}
            className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-transform drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
            style={{ color: liked ? '#ef4444' : 'white' }}
          >
            <svg 
              className={`w-7 h-7 ${liked ? 'fill-current' : ''}`}
              fill={liked ? 'currentColor' : 'none'} 
              stroke="currentColor" 
              strokeWidth={2} 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
          <span className="text-[12px] text-white font-medium drop-shadow-md select-none">{likeCount}</span>
        </div>

        {/* Comment Icon */}
        <div className="flex flex-col items-center gap-1.5">
          <button 
            onClick={handleOpenComments}
            className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-transform drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          <span className="text-[12px] text-white font-medium drop-shadow-md select-none">{commentsList.length}</span>
        </div>

        {/* Share (Paper Plane) Icon */}
        <div className="flex flex-col items-center gap-1.5">
          <button 
            onClick={handleShare}
            className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-transform drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
          >
            <svg className="w-7 h-7 -rotate-12 translate-x-[1px] -translate-y-[1px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l8.139-4.07M8.684 10.742l-2.085 9.02a.75.75 0 001.089.818l5.584-3.72M8.684 10.742L21 3m0 0l-5.38 18.062a.75.75 0 01-1.355-.008L9.88 12.06 21 3z" />
            </svg>
          </button>
          <span className="text-[12px] text-white font-medium drop-shadow-md select-none">Share</span>
        </div>

        {/* Save/Bookmark Icon */}
        <div className="flex flex-col items-center gap-1.5">
          <button 
            onClick={handleSaveToggle}
            className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-transform drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
            style={{ color: saved ? '#f59e0b' : 'white' }}
          >
            <svg 
              className={`w-7 h-7 ${saved ? 'fill-current' : ''}`}
              fill={saved ? 'currentColor' : 'none'} 
              stroke="currentColor" 
              strokeWidth={2} 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          <span className="text-[12px] text-white font-medium drop-shadow-md select-none">Save</span>
        </div>
      </div>

      {/* Sliding Comments Drawer Panel Overlay */}
      {isCommentsOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          {/* Backdrop Closer */}
          <div className="absolute inset-0" onClick={() => setIsCommentsOpen(false)} />
          
          {/* Sliding Panel */}
          <div 
            className="w-full max-h-[70%] bg-zinc-950 rounded-t-[30px] border-t border-zinc-800 z-10 flex flex-col animate-slide-up select-text"
            style={{ 
              background: isDark ? '#09090b' : '#18181b',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)'
            }}
          >
            {/* Header Drag Handler & Title */}
            <div className="w-full flex items-center justify-between px-6 py-4.5 border-b border-white/5 relative">
              <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-12 h-1 bg-zinc-700 rounded-full" />
              
              <h2 className="text-sm font-semibold text-white">Comments ({commentsList.length})</h2>
              
              <button 
                onClick={() => setIsCommentsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* List of comments */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {commentsList.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs">
                  Be the first to comment on this reel!
                </div>
              ) : (
                commentsList.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-zinc-800">
                      {c.userImage ? (
                        <img src={c.userImage} alt={c.user} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold">
                          {c.user.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white">@{c.user}</span>
                        <span className="text-[10px] text-zinc-500">{c.time}</span>
                      </div>
                      <p className="text-xs font-light text-zinc-300 mt-0.5 leading-relaxed">{c.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input form */}
            <form onSubmit={handlePostComment} className="p-4 border-t border-white/5 bg-zinc-950 flex gap-2 items-center">
              <input 
                type="text"
                placeholder="Add a comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                className="flex-1 h-10 px-4 rounded-full text-xs font-light bg-white/5 border border-white/10 text-white focus:outline-none focus:border-orange-500"
              />
              <button 
                type="submit"
                disabled={!newCommentText.trim() || isPostingComment}
                className="h-10 px-4 rounded-full bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 active:scale-95 transition-all"
              >
                Post
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
