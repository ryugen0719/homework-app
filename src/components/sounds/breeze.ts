import type { Recipe } from './react-bits-sound';

// 高解像度ブリーズ（移動・日付/週/月送り）: 左右にすっと流れるシルキーな空気スウィープ
const breeze: Recipe = {
  duration: 0.24,
  seed: 62,
  loudness: -23,
  lowpass: 6800,
  highpass: 190,
  width: 0.55,
  reverb: { mix: 0.09, decay: 0.26, predelay: 0.006, damp: 5200, lowcut: 300 },
  layers: [
    {
      type: 'noise',
      color: 'pink',
      at: 0,
      gain: -4,
      pan: { from: -0.24, to: 0.24, time: 0.18, curve: 2 },
      filter: { type: 'bandpass', freq: { from: 620, to: 1850, time: 0.17, curve: 2 }, q: 0.9 },
      env: { attack: 0.065, rise: 1.6, decay: 0.12, curve: 4.5 },
    },
    {
      type: 'tone',
      freq: { from: 440, to: 587.33, time: 0.14, curve: 2 },
      at: 0.01,
      gain: -15,
      partials: [
        [1, 1, 1],
        [2, 0.06, 0.4],
      ],
      env: { attack: 0.045, rise: 1.4, decay: 0.12, curve: 5 },
    },
  ],
};

export default breeze;
