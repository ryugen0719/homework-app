'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { AlertTriangle, Clock, LogOut, Trash2, X } from 'lucide-react';

export type ConfirmDialogTone = 'danger' | 'primary' | 'warning';
export type ConfirmDialogIcon = 'trash' | 'logout' | 'timer' | 'warning';

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  icon?: ConfirmDialogIcon;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps {
  options: ConfirmDialogOptions | null;
  busy?: boolean;
  onClose: () => void;
}

function renderIcon(icon: ConfirmDialogIcon | undefined, tone: ConfirmDialogTone) {
  const iconSize = 20;
  const colorClass =
    tone === 'danger'
      ? 'bg-error-soft text-danger'
      : tone === 'warning'
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        : 'bg-primary-soft text-primary';

  let node = <AlertTriangle size={iconSize} />;
  if (icon === 'trash') node = <Trash2 size={iconSize} />;
  else if (icon === 'logout') node = <LogOut size={iconSize} />;
  else if (icon === 'timer') node = <Clock size={iconSize} />;

  return (
    <span
      className={`grid size-11 shrink-0 place-items-center rounded-2xl ${colorClass}`}
      aria-hidden="true"
    >
      {node}
    </span>
  );
}

export default function ConfirmDialog({ options, busy = false, onClose }: ConfirmDialogProps) {
  const open = Boolean(options);
  const tone: ConfirmDialogTone = options?.tone || 'primary';

  const confirmBtnClass =
    tone === 'danger'
      ? 'bg-danger hover:bg-danger/90 !text-white'
      : tone === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700 !text-white'
        : 'bg-primary hover:bg-primary-hover !text-white';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm" />
        <Dialog.Content
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          {options && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-3xl border border-line bg-card p-5 sm:p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3.5">
                {renderIcon(options.icon, tone)}
                <div className="min-w-0 flex-1 pt-0.5">
                  <Dialog.Title className="m-0 text-base font-extrabold tracking-tight text-ink">
                    {options.title}
                  </Dialog.Title>
                  {options.description && (
                    <Dialog.Description className="m-0 mt-1.5 text-xs sm:text-[13px] leading-relaxed text-muted whitespace-pre-line">
                      {options.description}
                    </Dialog.Description>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="p-1.5 -mr-1 -mt-1 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-40"
                  aria-label="閉じる"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl border border-line bg-card text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-50"
                >
                  {options.cancelLabel || 'キャンセル'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const action = options.onConfirm;
                    onClose();
                    void action();
                  }}
                  className={`w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl shadow-subtle active:scale-95 transition-all cursor-pointer disabled:opacity-50 ${confirmBtnClass}`}
                >
                  {options.confirmLabel}
                </button>
              </div>
            </motion.div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
