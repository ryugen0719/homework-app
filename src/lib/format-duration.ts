/**
 * 分数を「○時間○分」形式で見やすくフォーマットする
 * 例: 45 -> "45分", 60 -> "1時間", 135 -> "2時間15分"
 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}時間` : `${h}時間${rem}分`;
}

/**
 * カレンダーマス目など狭いスペース向けの短縮フォーマット
 * 例: 45 -> "45m", 60 -> "1h", 135 -> "2h15m"
 */
export function formatDurationCompact(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}
