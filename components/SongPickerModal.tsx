'use client';

import React, { useState, useEffect, useRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import {
  Search,
  ChevronLeft,
  Play,
  Pause,
  Music,
  X,
  Volume2,
} from 'lucide-react';

export interface SongTrack {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  audioUrl: string;
  duration?: number;
}

export interface SelectedSongPayload {
  title: string;
  artist: string;
  artworkUrl: string;
  audioUrl: string;
  duration: number;
  startTime: number;
}

interface SongPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendSong: (song: SelectedSongPayload) => void;
}

export default function SongPickerModal({
  isOpen,
  onClose,
  onSendSong,
}: SongPickerModalProps) {
  const [step, setStep] = useState<'search' | 'trimmer'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<SongTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<SongTrack | null>(null);

  // Audio Playback & Trimming State
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [clipDuration, setClipDuration] = useState<number>(30); // 5s to 30s
  const [clipStart, setClipStart] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setStep('search');
      setIsPlaying(false);
      setTimeout(() => searchInputRef.current?.focus(), 150);
      // Pre-load trending default tracks
      if (tracks.length === 0) {
        searchMusic('trending pop hits');
      }
    } else {
      stopAudio();
    }
  }, [isOpen]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setPreviewTrackId(null);
  };

  const searchMusic = async (q: string) => {
    if (!q.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tracks)) {
          setTracks(data.tracks);
        }
      }
    } catch (err) {
      console.error('Failed to search music:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search on user typing
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timer = setTimeout(() => {
      searchMusic(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Audio preview for search list
  const handleToggleSearchPreview = (track: SongTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');

    if (previewTrackId === track.id && isPlaying) {
      stopAudio();
      return;
    }

    if (audioRef.current) {
      setIsPlaying(true);
      setPreviewTrackId(track.id);
      audioRef.current.src = track.audioUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.warn('Playback blocked:', err);
        setIsPlaying(false);
      });
    }
  };

  // Select track and transition to Screen 2: Trimmer (Call Interface style)
  const handleSelectTrack = (track: SongTrack) => {
    triggerHaptic('medium');
    stopAudio();
    setSelectedTrack(track);
    setClipDuration(30);
    setClipStart(0);
    setCurrentTime(0);
    setStep('trimmer');

    // Auto-play preview in trimmer
    if (audioRef.current) {
      setIsPlaying(true);
      audioRef.current.src = track.audioUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  // Trimmer audio loop within selected [clipStart, clipStart + clipDuration]
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      const maxTime = Math.min(30, clipStart + clipDuration);
      if (audio.currentTime >= maxTime) {
        audio.currentTime = clipStart;
      }
    };

    const handleEnded = () => {
      audio.currentTime = clipStart;
      audio.play().catch(() => {});
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [clipStart, clipDuration, step]);

  const handleToggleTrimmerPlay = () => {
    triggerHaptic('light');
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = clipStart;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSend = () => {
    if (!selectedTrack) return;
    triggerHaptic('heavy');
    stopAudio();
    onSendSong({
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      artworkUrl: selectedTrack.artworkUrl,
      audioUrl: selectedTrack.audioUrl,
      duration: clipDuration,
      startTime: clipStart,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      {/* Hidden audio element for preview */}
      <audio ref={audioRef} preload="auto" />

      {step === 'search' ? (
        /* ══════════════════════════════════════════════════════════════════════
           SCREEN 1: SEARCH MUSIC
           Top: Dark Zinc with search input
           Bottom: Rounded White Container with zinc outline song cards
           ══════════════════════════════════════════════════════════════════════ */
        <div className="flex-1 w-full max-w-lg mx-auto flex flex-col bg-[#141111] overflow-hidden sm:rounded-3xl sm:my-6 sm:border sm:border-zinc-800 shadow-2xl">
          {/* Top Dark Zinc Header */}
          <div className="pt-14 sm:pt-6 px-4 pb-4 flex items-center gap-3 bg-[#141111] shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                stopAudio();
                onClose();
              }}
              className="p-1.5 -ml-1 text-white/80 hover:text-white active:scale-90 transition-all cursor-pointer outline-none border-0 ring-0 bg-transparent"
              title="Close"
              aria-label="Close Music Search"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Search Input */}
            <div className="flex-1 relative flex items-center">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search songs, artists, hits..."
                className="w-full pl-9 pr-8 py-2.5 rounded-full bg-zinc-900 border border-zinc-700/80 focus:border-[#9D4EDD] outline-none text-[14px] text-white placeholder:text-zinc-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Rounded White Container */}
          <div className="flex-1 bg-white rounded-t-[32px] sm:rounded-t-[36px] px-4 pt-3 pb-6 flex flex-col overflow-hidden shadow-[0_-10px_30px_rgba(0,0,0,0.15)] min-h-0">
            {/* Top Pull Bar */}
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-3 shrink-0" />

            {/* Track List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 no-scrollbar pr-0.5">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2.5 text-zinc-400">
                  <div className="w-7 h-7 border-2 border-zinc-300 border-t-[#9D4EDD] rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-600">Searching music...</span>
                </div>
              ) : tracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-400">
                  <Music className="w-10 h-10 text-zinc-300 mb-2 stroke-[1.5]" />
                  <span className="text-[14px] font-bold text-zinc-800">No songs found</span>
                  <span className="text-xs text-zinc-400 mt-0.5">Try searching for another song or artist</span>
                </div>
              ) : (
                tracks.map((track) => {
                  const isItemPlaying = previewTrackId === track.id && isPlaying;

                  return (
                    <div
                      key={track.id}
                      onClick={() => handleSelectTrack(track)}
                      className="w-full p-2.5 rounded-2xl bg-white hover:bg-zinc-50 active:scale-[0.99] border border-zinc-200 shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group"
                    >
                      {/* Artwork + Play overlay */}
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-zinc-100 shrink-0 shadow-xs border border-zinc-100">
                        {track.artworkUrl ? (
                          <img
                            src={track.artworkUrl}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-100 text-zinc-400">
                            <Music className="w-5 h-5" />
                          </div>
                        )}

                        {/* Play Preview Button */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleSearchPreview(track, e)}
                          className={`absolute inset-0 flex items-center justify-center transition-all ${
                            isItemPlaying
                              ? 'bg-black/60 opacity-100'
                              : 'bg-black/40 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {isItemPlaying ? (
                            <Pause className="w-5 h-5 text-[#D8B4E2] fill-current" />
                          ) : (
                            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                          )}
                        </button>
                      </div>

                      {/* Song Details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-bold text-zinc-900 truncate leading-tight group-hover:text-black">
                          {track.title}
                        </h4>
                        <p className="text-[12px] text-zinc-500 truncate mt-0.5 font-medium">
                          {track.artist}
                        </p>
                      </div>

                      {/* Select Pill */}
                      <div className="px-3.5 py-1.5 rounded-full bg-zinc-900 group-hover:bg-zinc-800 text-white text-[11.5px] font-bold transition-all shrink-0 shadow-xs">
                        Select
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           SCREEN 2: SONG TRIMMER (VIDEO CALL UI STYLE)
           Upper White Container + Bottom Dark Zinc Bar
           With Safe-Area Spacing away from Mobile Notification Bar!
           ══════════════════════════════════════════════════════════════════════ */
        <div className="flex-1 w-full max-w-lg mx-auto flex flex-col bg-[#141111] overflow-hidden sm:rounded-3xl sm:my-6 sm:border sm:border-zinc-800 shadow-2xl">
          {/* ── 1. Upper White Box: Artwork, Title, Frameless Back & Send SVG ── */}
          <div className="flex-1 bg-white rounded-t-[32px] sm:rounded-t-[36px] pt-14 sm:pt-6 px-6 pb-6 flex flex-col justify-between items-center relative shadow-md">
            {/* Top Navigation Row (Safely below mobile notification/status bar) */}
            <div className="w-full flex items-center justify-between">
              {/* Top Left: Frameless Back Button (No border, No outline) */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  stopAudio();
                  setStep('search');
                }}
                className="p-2 -ml-2 text-zinc-800 hover:text-zinc-600 active:scale-95 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none bg-transparent flex items-center gap-1"
                title="Back to Search"
                aria-label="Back to Search"
              >
                <ChevronLeft className="w-6 h-6 text-zinc-900" strokeWidth={2.4} />
              </button>

              <span className="text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
                Preview & Trim
              </span>

              {/* Top Right: Exact Send Button SVG (Frameless) */}
              <button
                type="button"
                onClick={handleSend}
                className="p-2 -mr-2 text-zinc-900 hover:text-zinc-700 active:scale-90 transition-all cursor-pointer outline-none border-0 ring-0 focus:outline-none bg-transparent"
                title="Send Song to Chat"
                aria-label="Send Song to Chat"
              >
                <svg className="w-6 h-6 text-zinc-900" viewBox="-0.5 0 25 25" fill="none" stroke="currentColor">
                  <path
                    d="M2.33045 8.38999C0.250452 11.82 9.42048 14.9 9.42048 14.9C9.42048 14.9 12.5005 24.07 15.9305 21.99C19.5705 19.77 23.9305 6.13 21.0505 3.27C18.1705 0.409998 4.55045 4.74999 2.33045 8.38999Z"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M15.1999 9.12L9.41992 14.9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Album Artwork & Song Details */}
            <div className="flex flex-col items-center text-center my-auto py-2">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-3xl overflow-hidden shadow-2xl ring-4 ring-zinc-100 bg-zinc-900">
                {selectedTrack?.artworkUrl ? (
                  <img
                    src={selectedTrack.artworkUrl}
                    alt={selectedTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <Music className="w-16 h-16 stroke-1" />
                  </div>
                )}

                {/* Animated Equalizer Wave Overlay When Playing */}
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-8 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-12 bg-[#D8B4E2] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="w-1.5 h-10 bg-[#D8B4E2] rounded-full animate-bounce" style={{ animationDelay: '450ms' }} />
                    <span className="w-1.5 h-7 bg-white rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                  </div>
                )}
              </div>

              <h3 className="text-[20px] font-black text-zinc-900 mt-4 max-w-[280px] truncate leading-tight">
                {selectedTrack?.title}
              </h3>
              <p className="text-[14px] text-zinc-500 font-semibold mt-1 max-w-[260px] truncate">
                {selectedTrack?.artist}
              </p>
            </div>
          </div>

          {/* ── 2. Bottom Dark Zinc Bar: Duration & Time Selector (Up to 30s) ── */}
          <div className="w-full bg-[#181515] px-6 pt-5 pb-8 flex flex-col gap-4 border-t border-zinc-800/60 text-white">
            {/* Trimmer Controls Header */}
            <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Volume2 className="w-4 h-4 text-[#D8B4E2]" />
                <span>Clip Length: {clipDuration}s</span>
              </span>
              <span>
                {Math.floor(currentTime)}s / {clipDuration}s
              </span>
            </div>

            {/* Duration / Range Slider (Up to 30s) */}
            <div className="flex flex-col gap-2">
              <div className="relative w-full flex items-center">
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={clipDuration}
                  onChange={(e) => {
                    const dur = Number(e.target.value);
                    setClipDuration(dur);
                    if (clipStart + dur > 30) {
                      setClipStart(Math.max(0, 30 - dur));
                    }
                  }}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#D8B4E2]"
                />
              </div>

              {/* Clip Start Offset Slider (if duration < 30) */}
              {clipDuration < 30 && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between text-[11px] text-zinc-500 font-medium">
                    <span>Start: {clipStart}s</span>
                    <span>End: {clipStart + clipDuration}s</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, 30 - clipDuration)}
                    step={1}
                    value={clipStart}
                    onChange={(e) => {
                      const start = Number(e.target.value);
                      setClipStart(start);
                      if (audioRef.current) {
                        audioRef.current.currentTime = start;
                      }
                    }}
                    className="w-full h-1.5 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                </div>
              )}
            </div>

            {/* Play/Pause Button & Send Action */}
            <div className="flex items-center justify-center gap-4 mt-1">
              <button
                type="button"
                onClick={handleToggleTrimmerPlay}
                className="w-12 h-12 rounded-full bg-white text-zinc-900 hover:bg-zinc-200 active:scale-90 flex items-center justify-center transition-all cursor-pointer shadow-lg outline-none"
                title={isPlaying ? 'Pause' : 'Play Preview'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
