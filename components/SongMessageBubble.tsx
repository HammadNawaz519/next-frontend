'use client';

import React, { useState, useRef, useEffect } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { Play, Pause, Music } from 'lucide-react';

export interface SongMessageData {
  title: string;
  artist: string;
  artworkUrl: string;
  audioUrl: string;
  duration?: number;
  startTime?: number;
}

interface SongMessageBubbleProps {
  msg: any;
  isSent: boolean;
  activeTheme?: any;
}

export default function SongMessageBubble({
  msg,
  isSent,
  activeTheme,
}: SongMessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  let songData: SongMessageData = {
    title: 'Unknown Track',
    artist: 'Unknown Artist',
    artworkUrl: '',
    audioUrl: '',
    duration: 30,
    startTime: 0,
  };

  try {
    if (typeof msg.content === 'string') {
      songData = JSON.parse(msg.content);
    } else if (typeof msg.content === 'object') {
      songData = msg.content;
    }
  } catch (e) {
    songData = {
      title: msg.content || 'Song Track',
      artist: 'Music',
      artworkUrl: msg.thumbnailUrl || '',
      audioUrl: msg.mediaUrl || msg.content || '',
      duration: msg.duration || 30,
      startTime: 0,
    };
  }

  const duration = songData.duration || 30;
  const startTime = songData.startTime || 0;

  // Pre-initialize audio offset for instant zero-lag playback on tap
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (startTime > 0 && audio.currentTime === 0) {
      audio.currentTime = startTime;
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime - startTime);
      if (audio.currentTime >= startTime + duration) {
        audio.pause();
        audio.currentTime = startTime;
        setIsPlaying(false);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      audio.currentTime = startTime;
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [startTime, duration]);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.currentTime < startTime || audio.currentTime >= startTime + duration) {
        audio.currentTime = startTime;
      }
      setIsPlaying(true); // Immediate optimistic UI
      audio.play().catch(err => {
        console.warn('Playback error:', err);
        setIsPlaying(false);
      });
    }
  };

  return (
    <div
      onClick={handleTogglePlay}
      className="relative rounded-[1.4rem] overflow-hidden cursor-pointer shadow-md select-none group transition-all active:scale-[0.99] border border-black/10"
      style={{
        width: '260px',
        maxWidth: '100%',
        height: '260px',
      }}
    >
      {/* Preload auto for blazing-fast instant playback */}
      <audio ref={audioRef} src={songData.audioUrl} preload="auto" />

      {/* ── Background Artwork (Blurred when playing, crisp otherwise) ── */}
      {songData.artworkUrl ? (
        <img
          src={songData.artworkUrl}
          alt={songData.title}
          className={`w-full h-full object-cover transition-all duration-500 ${
            isPlaying ? 'scale-110 filter blur-[12px] brightness-75' : 'group-hover:scale-105 brightness-95'
          }`}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
          <Music className="w-16 h-16 text-zinc-600" />
        </div>
      )}

      {/* ── Overlay Gradient ── */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30 pointer-events-none" />

      {/* ── Top Badge (Music Tag) ── */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-[11px] font-bold border border-white/10 shadow-xs">
        <Music className="w-3 h-3 text-[#D8B4E2]" />
        <span>Song Clip</span>
      </div>

      {/* ── Center Play / Waving Dots Equalizer Visualizer ── */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        {isPlaying ? (
          /* Animated Waving Equalizer Dots */
          <div className="flex items-center gap-2 px-4 py-3 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-xl animate-in zoom-in-95 duration-200">
            <span className="w-1.5 h-6 bg-[#D8B4E2] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.9s' }} />
            <span className="w-1.5 h-10 bg-white rounded-full animate-bounce" style={{ animationDelay: '180ms', animationDuration: '0.9s' }} />
            <span className="w-1.5 h-4 bg-[#D8B4E2] rounded-full animate-bounce" style={{ animationDelay: '360ms', animationDuration: '0.9s' }} />
            <span className="w-1.5 h-8 bg-white rounded-full animate-bounce" style={{ animationDelay: '540ms', animationDuration: '0.9s' }} />
            <span className="w-1.5 h-5 bg-[#D8B4E2] rounded-full animate-bounce" style={{ animationDelay: '270ms', animationDuration: '0.9s' }} />
          </div>
        ) : (
          /* Play Button */
          <div className="w-12 h-12 rounded-full bg-white/90 group-hover:bg-white text-zinc-900 flex items-center justify-center shadow-xl transition-all group-hover:scale-110">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        )}
      </div>

      {/* ── Bottom Track Details & Duration ── */}
      <div className="absolute bottom-0 left-0 right-0 p-3.5 z-10 flex flex-col gap-0.5 text-white">
        <h4 className="text-[14.5px] font-black truncate leading-tight drop-shadow-sm">
          {songData.title}
        </h4>
        <div className="flex items-center justify-between text-[11.5px] text-zinc-300 font-medium mt-0.5">
          <span className="truncate max-w-[170px]">{songData.artist}</span>
          <span className="shrink-0 text-[#D8B4E2] font-semibold text-[11px]">
            {isPlaying ? `${Math.max(0, Math.floor(currentTime))}s / ` : ''}{duration}s
          </span>
        </div>
      </div>
    </div>
  );
}
