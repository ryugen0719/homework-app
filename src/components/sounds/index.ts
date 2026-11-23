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
import streak from './streak';
import treasure from './treasure';
import heart from './heart';
import tab from './tab';
import breeze from './breeze';
import daylight from './daylight';
import nightfall from './nightfall';
import clasp from './clasp';
import unclasp from './unclasp';
import uplink from './uplink';
import erase from './erase';
import petal from './petal';

export {
  streak,
  treasure,
  heart,
  tab,
  breeze,
  daylight,
  nightfall,
  clasp,
  unclasp,
  uplink,
  erase,
  petal,
  playSound,
  preloadSound,
  setSoundMuted,
  setSoundVolume,
  useSound,
};

export type AppSoundName =
  | 'streak'
  | 'treasure'
  | 'heart'
  | 'tab'
  | 'breeze'
  | 'daylight'
  | 'nightfall'
  | 'clasp'
  | 'unclasp'
  | 'uplink'
  | 'erase'
  | 'petal';

const SOUND_RECIPES: Record<AppSoundName, Recipe> = {
  streak,
  treasure,
  heart,
  tab,
  breeze,
  daylight,
  nightfall,
  clasp,
  unclasp,
  uplink,
  erase,
  petal,
};

const SOUND_MUTED_KEY = 'homework_sound_muted';
const TEACHER_SOUND_MUTED_KEY = 'homework_sound_muted_teacher';

export type SoundRole = 'student' | 'teacher';
let activeSoundRole: SoundRole = 'student';

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
  setSoundVolume(0.35);
  (Object.values(SOUND_RECIPES) as Recipe[]).forEach((recipe) => {
    preloadSound(recipe);
  });
}

export function playAppSound(name: AppSoundName, tune?: Tune) {
  if (typeof window === 'undefined') return;
  syncAppSoundMuted();
  setSoundVolume(0.35);
  const recipe = SOUND_RECIPES[name];
  if (!recipe) return;
  void playSound(recipe, tune).catch(() => undefined);
}
