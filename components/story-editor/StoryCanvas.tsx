'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  StoryMode,
  StoryLayer,
  StoryTextLayer,
  StoryStickerLayer,
  DrawingStroke,
  StoryFilter,
  StoryAdjustments,
  StoryTransform,
  StoryBgGradient
} from '@/types/story-editor';
import { Image as ImageIcon, Volume2, VolumeX, Play, Pause, Edit3, Trash2 } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

export interface StoryCanvasProps {
  mode: StoryMode;
  mediaUrl: string | null;
  mediaType: 'image' | 'video';
  textLayers: StoryTextLayer[];
  stickerLayers: StoryStickerLayer[];
  drawingStrokes: DrawingStroke[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onUpdateTextLayer: (id: string, updates: Partial<StoryTextLayer>) => void;
  onUpdateStickerLayer: (id: string, updates: Partial<StoryStickerLayer>) => void;
  onAddDrawingStroke: (stroke: DrawingStroke) => void;
  isDrawingMode: boolean;
  drawingColor: string;
  drawingSize: number;
  drawingTool: 'pen' | 'marker' | 'eraser';
  activeFilter: StoryFilter;
  adjustments: StoryAdjustments;
  transform: StoryTransform;
  bgGradients: StoryBgGradient[];
  activeBgIndex: number;
  showSafeArea: boolean;
  onOpenMediaPicker: () => void;
}

export default function StoryCanvas({
  mode,
  mediaUrl,
  mediaType,
  textLayers,
  stickerLayers,
  drawingStrokes,
  selectedLayerId,
  onSelectLayer,
  onUpdateTextLayer,
  onUpdateStickerLayer,
  onAddDrawingStroke,
  isDrawingMode,
  drawingColor,
  drawingSize,
  drawingTool,
  activeFilter,
  adjustments,
  transform,
  bgGradients,
  activeBgIndex,
  showSafeArea,
  onOpenMediaPicker
}: StoryCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Gesture tracking state
  const isDraggingRef = useRef(false);
  const activeDragLayerIdRef = useRef<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number; layerX: number; layerY: number }>({
    x: 0,
    y: 0,
    layerX: 0,
    layerY: 0
  });

  // Current active drawing stroke in progress
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const isPaintingRef = useRef(false);

  // ── CSS Filter Calculation ──
  const getFilterStyle = useCallback(() => {
    let baseFilter = '';
    switch (activeFilter) {
      case 'vivid':
        baseFilter = 'saturate(1.4) contrast(1.15)';
        break;
      case 'warm':
        baseFilter = 'sepia(0.25) saturate(1.2) hue-rotate(-10deg)';
        break;
      case 'cool':
        baseFilter = 'saturate(0.9) hue-rotate(15deg) brightness(1.05)';
        break;
      case 'mono':
        baseFilter = 'grayscale(1) contrast(1.2)';
        break;
      case 'vintage':
        baseFilter = 'sepia(0.4) contrast(0.9) brightness(0.95)';
        break;
      case 'dramatic':
        baseFilter = 'contrast(1.4) saturate(1.2) brightness(0.9)';
        break;
      case 'soft':
        baseFilter = 'brightness(1.1) contrast(0.9) saturate(1.1)';
        break;
      case 'noir':
        baseFilter = 'grayscale(1) contrast(1.7) brightness(0.85)';
        break;
      default:
        baseFilter = '';
    }

    const b = 1 + adjustments.brightness / 100;
    const c = 1 + adjustments.contrast / 100;
    const s = 1 + adjustments.saturation / 100;
    const blur = adjustments.blur > 0 ? `blur(${adjustments.blur}px)` : '';

    const adjFilter = `brightness(${b}) contrast(${c}) saturate(${s}) ${blur}`.trim();
    return `${baseFilter} ${adjFilter}`.trim() || 'none';
  }, [activeFilter, adjustments]);

  // ── Draw Persistent Strokes on Canvas ──
  const redrawDrawingCanvas = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawingStrokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = stroke.mode === 'marker' ? 0.6 : 1.0;
      ctx.globalCompositeOperation = stroke.mode === 'eraser' ? 'destination-out' : 'source-over';

      const first = stroke.points[0];
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);

      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
      }
      ctx.stroke();
    });

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }, [drawingStrokes]);

  useEffect(() => {
    redrawDrawingCanvas();
  }, [drawingStrokes, redrawDrawingCanvas]);

  // ── Handle Canvas Resize for Drawing ──
  useEffect(() => {
    const updateCanvasDimensions = () => {
      const canvas = drawingCanvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        redrawDrawingCanvas();
      }
    };
    updateCanvasDimensions();
    window.addEventListener('resize', updateCanvasDimensions);
    return () => window.removeEventListener('resize', updateCanvasDimensions);
  }, [redrawDrawingCanvas]);

  // ── Freehand Drawing Events ──
  const handleDrawingPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    isPaintingRef.current = true;
    currentStrokeRef.current = [{ x, y }];

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.strokeStyle = drawingColor;
      ctx.lineWidth = drawingSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = drawingTool === 'marker' ? 0.6 : 1.0;
      ctx.globalCompositeOperation = drawingTool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.moveTo(x * rect.width, y * rect.height);
    }
  };

  const handleDrawingPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !isPaintingRef.current) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    currentStrokeRef.current.push({ x, y });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo(x * rect.width, y * rect.height);
      ctx.stroke();
    }
  };

  const handleDrawingPointerUp = () => {
    if (!isDrawingMode || !isPaintingRef.current) return;
    isPaintingRef.current = false;

    if (currentStrokeRef.current.length > 1) {
      onAddDrawingStroke({
        id: 'stroke-' + Date.now() + Math.random().toString(36).substring(7),
        points: [...currentStrokeRef.current],
        color: drawingColor,
        size: drawingSize,
        mode: drawingTool
      });
    }
    currentStrokeRef.current = [];
  };

  // ── Pointer Drag / Move for Text and Stickers ──
  const handleLayerPointerDown = (
    e: React.PointerEvent,
    id: string,
    currentX: number,
    currentY: number
  ) => {
    if (isDrawingMode) return;
    e.stopPropagation();
    onSelectLayer(id);

    isDraggingRef.current = true;
    activeDragLayerIdRef.current = id;
    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      layerX: currentX,
      layerY: currentY
    };

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !activeDragLayerIdRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStartPosRef.current.x) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStartPosRef.current.y) / rect.height) * 100;

    const newX = Math.max(0, Math.min(100, dragStartPosRef.current.layerX + deltaX));
    const newY = Math.max(0, Math.min(100, dragStartPosRef.current.layerY + deltaY));

    const textMatch = textLayers.find((l) => l.id === activeDragLayerIdRef.current);
    if (textMatch) {
      onUpdateTextLayer(textMatch.id, { x: newX, y: newY });
      return;
    }

    const stickerMatch = stickerLayers.find((l) => l.id === activeDragLayerIdRef.current);
    if (stickerMatch) {
      onUpdateStickerLayer(stickerMatch.id, { x: newX, y: newY });
    }
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      activeDragLayerIdRef.current = null;
    }
  };

  // ── Background Style ──
  const currentBg = bgGradients[activeBgIndex] || bgGradients[0];

  return (
    <div
      ref={containerRef}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onClick={(e) => {
        if (e.target === containerRef.current) {
          onSelectLayer(null);
          setEditingTextId(null);
        }
      }}
      className={`w-full max-w-[360px] aspect-[9/16] max-h-[72dvh] rounded-[28px] overflow-hidden relative shadow-2xl flex items-center justify-center select-none border border-zinc-800/80 transition-colors ${
        mode === 'text' ? currentBg.bg : 'bg-zinc-950'
      }`}
    >
      {/* ── 1. MEDIA LAYER (PHOTO / VIDEO) ── */}
      {mode !== 'text' && mediaUrl ? (
        <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center pointer-events-none">
          {mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              autoPlay
              loop
              muted={isVideoMuted}
              playsInline
              className={`w-full h-full ${
                transform.cropMode === 'cover' ? 'object-cover' : 'object-contain'
              }`}
              style={{
                transform: `rotate(${transform.rotation}deg) scale(${transform.zoom})`,
                filter: getFilterStyle()
              }}
            />
          ) : (
            <img
              src={mediaUrl}
              alt="Story Content"
              className={`w-full h-full ${
                transform.cropMode === 'cover' ? 'object-cover' : 'object-contain'
              }`}
              style={{
                transform: `rotate(${transform.rotation}deg) scale(${transform.zoom})`,
                filter: getFilterStyle()
              }}
            />
          )}

          {/* Vignette Shadow Overlay if adjustments applied */}
          {adjustments.vignette > 0 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: `inset 0 0 ${adjustments.vignette * 1.5}px rgba(0,0,0,0.8)`
              }}
            />
          )}
        </div>
      ) : mode !== 'text' && !mediaUrl ? (
        /* Empty Media Placeholder */
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-4 z-10">
          <button
            onClick={() => {
              triggerHaptic('light');
              onOpenMediaPicker();
            }}
            className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[#9D4EDD] cursor-pointer hover:bg-zinc-800 active:scale-95 transition-all shadow-lg"
          >
            <ImageIcon className="w-8 h-8" strokeWidth={2} />
          </button>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Select Photo or Video</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-[220px]">
              Tap above to upload from your gallery or camera
            </p>
          </div>
        </div>
      ) : null}

      {/* ── 2. VIDEO CONTROLS OVERLAY (If Video Mode) ── */}
      {mode === 'video' && mediaUrl && (
        <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
          <button
            onClick={() => {
              triggerHaptic('light');
              if (videoRef.current) {
                if (isVideoPlaying) videoRef.current.pause();
                else videoRef.current.play();
                setIsVideoPlaying(!isVideoPlaying);
              }
            }}
            className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-all cursor-pointer"
          >
            {isVideoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => {
              triggerHaptic('light');
              setIsVideoMuted(!isVideoMuted);
            }}
            className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-all cursor-pointer"
          >
            {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* ── 3. FREEHAND DRAWING CANVAS ── */}
      <canvas
        ref={drawingCanvasRef}
        onPointerDown={handleDrawingPointerDown}
        onPointerMove={handleDrawingPointerMove}
        onPointerUp={handleDrawingPointerUp}
        className={`absolute inset-0 w-full h-full z-20 ${
          isDrawingMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
        }`}
      />

      {/* ── 4. TEXT LAYERS ── */}
      {textLayers.map((layer) => {
        const isSelected = selectedLayerId === layer.id;
        const isEditing = editingTextId === layer.id;

        // Background highlight styles
        let bgStyle = '';
        if (layer.background === 'pill') {
          bgStyle = 'bg-black/75 rounded-full px-4 py-1.5 backdrop-blur-xs';
        } else if (layer.background === 'rect') {
          bgStyle = 'bg-black/75 rounded-xl px-3 py-1.5 backdrop-blur-xs';
        } else if (layer.background === 'transparent') {
          bgStyle = 'bg-white/20 rounded-xl px-3 py-1.5 backdrop-blur-md';
        } else if (layer.background === 'solid') {
          bgStyle = 'bg-[#9D4EDD] text-white rounded-xl px-3 py-1.5 shadow-md';
        }

        return (
          <div
            key={layer.id}
            onPointerDown={(e) => handleLayerPointerDown(e, layer.id, layer.x, layer.y)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingTextId(layer.id);
            }}
            className={`absolute z-30 cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 touch-none ${
              isSelected ? 'ring-2 ring-[#9D4EDD] ring-offset-2 ring-offset-black/50 rounded-lg' : ''
            }`}
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`
            }}
          >
            {isEditing ? (
              <input
                type="text"
                autoFocus
                value={layer.text}
                onChange={(e) => onUpdateTextLayer(layer.id, { text: e.target.value })}
                onBlur={() => setEditingTextId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingTextId(null);
                }}
                className={`bg-transparent text-center outline-none border-b border-[#9D4EDD] ${bgStyle}`}
                style={{
                  fontFamily: layer.fontFamily,
                  fontSize: `${layer.fontSize}px`,
                  color: layer.color,
                  textAlign: layer.textAlign,
                  fontWeight: layer.fontWeight
                }}
              />
            ) : (
              <div
                className={`font-bold whitespace-pre-wrap max-w-[280px] break-words text-center transition-all ${bgStyle}`}
                style={{
                  fontFamily: layer.fontFamily,
                  fontSize: `${layer.fontSize}px`,
                  color: layer.color,
                  textAlign: layer.textAlign,
                  fontWeight: layer.fontWeight,
                  textShadow: layer.shadow ? '0 2px 8px rgba(0,0,0,0.8)' : 'none'
                }}
              >
                {layer.text || 'Tap to edit'}
              </div>
            )}
          </div>
        );
      })}

      {/* ── 5. STICKER LAYERS ── */}
      {stickerLayers.map((layer) => {
        const isSelected = selectedLayerId === layer.id;

        return (
          <div
            key={layer.id}
            onPointerDown={(e) => handleLayerPointerDown(e, layer.id, layer.x, layer.y)}
            className={`absolute z-30 cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 touch-none text-4xl select-none ${
              isSelected ? 'ring-2 ring-[#9D4EDD] ring-offset-2 ring-offset-black/50 rounded-2xl p-1' : ''
            }`}
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`
            }}
          >
            {layer.value}
          </div>
        );
      })}

      {/* ── 6. SAFE AREA GUIDES (TEMPORARY OVERLAY) ── */}
      {showSafeArea && (
        <div className="absolute inset-0 pointer-events-none z-40 border-2 border-dashed border-white/20 m-4 rounded-2xl flex flex-col justify-between p-2">
          <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono text-center">
            Safe Area Top
          </span>
          <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono text-center">
            Safe Area Bottom
          </span>
        </div>
      )}
    </div>
  );
}
