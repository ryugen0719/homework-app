'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  Camera,
  Check,
  LoaderCircle,
  Moon,
  PencilLine,
  Sun,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import StudentAvatar, { STUDENT_COLOR_OPTIONS } from './StudentAvatar';
import ImageCropModal from './ImageCropModal';
import { formatDuration } from '../lib/format-duration';
import { playAppSound } from './sounds';

interface StudentProfile {
  id: string;
  name: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
  rankingOptOut?: boolean;
  createdAt?: string;
}

interface ProfileModalProps {
  student: StudentProfile;
  token: string;
  theme: 'light' | 'dark';
  soundMuted: boolean;
  monthRecordedDays?: number;
  monthTotalMinutes?: number;
  onToggleTheme: () => void;
  onToggleSound: () => void;
  onSwitchAccount: () => void;
  onClose: () => void;
  onUpdated: (updated: Partial<StudentProfile>, message?: string) => void;
}

function formatJoinedDate(isoString?: string) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
  }).format(date);
}

export default function ProfileModal({
  student,
  token,
  theme,
  soundMuted,
  monthRecordedDays = 0,
  monthTotalMinutes = 0,
  onToggleTheme,
  onToggleSound,
  onSwitchAccount,
  onClose,
  onUpdated,
}: ProfileModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [displayName, setDisplayName] = useState(student.displayName || student.name);
  const [color, setColor] = useState(student.color || STUDENT_COLOR_OPTIONS[0]);
  const [avatarUrl, setAvatarUrl] = useState(student.avatarUrl || '');
  const [rankingOptOut, setRankingOptOut] = useState(Boolean(student.rankingOptOut));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingRanking, setTogglingRanking] = useState(false);
  const [error, setError] = useState('');
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingCropFile) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, pendingCropFile]);

  const joinedLabel = formatJoinedDate(student.createdAt);

  const uploadProcessedAvatar = async (processedFile: File) => {
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', processedFile);
      formData.append('studentId', student.id);

      const res = await fetch('/api/avatar/upload', {
        method: 'POST',
        headers: { 'x-app-token': token },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || '画像のアップロードに失敗しました');
        return;
      }
      setAvatarUrl(json.avatarUrl);
      playAppSound('heart');
      onUpdated({ avatarUrl: json.avatarUrl }, 'アイコン画像を更新しました');
    } catch {
      setError('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('JPG・PNG・WebP・GIF形式の画像を選択してください');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('画像サイズは15MB以下にしてください');
      return;
    }
    setError('');
    setPendingCropFile(file);
  };

  const handleToggleRankingQuick = async () => {
    if (togglingRanking || saving) return;
    const nextOptOut = !rankingOptOut;
    setTogglingRanking(true);
    setError('');
    try {
      const res = await fetch('/api/students', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({
          studentId: student.id,
          rankingOptOut: nextOptOut,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || '設定の保存に失敗しました');
        return;
      }
      setRankingOptOut(nextOptOut);
      playAppSound(nextOptOut ? 'unclasp' : 'clasp');
      onUpdated(
        { rankingOptOut: nextOptOut },
        nextOptOut ? 'レースランキングを非表示にしました' : 'レースランキングに参加しました'
      );
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setTogglingRanking(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedDisplay = displayName.trim() || student.name;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/students', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({
          studentId: student.id,
          displayName: trimmedDisplay,
          color,
          icon: student.icon || 'book',
          avatarUrl,
          rankingOptOut,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'プロフィールの保存に失敗しました');
        return;
      }
      playAppSound('heart');
      onUpdated({
        displayName: trimmedDisplay,
        color,
        avatarUrl,
        rankingOptOut,
      });
      setMode('view');
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  const resetEditDraft = () => {
    setDisplayName(student.displayName || student.name);
    setColor(student.color || STUDENT_COLOR_OPTIONS[0]);
    setAvatarUrl(student.avatarUrl || '');
    setRankingOptOut(Boolean(student.rankingOptOut));
    setError('');
    setMode('view');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-[28px] border border-line bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 上部カバーバナー（画像のような角丸インセット＋右上丸ボタン） */}
        <div className="p-3 pb-0">
          <div
            className="relative h-32 sm:h-36 w-full rounded-[20px] overflow-hidden"
            style={{
              background: `linear-gradient(180deg, ${color}cc 0%, ${color}99 58%, ${color}66 78%, rgba(255,255,255,0.45) 100%)`,
            }}
          >
            {/* やわらかい光のグラデーション層 */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 85% 60% at 25% 15%, rgba(255,255,255,0.28) 0%, transparent 65%), linear-gradient(180deg, rgba(11,18,32,0.06) 0%, rgba(11,18,32,0.18) 100%)',
              }}
            />

            {/* 編集モード時の戻るボタン（左上） */}
            {mode === 'edit' && (
              <button
                type="button"
                onClick={resetEditDraft}
                disabled={saving || uploading}
                className="absolute top-3 left-3 size-9 rounded-full bg-white/90 text-[#0B1220] hover:bg-white shadow-md backdrop-blur-sm grid place-items-center transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                aria-label="プロフィールに戻る"
                title="プロフィールに戻る"
              >
                <ArrowLeft size={16} />
              </button>
            )}

            {/* 右上のフローティング丸ボタン（テーマ切替・閉じる） */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleTheme}
                className="size-9 rounded-full bg-white/90 text-[#0B1220] hover:bg-white shadow-md backdrop-blur-sm grid place-items-center transition-all active:scale-95 cursor-pointer"
                aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
                title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="size-9 rounded-full bg-white/90 text-[#0B1220] hover:bg-white shadow-md backdrop-blur-sm grid place-items-center transition-all active:scale-95 cursor-pointer"
                aria-label="閉じる"
                title="閉じる"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 中央オーバーラップアバター */}
        <div className="relative z-10 -mt-12 flex justify-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || saving}
              className="group relative block rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait"
              aria-label="アイコン画像を変更"
              title="タップしてアイコン画像を変更"
            >
              <StudentAvatar
                avatarUrl={avatarUrl}
                icon={student.icon}
                color={color}
                name={displayName}
                size="2xl"
                shape="circle"
                className="!ring-[5px] !ring-card shadow-lg"
              />
              <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/35 transition-colors grid place-items-center">
                <Camera
                  size={20}
                  className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"
                />
              </span>
              {uploading && (
                <span className="absolute inset-0 rounded-full bg-black/60 grid place-items-center text-white">
                  <LoaderCircle size={24} className="animate-spin" />
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || saving}
              className="absolute bottom-0.5 right-0.5 size-7 rounded-full bg-card border border-line text-ink hover:text-primary hover:border-primary/50 shadow-md grid place-items-center transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              aria-label="アイコン画像をアップロード"
              title="アイコン画像を変更"
            >
              <Camera size={13} />
            </button>
          </div>
        </div>

        {mode === 'view' ? (
          /* プロフィール表示モード */
          <div className="px-5 pt-3 pb-5">
            <div className="text-center">
              <p className="m-0 text-xs font-medium text-muted">
                @{student.name}
              </p>

              <div className="mt-1 flex items-center justify-center gap-1.5">
                <h3
                  id="profile-modal-title"
                  className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight text-ink truncate max-w-[260px]"
                >
                  {displayName}
                </h3>
                <BadgeCheck size={19} className="text-ink shrink-0" aria-hidden="true" />
              </div>

              <p className="m-0 mt-1.5 text-xs sm:text-sm text-ink/80">
                {monthRecordedDays > 0
                  ? `今月の学習 ${formatDuration(monthTotalMinutes)}・${monthRecordedDays}日記録`
                  : '毎日の学習を記録中'}
              </p>

              <p className="m-0 mt-1 text-xs text-muted">
                <span>{rankingOptOut ? 'レース非表示' : 'レース参加中'}</span>
                {joinedLabel && (
                  <>
                    <span className="mx-1.5 opacity-60">·</span>
                    <span>{joinedLabel}に登録</span>
                  </>
                )}
              </p>

              {/* メインピルアクション（編集 / アカウント切り替え） */}
              <div className="mt-5 flex items-center justify-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('edit');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-ink text-card dark:bg-white dark:text-[#0B1220] text-xs sm:text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-subtle cursor-pointer"
                >
                  <PencilLine size={14} />
                  <span>プロフィール編集</span>
                </button>

                <button
                  type="button"
                  onClick={onSwitchAccount}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full border border-line-strong bg-card-subtle/60 hover:bg-card-subtle text-ink text-xs sm:text-sm font-bold active:scale-95 transition-all cursor-pointer"
                >
                  <ArrowLeftRight size={14} />
                  <span>アカウント切り替え</span>
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-xs font-semibold text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 text-center">
                {error}
              </p>
            )}

            {/* 各種クイック設定 */}
            <div className="mt-5 pt-4 border-t border-line/70 space-y-2">
              {/* 外観テーマ */}
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-card-subtle/50 border border-line/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-8 rounded-xl bg-card border border-line grid place-items-center text-ink shrink-0">
                    {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-xs font-bold text-ink">外観テーマ</p>
                    <p className="m-0 text-[11px] text-muted">
                      現在: {theme === 'dark' ? 'ダークモード' : 'ライトモード'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-card border border-line hover:border-primary/50 text-ink transition-all cursor-pointer shrink-0"
                >
                  {theme === 'dark' ? 'ライトへ' : 'ダークへ'}
                </button>
              </div>

              {/* 効果音（サウンド） */}
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-card-subtle/50 border border-line/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-8 rounded-xl bg-card border border-line grid place-items-center text-ink shrink-0">
                    {soundMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-xs font-bold text-ink">効果音</p>
                    <p className="m-0 text-[11px] text-muted">
                      {soundMuted ? 'ミュート中' : 'タップ音・達成音を再生'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!soundMuted}
                  onClick={onToggleSound}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    !soundMuted ? 'bg-primary' : 'bg-line-strong'
                  }`}
                  aria-label="効果音のオンオフを切り替え"
                >
                  <span
                    className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${
                      !soundMuted ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* レースランキング表示 */}
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-card-subtle/50 border border-line/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-8 rounded-xl bg-card border border-line grid place-items-center text-primary shrink-0">
                    <Trophy size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-xs font-bold text-ink">レースランキング表示</p>
                    <p className="m-0 text-[11px] text-muted">
                      {rankingOptOut ? 'ランキングに表示しない' : 'ランキングに参加する'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!rankingOptOut}
                  disabled={togglingRanking}
                  onClick={() => void handleToggleRankingQuick()}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                    !rankingOptOut ? 'bg-primary' : 'bg-line-strong'
                  }`}
                  aria-label="レースランキング表示を切り替え"
                >
                  <span
                    className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${
                      !rankingOptOut ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* プロフィール編集モード */
          <form onSubmit={handleSave} className="px-5 pt-3 pb-5 space-y-4">
            <div className="text-center">
              <h3 id="profile-modal-title" className="m-0 text-base font-extrabold text-ink">
                プロフィール編集
              </h3>
              <div className="mt-2.5 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-full bg-card-subtle border border-line hover:border-primary/50 text-ink hover:text-primary transition-all cursor-pointer disabled:opacity-50"
                >
                  <Camera size={13} className="text-primary" />
                  <span>{uploading ? 'アップロード中…' : avatarUrl ? '画像を変更' : '画像をアップロード'}</span>
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    disabled={uploading || saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full border border-line text-muted hover:text-danger hover:border-danger/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    <span>画像を消す</span>
                  </button>
                )}
              </div>
            </div>

            {/* 表示名 */}
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5" htmlFor="profile-display-name">
                表示名（ニックネーム）
              </label>
              <input
                id="profile-display-name"
                type="text"
                maxLength={20}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: たろう"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-line bg-card text-ink focus:outline-none focus:border-primary"
                required
              />
            </div>

            {/* テーマカラー選択（バナー色にもリアルタイム反映） */}
            <div>
              <label className="block text-xs font-bold text-muted mb-2">
                マイカラー（バナー・レース色）
              </label>
              <div className="flex flex-wrap gap-2.5">
                {STUDENT_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                    setColor(c);
                    playAppSound('petal');
                  }}
                    style={{ backgroundColor: c }}
                    className={`size-8 rounded-full transition-transform cursor-pointer ${
                      color === c
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                    aria-label={`色 ${c}`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs font-semibold text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/60">
              <button
                type="button"
                onClick={resetEditDraft}
                disabled={saving || uploading}
                className="px-4 py-2 text-xs font-bold rounded-full border border-line text-muted hover:text-ink cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving || uploading || !displayName.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-full bg-primary text-white hover:bg-primary-hover active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
              >
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                <span>{saving ? '保存中…' : '変更を保存'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {pendingCropFile && (
        <ImageCropModal
          file={pendingCropFile}
          mode="avatar"
          onCancel={() => setPendingCropFile(null)}
          onConfirm={(processedFile) => {
            setPendingCropFile(null);
            void uploadProcessedAvatar(processedFile);
          }}
        />
      )}
    </div>
  );
}
