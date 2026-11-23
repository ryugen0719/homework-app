import type { Recipe } from './react-bits-sound';

// 高解像度タブ切替: 軽快なバンドパスクリック + 澄んだB5倍音レゾナンス + 極小エア
const tab: Recipe = {
  duration: 0.068,
  seed: 203,
  loudness: -22.5,
  lowpass: 7600,
  highpass: 360,
  reverb: { mix: 0.05, decay: 0.14, predelay: 0.005, damp: 5200, lowcut: 360 },
  layers: [
    {
      type: 'noise',
      color: 'pink',
      at: 0,
      gain: -1,
      punch: true,
      filter: { type: 'bandpass', freq: { from: 1500, to: 2300, time: 0.018, curve: 2 }, q: 1.3 },
      env: { attack: 0.0012, rise: 1.4, decay: 0.016, curve: 5.5 },
    },
    {
      type: 'tone',
      freq: 987.77,
      at: 0,
      gain: -9.5,
      partials: [
        [1, 1, 1],
        [2, 0.09, 0.35],
      ],
      env: { attack: 0.0015, decay: 0.04, curve: 6 },
    },
  ],
};

export default tab;
