'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import AppTitle from './AppTitle';
import {
  consumeGoogleRedirectIdToken,
  isFirebaseClientConfigured,
  signInWithGoogleForGate,
  signOutGoogleGate,
} from '../lib/firebase-client';

interface GoogleGateViewProps {
  onVerified: (email: string) => void;
}

export default function GoogleGateView({ onVerified }: GoogleGateViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configured = isFirebaseClientConfigured();

  const verifyIdTokenOnServer = async (idToken: string) => {
    const res = await fetch('/api/auth/gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      await signOutGoogleGate();
      setError(data.error || 'アクセスが許可されていません');
      return;
    }
    onVerified(data.email || '');
  };

  // リダイレクト認証から戻った場合のトークン処理
  useEffect(() => {
    let active = true;
    consumeGoogleRedirectIdToken()
      .then((res) => {
        if (!active || !res) return;
        setBusy(true);
        return verifyIdTokenOnServer(res.idToken);
      })
      .catch(() => {
        if (active) setError('Googleログインの確認に失敗しました');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithGoogleForGate();
      if (!result) return; // リダイレクト中
      await verifyIdTokenOnServer(result.idToken);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('');
      } else {
        setError('Googleログインに失敗しました。もう一度お試しください。');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <AppTitle
          variant="hero"
          subtitle="許可されたメンバーのみアクセスできます"
        />

        <div className="rounded-3xl border border-line bg-card p-6 sm:p-8 shadow-card space-y-5 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <ShieldCheck size={24} />
          </div>

          <div className="space-y-1.5">
            <h2 className="m-0 text-base sm:text-lg font-extrabold text-ink">
              メンバー確認
            </h2>
            <p className="m-0 text-xs sm:text-sm text-muted leading-relaxed">
              続行するには、登録済みのGoogleアカウントでサインインしてください。
            </p>
          </div>

          {!configured ? (
            <p className="m-0 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Firebase Authentication のクライアント設定（NEXT_PUBLIC_FIREBASE_*）が未設定です。
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleGoogleSignIn()}
              className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-2xl border border-line-strong bg-card hover:bg-card-subtle text-sm font-bold text-ink shadow-subtle active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle size={18} className="animate-spin text-primary" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
              )}
              <span>{busy ? '確認中…' : 'Googleで続行'}</span>
            </button>
          )}

          {error && (
            <p
              role="alert"
              className="m-0 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-semibold text-danger text-left leading-relaxed"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
