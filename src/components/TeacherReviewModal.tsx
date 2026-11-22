'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Drawer } from 'vaul';
import { Calendar, Check, LoaderCircle, MessageCircle, X } from 'lucide-react';
import { ui } from '../app/ui';

function subscribeMobile(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(max-width: 639px)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getIsMobileSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 639px)').matches;
}

function getIsMobileServerSnapshot() {
  return false;
}

const TEACHER_QUICK_COMMENTS = [
  'よくがんばりました！',
  'コツコツ続けていて素晴らしいです！',
  'ノートが丁寧でわかりやすいですね！',
  '確認しました！',
] as const;

interface TeacherReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateLabel: string;
  studentName?: string;
  comment: string;
  reviewedAt?: string;
  hasNextUnreviewed: boolean;
  saving: boolean;
  disabled: boolean;
  canSave: boolean;
  error?: string;
  onChangeComment: (nextComment: string) => void;
  onSave: (jumpToNext: boolean) => Promise<boolean>;
}

export default function TeacherReviewModal({
  open,
  onOpenChange,
  dateLabel,
  studentName,
  comment,
  reviewedAt,
  hasNextUnreviewed,
  saving,
  disabled,
  canSave,
  error,
  onChangeComment,
  onSave,
}: TeacherReviewModalProps) {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || isMobile) return;
    const id = window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, isMobile]);

  const handleClose = () => {
    if (saving) return;
    onOpenChange(false);
  };

  const handleSave = (jumpToNext: boolean) => {
    if (disabled || saving || !canSave) return;
    void onSave(jumpToNext).then((ok) => {
      if (ok) {
        onOpenChange(false);
      }
    });
  };

  const formBody = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-vaul-no-drag="" className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-bold text-ink" htmlFor="review-comment-modal">
            確認コメント（任意）
          </label>
          {reviewedAt && (
            <span className="text-[11px] text-muted font-numbers">
              確認: {new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(reviewedAt))}
            </span>
          )}
        </div>

        {/* 定型コメントのワンタップ入力 */}
        <div className="flex flex-wrap gap-1.5">
          {TEACHER_QUICK_COMMENTS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled || saving}
              onClick={() => {
                const currentText = comment.trim();
                const nextText = currentText ? `${currentText}\n${preset}` : preset;
                onChangeComment(nextText.slice(0, 1000));
              }}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-line bg-card-subtle/60 hover:bg-card-subtle hover:border-primary/40 text-ink transition-all cursor-pointer disabled:opacity-40"
            >
              + {preset}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          id="review-comment-modal"
          className={`${ui.textArea} min-h-[110px]`}
          rows={4}
          maxLength={1000}
          value={comment}
          disabled={disabled || saving}
          onChange={(e) => onChangeComment(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !disabled && !saving && canSave) {
              e.preventDefault();
              handleSave(hasNextUnreviewed);
            }
          }}
          placeholder="コメントを入力（空欄のまま確認完了もできます / Ctrl+Enterで保存）"
        />

        {error && (
          <p
            role="alert"
            className="m-0 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-semibold text-danger"
          >
            {error}
          </p>
        )}
      </div>

      <div
        data-vaul-no-drag=""
        className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-5 py-3.5 border-t border-line/70 bg-card-subtle/40"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={saving}
          className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold rounded-xl border border-line bg-card text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-50"
        >
          閉じる
        </button>

        <button
          type="button"
          className={
            hasNextUnreviewed
              ? 'w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-line bg-card hover:bg-card-subtle text-xs font-bold text-ink transition-all cursor-pointer disabled:opacity-45'
              : `${ui.primaryButton} w-full sm:w-auto justify-center`
          }
          disabled={disabled || saving || !canSave}
          onClick={() => handleSave(false)}
        >
          {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
          <span>{saving ? '保存中…' : reviewedAt ? 'コメントを更新' : '確認完了'}</span>
        </button>

        {hasNextUnreviewed && (
          <button
            type="button"
            className={`${ui.primaryButton} w-full sm:w-auto justify-center`}
            disabled={disabled || saving || !canSave}
            onClick={() => handleSave(true)}
          >
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
            <span>{saving ? '保存中…' : '確認して次の未確認へ'}</span>
          </button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleClose();
          } else {
            onOpenChange(true);
          }
        }}
        dismissible={!saving}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mt-12 flex max-h-[90dvh] flex-col rounded-t-3xl border-t border-line bg-card shadow-2xl outline-none overflow-hidden">
            <div className="mx-auto mt-3 mb-1 h-1.5 w-11 shrink-0 rounded-full bg-line-strong/80" />
            <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-3 border-b border-line/60">
              <div className="min-w-0">
                <Drawer.Title className="m-0 text-base font-extrabold text-ink tracking-tight flex items-center gap-1.5">
                  <MessageCircle size={16} className="text-primary" />
                  <span>{reviewedAt ? '確認コメントを編集' : '確認コメントを入力'}</span>
                </Drawer.Title>
                <Drawer.Description className="m-0 mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <Calendar size={12} className="text-primary" />
                  <span>{dateLabel}</span>
                  {studentName && <span>· {studentName}</span>}
                </Drawer.Description>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="p-2 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-40"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>
            {formBody}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl outline-none"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line/60">
            <div className="min-w-0">
              <Dialog.Title className="m-0 text-base font-extrabold text-ink tracking-tight flex items-center gap-1.5">
                <MessageCircle size={16} className="text-primary" />
                <span>{reviewedAt ? '確認コメントを編集' : '確認コメントを入力'}</span>
              </Dialog.Title>
              <Dialog.Description className="m-0 mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Calendar size={12} className="text-primary" />
                <span>{dateLabel}</span>
                {studentName && <span>· {studentName}</span>}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={saving}
                className="p-2 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-40"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {formBody}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
