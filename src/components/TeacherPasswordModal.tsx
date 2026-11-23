'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, X } from 'lucide-react';

interface TeacherPasswordModalProps {
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function TeacherPasswordModal({
  token,
  onClose,
  onSaved,
}: TeacherPasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedCurrent = currentPassword.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedCurrent) {
      setError('現在のパスワードを入力してください');
      return;
    }
    if (trimmedNew.length < 4 || trimmedNew.length > 64) {
      setError('新しいパスワードは4文字以上64文字以内で入力してください');
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      setError('新しいパスワード（確認）が一致しません');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/teacher-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({
          currentPassword: trimmedCurrent,
          newPassword: trimmedNew,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'パスワードの変更に失敗しました');
        return;
      }
      onSaved();
    } catch {
      setError('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="先生パスワードの変更"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-line bg-card p-6 sm:p-7 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="absolute top-5 right-5 p-2 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-50"
          aria-label="閉じる"
        >
          <X size={18} />
        </button>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={18} className="text-primary" />
            <h3 className="text-lg font-bold text-ink">先生パスワードの変更</h3>
          </div>
          <p className="text-xs text-muted">
            次回ログイン時から新しいパスワードが使用されます。
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="teacher-current-pw"
              className="block text-xs font-bold text-muted mb-1.5"
            >
              現在のパスワード
            </label>
            <input
              id="teacher-current-pw"
              type={showPasswords ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="現在のパスワードを入力"
              autoComplete="current-password"
              disabled={saving}
              className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-line bg-card-subtle/50 text-ink focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div>
            <label
              htmlFor="teacher-new-pw"
              className="block text-xs font-bold text-muted mb-1.5"
            >
              新しいパスワード（4文字以上）
            </label>
            <input
              id="teacher-new-pw"
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新しいパスワードを入力"
              autoComplete="new-password"
              minLength={4}
              maxLength={64}
              disabled={saving}
              className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-line bg-card-subtle/50 text-ink focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div>
            <label
              htmlFor="teacher-confirm-pw"
              className="block text-xs font-bold text-muted mb-1.5"
            >
              新しいパスワード（確認）
            </label>
            <input
              id="teacher-confirm-pw"
              type={showPasswords ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="もう一度入力"
              autoComplete="new-password"
              minLength={4}
              maxLength={64}
              disabled={saving}
              className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-line bg-card-subtle/50 text-ink focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
            >
              {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{showPasswords ? 'パスワードを隠す' : 'パスワードを表示'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving && <LoaderCircle size={14} className="animate-spin" />}
                <span>{saving ? '保存中…' : '変更する'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
