'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  Image as ImageIcon,
  Type,
  Sparkles,
  Send,
  Trash2,
  Smile,
  Palette,
  Check,
  Loader2
} from 'lucide-react';
import { createStoryAction } from '@/app/dashboard/actions';
import { optimizeImageClient } from '@/lib/media-optimizer';
import { triggerHaptic } from '@/lib/haptics';

interface StoryEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryPosted: (story: any) => void;
  currentUser?: any;
}

const BG_GRADIENTS = [
  { id: 'dark', bg: 'bg-[#181515]', color: '#181515' },
  { id: 'purple', bg: 'bg-gradient-to-br from-[#9D4EDD] to-[#4A0E4E]', color: '#9D4EDD' },
  { id: 'ocean', bg: 'bg-gradient-to-br from-[#0284C7] to-[#0F172A]', color: '#0284C7' },
  { id: 'emerald', bg: 'bg-gradient-to-br from-[#10B981] to-[#064E3B]', color: '#10B981' },
  { id: 'rose', bg: 'bg-gradient-to-br from-[#E11D48] to-[#4C0519]', color: '#E11D48' },
  { id: 'amber', bg: 'bg-gradient-to-br from-[#D97706] to-[#451A03]', color: '#D97706' },
];

export default function StoryEditor({
  isOpen,
  onClose,
  onStoryPosted,
  currentUser
}: StoryEditorProps) {
  const [mode, setMode] = useState<'media' | 'text'>('media');
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [textStoryContent, setTextStoryContent] = useState('');
  const [activeBgIndex, setActiveBgIndex] = useState(0);
  const [overlayText, setOverlayText] = useState('');
  const [showOverlayInput, setShowOverlayInput] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset state when opening editor
      setSelectedMediaUrl(null);
      setCaption('');
      setTextStoryContent('');
      setOverlayText('');
      setShowOverlayInput(false);
      setIsPosting(false);
      setErrorMsg(null);
      setMode('media');
      setActiveBgIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const isVideo = file.type.startsWith('video/');
    setSelectedMediaType(isVideo ? 'video' : 'image');

    try {
      if (isVideo) {
        if (file.size > 25 * 1024 * 1024) {
          setErrorMsg('Video file must be under 25MB');
          return;
        }
        const url = URL.createObjectURL(file);
        setSelectedMediaUrl(url);
        setMode('media');
      } else {
        const optimized = await optimizeImageClient(file, { maxWidth: 1080, maxHeight: 1920, quality: 0.85 });
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedMediaUrl(reader.result as string);
          setMode('media');
        };
        reader.readAsDataURL(optimized);
      }
    } catch (err) {
      console.error('File selection error:', err);
      const url = URL.createObjectURL(file);
      setSelectedMediaUrl(url);
      setMode('media');
    }
  };

  const generateTextStoryImage = (): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw background color
    const bgColor = BG_GRADIENTS[activeBgIndex]?.color || '#181515';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stylized background circle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.arc(540, 960, 420, 0, Math.PI * 2);
    ctx.fill();

    // Draw text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 56px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const words = (textStoryContent || 'My Story').split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = ctx.measureText(testLine).width;
      if (width < 900) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) lines.push(currentLine);

    const lineHeight = 76;
    const startY = 960 - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, index) => {
      ctx.fillText(line, 540, startY + index * lineHeight);
    });

    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const handlePost = async () => {
    if (isPosting) return;

    let finalPayloadUrl = selectedMediaUrl;

    if (mode === 'text') {
      if (!textStoryContent.trim()) {
        setErrorMsg('Please enter some text for your story');
        return;
      }
      finalPayloadUrl = generateTextStoryImage();
    } else if (!selectedMediaUrl) {
      setErrorMsg('Please select a photo or video to post');
      return;
    }

    if (!finalPayloadUrl) return;

    setIsPosting(true);
    setErrorMsg(null);
    triggerHaptic('medium');

    try {
      const res = await createStoryAction(finalPayloadUrl);
      if (res && (res as any).success && (res as any).story) {
        triggerHaptic('heavy');
        onStoryPosted((res as any).story);
        onClose();
      } else {
        setErrorMsg((res as any)?.error || 'Failed to post story. Please try again.');
      }
    } catch (err: any) {
      console.error('Post story error:', err);
      setErrorMsg('Network error while posting story.');
    } finally {
      setIsPosting(false);
    }
  };

  const canPost = mode === 'text' ? textStoryContent.trim().length > 0 : !!selectedMediaUrl;

  return (
    <div className="fixed inset-0 z-[80] bg-[#141111] flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-200">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* ── 1. Top Navigation Bar ── */}
      <div className="w-full pt-12 sm:pt-6 px-4 pb-3 flex items-center justify-between shrink-0 bg-[#141111] border-b border-zinc-800/80 z-20">
        {/* Left: Back / Close */}
        <button
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          disabled={isPosting}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all hover:bg-zinc-800"
          title="Cancel"
        >
          <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.2} />
        </button>

        {/* Center: Title */}
        <div className="flex flex-col items-center">
          <h2 className="text-[17px] font-bold text-white tracking-tight">Create Story</h2>
          <span className="text-[11px] text-zinc-400 font-medium">Connect Stories</span>
        </div>

        {/* Right: Post Button */}
        <button
          onClick={handlePost}
          disabled={!canPost || isPosting}
          className={`px-4.5 py-2 rounded-full font-semibold text-[13.5px] transition-all flex items-center gap-1.5 active:scale-95 ${
            canPost && !isPosting
              ? 'bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] text-white shadow-[0_4px_16px_rgba(157,78,221,0.4)] cursor-pointer hover:brightness-110'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-70'
          }`}
        >
          {isPosting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Posting...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>Post</span>
            </>
          )}
        </button>
      </div>

      {/* Error Toast */}
      {errorMsg && (
        <div className="mx-4 mt-2 p-2.5 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-medium text-center animate-in fade-in duration-150 shrink-0">
          {errorMsg}
        </div>
      )}

      {/* ── 2. Central Editor Canvas ── */}
      <div className="flex-1 flex flex-col justify-center items-center relative overflow-hidden p-3 min-h-0">
        {mode === 'text' ? (
          /* Text Story Mode */
          <div
            className={`w-full max-w-[360px] h-[520px] max-h-[70vh] rounded-3xl p-6 flex flex-col justify-between items-center relative shadow-2xl transition-all duration-300 border border-white/10 ${
              BG_GRADIENTS[activeBgIndex].bg
            }`}
          >
            {/* Background Palette Selector */}
            <div className="flex items-center gap-2 p-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 shrink-0">
              {BG_GRADIENTS.map((g, idx) => (
                <button
                  key={g.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveBgIndex(idx);
                  }}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                    activeBgIndex === idx ? 'ring-2 ring-white scale-110 shadow-md' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ background: g.color }}
                />
              ))}
            </div>

            {/* Central Text Input */}
            <div className="w-full flex-1 flex items-center justify-center px-2">
              <textarea
                autoFocus
                rows={4}
                placeholder="What's on your mind?..."
                value={textStoryContent}
                onChange={(e) => setTextStoryContent(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-center text-2xl sm:text-3xl font-bold text-white placeholder-white/40 resize-none leading-relaxed"
                maxLength={200}
              />
            </div>

            <span className="text-[11px] text-white/60 font-medium">
              {200 - textStoryContent.length} chars left
            </span>
          </div>
        ) : selectedMediaUrl ? (
          /* Media Preview Mode */
          <div className="w-full max-w-[360px] h-[520px] max-h-[70vh] rounded-3xl overflow-hidden relative shadow-2xl bg-zinc-950 flex items-center justify-center border border-zinc-800/80">
            {selectedMediaType === 'video' ? (
              <video
                src={selectedMediaUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <img
                src={selectedMediaUrl}
                alt="Story Preview"
                className="w-full h-full object-contain"
              />
            )}

            {/* Overlay Text Display (If Added) */}
            {overlayText && (
              <div className="absolute top-1/3 left-4 right-4 p-3 rounded-2xl bg-black/60 backdrop-blur-md text-white text-center text-lg font-bold shadow-lg border border-white/15 animate-in zoom-in-95 duration-150">
                {overlayText}
              </div>
            )}

            {/* Top Quick Actions on Media */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowOverlayInput(prev => !prev);
                }}
                className="p-2.5 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-all cursor-pointer shadow-md"
                title="Add Text Overlay"
              >
                <Type className="w-4 h-4" strokeWidth={2.2} />
              </button>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedMediaUrl(null);
                  setOverlayText('');
                }}
                className="p-2.5 rounded-full bg-black/60 backdrop-blur-md text-red-400 hover:bg-black/80 transition-all cursor-pointer shadow-md"
                title="Remove Media"
              >
                <Trash2 className="w-4 h-4" strokeWidth={2.2} />
              </button>
            </div>

            {/* Overlay Input Popover */}
            {showOverlayInput && (
              <div className="absolute inset-x-4 top-16 p-3 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl z-30 animate-in slide-in-from-top-2 duration-150">
                <input
                  type="text"
                  autoFocus
                  placeholder="Type overlay text..."
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600 focus:border-[#9D4EDD]"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => setShowOverlayInput(false)}
                    className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty Media Picker Placeholder */
          <div className="w-full max-w-[360px] h-[520px] max-h-[70vh] rounded-3xl p-6 border-2 border-dashed border-zinc-800 bg-zinc-900/40 flex flex-col items-center justify-center text-center gap-4">
            <div
              onClick={() => {
                triggerHaptic('light');
                fileInputRef.current?.click();
              }}
              className="w-20 h-20 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-[#9D4EDD] cursor-pointer hover:bg-zinc-800 active:scale-95 transition-all shadow-md"
            >
              <ImageIcon className="w-8 h-8" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Select Photo or Video</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-[240px]">
                Tap above to choose from your gallery, or switch to text story below
              </p>
            </div>
            <button
              onClick={() => {
                triggerHaptic('light');
                fileInputRef.current?.click();
              }}
              className="px-5 py-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
            >
              Open Gallery
            </button>
          </div>
        )}
      </div>

      {/* ── 3. Bottom Controls & Mode Switcher ── */}
      <div className="w-full px-4 pb-8 pt-2 bg-[#141111] flex flex-col gap-3 shrink-0 border-t border-zinc-800/80 z-20">
        {/* Caption Input when media is selected */}
        {mode === 'media' && selectedMediaUrl && (
          <div className="w-full max-w-[360px] mx-auto">
            <input
              type="text"
              placeholder="Add a caption to your story..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-4 py-3 rounded-full bg-zinc-900/90 border border-zinc-800 text-[13.5px] text-white placeholder:text-zinc-500 outline-none focus:border-zinc-700 transition-colors font-light"
            />
          </div>
        )}

        {/* Mode Selector Tabs (Photo vs Text) */}
        <div className="w-full max-w-[280px] mx-auto flex items-center bg-zinc-900/90 p-1 rounded-full border border-zinc-800/80 shadow-xs">
          <button
            onClick={() => {
              triggerHaptic('light');
              setMode('media');
              if (!selectedMediaUrl) {
                fileInputRef.current?.click();
              }
            }}
            className={`flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'media'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span>Photo / Video</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setMode('text');
            }}
            className={`flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'text'
                ? 'bg-[#9D4EDD] text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Type className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span>Text Story</span>
          </button>
        </div>
      </div>
    </div>
  );
}
