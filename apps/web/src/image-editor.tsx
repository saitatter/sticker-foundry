import { ImagePlus, Edit3 } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import type { AdminSettings } from './api';
import { hasColorAdjustments, isAnimatedSourceFile } from './image-editor-processing';
import { ImageEditControls as ExtractedImageEditControls } from './image-editor-controls';

export { editableUploadFile, stickerUploadOptionsFromEdit } from './image-editor-processing';

export type ImageEditOptions = {
  rotation: 0 | 90 | 180 | 270;
  cropSquare: boolean;
  normalizeSquare: boolean;
  removeLightBackground: boolean;
  serverBackgroundRemovalMode: 'none' | 'threshold' | 'ai';
  backgroundThreshold: number;
  backgroundFeather: number;
  cleanupSpeckles: boolean;
  speckleSize: number;
  outline: boolean;
  shadow: boolean;
  zoom: number;
  offsetX: number;
  offsetY: number;
  brushMode: BrushMode;
  brushSize: number;
  brushStrokes: BrushStroke[];
  textEnabled: boolean;
  textContent: string;
  textSize: number;
  textColor: string;
  textStrokeColor: string;
  textStrokeWidth: number;
  textRotation: number;
  textX: number;
  textY: number;
  autoFitSubject: boolean;
  subjectPadding: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpen: number;
  warmth: number;
  tint: number;
  grayscale: boolean;
  optimizeOutput: boolean;
  outputQuality: number;
  animatedTrimStart: number;
  animatedTrimEnd: number;
  animatedFrameRate: number;
  animatedCompress: boolean;
};

export type BrushMode = 'erase' | 'restore';

export type BrushPoint = {
  x: number;
  y: number;
};

export type BrushStroke = {
  id: string;
  mode: BrushMode;
  size: number;
  points: BrushPoint[];
};

export const defaultImageEditOptions: ImageEditOptions = {
  rotation: 0,
  cropSquare: false,
  normalizeSquare: false,
  removeLightBackground: false,
  serverBackgroundRemovalMode: 'none',
  backgroundThreshold: 238,
  backgroundFeather: 14,
  cleanupSpeckles: true,
  speckleSize: 24,
  outline: false,
  shadow: false,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  brushMode: 'erase',
  brushSize: 28,
  brushStrokes: [],
  textEnabled: false,
  textContent: '',
  textSize: 64,
  textColor: '#ffffff',
  textStrokeColor: '#111827',
  textStrokeWidth: 6,
  textRotation: 0,
  textX: 50,
  textY: 82,
  autoFitSubject: false,
  subjectPadding: 12,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpen: 0,
  warmth: 0,
  tint: 0,
  grayscale: false,
  optimizeOutput: false,
  outputQuality: 82,
  animatedTrimStart: 0,
  animatedTrimEnd: 10,
  animatedFrameRate: 15,
  animatedCompress: true,
};

export function cloneImageEditOptions(options: ImageEditOptions): ImageEditOptions {
  return {
    ...options,
    brushStrokes: options.brushStrokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  };
}

export function imageEditBadges(options: ImageEditOptions, file: File, isAnimatedPack: boolean) {
  const badges: string[] = [];
  if (
    options.rotation !== 0 ||
    options.cropSquare ||
    options.normalizeSquare ||
    options.zoom !== 1 ||
    options.offsetX !== 0 ||
    options.offsetY !== 0
  ) {
    badges.push('Framing');
  }
  if (options.removeLightBackground || options.serverBackgroundRemovalMode !== 'none') {
    badges.push(options.serverBackgroundRemovalMode === 'ai' ? 'AI bg' : 'Background');
  }
  if (options.brushStrokes.length > 0) {
    badges.push(`${options.brushStrokes.length} brush stroke${options.brushStrokes.length === 1 ? '' : 's'}`);
  }
  if (options.outline || options.shadow || options.textEnabled) {
    badges.push('Sticker effects');
  }
  if (hasColorAdjustments(options) || options.grayscale) {
    badges.push('Color');
  }
  if (options.optimizeOutput) {
    badges.push('Optimized');
  }
  if (
    isAnimatedPack &&
    isAnimatedSourceFile(file) &&
    (options.animatedTrimStart > 0 || options.animatedTrimEnd < 10 || options.animatedFrameRate !== 15)
  ) {
    badges.push('Animation');
  }
  return badges.length > 0 ? badges : ['Original image'];
}

export function UploadEditSummary({
  file,
  fileCount,
  isAnimatedPack,
  options,
  onEdit,
  onReset,
}: {
  file: File;
  fileCount: number;
  isAnimatedPack: boolean;
  options: ImageEditOptions;
  onEdit: () => void;
  onReset: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const badges = imageEditBadges(options, file, isAnimatedPack);
  const hasEdits = badges[0] !== 'Original image';

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="upload-edit-summary">
      <div className="upload-edit-preview">
        {previewUrl ? <img alt="Selected upload preview" src={previewUrl} /> : <ImagePlus size={24} />}
      </div>
      <div className="upload-edit-copy">
        <strong>{fileCount === 1 ? file.name : `${fileCount} images selected`}</strong>
        <div className="upload-edit-badges">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      </div>
      <button className="secondary-button" onClick={onEdit} type="button">
        <Edit3 size={17} />
        Edit
      </button>
      <button className="ghost-button" disabled={!hasEdits} onClick={onReset} type="button">
        Reset
      </button>
    </div>
  );
}

export function ImageEditModal({
  backgroundRemovalStatus,
  file,
  options,
  onChange,
  onApply,
  onClose,
  onReset,
}: {
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
  file: File;
  options: ImageEditOptions;
  onChange: Dispatch<SetStateAction<ImageEditOptions>>;
  onApply: () => void;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <div className="modal-backdrop image-editor-backdrop">
      <section
        aria-label="Sticker image editor"
        aria-modal="true"
        className="modal-panel image-editor-modal"
        role="dialog"
      >
        <header className="image-editor-header">
          <div>
            <h3>Edit Sticker</h3>
            <p>{file.name}</p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Cancel
          </button>
        </header>
        <ExtractedImageEditControls
          backgroundRemovalStatus={backgroundRemovalStatus}
          file={file}
          modal
          options={options}
          onChange={onChange}
        />
        <footer className="image-editor-footer">
          <button className="ghost-button" onClick={onReset} type="button">
            Reset edits
          </button>
          <div>
            <button className="secondary-button" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" onClick={onApply} type="button">
              Apply edits
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
