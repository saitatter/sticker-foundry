import { Eraser, Eye, MoveRight, Redo2, RefreshCw, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import {
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { AdminSettings } from './api';
import type { BrushMode, BrushPoint, BrushStroke, ImageEditOptions } from './image-editor';
import {
  clamp,
  drawCheckerboard,
  drawEditedPreview,
  ensurePreviewCanvasSize,
  formatBytes,
  imageEditOutputSize,
  loadImage,
  renderImageEditCanvas,
  serverBackgroundRemovalMessage,
} from './image-editor-processing';

type ImageEditPanel = 'basics' | 'text' | 'background' | 'output';

const imageEditPresets: Array<{ name: string; options: Partial<ImageEditOptions> }> = [
  {
    name: 'Meme cutout',
    options: {
      removeLightBackground: true,
      backgroundThreshold: 232,
      backgroundFeather: 18,
      cleanupSpeckles: true,
      speckleSize: 36,
      autoFitSubject: true,
      normalizeSquare: true,
      outline: true,
      textEnabled: true,
      textContent: 'TEXT',
      textY: 84,
    },
  },
  {
    name: 'Soft shadow',
    options: {
      normalizeSquare: true,
      autoFitSubject: true,
      subjectPadding: 14,
      shadow: true,
    },
  },
  {
    name: 'Bold outline',
    options: {
      removeLightBackground: true,
      backgroundThreshold: 236,
      backgroundFeather: 10,
      outline: true,
      autoFitSubject: true,
      normalizeSquare: true,
    },
  },
];

export function ImageEditControls({
  backgroundRemovalStatus,
  file,
  options,
  onChange,
  compact = false,
  modal = false,
}: {
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
  file: File;
  options: ImageEditOptions;
  onChange: Dispatch<SetStateAction<ImageEditOptions>>;
  compact?: boolean;
  modal?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewBoundsRef = useRef({ x: 0, y: 0, width: 1, height: 1 });
  const activeStrokeIdRef = useRef<string | null>(null);
  const [redoStrokes, setRedoStrokes] = useState<BrushStroke[]>([]);
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [activePanel, setActivePanel] = useState<ImageEditPanel>('basics');
  const isPossiblyAnimated = /\.(gif|webp)$/i.test(file.name);
  const showBackgroundControls = options.removeLightBackground || options.serverBackgroundRemovalMode !== 'none';
  const showBasicsPanel = !modal || activePanel === 'basics';
  const showTextPanel = !modal || activePanel === 'text';
  const showBackgroundPanel = !modal || activePanel === 'background';
  const showOutputPanel = !modal || activePanel === 'output';
  const animatedDuration = Math.max(0, options.animatedTrimEnd - options.animatedTrimStart);
  const animatedFrameDuration = 1000 / Math.max(1, options.animatedFrameRate);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSourcePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    let alive = true;
    setOutputSize(null);
    setSourceImage(null);
    const canvas = canvasRef.current;
    if (canvas) {
      ensurePreviewCanvasSize(canvas);
      const context = canvas.getContext('2d');
      if (context) drawCheckerboard(context, canvas.width, canvas.height, 16);
    }
    loadImage(file)
      .then((image) => {
        if (alive) setSourceImage(image);
      })
      .catch(() => {
        if (alive) setSourceImage(null);
      });

    return () => {
      alive = false;
    };
  }, [file]);

  useEffect(() => {
    let alive = true;
    let animationFrame = 0;
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) return undefined;
    ensurePreviewCanvasSize(canvas);

    const previewCanvas = renderImageEditCanvas(sourceImage, options);
    if (!previewCanvas) return undefined;

    animationFrame = window.requestAnimationFrame(() => {
      if (!alive) return;
      const nextBounds = drawEditedPreview(canvas, previewCanvas);
      if (nextBounds) previewBoundsRef.current = nextBounds;
    });

    imageEditOutputSize(file, previewCanvas, options)
      .then((size) => {
        if (alive) setOutputSize(size);
      })
      .catch(() => {
        if (alive) setOutputSize(file.size);
      });

    return () => {
      alive = false;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [file, options, sourceImage]);

  useEffect(() => {
    setRedoStrokes([]);
  }, [file]);

  function rotate(delta: 90 | -90) {
    const nextRotation = ((options.rotation + delta + 360) % 360) as ImageEditOptions['rotation'];
    onChange({ ...options, rotation: nextRotation });
  }

  function setBrushMode(mode: BrushMode) {
    onChange((current) => ({ ...current, brushMode: mode }));
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): BrushPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) / rect.width;
    const canvasY = (event.clientY - rect.top) / rect.height;
    const bounds = previewBoundsRef.current;
    const x = (canvasX - bounds.x) / bounds.width;
    const y = (canvasY - bounds.y) / bounds.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function startBrushStroke(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event);
    if (!point) return;
    const stroke: BrushStroke = {
      id: crypto.randomUUID(),
      mode: options.brushMode,
      size: options.brushSize,
      points: [point],
    };
    activeStrokeIdRef.current = stroke.id;
    event.currentTarget.setPointerCapture(event.pointerId);
    setRedoStrokes([]);
    onChange((current) => ({ ...current, brushStrokes: [...current.brushStrokes, stroke] }));
  }

  function continueBrushStroke(event: PointerEvent<HTMLCanvasElement>) {
    const activeStrokeId = activeStrokeIdRef.current;
    if (!activeStrokeId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    onChange((current) => ({
      ...current,
      brushStrokes: current.brushStrokes.map((stroke) => {
        if (stroke.id !== activeStrokeId) return stroke;
        const previous = stroke.points.at(-1);
        if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.004) return stroke;
        return { ...stroke, points: [...stroke.points, point] };
      }),
    }));
  }

  function finishBrushStroke() {
    activeStrokeIdRef.current = null;
  }

  function undoBrushStroke() {
    const previousStroke = options.brushStrokes.at(-1);
    if (!previousStroke) return;
    setRedoStrokes((strokes) => [...strokes, previousStroke]);
    onChange((current) => ({ ...current, brushStrokes: current.brushStrokes.slice(0, -1) }));
  }

  function redoBrushStroke() {
    const stroke = redoStrokes.at(-1);
    if (!stroke) return;
    setRedoStrokes((strokes) => strokes.slice(0, -1));
    onChange((current) => ({ ...current, brushStrokes: [...current.brushStrokes, stroke] }));
  }

  function applyPreset(preset: Partial<ImageEditOptions>) {
    setRedoStrokes([]);
    onChange((current) => ({
      ...current,
      ...preset,
      brushStrokes: [],
      brushMode: current.brushMode,
      brushSize: current.brushSize,
    }));
  }

  return (
    <div
      className={`image-edit-controls ${compact ? 'compact' : ''} ${modal ? 'modal-editor' : ''} ${compareMode ? 'compare-mode' : ''}`}
    >
      <div className={`image-edit-preview ${compareMode ? 'compare' : ''}`}>
        {compareMode && sourcePreviewUrl ? (
          <div className="compare-pane">
            <span>Before</span>
            <img alt="Original preview" src={sourcePreviewUrl} />
          </div>
        ) : null}
        <div className="compare-pane">
          {compareMode ? <span>After</span> : null}
          <canvas
            aria-label="Edited preview canvas"
            onPointerCancel={finishBrushStroke}
            onPointerDown={startBrushStroke}
            onPointerLeave={finishBrushStroke}
            onPointerMove={continueBrushStroke}
            onPointerUp={finishBrushStroke}
            ref={canvasRef}
          />
        </div>
      </div>
      {modal ? (
        <div className="editor-panel-tabs" role="tablist" aria-label="Editor panels">
          {[
            ['basics', 'Basics'],
            ['text', 'Text'],
            ['background', 'Background'],
            ['output', 'Output'],
          ].map(([panel, label]) => (
            <button
              aria-selected={activePanel === panel}
              className={activePanel === panel ? 'active' : ''}
              key={panel}
              onClick={() => setActivePanel(panel as ImageEditPanel)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {showBasicsPanel ? (
        <div className="image-edit-actions">
          <EditorIconButton label="Rotate left" onClick={() => rotate(-90)}>
            <RotateCcw size={16} />
          </EditorIconButton>
          <EditorIconButton label="Rotate right" onClick={() => rotate(90)}>
            <RotateCw size={16} />
          </EditorIconButton>
          <EditorIconButton label="Undo brush" disabled={options.brushStrokes.length === 0} onClick={undoBrushStroke}>
            <Undo2 size={16} />
          </EditorIconButton>
          <EditorIconButton label="Redo brush" disabled={redoStrokes.length === 0} onClick={redoBrushStroke}>
            <Redo2 size={16} />
          </EditorIconButton>
          <EditorIconButton label="Erase brush" onClick={() => setBrushMode('erase')}>
            <Eraser size={16} />
          </EditorIconButton>
          <EditorIconButton label="Restore brush" onClick={() => setBrushMode('restore')}>
            <RefreshCw size={16} />
          </EditorIconButton>
          <EditorIconButton label="Compare before after" onClick={() => setCompareMode((enabled) => !enabled)}>
            <Eye size={16} />
          </EditorIconButton>
          <EditorIconButton
            label="Center subject"
            onClick={() => onChange((current) => ({ ...current, autoFitSubject: true, normalizeSquare: true }))}
          >
            <MoveRight size={16} />
          </EditorIconButton>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.cropSquare}
              onChange={(event) =>
                onChange({
                  ...options,
                  cropSquare: event.target.checked,
                  zoom: event.target.checked ? options.zoom : 1,
                  offsetX: event.target.checked ? options.offsetX : 0,
                  offsetY: event.target.checked ? options.offsetY : 0,
                })
              }
              type="checkbox"
            />
            Square crop
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.normalizeSquare}
              onChange={(event) => onChange({ ...options, normalizeSquare: event.target.checked })}
              type="checkbox"
            />
            Normalize square
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.removeLightBackground}
              onChange={(event) => onChange({ ...options, removeLightBackground: event.target.checked })}
              type="checkbox"
            />
            Remove light background
          </label>
          <label>
            Background removal
            <select
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  serverBackgroundRemovalMode: event.target.value as ImageEditOptions['serverBackgroundRemovalMode'],
                }))
              }
              value={options.serverBackgroundRemovalMode}
            >
              <option value="none">Off</option>
              <option value="threshold">Server threshold</option>
              <option value="ai">AI fallback</option>
            </select>
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.outline}
              onChange={(event) => onChange({ ...options, outline: event.target.checked })}
              type="checkbox"
            />
            Outline
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.shadow}
              onChange={(event) => onChange({ ...options, shadow: event.target.checked })}
              type="checkbox"
            />
            Shadow
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.textEnabled}
              onChange={(event) => onChange((current) => ({ ...current, textEnabled: event.target.checked }))}
              type="checkbox"
            />
            Enable text
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.autoFitSubject}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  autoFitSubject: event.target.checked,
                  normalizeSquare: event.target.checked || current.normalizeSquare,
                }))
              }
              type="checkbox"
            />
            Auto-fit
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.grayscale}
              onChange={(event) => onChange((current) => ({ ...current, grayscale: event.target.checked }))}
              type="checkbox"
            />
            Grayscale
          </label>
        </div>
      ) : null}
      {showBasicsPanel ? (
        <div className="preset-row" aria-label="Image edit presets">
          {imageEditPresets.map((preset) => (
            <button
              className="secondary-button"
              key={preset.name}
              onClick={() => applyPreset(preset.options)}
              type="button"
            >
              {preset.name}
            </button>
          ))}
        </div>
      ) : null}
      {showBasicsPanel ? (
        <div className="layer-strip" aria-label="Canvas layers">
          <span>Transparent bg</span>
          <span>Sticker</span>
          <span className={options.outline || options.shadow ? 'active' : ''}>Effects</span>
          <span className={options.textEnabled ? 'active' : ''}>Text</span>
        </div>
      ) : null}
      {showBasicsPanel ? (
        <div className="image-edit-sliders brush-sliders">
          <label>
            Brush size
            <input
              max="120"
              min="4"
              onChange={(event) => onChange((current) => ({ ...current, brushSize: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.brushSize}
            />
          </label>
          <span className="brush-status">{options.brushMode === 'erase' ? 'Erasing pixels' : 'Restoring pixels'}</span>
        </div>
      ) : null}
      {showTextPanel && (modal || options.textEnabled) ? (
        <div className="image-edit-sliders text-sliders">
          {modal ? (
            <label className="checkbox-row image-edit-toggle">
              <input
                checked={options.textEnabled}
                onChange={(event) => onChange((current) => ({ ...current, textEnabled: event.target.checked }))}
                type="checkbox"
              />
              Enable text
            </label>
          ) : null}
          {options.textEnabled ? (
            <>
              <label>
                Text content
                <input
                  maxLength={40}
                  onChange={(event) => onChange((current) => ({ ...current, textContent: event.target.value }))}
                  placeholder="meme text"
                  value={options.textContent}
                />
              </label>
              <label>
                Size
                <input
                  max="140"
                  min="18"
                  onChange={(event) => onChange((current) => ({ ...current, textSize: Number(event.target.value) }))}
                  step="1"
                  type="range"
                  value={options.textSize}
                />
              </label>
              <label>
                Fill
                <input
                  onChange={(event) => onChange((current) => ({ ...current, textColor: event.target.value }))}
                  type="color"
                  value={options.textColor}
                />
              </label>
              <label>
                Stroke
                <input
                  onChange={(event) => onChange((current) => ({ ...current, textStrokeColor: event.target.value }))}
                  type="color"
                  value={options.textStrokeColor}
                />
              </label>
              <label>
                Stroke width
                <input
                  max="20"
                  min="0"
                  onChange={(event) =>
                    onChange((current) => ({ ...current, textStrokeWidth: Number(event.target.value) }))
                  }
                  step="1"
                  type="range"
                  value={options.textStrokeWidth}
                />
              </label>
              <label>
                Rotate
                <input
                  max="45"
                  min="-45"
                  onChange={(event) => onChange((current) => ({ ...current, textRotation: Number(event.target.value) }))}
                  step="1"
                  type="range"
                  value={options.textRotation}
                />
              </label>
              <label>
                X
                <input
                  max="100"
                  min="0"
                  onChange={(event) => onChange((current) => ({ ...current, textX: Number(event.target.value) }))}
                  step="1"
                  type="range"
                  value={options.textX}
                />
              </label>
              <label>
                Y
                <input
                  max="100"
                  min="0"
                  onChange={(event) => onChange((current) => ({ ...current, textY: Number(event.target.value) }))}
                  step="1"
                  type="range"
                  value={options.textY}
                />
              </label>
            </>
          ) : (
            <span className="muted-row">Turn on text to add a caption layer.</span>
          )}
        </div>
      ) : null}
      {showBasicsPanel ? (
        <div className="image-edit-sliders color-sliders">
          <label>
            Brightness
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange((current) => ({ ...current, brightness: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.brightness}
            />
          </label>
          <label>
            Contrast
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange((current) => ({ ...current, contrast: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.contrast}
            />
          </label>
          <label>
            Saturation
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange((current) => ({ ...current, saturation: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.saturation}
            />
          </label>
          <label>
            Sharpen
            <input
              max="100"
              min="0"
              onChange={(event) => onChange((current) => ({ ...current, sharpen: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.sharpen}
            />
          </label>
          <label>
            Warmth
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange((current) => ({ ...current, warmth: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.warmth}
            />
          </label>
          <label>
            Tint
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange((current) => ({ ...current, tint: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.tint}
            />
          </label>
        </div>
      ) : null}
      {showOutputPanel ? (
        <div className="optimizer-panel">
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.optimizeOutput}
              onChange={(event) => onChange((current) => ({ ...current, optimizeOutput: event.target.checked }))}
              type="checkbox"
            />
            Optimize under 100KB
          </label>
          <label>
            Quality
            <input
              disabled={!options.optimizeOutput}
              max="95"
              min="35"
              onChange={(event) => onChange((current) => ({ ...current, outputQuality: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.outputQuality}
            />
          </label>
          <span className={outputSize && outputSize > 100 * 1024 ? 'optimizer-warning' : 'optimizer-ok'}>
            {outputSize ? `Output ${formatBytes(outputSize)}` : 'Output pending'}
          </span>
          {outputSize && !isPossiblyAnimated && outputSize > 100 * 1024 ? (
            <span className="optimizer-warning">Static WhatsApp stickers should be under 100KB.</span>
          ) : null}
          {isPossiblyAnimated && file.size > 500 * 1024 ? (
            <span className="optimizer-warning">Animated WhatsApp stickers should be under 500KB.</span>
          ) : null}
        </div>
      ) : null}
      {showOutputPanel && isPossiblyAnimated ? (
        <div className="animated-panel">
          {sourcePreviewUrl ? <img alt="Animated source preview" src={sourcePreviewUrl} /> : null}
          <label>
            Trim start
            <input
              max="10"
              min="0"
              onChange={(event) =>
                onChange((current) => ({ ...current, animatedTrimStart: Number(event.target.value) }))
              }
              step="0.1"
              type="range"
              value={options.animatedTrimStart}
            />
          </label>
          <label>
            Trim end
            <input
              max="10"
              min="0.1"
              onChange={(event) => onChange((current) => ({ ...current, animatedTrimEnd: Number(event.target.value) }))}
              step="0.1"
              type="range"
              value={options.animatedTrimEnd}
            />
          </label>
          <label>
            Frame rate
            <input
              max="30"
              min="1"
              onChange={(event) =>
                onChange((current) => ({ ...current, animatedFrameRate: Number(event.target.value) }))
              }
              step="1"
              type="range"
              value={options.animatedFrameRate}
            />
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.animatedCompress}
              onChange={(event) => onChange((current) => ({ ...current, animatedCompress: event.target.checked }))}
              type="checkbox"
            />
            Server compress
          </label>
          <span className={animatedDuration > 10 || animatedDuration <= 0 ? 'optimizer-warning' : 'optimizer-ok'}>
            Duration {animatedDuration.toFixed(1)}s / 10s max
          </span>
          <span className={animatedFrameDuration < 8 ? 'optimizer-warning' : 'optimizer-ok'}>
            Frame {Math.round(animatedFrameDuration)}ms
          </span>
        </div>
      ) : null}
      {showBasicsPanel && options.autoFitSubject ? (
        <div className="image-edit-sliders subject-sliders">
          <label>
            Subject padding
            <input
              max="35"
              min="0"
              onChange={(event) => onChange((current) => ({ ...current, subjectPadding: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.subjectPadding}
            />
          </label>
        </div>
      ) : null}
      {showBackgroundPanel ? (
        <div className="image-edit-sliders background-mode-panel">
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.removeLightBackground}
              onChange={(event) => onChange({ ...options, removeLightBackground: event.target.checked })}
              type="checkbox"
            />
            Remove light background
          </label>
          <label>
            Background removal
            <select
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  serverBackgroundRemovalMode: event.target.value as ImageEditOptions['serverBackgroundRemovalMode'],
                }))
              }
              value={options.serverBackgroundRemovalMode}
            >
              <option value="none">Off</option>
              <option value="threshold">Server threshold</option>
              <option value="ai">AI fallback</option>
            </select>
          </label>
        </div>
      ) : null}
      {showBackgroundPanel && options.serverBackgroundRemovalMode !== 'none' ? (
        <p className="upload-note server-bg-note">
          {serverBackgroundRemovalMessage(options.serverBackgroundRemovalMode, backgroundRemovalStatus)}
        </p>
      ) : null}
      {showBackgroundPanel && showBackgroundControls ? (
        <div className="image-edit-sliders background-sliders">
          <label>
            Threshold
            <input
              max="255"
              min="180"
              onChange={(event) => onChange({ ...options, backgroundThreshold: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.backgroundThreshold}
            />
          </label>
          <label>
            Soft edge
            <input
              max="48"
              min="0"
              onChange={(event) => onChange({ ...options, backgroundFeather: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.backgroundFeather}
            />
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.cleanupSpeckles}
              onChange={(event) => onChange({ ...options, cleanupSpeckles: event.target.checked })}
              type="checkbox"
            />
            Cleanup speckles
          </label>
          {options.cleanupSpeckles ? (
            <label>
              Speckle size
              <input
                max="180"
                min="4"
                onChange={(event) => onChange({ ...options, speckleSize: Number(event.target.value) })}
                step="1"
                type="range"
                value={options.speckleSize}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      {showBasicsPanel && options.cropSquare ? (
        <div className="image-edit-sliders">
          <label>
            Zoom
            <input
              max="3"
              min="1"
              onChange={(event) => onChange({ ...options, zoom: Number(event.target.value) })}
              step="0.05"
              type="range"
              value={options.zoom}
            />
          </label>
          <label>
            Horizontal
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange({ ...options, offsetX: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.offsetX}
            />
          </label>
          <label>
            Vertical
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange({ ...options, offsetY: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.offsetY}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function EditorIconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
