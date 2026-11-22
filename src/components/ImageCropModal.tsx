'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { Check, LoaderCircle, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';

export type CropMode = 'avatar' | 'evidence';

interface ImageCropModalProps {
  file: File;
  mode: CropMode;
  onCancel: () => void;
  onConfirm: (processedFile: File) => void;
}

const EVIDENCE_ASPECTS = [
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
] as const;

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (err) => reject(err));
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = url;
  });
}

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * トリミング・回転・リサイズを行って最適化済み File を生成
 * - avatar: 256x256 px にリサイズ（軽量・高精細）
 * - evidence: 長辺最大 1600 px にリサイズ
 */
async function buildCroppedFile(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  mode: CropMode,
  originalName: string
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  // 1. 回転済み画像を一時キャンバスに描画
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  // 2. トリミング＋リサイズ先の出力サイズ決定
  let outW = Math.max(1, Math.round(pixelCrop.width));
  let outH = Math.max(1, Math.round(pixelCrop.height));

  if (mode === 'avatar') {
    outW = 256;
    outH = 256;
  } else {
    const MAX_DIM = 1600;
    if (outW > MAX_DIM || outH > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / outW, MAX_DIM / outH);
      outW = Math.max(1, Math.round(outW * ratio));
      outH = Math.max(1, Math.round(outH * ratio));
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Canvas not supported');

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH
  );

  const quality = mode === 'avatar' ? 0.86 : 0.85;
  const blob: Blob = await new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
          return;
        }
        // WebP非対応時のフォールバック
        outCanvas.toBlob(
          (jb) => (jb ? resolve(jb) : reject(new Error('Failed to encode image'))),
          'image/jpeg',
          quality
        );
      },
      'image/webp',
      quality
    );
  });

  const mime = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}.${ext}`, { type: mime });
}

export default function ImageCropModal({
  file,
  mode,
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number>(mode === 'avatar' ? 1 : 4 / 3);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const raf = requestAnimationFrame(() => setImageUrl(url));
    return () => {
      cancelAnimationFrame(raf);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageUrl || !croppedAreaPixels) return;
    setProcessing(true);
    try {
      const processed = await buildCroppedFile(
        imageUrl,
        croppedAreaPixels,
        rotation,
        mode,
        file.name
      );
      onConfirm(processed);
    } catch {
      onConfirm(file);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="画像のトリミング"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-line bg-card shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-3.5 border-b border-line/70 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-ink m-0">
              {mode === 'avatar' ? 'アイコンのトリミング' : '写真のトリミング'}
            </h3>
            <p className="text-[11px] text-muted m-0">
              {mode === 'avatar'
                ? 'ドラッグとズームで位置を調整（256×256pxに自動リサイズ）'
                : '見やすい範囲に切り抜き・回転できます'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="p-1.5 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        {/* クロップ領域 */}
        <div className="relative w-full h-72 sm:h-80 bg-[#0d0f12]">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={mode === 'avatar' ? 'round' : 'rect'}
              showGrid={mode === 'evidence'}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          )}
        </div>

        {/* コントロール（ズーム・回転・比率切替） */}
        <div className="p-4 sm:p-5 space-y-3.5 bg-card">
          <div className="flex items-center gap-3">
            <ZoomOut size={15} className="text-muted shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="ズーム"
              className="flex-1 accent-primary cursor-pointer"
            />
            <ZoomIn size={15} className="text-muted shrink-0" />
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-line bg-card-subtle hover:bg-card text-xs font-semibold text-ink transition-colors cursor-pointer shrink-0"
              title="90度回転"
            >
              <RotateCw size={13} />
              <span>回転</span>
            </button>
          </div>

          {mode === 'evidence' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted">比率</span>
              <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-card-subtle border border-line">
                {EVIDENCE_ASPECTS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setAspect(opt.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-numbers transition-all cursor-pointer ${
                      Math.abs(aspect - opt.value) < 0.01
                        ? 'bg-card text-ink shadow-subtle'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-line/60">
            {mode === 'evidence' && (
              <button
                type="button"
                onClick={() => onConfirm(file)}
                disabled={processing}
                className="mr-auto text-xs font-semibold text-muted hover:text-ink px-2 py-1.5 cursor-pointer"
              >
                そのまま使う
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-line text-muted hover:text-ink cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={processing || !croppedAreaPixels}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary-hover active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
            >
              {processing ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              <span>{processing ? '処理中…' : 'この範囲で保存'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
