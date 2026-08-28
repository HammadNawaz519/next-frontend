'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  Image as ImageIcon,
  Type,
  Send,
  Trash2,
  Smile,
  Palette,
  Check,
  Loader2,
  Undo2,
  Redo2,
  ShieldAlert,
  HelpCircle,
  Video,
  Sparkles
} from 'lucide-react';
import { createStoryAction } from '@/app/dashboard/actions';
import { optimizeImageClient, validateMediaFile } from '@/lib/media-optimizer';
import { triggerHaptic } from '@/lib/haptics';
import {
  StoryMode,
  StoryLayer,
  StoryTextLayer,
  StoryStickerLayer,
  DrawingStroke,
  StoryFilter,
  StoryAdjustments,
  StoryTransform,
  StoryBgGradient,
  StoryDraft,
  PostStage
} from '@/types/story-editor';

import StoryCanvas from './story-editor/StoryCanvas';
import StoryToolbar, { FONT_PRESETS, CONNECT_COLORS } from './story-editor/StoryToolbar';
import StoryStickerPicker from './story-editor/StoryStickerPicker';

interface StoryEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryPosted: (story: any) => void;
  currentUser?: any;
}

const BG_GRADIENTS: StoryBgGradient[] = [
  { id: 'dark', name: 'Dark Void', bg: 'bg-[#181515]', color: '#181515' },
  { id: 'purple', name: 'Connect Purple', bg: 'bg-gradient-to-br from-[#9D4EDD] to-[#4A0E4E]', color: '#9D4EDD' },
  { id: 'ocean', name: 'Deep Ocean', bg: 'bg-gradient-to-br from-[#0284C7] to-[#0F172A]', color: '#0284C7' },
  { id: 'emerald', name: 'Emerald Forest', bg: 'bg-gradient-to-br from-[#10B981] to-[#064E3B]', color: '#10B981' },
  { id: 'rose', name: 'Rose Sunset', bg: 'bg-gradient-to-br from-[#E11D48] to-[#4C0519]', color: '#E11D48' },
  { id: 'amber', name: 'Amber Glow', bg: 'bg-gradient-to-br from-[#D97706] to-[#451A03]', color: '#D97706' }
];

export default function StoryEditor({
  isOpen,
  onClose,
  onStoryPosted,
  currentUser
}: StoryEditorProps) {
  const userId = currentUser?.id || currentUser?.email || 'default_user';
  const draftKey = `story_draft_${userId}`;

  // ── Core Editor State ──
  const [mode, setMode] = useState<StoryMode>('photo');
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState<string>('');
  const [activeBgIndex, setActiveBgIndex] = useState<number>(0);

  // Layers & Drawing
  const [textLayers, setTextLayers] = useState<StoryTextLayer[]>([]);
  const [stickerLayers, setStickerLayers] = useState<StoryStickerLayer[]>([]);
  const [drawingStrokes, setDrawingStrokes] = useState<DrawingStroke[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Drawing Tools
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [drawingColor, setDrawingColor] = useState<string>('#FFFFFF');
  const [drawingSize, setDrawingSize] = useState<number>(7);
  const [drawingTool, setDrawingTool] = useState<'pen' | 'marker' | 'eraser'>('pen');

  // Filters & Adjustments & Transforms
  const [activeFilter, setActiveFilter] = useState<StoryFilter>('normal');
  const [adjustments, setAdjustments] = useState<StoryAdjustments>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blur: 0,
    vignette: 0
  });
  const [transform, setTransform] = useState<StoryTransform>({
    zoom: 1,
    rotation: 0,
    cropMode: 'cover',
    panX: 0,
    panY: 0
  });

  // UI Panels
  const [activeSubTool, setActiveSubTool] = useState<
    'none' | 'filters' | 'adjust' | 'transform' | 'background'
  >('none');
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState<boolean>(false);
  const [showSafeArea, setShowSafeArea] = useState<boolean>(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState<boolean>(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState<boolean>(false);
  const [recoveredDraft, setRecoveredDraft] = useState<StoryDraft | null>(null);

  // Posting & Status
  const [postStage, setPostStage] = useState<PostStage>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<
    {
      textLayers: StoryTextLayer[];
      stickerLayers: StoryStickerLayer[];
      drawingStrokes: DrawingStroke[];
      filter: StoryFilter;
      adjustments: StoryAdjustments;
      transform: StoryTransform;
      activeBgIndex: number;
    }[]
  >([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Push Current State to History Stack ──
  const pushHistoryState = useCallback(
    (override?: Partial<typeof history[0]>) => {
      const currentState = {
        textLayers,
        stickerLayers,
        drawingStrokes,
        filter: activeFilter,
        adjustments,
        transform,
        activeBgIndex,
        ...override
      };

      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, currentState].slice(-25); // Cap to 25 history entries
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [textLayers, stickerLayers, drawingStrokes, activeFilter, adjustments, transform, activeBgIndex, historyIndex]
  );

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    triggerHaptic('light');
    const targetState = history[historyIndex - 1];
    if (targetState) {
      setTextLayers(targetState.textLayers);
      setStickerLayers(targetState.stickerLayers);
      setDrawingStrokes(targetState.drawingStrokes);
      setActiveFilter(targetState.filter);
      setAdjustments(targetState.adjustments);
      setTransform(targetState.transform);
      setActiveBgIndex(targetState.activeBgIndex);
      setHistoryIndex((idx) => idx - 1);
    }
  }, [history, historyIndex]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    triggerHaptic('light');
    const targetState = history[historyIndex + 1];
    if (targetState) {
      setTextLayers(targetState.textLayers);
      setStickerLayers(targetState.stickerLayers);
      setDrawingStrokes(targetState.drawingStrokes);
      setActiveFilter(targetState.filter);
      setAdjustments(targetState.adjustments);
      setTransform(targetState.transform);
      setActiveBgIndex(targetState.activeBgIndex);
      setHistoryIndex((idx) => idx + 1);
    }
  }, [history, historyIndex]);

  // ── Draft Check upon Opening ──
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setPostStage('idle');
      setShowCloseConfirm(false);

      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed: StoryDraft = JSON.parse(saved);
          if (parsed && (parsed.textLayers?.length || parsed.drawingStrokes?.length || parsed.mediaUrl)) {
            setRecoveredDraft(parsed);
            setShowDraftPrompt(true);
            return;
          }
        }
      } catch (e) {}

      // Fresh state initialization
      resetEditorState();
    } else {
      cleanupResources();
    }
  }, [isOpen, draftKey]);

  const resetEditorState = () => {
    setMode('photo');
    setSelectedMediaUrl(null);
    setSelectedMediaType('image');
    setCaption('');
    setTextLayers([]);
    setStickerLayers([]);
    setDrawingStrokes([]);
    setSelectedLayerId(null);
    setIsDrawingMode(false);
    setActiveFilter('normal');
    setAdjustments({ brightness: 0, contrast: 0, saturation: 0, blur: 0, vignette: 0 });
    setTransform({ zoom: 1, rotation: 0, cropMode: 'cover', panX: 0, panY: 0 });
    setActiveBgIndex(0);
    setHistory([]);
    setHistoryIndex(-1);
  };

  const applyDraft = (draft: StoryDraft) => {
    setMode(draft.mode || 'photo');
    setSelectedMediaUrl(draft.mediaUrl || null);
    setSelectedMediaType(draft.mediaType || 'image');
    setCaption(draft.caption || '');
    setTextLayers(draft.textLayers || []);
    setStickerLayers(draft.stickerLayers || []);
    setDrawingStrokes(draft.drawingStrokes || []);
    setActiveFilter(draft.filter || 'normal');
    setAdjustments(draft.adjustments || { brightness: 0, contrast: 0, saturation: 0, blur: 0, vignette: 0 });
    setTransform(draft.transform || { zoom: 1, rotation: 0, cropMode: 'cover', panX: 0, panY: 0 });
    setActiveBgIndex(draft.activeBgIndex || 0);
    setShowDraftPrompt(false);
    setRecoveredDraft(null);
    triggerHaptic('medium');
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch (e) {}
    setShowDraftPrompt(false);
    setRecoveredDraft(null);
    resetEditorState();
    triggerHaptic('light');
  };

  // ── Debounced Autosave ──
  useEffect(() => {
    if (!isOpen || showDraftPrompt) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const hasContent = textLayers.length > 0 || stickerLayers.length > 0 || drawingStrokes.length > 0 || selectedMediaUrl;
      if (hasContent) {
        const draft: StoryDraft = {
          userId,
          updatedAt: Date.now(),
          mode,
          mediaUrl: selectedMediaUrl?.startsWith('data:') ? selectedMediaUrl : null,
          mediaType: selectedMediaType,
          caption,
          textLayers,
          stickerLayers,
          drawingStrokes,
          filter: activeFilter,
          adjustments,
          transform,
          activeBgIndex
        };
        try {
          localStorage.setItem(draftKey, JSON.stringify(draft));
        } catch (e) {}
      }
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    isOpen,
    showDraftPrompt,
    mode,
    selectedMediaUrl,
    selectedMediaType,
    caption,
    textLayers,
    stickerLayers,
    drawingStrokes,
    activeFilter,
    adjustments,
    transform,
    activeBgIndex,
    userId,
    draftKey
  ]);

  // Clean memory / Object URLs
  const cleanupResources = () => {
    if (selectedMediaUrl && selectedMediaUrl.startsWith('blob:')) {
      URL.revokeObjectURL(selectedMediaUrl);
    }
  };

  // ── Keyboard Shortcuts (Desktop) ──
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        if (selectedLayerId) setSelectedLayerId(null);
        else if (isDrawingMode) setIsDrawingMode(false);
        else handleRequestClose();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) {
          handleDeleteLayer(selectedLayerId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedLayerId, isDrawingMode, handleUndo, handleRedo]);

  // ── Layer Management ──
  const handleAddTextLayer = () => {
    triggerHaptic('light');
    const newLayer: StoryTextLayer = {
      id: 'text-' + Date.now() + Math.random().toString(36).substring(7),
      type: 'text',
      text: 'Good vibes',
      x: 50,
      y: 45 + (textLayers.length * 8) % 30,
      scale: 1,
      rotation: 0,
      fontFamily: FONT_PRESETS[0].font,
      fontSize: 28,
      fontWeight: 'bold',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#FFFFFF',
      background: 'none',
      backgroundColor: '#000000',
      shadow: true,
      opacity: 1,
      zIndex: textLayers.length + 10
    };

    setTextLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    pushHistoryState({ textLayers: [...textLayers, newLayer] });
  };

  const handleUpdateTextLayer = (id: string, updates: Partial<StoryTextLayer>) => {
    setTextLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const handleAddStickerLayer = (emoji: string) => {
    triggerHaptic('light');
    const newLayer: StoryStickerLayer = {
      id: 'sticker-' + Date.now() + Math.random().toString(36).substring(7),
      type: 'sticker',
      value: emoji,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      zIndex: stickerLayers.length + 20
    };

    setStickerLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    pushHistoryState({ stickerLayers: [...stickerLayers, newLayer] });
  };

  const handleUpdateStickerLayer = (id: string, updates: Partial<StoryStickerLayer>) => {
    setStickerLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const handleDeleteLayer = (id: string) => {
    triggerHaptic('medium');
    setTextLayers((prev) => prev.filter((l) => l.id !== id));
    setStickerLayers((prev) => prev.filter((l) => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
    pushHistoryState({
      textLayers: textLayers.filter((l) => l.id !== id),
      stickerLayers: stickerLayers.filter((l) => l.id !== id)
    });
  };

  const handleDuplicateLayer = (id: string) => {
    triggerHaptic('light');
    const textTarget = textLayers.find((l) => l.id === id);
    if (textTarget) {
      const dup: StoryTextLayer = {
        ...textTarget,
        id: 'text-' + Date.now() + Math.random().toString(36).substring(7),
        x: Math.min(90, textTarget.x + 5),
        y: Math.min(90, textTarget.y + 5)
      };
      setTextLayers((prev) => [...prev, dup]);
      setSelectedLayerId(dup.id);
      pushHistoryState({ textLayers: [...textLayers, dup] });
      return;
    }

    const stickerTarget = stickerLayers.find((l) => l.id === id);
    if (stickerTarget) {
      const dup: StoryStickerLayer = {
        ...stickerTarget,
        id: 'sticker-' + Date.now() + Math.random().toString(36).substring(7),
        x: Math.min(90, stickerTarget.x + 5),
        y: Math.min(90, stickerTarget.y + 5)
      };
      setStickerLayers((prev) => [...prev, dup]);
      setSelectedLayerId(dup.id);
      pushHistoryState({ stickerLayers: [...stickerLayers, dup] });
    }
  };

  const handleAddDrawingStroke = (stroke: DrawingStroke) => {
    setDrawingStrokes((prev) => [...prev, stroke]);
    pushHistoryState({ drawingStrokes: [...drawingStrokes, stroke] });
  };

  const handleUndoDrawingStroke = () => {
    if (drawingStrokes.length === 0) return;
    const nextStrokes = drawingStrokes.slice(0, -1);
    setDrawingStrokes(nextStrokes);
    pushHistoryState({ drawingStrokes: nextStrokes });
  };

  const handleClearDrawing = () => {
    setDrawingStrokes([]);
    pushHistoryState({ drawingStrokes: [] });
  };

  // ── Media File Selection ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const isVideo = file.type.startsWith('video/');
    const validation = validateMediaFile(file, isVideo ? 'video' : 'image');

    if (!validation.isValid) {
      setErrorMsg(validation.error || 'Invalid file.');
      return;
    }

    setSelectedMediaType(isVideo ? 'video' : 'image');
    triggerHaptic('medium');

    try {
      if (isVideo) {
        if (file.size > 25 * 1024 * 1024) {
          setErrorMsg('Video file must be under 25MB');
          return;
        }
        const url = URL.createObjectURL(file);
        setSelectedMediaUrl(url);
        setMode('photo');
      } else {
        const optimized = await optimizeImageClient(file, 1920, 0.88);
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedMediaUrl(reader.result as string);
          setMode('photo');
        };
        reader.readAsDataURL(optimized.file);
      }
    } catch (err) {
      console.error('File processing error:', err);
      const url = URL.createObjectURL(file);
      setSelectedMediaUrl(url);
      setMode('photo');
    }
  };

  // ── Close / Exit Confirmation ──
  const handleRequestClose = () => {
    const hasUnsavedWork = textLayers.length > 0 || stickerLayers.length > 0 || drawingStrokes.length > 0 || selectedMediaUrl;
    if (hasUnsavedWork && postStage === 'idle') {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  // ── High-Definition 1080x1920 Canvas Composite Pipeline ──
  const renderFinalStoryComposite = async (): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context creation failed');

    // 1. Draw Background
    if (mode === 'text' || !selectedMediaUrl) {
      const bg = BG_GRADIENTS[activeBgIndex];
      ctx.fillStyle = bg.color || '#181515';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle decorative ambient background glow
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.arc(540, 960, 480, 0, Math.PI * 2);
      ctx.fill();
    } else if (selectedMediaType === 'image' && selectedMediaUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for rendering'));
        img.src = selectedMediaUrl;
      });

      ctx.save();
      ctx.translate(540, 960);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.scale(transform.zoom, transform.zoom);

      // Draw image to cover 1080x1920
      const imgAspect = img.width / img.height;
      const canvasAspect = 1080 / 1920;
      let drawW = 1080;
      let drawH = 1920;

      if (transform.cropMode === 'cover') {
        if (imgAspect > canvasAspect) {
          drawH = 1920;
          drawW = 1920 * imgAspect;
        } else {
          drawW = 1080;
          drawH = 1080 / imgAspect;
        }
      } else {
        if (imgAspect > canvasAspect) {
          drawW = 1080;
          drawH = 1080 / imgAspect;
        } else {
          drawH = 1920;
          drawW = 1920 * imgAspect;
        }
      }

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }

    // 2. Draw Freehand Strokes
    drawingStrokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size * 2.8; // Scale to 1080p
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = stroke.mode === 'marker' ? 0.6 : 1.0;
      ctx.globalCompositeOperation = stroke.mode === 'eraser' ? 'destination-out' : 'source-over';

      const first = stroke.points[0];
      ctx.moveTo(first.x * 1080, first.y * 1920);

      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        ctx.lineTo(p.x * 1080, p.y * 1920);
      }
      ctx.stroke();
    });

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // 3. Draw Text Layers
    textLayers.forEach((layer) => {
      ctx.save();
      const px = (layer.x / 100) * 1080;
      const py = (layer.y / 100) * 1920;

      ctx.translate(px, py);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.scale(layer.scale, layer.scale);

      const scaledFontSize = Math.round(layer.fontSize * 2.8);
      ctx.font = `${layer.fontWeight} ${scaledFontSize}px ${layer.fontFamily}`;
      ctx.textAlign = layer.textAlign;
      ctx.textBaseline = 'middle';

      const text = layer.text || '';
      const textWidth = ctx.measureText(text).width;
      const padX = 24;
      const padY = 16;
      const boxH = scaledFontSize + padY * 2;
      const boxW = textWidth + padX * 2;

      // Draw text background pill
      if (layer.background === 'pill' || layer.background === 'solid') {
        ctx.fillStyle = layer.background === 'solid' ? '#9D4EDD' : 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        const r = boxH / 2;
        const bx = -boxW / 2;
        const by = -boxH / 2;
        ctx.roundRect(bx, by, boxW, boxH, r);
        ctx.fill();
      } else if (layer.background === 'rect') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 16);
        ctx.fill();
      }

      // Draw shadow
      if (layer.shadow) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
      }

      ctx.fillStyle = layer.color || '#FFFFFF';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    });

    // 4. Draw Sticker Layers
    stickerLayers.forEach((layer) => {
      ctx.save();
      const px = (layer.x / 100) * 1080;
      const py = (layer.y / 100) * 1920;

      ctx.translate(px, py);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.scale(layer.scale, layer.scale);

      ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.value, 0, 0);
      ctx.restore();
    });

    return canvas.toDataURL('image/jpeg', 0.92);
  };

  // ── Post Story Handler ──
  const handlePostStory = async () => {
    if (postStage !== 'idle') return;

    setErrorMsg(null);
    triggerHaptic('medium');

    try {
      // 1. Preparing
      setPostStage('preparing');

      // 2. Rendering
      setPostStage('rendering');
      let finalPayloadUrl = selectedMediaUrl;

      if (mode === 'text' || (selectedMediaType === 'image' && selectedMediaUrl)) {
        finalPayloadUrl = await renderFinalStoryComposite();
      }

      if (!finalPayloadUrl) {
        setErrorMsg('Please add media or text to your story before posting.');
        setPostStage('idle');
        return;
      }

      // 3. Uploading & Publishing
      setPostStage('uploading');
      setPostStage('publishing');

      const res = await createStoryAction(finalPayloadUrl);

      if (res && res.success && res.story) {
        setPostStage('success');
        triggerHaptic('heavy');

        // Clear local draft upon success
        try {
          localStorage.removeItem(draftKey);
        } catch (e) {}

        // Notify parent and close
        setTimeout(() => {
          onStoryPosted(res.story);
          onClose();
        }, 500);
      } else {
        setPostStage('error');
        setErrorMsg(res?.error || 'Failed to publish story. Please try again.');
      }
    } catch (err: any) {
      console.error('Story posting failed:', err);
      setPostStage('error');
      setErrorMsg('Network error while publishing your story. Please try again.');
    }
  };

  const selectedLayer =
    textLayers.find((l) => l.id === selectedLayerId) ||
    stickerLayers.find((l) => l.id === selectedLayerId) ||
    null;

  const canPost =
    mode === 'text'
      ? textLayers.length > 0 || drawingStrokes.length > 0
      : !!selectedMediaUrl;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-[#141111] flex flex-col font-sans select-none overflow-hidden h-[100dvh] animate-in fade-in duration-200">
      
      {/* Hidden Media Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* ── 1. TOP SAFE-AREA NAVIGATION BAR ── */}
      <div className="w-full pt-[env(safe-area-inset-top,14px)] sm:pt-6 px-4 pb-3 flex items-center justify-between shrink-0 bg-[#141111] border-b border-zinc-800/80 z-20">
        
        {/* Left: Back/Cancel Button */}
        <button
          onClick={() => {
            triggerHaptic('light');
            handleRequestClose();
          }}
          disabled={postStage !== 'idle' && postStage !== 'error'}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all hover:bg-zinc-800 disabled:opacity-50"
          title="Close Editor"
        >
          <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.2} />
        </button>

        {/* Center: Title & Safe Area Guide Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <h2 className="text-[16.5px] font-bold text-white tracking-tight leading-tight">
              {mode === 'text' ? 'Text Story' : 'Story Creator'}
            </h2>
            <span className="text-[11px] text-zinc-400 font-medium">Connect Stories</span>
          </div>

          <button
            onClick={() => {
              triggerHaptic('light');
              setShowSafeArea(!showSafeArea);
            }}
            className={`p-1.5 rounded-full border transition-all ${
              showSafeArea
                ? 'bg-[#9D4EDD] border-[#9D4EDD] text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Toggle Safe Area Guides"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Undo, Redo, & Post Actions */}
        <div className="flex items-center gap-1.5">
          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0 || postStage !== 'idle'}
            className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-40 transition-all cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Redo */}
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1 || postStage !== 'idle'}
            className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-40 transition-all cursor-pointer"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {/* Post Button */}
          <button
            onClick={handlePostStory}
            disabled={!canPost || (postStage !== 'idle' && postStage !== 'error')}
            className={`ml-1 px-4.5 py-2 rounded-full font-semibold text-[13.5px] transition-all flex items-center gap-1.5 active:scale-95 ${
              canPost && (postStage === 'idle' || postStage === 'error')
                ? 'bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] text-white shadow-[0_4px_16px_rgba(157,78,221,0.4)] cursor-pointer hover:brightness-110'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-70'
            }`}
          >
            {postStage === 'preparing' && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Preparing...</span>
              </>
            )}
            {postStage === 'rendering' && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Rendering...</span>
              </>
            )}
            {(postStage === 'uploading' || postStage === 'publishing') && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Publishing...</span>
              </>
            )}
            {postStage === 'success' && (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Posted!</span>
              </>
            )}
            {(postStage === 'idle' || postStage === 'error') && (
              <>
                <Send className="w-3.5 h-3.5" strokeWidth={2.2} />
                <span>Post</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Error Alert Bar */}
      {errorMsg && (
        <div className="mx-4 mt-2 p-2.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-medium text-center flex items-center justify-between px-4 animate-in fade-in duration-150 shrink-0">
          <span>{errorMsg}</span>
          <button
            onClick={() => {
              setErrorMsg(null);
              setPostStage('idle');
            }}
            className="text-white hover:text-red-200 text-xs font-bold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 2. CENTRAL 9:16 STORY CANVAS ── */}
      <div className="flex-1 flex flex-col justify-center items-center relative overflow-hidden p-3 min-h-0">
        <StoryCanvas
          mode={mode}
          mediaUrl={selectedMediaUrl}
          mediaType={selectedMediaType}
          textLayers={textLayers}
          stickerLayers={stickerLayers}
          drawingStrokes={drawingStrokes}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
          onUpdateTextLayer={handleUpdateTextLayer}
          onUpdateStickerLayer={handleUpdateStickerLayer}
          onAddDrawingStroke={handleAddDrawingStroke}
          isDrawingMode={isDrawingMode}
          drawingColor={drawingColor}
          drawingSize={drawingSize}
          drawingTool={drawingTool}
          activeFilter={activeFilter}
          adjustments={adjustments}
          transform={transform}
          bgGradients={BG_GRADIENTS}
          activeBgIndex={activeBgIndex}
          showSafeArea={showSafeArea}
          onOpenMediaPicker={() => fileInputRef.current?.click()}
        />
      </div>

      {/* ── 3. CONTEXTUAL BOTTOM TOOLBAR & MODE SELECTOR ── */}
      <div className="w-full px-4 pb-[env(safe-area-inset-bottom,20px)] pt-2 bg-[#141111] flex flex-col gap-2.5 shrink-0 border-t border-zinc-800/80 z-20">
        
        {/* Contextual Toolbar */}
        <StoryToolbar
          mode={mode}
          selectedLayer={selectedLayer}
          onUpdateTextLayer={handleUpdateTextLayer}
          onDeleteLayer={handleDeleteLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onAddTextLayer={handleAddTextLayer}
          onOpenStickerPicker={() => setIsStickerPickerOpen(true)}
          isDrawingMode={isDrawingMode}
          onToggleDrawingMode={setIsDrawingMode}
          drawingColor={drawingColor}
          onChangeDrawingColor={setDrawingColor}
          drawingSize={drawingSize}
          onChangeDrawingSize={setDrawingSize}
          drawingTool={drawingTool}
          onChangeDrawingTool={setDrawingTool}
          onUndoDrawingStroke={handleUndoDrawingStroke}
          onClearDrawing={handleClearDrawing}
          activeFilter={activeFilter}
          onChangeFilter={setActiveFilter}
          adjustments={adjustments}
          onChangeAdjustments={setAdjustments}
          transform={transform}
          onChangeTransform={setTransform}
          bgGradients={BG_GRADIENTS}
          activeBgIndex={activeBgIndex}
          onChangeBgIndex={setActiveBgIndex}
          activeSubTool={activeSubTool}
          setActiveSubTool={setActiveSubTool}
        />

        {/* Mode Selector Pill (Photo/Video vs Text) */}
        {!isDrawingMode && !selectedLayer && activeSubTool === 'none' && (
          <div className="w-full max-w-[260px] mx-auto flex items-center bg-zinc-900/90 p-1 rounded-full border border-zinc-800 shadow-xs">
            <button
              onClick={() => {
                triggerHaptic('light');
                setMode('photo');
                if (!selectedMediaUrl) {
                  fileInputRef.current?.click();
                }
              }}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'photo'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>Media</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('light');
                setMode('text');
                if (textLayers.length === 0) {
                  handleAddTextLayer();
                }
              }}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'text'
                  ? 'bg-[#9D4EDD] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Type className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>Text</span>
            </button>
          </div>
        )}
      </div>

      {/* ── 4. STICKER PICKER MODAL SHEET ── */}
      <StoryStickerPicker
        isOpen={isStickerPickerOpen}
        onClose={() => setIsStickerPickerOpen(false)}
        onSelectSticker={handleAddStickerLayer}
      />

      {/* ── 5. CLOSE CONFIRMATION MODAL ── */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#181515] border border-zinc-800 rounded-3xl p-5 flex flex-col items-center text-center gap-3 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#D8B4E2]">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Save Draft?</h3>
              <p className="text-xs text-zinc-400 mt-1">
                You have unsaved story edits. Would you like to save your draft or discard it?
              </p>
            </div>
            <div className="flex flex-col w-full gap-2 mt-2">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowCloseConfirm(false);
                  onClose();
                }}
                className="w-full py-2.5 rounded-full bg-[#9D4EDD] text-white font-bold text-xs hover:brightness-110 transition-all cursor-pointer"
              >
                Save Draft & Exit
              </button>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  try {
                    localStorage.removeItem(draftKey);
                  } catch (e) {}
                  setShowCloseConfirm(false);
                  onClose();
                }}
                className="w-full py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-red-400 font-semibold text-xs transition-all cursor-pointer"
              >
                Discard Edits
              </button>
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 font-medium text-xs transition-all cursor-pointer"
              >
                Continue Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. DRAFT RECOVERY PROMPT ── */}
      {showDraftPrompt && recoveredDraft && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#181515] border border-zinc-800 rounded-3xl p-5 flex flex-col items-center text-center gap-3 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-[#9D4EDD]/20 border border-[#9D4EDD]/40 flex items-center justify-center text-[#D8B4E2]">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Continue Unfinished Story?</h3>
              <p className="text-xs text-zinc-400 mt-1">
                We found an unsaved draft from your previous session.
              </p>
            </div>
            <div className="flex flex-col w-full gap-2 mt-2">
              <button
                onClick={() => applyDraft(recoveredDraft)}
                className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] text-white font-bold text-xs hover:brightness-110 transition-all cursor-pointer shadow-md"
              >
                Continue Draft
              </button>
              <button
                onClick={discardDraft}
                className="w-full py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-semibold text-xs transition-all cursor-pointer"
              >
                Start New Story
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
