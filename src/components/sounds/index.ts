'use client';

import {
  playSound,
  preloadSound,
  setSoundMuted,
  setSoundVolume,
  useSound,
  type Recipe,
  type Tune,
} from './react-bits-sound';
import cardFlip from './cardFlip';
import clasp from './clasp';
import unclasp from './unclasp';
import daylight from './daylight';
import nightfall from './nightfall';
import erase from './erase';
import heart from './heart';
import petal from './petal';
import uplink from './uplink';
import streak from './streak';
import treasure from './treasure';

export {
  cardFlip,
  clasp,
  unclasp,
  daylight,
  nightfall,
  erase,
  heart,
  petal,
  uplink,
  streak,
  treasure,
  playSound,
  preloadSound,
  setSoundMuted,
  setSoundVolume,
  useSound,
};

/**
 * 宿題ノート 引き算サウンド設計（React Bits Sound Lab ベース）
 *
 * 普段のボタン操作・タブ切替・移動はあえて無音とし、
 * 意味のある区切り・達成・物理的インタラクションのみ控えめな高解像度音源を鳴らす。
 *
 * - cardFlip  : 実績カードのフリップ（@react-bits/SoundBreeze）
 * - clasp     : タイマー再開・効果音ONの確認
 * - unclasp   : タイマー一時停止
 * - daylight  : ライトモード切替
 * - nightfall : ダークモード切替
 * - erase     : 記録削除・計測キャンセル
 * - petal     : カラー選択などの繊細なアクセント
 * - heart     : ログイン・週間目標や設定の保存確認
 * - uplink    : ライブタイマー開始・写真アップロード
 * - streak    : 勉強記録の保存完了
 * - treasure  : 連続ボーナス獲得
 */
export type AppSoundName =
  | 'cardFlip'
  | 'clasp'
  | 'unclasp'
  | 'daylight'
  | 'nightfall'
  | 'erase'
  | 'petal'
  | 'heart'
  | 'uplink'
  | 'streak'
  | 'treasure';

const SOUND_RECIPES: Record<AppSoundName, Recipe> = {
  cardFlip,
  clasp,
  unclasp,
  daylight,
  nightfall,
  erase,
  petal,
  heart,
  uplink,
  streak,
  treasure,
};

// 静かな学習環境でも耳障りにならない控えめバランス（マスター 0.22 基準）
const DEFAULT_TUNES: Record<AppSoundName, Tune> = {
  cardFlip: { volume: -5.5, variation: 0.08 },
  clasp: { volume: -5.5, variation: 0.05 },
  unclasp: { volume: -6, variation: 0.05 },
  daylight: { volume: -5, variation: 0.04 },
  nightfall: { volume: -5, variation: 0.04 },
  erase: { volume: -4.5, variation: 0.06 },
  petal: { volume: -6, variation: 0.08 },
  heart: { volume: -3.5 },
  uplink: { volume: -3.5 },
  streak: { volume: -2.5 },
  treasure: { volume: -2 },
};

const DEFAULT_MASTER_VOLUME = 0.22;
const SOUND_MUTED_KEY = 'homework_sound_muted';
const TEACHER_SOUND_MUTED_KEY = 'homework_sound_muted_teacher';

export type SoundRole = 'student' | 'teacher';
let activeSoundRole: SoundRole = 'student';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function setAppSoundRole(role: SoundRole) {
  activeSoundRole = role;
  setSoundMuted(getSoundMuted(role));
}

export function getSoundMuted(role: SoundRole = activeSoundRole): boolean {
  if (typeof window === 'undefined') return role === 'teacher';
  try {
    if (role === 'teacher') {
      const saved = localStorage.getItem(TEACHER_SOUND_MUTED_KEY);
      // 先生はデフォルトで効果音オフ
      return saved === null ? true : saved === 'true';
    }
    return localStorage.getItem(SOUND_MUTED_KEY) === 'true';
  } catch {
    return role === 'teacher';
  }
}

export function setAppSoundMuted(muted: boolean, role: SoundRole = activeSoundRole) {
  activeSoundRole = role;
  setSoundMuted(muted);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        role === 'teacher' ? TEACHER_SOUND_MUTED_KEY : SOUND_MUTED_KEY,
        String(muted)
      );
    } catch {
      // ignore
    }
  }
}

export function syncAppSoundMuted(role: SoundRole = activeSoundRole) {
  setSoundMuted(getSoundMuted(role));
}

export function preloadAppSounds() {
  if (typeof window === 'undefined') return;
  syncAppSoundMuted();
  setSoundVolume(DEFAULT_MASTER_VOLUME);
  (Object.keys(SOUND_RECIPES) as AppSoundName[]).forEach((name) => {
    preloadSound(SOUND_RECIPES[name], DEFAULT_TUNES[name]);
  });
}

export function playAppSound(name: AppSoundName, tune?: Tune) {
  if (typeof window === 'undefined' || prefersReducedMotion()) return;
  syncAppSoundMuted();
  const recipe = SOUND_RECIPES[name];
  if (!recipe) return;
  const mergedTune: Tune = tune ? { ...DEFAULT_TUNES[name], ...tune } : DEFAULT_TUNES[name];
  void playSound(recipe, mergedTune).catch(() => undefined);
}
