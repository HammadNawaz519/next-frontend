'use client';

import React from 'react';
import {
  Type,
  Smile,
  Brush,
  SlidersHorizontal,
  Sparkles,
  Crop,
  RotateCw,
  Trash2,
  Copy,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Minus,
  Plus,
  Undo2,
  Check,
  X,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import {
  StoryMode,
  StoryLayer,
  StoryTextLayer,
  StoryStickerLayer,
  StoryFilter,
  StoryAdjustments,
  StoryTransform,
  StoryBgGradient,
  TextBackgroundStyle
} from '@/types/story-editor';
import { triggerHaptic } from '@/lib/haptics';

export interface StoryToolbarProps {
  mode: StoryMode;
  selectedLayer: StoryLayer | null;
  onUpdateTextLayer?: (id: string, updates: Partial<StoryTextLayer>) => void;
  onDeleteLayer?: (id: string) => void;
  onDuplicateLayer?: (id: string) => void;
  onAddTextLayer: () => void;
  onOpenStickerPicker: () => void;
  isDrawingMode: boolean;
  onToggleDrawingMode: (active: boolean) => void;
  drawingColor: string;
  onChangeDrawingColor: (color: string) => void;
  drawingSize: number;
  onChangeDrawingSize: (size: number) => void;
  drawingTool: 'pen' | 'marker' | 'eraser';
  onChangeDrawingTool: (tool: 'pen' | 'marker' | 'eraser') => void;
  onUndoDrawingStroke?: () => void;
  onClearDrawing?: () => void;
  activeFilter: StoryFilter;
  onChangeFilter: (filter: StoryFilter) => void;
  adjustments: StoryAdjustments;
  onChangeAdjustments: (adjustments: StoryAdjustments) => void;
  transform: StoryTransform;
  onChangeTransform: (transform: StoryTransform) => void;
  bgGradients: StoryBgGradient[];
  activeBgIndex: number;
  onChangeBgIndex: (index: number) => void;
  activeSubTool: 'none' | 'filters' | 'adjust' | 'transform' | 'background';
  setActiveSubTool: (tool: 'none' | 'filters' | 'adjust' | 'transform' | 'background') => void;
}

export const FONT_PRESETS = [
  { id: 'sans', name: 'Sans', font: 'var(--font-inter, sans-serif)' },
  { id: 'headline', name: 'Headline', font: 'Impact, sans-serif' },
  { id: 'serif', name: 'Serif', font: 'Georgia, serif' },
  { id: 'neon', name: 'Neon', font: 'cursive, sans-serif' },
  { id: 'mono', name: 'Mono', font: 'monospace' }
];

export const CONNECT_COLORS = [
  '#FFFFFF',
  '#141111',
  '#9D4EDD',
  '#D8B4E2',
  '#FFF3CD',
  '#10B981',
  '#0284C7',
  '#E11D48',
  '#F59E0B'
];

export const FILTER_PRESETS: { id: StoryFilter; name: string }[] = [
  { id: 'normal', name: 'Normal' },
  { id: 'vivid', name: 'Vivid' },
  { id: 'warm', name: 'Warm' },
  { id: 'cool', name: 'Cool' },
  { id: 'mono', name: 'Mono' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'dramatic', name: 'Dramatic' },
  { id: 'soft', name: 'Soft' },
  { id: 'noir', name: 'Noir' }
];

export default function StoryToolbar({
  mode,
  selectedLayer,
  onUpdateTextLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onAddTextLayer,
  onOpenStickerPicker,
  isDrawingMode,
  onToggleDrawingMode,
  drawingColor,
  onChangeDrawingColor,
  drawingSize,
  onChangeDrawingSize,
  drawingTool,
  onChangeDrawingTool,
  onUndoDrawingStroke,
  onClearDrawing,
  activeFilter,
  onChangeFilter,
  adjustments,
  onChangeAdjustments,
  transform,
  onChangeTransform,
  bgGradients,
  activeBgIndex,
  onChangeBgIndex,
  activeSubTool,
  setActiveSubTool
}: StoryToolbarProps) {

  // ── 1. DRAWING SUB-TOOLBAR ──
  if (isDrawingMode) {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#181515] border border-zinc-800/90 rounded-2xl p-3 flex flex-col gap-3 shadow-xl animate-in slide-in-from-bottom-2 duration-150">
        <div className="flex items-center justify-between px-1">
          {/* Drawing Tools Toggle */}
          <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-full border border-zinc-800">
            <button
              onClick={() => {
                triggerHaptic('light');
                onChangeDrawingTool('pen');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                drawingTool === 'pen' ? 'bg-[#9D4EDD] text-white shadow-xs' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Pen
            </button>
            <button
              onClick={() => {
                triggerHaptic('light');
                onChangeDrawingTool('marker');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                drawingTool === 'marker' ? 'bg-[#9D4EDD] text-white shadow-xs' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Marker
            </button>
            <button
              onClick={() => {
                triggerHaptic('light');
                onChangeDrawingTool('eraser');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                drawingTool === 'eraser' ? 'bg-[#9D4EDD] text-white shadow-xs' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Eraser
            </button>
          </div>

          {/* Size Selectors */}
          <div className="flex items-center gap-2">
            {[3, 7, 14].map((sz) => (
              <button
                key={sz}
                onClick={() => {
                  triggerHaptic('light');
                  onChangeDrawingSize(sz);
                }}
                className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                  drawingSize === sz ? 'border-white bg-zinc-800' : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                }`}
              >
                <div
                  className="rounded-full bg-white"
                  style={{ width: sz === 3 ? 4 : sz === 7 ? 8 : 12, height: sz === 3 ? 4 : sz === 7 ? 8 : 12 }}
                />
              </button>
            ))}
          </div>

          {/* Drawing Actions */}
          <div className="flex items-center gap-1.5">
            {onUndoDrawingStroke && (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  onUndoDrawingStroke();
                }}
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center transition-all"
                title="Undo Stroke"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => {
                triggerHaptic('medium');
                onToggleDrawingMode(false);
              }}
              className="px-3 py-1.5 rounded-full bg-white text-zinc-900 text-xs font-bold transition-all hover:bg-zinc-200"
            >
              Done
            </button>
          </div>
        </div>

        {/* Color Palette */}
        {drawingTool !== 'eraser' && (
          <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar py-1">
            {CONNECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  triggerHaptic('light');
                  onChangeDrawingColor(c);
                }}
                className={`w-6 h-6 rounded-full transition-transform ${
                  drawingColor === c ? 'ring-2 ring-white scale-125 shadow-md' : 'opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 2. SELECTED TEXT LAYER SUB-TOOLBAR ──
  if (selectedLayer && selectedLayer.type === 'text') {
    const textLayer = selectedLayer as StoryTextLayer;

    return (
      <div className="w-full max-w-lg mx-auto bg-[#181515] border border-zinc-800/90 rounded-2xl p-3 flex flex-col gap-2.5 shadow-xl animate-in slide-in-from-bottom-2 duration-150">
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar pb-1">
          {/* Font Family Selector */}
          <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-full border border-zinc-800">
            {FONT_PRESETS.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  triggerHaptic('light');
                  onUpdateTextLayer?.(textLayer.id, { fontFamily: f.font });
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  textLayer.fontFamily === f.font
                    ? 'bg-[#9D4EDD] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>

          {/* Alignment */}
          <div className="flex items-center bg-zinc-900 p-0.5 rounded-full border border-zinc-800">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => {
                  triggerHaptic('light');
                  onUpdateTextLayer?.(textLayer.id, { textAlign: align });
                }}
                className={`p-1.5 rounded-full text-xs transition-all ${
                  textLayer.textAlign === align ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {align === 'left' ? (
                  <AlignLeft className="w-3.5 h-3.5" />
                ) : align === 'center' ? (
                  <AlignCenter className="w-3.5 h-3.5" />
                ) : (
                  <AlignRight className="w-3.5 h-3.5" />
                )}
              </button>
            ))}
          </div>

          {/* Background Highlight Toggle */}
          <button
            onClick={() => {
              triggerHaptic('light');
              const styles: TextBackgroundStyle[] = ['none', 'pill', 'rect', 'transparent', 'solid'];
              const nextIdx = (styles.indexOf(textLayer.background) + 1) % styles.length;
              onUpdateTextLayer?.(textLayer.id, { background: styles[nextIdx] });
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
              textLayer.background !== 'none'
                ? 'bg-[#9D4EDD] border-[#9D4EDD] text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            A
          </button>

          {/* Duplicate & Delete */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                triggerHaptic('light');
                onDuplicateLayer?.(textLayer.id);
              }}
              className="p-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-all"
              title="Duplicate"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                triggerHaptic('medium');
                onDeleteLayer?.(textLayer.id);
              }}
              className="p-1.5 rounded-full bg-zinc-900 hover:bg-red-500/30 text-red-400 transition-all"
              title="Delete Layer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Color Palette */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {CONNECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  triggerHaptic('light');
                  onUpdateTextLayer?.(textLayer.id, { color: c });
                }}
                className={`w-5 h-5 rounded-full transition-transform ${
                  textLayer.color === c ? 'ring-2 ring-white scale-125 shadow-md' : 'opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Size Adjuster */}
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={() => {
                triggerHaptic('light');
                onUpdateTextLayer?.(textLayer.id, { fontSize: Math.max(16, textLayer.fontSize - 4) });
              }}
              className="w-6 h-6 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center text-xs"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[11px] text-zinc-400 font-mono w-5 text-center">{textLayer.fontSize}</span>
            <button
              onClick={() => {
                triggerHaptic('light');
                onUpdateTextLayer?.(textLayer.id, { fontSize: Math.min(80, textLayer.fontSize + 4) });
              }}
              className="w-6 h-6 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center text-xs"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 3. SELECTED STICKER LAYER SUB-TOOLBAR ──
  if (selectedLayer && selectedLayer.type === 'sticker') {
    return (
      <div className="w-full max-w-sm mx-auto bg-[#181515] border border-zinc-800/90 rounded-2xl p-2 px-4 flex items-center justify-between shadow-xl animate-in slide-in-from-bottom-2 duration-150">
        <span className="text-xs font-semibold text-zinc-400">Sticker Layer</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              triggerHaptic('light');
              onDuplicateLayer?.(selectedLayer.id);
            }}
            className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-all flex items-center gap-1 text-xs"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          <button
            onClick={() => {
              triggerHaptic('medium');
              onDeleteLayer?.(selectedLayer.id);
            }}
            className="p-2 rounded-full bg-zinc-900 hover:bg-red-500/30 text-red-400 transition-all flex items-center gap-1 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    );
  }

  // ── 4. SUB-PANEL: FILTERS CAROUSEL ──
  if (activeSubTool === 'filters') {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#181515] border border-zinc-800/90 rounded-2xl p-3 flex flex-col gap-2 shadow-xl animate-in slide-in-from-bottom-2 duration-150">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-bold text-white uppercase tracking-wider">Filters</span>
          <button
            onClick={() => setActiveSubTool('none')}
            className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {FILTER_PRESETS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                triggerHaptic('light');
                onChangeFilter(f.id);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                activeFilter === f.id
                  ? 'bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] text-white shadow-xs'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 5. SUB-PANEL: IMAGE ADJUSTMENTS ──
  if (activeSubTool === 'adjust') {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#181515] border border-zinc-800/90 rounded-2xl p-3 flex flex-col gap-2.5 shadow-xl animate-in slide-in-from-bottom-2 duration-150 text-xs">
        <div className="flex items-center justify-between pb-1">
          <span className="font-bold text-white uppercase tracking-wider">Adjustments</span>
          <button
            onClick={() => setActiveSubTool('none')}
            className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Brightness */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-400 w-20">Brightness</span>
          <input
            type="range"
            min="-100"
            max="100"
            value={adjustments.brightness}
            onChange={(e) => onChangeAdjustments({ ...adjustments, brightness: Number(e.target.value) })}
            className="flex-1 accent-[#9D4EDD] h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
          <span className="font-mono text-zinc-300 w-8 text-right">{adjustments.brightness}</span>
        </div>

        {/* Contrast */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-400 w-20">Contrast</span>
          <input
            type="range"
            min="-100"
            max="100"
            value={adjustments.contrast}
            onChange={(e) => onChangeAdjustments({ ...adjustments, contrast: Number(e.target.value) })}
            className="flex-1 accent-[#9D4EDD] h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
          <span className="font-mono text-zinc-300 w-8 text-right">{adjustments.contrast}</span>
        </div>

        {/* Saturation */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-400 w-20">Saturation</span>
          <input
            type="range"
            min="-100"
            max="100"
            value={adjustments.saturation}
            onChange={(e) => onChangeAdjustments({ ...adjustments, saturation: Number(e.target.value) })}
            className="flex-1 accent-[#9D4EDD] h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
          <span className="font-mono text-zinc-300 w-8 text-right">{adjustments.saturation}</span>
        </div>

        {/* Reset */}
        <div className="flex justify-end pt-1">
          <button
            onClick={() => {
              triggerHaptic('light');
              onChangeAdjustments({ brightness: 0, contrast: 0, saturation: 0, blur: 0, vignette: 0 });
            }}
            className="text-[11px] text-zinc-400 hover:text-white"
          >
            Reset All
          </button>
        </div>
      </div>
    );
  }

  // ── 6. SUB-PANEL: TRANSFORM & ROTATE ──
  if (activeSubTool === 'transform') {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#181515] border border-zinc-800/90 rounded-2xl p-3 flex items-center justify-between shadow-xl animate-in slide-in-from-bottom-2 duration-150">
        <div className="flex items-center gap-2">
          {/* Rotate 90 deg */}
          <button
            onClick={() => {
              triggerHaptic('light');
              const nextRot = (transform.rotation + 90) % 360;
              onChangeTransform({ ...transform, rotation: nextRot });
            }}
            className="px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate 90° ({transform.rotation}°)</span>
          </button>

          {/* Crop Mode (Cover vs Contain) */}
          <button
            onClick={() => {
              triggerHaptic('light');
              const nextMode = transform.cropMode === 'cover' ? 'contain' : 'cover';
              onChangeTransform({ ...transform, cropMode: nextMode });
            }}
            className="px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>{transform.cropMode === 'cover' ? 'Fit Screen' : 'Original Ratio'}</span>
          </button>
        </div>

        <button
          onClick={() => setActiveSubTool('none')}
          className="w-7 h-7 rounded-full bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── 7. SUB-PANEL: BACKGROUND GRADIENTS (Text Mode) ──
  if (activeSubTool === 'background') {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#181515] border border-zinc-800/90 rounded-2xl p-3 flex flex-col gap-2 shadow-xl animate-in slide-in-from-bottom-2 duration-150">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-bold text-white uppercase tracking-wider">Background Style</span>
          <button
            onClick={() => setActiveSubTool('none')}
            className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {bgGradients.map((g, idx) => (
            <button
              key={g.id}
              onClick={() => {
                triggerHaptic('light');
                onChangeBgIndex(idx);
              }}
              className={`w-8 h-8 rounded-full transition-transform cursor-pointer shrink-0 ${
                activeBgIndex === idx ? 'ring-2 ring-white scale-110 shadow-md' : 'opacity-80 hover:opacity-100'
              }`}
              style={{ background: g.color }}
              title={g.name}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── 8. PRIMARY CONTEXTUAL TOOLBAR (DEFAULT IDLE STATE) ──
  return (
    <div className="w-full max-w-md mx-auto bg-[#181515]/95 backdrop-blur-md border border-zinc-800/80 rounded-full p-1.5 px-3 flex items-center justify-between shadow-2xl">
      {/* Add Text */}
      <button
        onClick={() => {
          triggerHaptic('light');
          onAddTextLayer();
        }}
        className="p-2.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800/80 active:scale-95 transition-all flex flex-col items-center gap-0.5"
        title="Add Text"
      >
        <Type className="w-5 h-5 text-white" strokeWidth={2.2} />
      </button>

      {/* Add Sticker */}
      <button
        onClick={() => {
          triggerHaptic('light');
          onOpenStickerPicker();
        }}
        className="p-2.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800/80 active:scale-95 transition-all flex flex-col items-center gap-0.5"
        title="Stickers"
      >
        <Smile className="w-5 h-5 text-[#D8B4E2]" strokeWidth={2.2} />
      </button>

      {/* Freehand Draw */}
      <button
        onClick={() => {
          triggerHaptic('light');
          onToggleDrawingMode(true);
        }}
        className="p-2.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800/80 active:scale-95 transition-all flex flex-col items-center gap-0.5"
        title="Draw"
      >
        <Brush className="w-5 h-5 text-zinc-200" strokeWidth={2.2} />
      </button>

      {/* Filters (Media Mode) */}
      {mode === 'photo' && (
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveSubTool(activeSubTool === 'filters' ? 'none' : 'filters');
          }}
          className={`p-2.5 rounded-full active:scale-95 transition-all flex flex-col items-center gap-0.5 ${
            activeSubTool === 'filters' ? 'bg-[#9D4EDD] text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
          }`}
          title="Filters"
        >
          <Sparkles className="w-5 h-5" strokeWidth={2.2} />
        </button>
      )}

      {/* Adjustments (Media Mode) */}
      {mode === 'photo' && (
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveSubTool(activeSubTool === 'adjust' ? 'none' : 'adjust');
          }}
          className={`p-2.5 rounded-full active:scale-95 transition-all flex flex-col items-center gap-0.5 ${
            activeSubTool === 'adjust' ? 'bg-[#9D4EDD] text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
          }`}
          title="Adjustments"
        >
          <SlidersHorizontal className="w-5 h-5" strokeWidth={2.2} />
        </button>
      )}

      {/* Transform / Crop (Media Mode) */}
      {mode === 'photo' && (
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveSubTool(activeSubTool === 'transform' ? 'none' : 'transform');
          }}
          className={`p-2.5 rounded-full active:scale-95 transition-all flex flex-col items-center gap-0.5 ${
            activeSubTool === 'transform' ? 'bg-[#9D4EDD] text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
          }`}
          title="Crop & Rotate"
        >
          <Crop className="w-5 h-5" strokeWidth={2.2} />
        </button>
      )}

      {/* Background Gradients (Text Mode) */}
      {mode === 'text' && (
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveSubTool(activeSubTool === 'background' ? 'none' : 'background');
          }}
          className={`p-2.5 rounded-full active:scale-95 transition-all flex flex-col items-center gap-0.5 ${
            activeSubTool === 'background' ? 'bg-[#9D4EDD] text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
          }`}
          title="Background Style"
        >
          <Palette className="w-5 h-5 text-[#9D4EDD]" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
