export type StoryMode = 'photo' | 'video' | 'text';

export type TextBackgroundStyle = 'none' | 'pill' | 'rect' | 'transparent' | 'solid';

export interface StoryTextLayer {
  id: string;
  type: 'text';
  text: string;
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  scale: number; // 0.5 - 3
  rotation: number; // in degrees
  fontFamily: string;
  fontSize: number; // base font size in px
  fontWeight: 'normal' | 'bold' | '900';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  background: TextBackgroundStyle;
  backgroundColor: string;
  shadow: boolean;
  opacity: number;
  zIndex: number;
}

export interface StoryStickerLayer {
  id: string;
  type: 'sticker';
  value: string;
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  scale: number;
  rotation: number;
  zIndex: number;
}

export type StoryLayer = StoryTextLayer | StoryStickerLayer;

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  points: DrawingPoint[];
  color: string;
  size: number;
  mode: 'pen' | 'marker' | 'eraser';
}

export type StoryFilter = 
  | 'normal' 
  | 'vivid' 
  | 'warm' 
  | 'cool' 
  | 'mono' 
  | 'vintage' 
  | 'dramatic' 
  | 'soft' 
  | 'noir';

export interface StoryAdjustments {
  brightness: number; // -100 to 100, default 0
  contrast: number;   // -100 to 100, default 0
  saturation: number; // -100 to 100, default 0
  blur: number;       // 0 to 20, default 0
  vignette: number;   // 0 to 100, default 0
}

export interface StoryTransform {
  zoom: number;       // 1 to 3
  rotation: number;   // 0, 90, 180, 270
  cropMode: 'cover' | 'contain';
  panX: number;
  panY: number;
}

export interface StoryBgGradient {
  id: string;
  name: string;
  bg: string;
  color: string;
  gradient?: string;
}

export interface StoryDraft {
  userId: string;
  updatedAt: number;
  mode: StoryMode;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video';
  caption: string;
  textLayers: StoryTextLayer[];
  stickerLayers: StoryStickerLayer[];
  drawingStrokes: DrawingStroke[];
  filter: StoryFilter;
  adjustments: StoryAdjustments;
  transform: StoryTransform;
  activeBgIndex: number;
}

export type PostStage = 
  | 'idle' 
  | 'preparing' 
  | 'rendering' 
  | 'uploading' 
  | 'publishing' 
  | 'success' 
  | 'error';
