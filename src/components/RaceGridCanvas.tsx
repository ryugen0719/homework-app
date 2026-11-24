'use client';

import { useEffect, useRef } from 'react';
import type { TrackZoomMode } from './raceTrackMath';

interface RaceGridCanvasProps {
  /** 勉強中のみ 30fps で時間同期スクロール。false時は rAF 完全停止（CPU 0%） */
  isRunning: boolean;
  /** 現在の勉強経過秒数（時間目盛りを実時間と完全同期させる基準） */
  elapsedSec: number;
  zoomMode: TrackZoomMode;
  theme: 'light' | 'dark';
}

const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

/**
 * ズーム倍率ごとの厳密な時間-空間マッピング（物理速度計算）:
 * - '10m'（超拡大）: 1細マス(48px) = 5秒  → 9.6 px/s （1分 = 576px = 12マス）
 * - '30m'（拡大）  : 1細マス(48px) = 10秒 → 4.8 px/s （1分 = 288px = 6マス）
 * - 'full'（全体） : 1細マス(48px) = 15秒 → 3.2 px/s （1分 = 192px = 4マス）
 *
 * どのモードでも「1細マス = 48px」を一定に保ちながら、時間分解能を変えることで
 * 現実の勉強時間（秒・分）と背景の移動速度・時間目盛りが数学的に完全一致する。
 */
export function getGridTimeMetrics(zoomMode: TrackZoomMode) {
  const minorPx = 48;
  if (zoomMode === '10m') {
    const secPerMinor = 5;
    return {
      minorPx,
      secPerMinor,
      pxPerSec: minorPx / secPerMinor, // 9.6 px/s
      minorsPerMajor: 4, // 20秒ごとに主線（192px）
      labelIntervalSec: 30, // 30秒ごとに時間目盛り表示
    };
  }
  if (zoomMode === '30m') {
    const secPerMinor = 10;
    return {
      minorPx,
      secPerMinor,
      pxPerSec: minorPx / secPerMinor, // 4.8 px/s
      minorsPerMajor: 6, // 60秒(1分)ごとに主線（288px）
      labelIntervalSec: 60, // 1分ごとに時間目盛り表示
    };
  }
  const secPerMinor = 15;
  return {
    minorPx,
    secPerMinor,
    pxPerSec: minorPx / secPerMinor, // 3.2 px/s
    minorsPerMajor: 4, // 60秒(1分)ごとに主線（192px）
    labelIntervalSec: 60, // 1分ごとに時間目盛り表示
  };
}

/** 決定的ハッシュ（0..1）：同じ時間スロットに常に同じ四角オブジェクトを配置 */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function formatAxisTime(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 建築図面・精密計器クオリティの背景グリッド Canvas。
 * - 現実の勉強秒数に厳密同期した 2 層方眼グリッド＋交点クロスヘア
 * - 下端を流れる実時間メモリ（01:00, 02:00, 05:00... 5分マイルストーン強調）
 * - グリッドのマス目にピタッと収まる四角い建築オブジェクト（塗り・L字枠・斜線ハッチ・遠景パララックス）
 */
export default function RaceGridCanvas({
  isRunning,
  elapsedSec,
  zoomMode,
  theme,
}: RaceGridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // React の 1 秒ごとの elapsedSec と、rAF 間のサブ秒補間を滑らかに統合
  const smoothSecRef = useRef<number>(elapsedSec);
  const anchorElapsedRef = useRef<number>(elapsedSec);
  const anchorTimeMsRef = useRef<number>(0);

  useEffect(() => {
    anchorElapsedRef.current = elapsedSec;
    anchorTimeMsRef.current = performance.now();
    // 大きなジャンプ（再開・リセット等）や停止時は即座に同期
    if (!isRunning || Math.abs(smoothSecRef.current - elapsedSec) > 1.8) {
      smoothSecRef.current = elapsedSec;
    }
  }, [elapsedSec, isRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const metrics = getGridTimeMetrics(zoomMode);
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawFrame = (currentSec: number) => {
      ctx.clearRect(0, 0, width, height);

      const isDark = theme === 'dark';
      const { minorPx, secPerMinor, pxPerSec, minorsPerMajor, labelIntervalSec } = metrics;

      // 画面左から約 34% の位置を「現在時刻の基準ライン」として時間軸を展開
      const nowAnchorX = width * 0.34;
      const worldOffsetPx = currentSec * pxPerSec;

      // カラーパレット（Geneva Cobalt 建築図面トーン）
      const minorStroke = isDark ? 'rgba(148, 163, 184, 0.055)' : 'rgba(15, 23, 42, 0.045)';
      const majorStroke = isDark ? 'rgba(96, 165, 250, 0.13)' : 'rgba(0, 87, 255, 0.095)';
      const crossStroke = isDark ? 'rgba(147, 197, 253, 0.24)' : 'rgba(0, 87, 255, 0.20)';
      const milestoneStroke = isDark ? 'rgba(251, 191, 36, 0.22)' : 'rgba(217, 119, 6, 0.20)';

      // 1. 遠景パララックス（0.42x 速度でゆっくり流れる極薄の大矩形ブロック）
      const parallaxCell = minorPx * 4; // 192px
      const parallaxOffset = worldOffsetPx * 0.42;
      const firstParaCol = Math.floor((parallaxOffset - nowAnchorX) / parallaxCell) - 1;
      const lastParaCol = Math.ceil((parallaxOffset + width - nowAnchorX) / parallaxCell) + 1;
      const paraRows = Math.ceil(height / parallaxCell) + 1;

      for (let col = firstParaCol; col <= lastParaCol; col++) {
        // 約 3 列に 1 つだけ静かに出現
        if (hash01(col * 17.3 + 9) > 0.36) continue;
        const row = Math.floor(hash01(col * 31.7 + 3) * Math.max(1, paraRows));
        const bx = nowAnchorX + col * parallaxCell - parallaxOffset;
        const by = row * parallaxCell;
        const bw = parallaxCell * (hash01(col * 7.1) > 0.5 ? 2 : 1);
        const bh = parallaxCell;

        ctx.fillStyle = isDark ? 'rgba(59, 130, 246, 0.028)' : 'rgba(0, 87, 255, 0.022)';
        ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
      }

      // 2. 水平グリッド線（固定 Y 座標）
      const rowCount = Math.ceil(height / minorPx) + 1;
      for (let r = 0; r <= rowCount; r++) {
        const y = r * minorPx + 0.5;
        const isMajorRow = r % 4 === 0;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.strokeStyle = isMajorRow ? majorStroke : minorStroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 3. 垂直グリッド線（時間軸に完全同期して右→左へ流れる）
      const firstCol = Math.floor((worldOffsetPx - nowAnchorX) / minorPx) - 1;
      const lastCol = Math.ceil((worldOffsetPx + width - nowAnchorX) / minorPx) + 1;

      for (let col = firstCol; col <= lastCol; col++) {
        const x = Math.round(nowAnchorX + col * minorPx - worldOffsetPx) + 0.5;
        if (x < -minorPx || x > width + minorPx) continue;

        const colSec = col * secPerMinor;
        const isMajor = ((col % minorsPerMajor) + minorsPerMajor) % minorsPerMajor === 0;
        const isFiveMinMilestone = colSec > 0 && colSec % 300 === 0;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.strokeStyle = isFiveMinMilestone
          ? milestoneStroke
          : isMajor
            ? majorStroke
            : minorStroke;
        ctx.lineWidth = isFiveMinMilestone ? 1.2 : 1;
        ctx.stroke();

        // 主線の交点に精密製図クロスヘア（+）
        if (isMajor) {
          ctx.strokeStyle = isFiveMinMilestone ? milestoneStroke : crossStroke;
          ctx.lineWidth = 1;
          for (let r = 0; r <= rowCount; r += 4) {
            const y = r * minorPx + 0.5;
            ctx.beginPath();
            ctx.moveTo(x - 3.5, y);
            ctx.lineTo(x + 3.5, y);
            ctx.moveTo(x, y - 3.5);
            ctx.lineTo(x, y + 3.5);
            ctx.stroke();
          }
        }
      }

      // 4. グリッドにスナップして時々流れてくる「四角い建築オブジェクト」
      //    （約 4〜6 マスに 1 個の控えめな密度で、塗り・L字フレーム・斜線ハッチを織り交ぜる）
      const visibleRows = Math.max(2, Math.floor(height / minorPx));
      for (let col = firstCol; col <= lastCol; col++) {
        const seed = hash01(col * 43.17 + 11.3);
        if (seed > 0.22) continue; // 22% の列にのみ出現（上品な疎密度）

        const styleRoll = hash01(col * 91.7 + 5.1);
        const row = Math.floor(hash01(col * 23.9 + 2.7) * (visibleRows - 1));
        const spanCols = hash01(col * 13.3) > 0.62 ? 2 : 1;
        const spanRows = hash01(col * 19.7) > 0.72 ? 2 : 1;

        const ox = nowAnchorX + col * minorPx - worldOffsetPx;
        const oy = row * minorPx;
        const ow = spanCols * minorPx;
        const oh = spanRows * minorPx;
        const isAccentGreen = hash01(col * 61.3) > 0.72;

        if (styleRoll < 0.42) {
          // タイプA：淡い塗りつぶしスクエア＋極細枠
          ctx.fillStyle = isAccentGreen
            ? isDark
              ? 'rgba(52, 211, 153, 0.065)'
              : 'rgba(0, 168, 107, 0.055)'
            : isDark
              ? 'rgba(59, 130, 246, 0.075)'
              : 'rgba(0, 87, 255, 0.055)';
          ctx.fillRect(ox + 2, oy + 2, ow - 4, oh - 4);

          ctx.strokeStyle = isAccentGreen
            ? isDark
              ? 'rgba(52, 211, 153, 0.22)'
              : 'rgba(0, 168, 107, 0.18)'
            : isDark
              ? 'rgba(96, 165, 250, 0.22)'
              : 'rgba(0, 87, 255, 0.16)';
          ctx.lineWidth = 1;
          ctx.strokeRect(ox + 2.5, oy + 2.5, ow - 5, oh - 5);
        } else if (styleRoll < 0.76) {
          // タイプB：精密L字コーナーブラケット付き中抜きフレーム
          const frameColor = isDark ? 'rgba(147, 197, 253, 0.24)' : 'rgba(0, 87, 255, 0.18)';
          ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.11)' : 'rgba(15, 23, 42, 0.08)';
          ctx.lineWidth = 1;
          ctx.strokeRect(ox + 3.5, oy + 3.5, ow - 7, oh - 7);

          const corner = 7;
          ctx.strokeStyle = frameColor;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          // 左上
          ctx.moveTo(ox + 3, oy + 3 + corner);
          ctx.lineTo(ox + 3, oy + 3);
          ctx.lineTo(ox + 3 + corner, oy + 3);
          // 右下
          ctx.moveTo(ox + ow - 3 - corner, oy + oh - 3);
          ctx.lineTo(ox + ow - 3, oy + oh - 3);
          ctx.lineTo(ox + ow - 3, oy + oh - 3 - corner);
          ctx.stroke();
        } else {
          // タイプC：建築図面の斜線ハッチングブロック
          ctx.save();
          ctx.beginPath();
          ctx.rect(ox + 3, oy + 3, ow - 6, oh - 6);
          ctx.clip();
          ctx.strokeStyle = isDark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(0, 87, 255, 0.10)';
          ctx.lineWidth = 1;
          const diag = ow + oh;
          for (let d = -oh; d < diag; d += 8) {
            ctx.beginPath();
            ctx.moveTo(ox + d, oy);
            ctx.lineTo(ox + d + oh, oy + oh);
            ctx.stroke();
          }
          ctx.restore();
          ctx.strokeStyle = isDark ? 'rgba(96, 165, 250, 0.20)' : 'rgba(0, 87, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.strokeRect(ox + 3.5, oy + 3.5, ow - 7, oh - 7);
        }
      }

      // 5. 画面下端を流れる「勉強時間の精密タイムライン・ルーラー（時間目盛り）」
      const rulerY = height - 18;
      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      // 下端ベースライン
      ctx.beginPath();
      ctx.moveTo(0, rulerY - 10.5);
      ctx.lineTo(width, rulerY - 10.5);
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let col = firstCol; col <= lastCol; col++) {
        const colSec = col * secPerMinor;
        if (colSec < 0) continue;
        const x = Math.round(nowAnchorX + col * minorPx - worldOffsetPx) + 0.5;
        if (x < -40 || x > width + 40) continue;

        const isLabelTick = colSec % labelIntervalSec === 0;
        const isFiveMin = colSec > 0 && colSec % 300 === 0;

        // 細かい目盛りティック
        ctx.beginPath();
        ctx.moveTo(x, rulerY - 10);
        ctx.lineTo(x, rulerY - (isFiveMin ? 2 : isLabelTick ? 4 : 7));
        ctx.strokeStyle = isFiveMin
          ? isDark
            ? 'rgba(251, 191, 36, 0.7)'
            : 'rgba(217, 119, 6, 0.7)'
          : isLabelTick
            ? isDark
              ? 'rgba(147, 197, 253, 0.55)'
              : 'rgba(0, 87, 255, 0.5)'
            : isDark
              ? 'rgba(148, 163, 184, 0.25)'
              : 'rgba(15, 23, 42, 0.20)';
        ctx.lineWidth = isFiveMin ? 1.5 : 1;
        ctx.stroke();

        // 時間ラベル（00:00, 01:00, 05:00...）
        if (isLabelTick) {
          ctx.fillStyle = isFiveMin
            ? isDark
              ? 'rgba(252, 211, 77, 0.85)'
              : 'rgba(180, 83, 9, 0.85)'
            : isDark
              ? 'rgba(148, 163, 184, 0.55)'
              : 'rgba(71, 85, 105, 0.58)';
          ctx.fillText(formatAxisTime(colSec), x, rulerY + 5);
        }
      }

      // 現在時刻基準マーカー（下端ルーラー上の NOW ピン）
      ctx.fillStyle = isDark ? 'rgba(96, 165, 250, 0.85)' : 'rgba(0, 87, 255, 0.8)';
      ctx.beginPath();
      ctx.moveTo(nowAnchorX, rulerY - 10);
      ctx.lineTo(nowAnchorX - 4, rulerY - 16);
      ctx.lineTo(nowAnchorX + 4, rulerY - 16);
      ctx.closePath();
      ctx.fill();
    };

    resize();
    drawFrame(smoothSecRef.current);

    let rafId: number | null = null;
    let lastRenderTime = 0;

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const tick = (now: number) => {
      if (document.visibilityState !== 'visible') {
        stopLoop();
        return;
      }
      if (now - lastRenderTime >= FRAME_INTERVAL_MS) {
        lastRenderTime = now;
        const dtSinceAnchor = Math.max(0, (now - anchorTimeMsRef.current) / 1000);
        // 次の 1 秒ティックまでのサブ秒を滑らかに補間（最大 +1.15s でクランプ）
        smoothSecRef.current = anchorElapsedRef.current + Math.min(1.15, dtSinceAnchor);
        drawFrame(smoothSecRef.current);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoopIfNeeded = () => {
      if (isRunning && !reduceMotion && document.visibilityState === 'visible') {
        if (rafId === null) {
          lastRenderTime = 0;
          anchorTimeMsRef.current = performance.now();
          rafId = window.requestAnimationFrame(tick);
        }
      } else {
        stopLoop();
        drawFrame(anchorElapsedRef.current);
      }
    };

    startLoopIfNeeded();

    const onResize = () => {
      resize();
      drawFrame(smoothSecRef.current);
    };
    const onVisibility = () => {
      startLoopIfNeeded();
    };

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isRunning, zoomMode, theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
