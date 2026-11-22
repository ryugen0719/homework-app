'use client';

import { useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, Trash2, X } from 'lucide-react';
import StudentAvatar, {
  renderPresetIcon,
  STUDENT_COLOR_OPTIONS,
  STUDENT_ICON_OPTIONS,
} from './StudentAvatar';
import ImageCropModal from './ImageCropModal';

interface StudentProfile {
  id: string;
  name: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
}

interface ProfileModalProps {
  student: StudentProfile;
  token: string;
  onClose: () => void;
  onUpdated: (updated: Partial<StudentProfile>) => void;
}

export default function ProfileModal({
  student,
  token,
  onClose,
  onUpdated,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(student.displayName || student.name);
  const [color, setColor] = useState(student.color || STUDENT_COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState(student.icon || 'book');
  const [avatarUrl, setAvatarUrl] = useState(student.avatarUrl || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      onUpdated({ avatarUrl: json.avatarUrl });
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

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
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
          icon,
          avatarUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'プロフィールの保存に失敗しました');
        return;
      }
      onUpdated({
        displayName: trimmedDisplay,
        color,
        icon,
        avatarUrl,
      });
      onClose();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 id="profile-modal-title" className="text-base font-extrabold text-ink">
              アイコン・プロフィール設定
            </h3>
            <p className="text-xs text-muted mt-0.5">
              レーストラックやヘッダーに表示される自分だけのアイコンを設定できます
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* 現在のアバタープレビュー＆画像アップロード */}
          <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-card-subtle/60 border border-line/70">
            <div className="relative">
              <StudentAvatar
                avatarUrl={avatarUrl}
                icon={icon}
                color={color}
                name={displayName}
                size="xl"
                shape="circle"
                className="shadow-card"
              />
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-ink/50 grid place-items-center text-white">
                  <LoaderCircle size={22} className="animate-spin" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-card border border-line hover:border-primary/50 text-ink hover:text-primary shadow-subtle transition-all cursor-pointer disabled:opacity-50"
              >
                <Camera size={14} className="text-primary" />
                <span>{uploading ? 'アップロード中…' : avatarUrl ? '画像を変更する' : '画像をアップロード'}</span>
              </button>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploading || saving}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl border border-line text-muted hover:text-danger hover:border-danger/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  <span>画像を消す</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted text-center">
              JPG / PNG / WebP / GIF（5MBまで）
            </p>
          </div>

          {/* プリセットアイコン選択 */}
          <div>
            <label className="block text-xs font-bold text-muted mb-2">
              プリセットアイコン（画像未設定時に表示）
            </label>
            <div className="grid grid-cols-5 gap-2">
              {STUDENT_ICON_OPTIONS.map((ic) => {
                const selected = !avatarUrl && icon === ic.key;
                return (
                  <button
                    key={ic.key}
                    type="button"
                    onClick={() => {
                      setIcon(ic.key);
                      setAvatarUrl('');
                    }}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                      selected
                        ? 'bg-primary/10 border-primary text-primary shadow-xs'
                        : 'bg-card border-line text-muted hover:text-ink hover:bg-card-subtle'
                    }`}
                  >
                    {renderPresetIcon(ic.key, 16)}
                    <span className="truncate max-w-full px-1">{ic.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* テーマカラー選択 */}
          <div>
            <label className="block text-xs font-bold text-muted mb-2">マイカラー（レースのレーン色）</label>
            <div className="flex flex-wrap gap-2.5">
              {STUDENT_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
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

          {/* レース表示名 */}
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

          {error && (
            <p className="text-xs font-semibold text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-line/60">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || uploading}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-line text-muted hover:text-ink cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || uploading || !displayName.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary-hover active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
            >
              {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{saving ? '保存中…' : '変更を保存'}</span>
            </button>
          </div>
        </form>
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
