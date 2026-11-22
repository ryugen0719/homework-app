'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  LoaderCircle,
  Lock,
  User,
} from 'lucide-react';
import { FiBookOpen } from 'react-icons/fi';
import StudentAvatar from '../components/StudentAvatar';
import RubberSegment from '../components/RubberSegment/RubberSegment';
import CodeSlots, { type CodeSlotsStatus } from '../components/CodeSlots/CodeSlots';

interface PublicStudent {
  id: string;
  name: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
}

interface LoginSuccessData {
  role: 'teacher' | 'student';
  token: string;
  name?: string;
  student?: {
    id: string;
    name: string;
    displayName: string;
    color: string;
    icon: string;
    avatarUrl?: string;
  };
}

interface LoginViewProps {
  onLoginSuccess: (data: LoginSuccessData) => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [activeTab, setActiveTab] = useState<'student' | 'teacher'>('student');
  const [students, setStudents] = useState<PublicStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // フォームステート
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [teacherName, setTeacherName] = useState('先生');
  const [teacherPassword, setTeacherPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [useTextPassword, setUseTextPassword] = useState(false);
  const [pinStatus, setPinStatus] = useState<CodeSlotsStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 公開生徒一覧の取得（生徒選択用）
  useEffect(() => {
    let active = true;
    fetch('/api/auth/students-list', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.students && Array.isArray(data.students)) {
          setStudents(data.students);
          if (data.students.length > 0) {
            setSelectedStudentName(data.students[0].name || data.students[0].displayName);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingStudents(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const submitStudentLogin = async (passwordToTry: string) => {
    if (!selectedStudentName.trim() || !passwordToTry.trim()) {
      setErrorMessage('お名前とパスワードを入力してください');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setPinStatus('idle');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'student',
          name: selectedStudentName.trim(),
          password: passwordToTry.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPinStatus('error');
        setErrorMessage(data.error || 'ログインできませんでした');
        return;
      }

      setPinStatus('success');
      window.setTimeout(() => {
        onLoginSuccess({
          role: 'student',
          token: data.token,
          student: data.student,
        });
      }, 360);
    } catch {
      setPinStatus('error');
      setErrorMessage('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitStudentLogin(studentPassword);
  };

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim() || !teacherPassword.trim()) {
      setErrorMessage('先生のお名前とパスワードを入力してください');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'teacher',
          name: teacherName.trim(),
          password: teacherPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'ログインできませんでした');
        return;
      }

      onLoginSuccess({
        role: 'teacher',
        token: data.token,
        name: data.name,
      });
    } catch {
      setErrorMessage('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* ロゴ＆ウェルカムメッセージ */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary text-white shadow-card mb-1">
            <FiBookOpen size={28} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            宿題ノート
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            日々の学びを記録し、先生と一緒に育てる学習ノート
          </p>
        </div>

        {/* ログインカード */}
        <div className="rounded-3xl border border-line bg-card p-6 sm:p-8 shadow-card space-y-6">
          {/* タブ切り替え（生徒 / 先生） */}
          <RubberSegment
            aria-label="ログイン区分"
            value={activeTab}
            onChange={(val) => {
              setActiveTab(val as 'student' | 'teacher');
              setErrorMessage('');
              setPinStatus('idle');
            }}
            items={[
              { value: 'student', label: '生徒', icon: <User size={15} /> },
              { value: 'teacher', label: '先生', icon: <GraduationCap size={16} /> },
            ]}
            trackColor="var(--card-subtle)"
            thumbColor="var(--card)"
            textColor="var(--text-sub)"
            activeTextColor="var(--text)"
            size="lg"
            radius={14}
            inset={4}
            equalSlots={true}
            className="w-full border border-line"
          />

          {/* エラーメッセージ */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-danger/10 border border-danger/25 text-danger text-xs font-semibold animate-in fade-in">
              {errorMessage}
            </div>
          )}

          {/* 生徒ログインフォーム */}
          {activeTab === 'student' ? (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              {/* 生徒が登録されている場合: クイック選択カード */}
              {loadingStudents ? (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted">
                  <LoaderCircle size={14} className="animate-spin" />
                  <span>生徒一覧を読み込み中…</span>
                </div>
              ) : students.length > 0 ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-muted">
                    あなたのアカウントを選択
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {students.map((st) => {
                      const isSelected =
                        selectedStudentName === st.name || selectedStudentName === st.displayName;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudentName(st.name || st.displayName);
                            setErrorMessage('');
                          }}
                          className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-xs'
                              : 'border-line/70 bg-card hover:bg-card-subtle'
                          }`}
                        >
                          <StudentAvatar
                            avatarUrl={st.avatarUrl}
                            icon={st.icon}
                            color={st.color}
                            name={st.displayName || st.name}
                            size="sm"
                            shape="circle"
                          />
                          <span className="font-bold text-xs text-ink truncate">
                            {st.displayName || st.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* お名前入力（手動入力も可能） */}
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5" htmlFor="student-name">
                  お名前（ニックネーム可）
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="student-name"
                    type="text"
                    placeholder="例: たろう"
                    value={selectedStudentName}
                    onChange={(e) => setSelectedStudentName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-semibold rounded-2xl border border-line bg-card text-ink focus:outline-none focus:border-primary shadow-subtle"
                    required
                  />
                </div>
              </div>

              {/* パスワード（4桁PINスロット / 通常入力切替） */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-muted" htmlFor="student-pw">
                    {useTextPassword ? 'パスワード' : '4桁のPIN'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUseTextPassword((v) => !v);
                      setStudentPassword('');
                      setPinStatus('idle');
                      setErrorMessage('');
                    }}
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    {useTextPassword ? '4桁PINで入力' : '文字で入力'}
                  </button>
                </div>

                {!useTextPassword ? (
                  <div className="flex flex-col items-center gap-2 py-1">
                    <CodeSlots
                      length={4}
                      value={studentPassword}
                      status={pinStatus}
                      disabled={submitting}
                      mask={!showPassword}
                      slotSize={52}
                      gap={10}
                      radius={14}
                      accentColor="var(--primary)"
                      slotColor="var(--card-subtle)"
                      digitColor="var(--text)"
                      inkColor="#ffffff"
                      dangerColor="var(--error)"
                      ariaLabel="4桁のPINコード"
                      onChange={(code) => {
                        setStudentPassword(code);
                        if (pinStatus === 'error') setPinStatus('idle');
                        if (errorMessage) setErrorMessage('');
                      }}
                      onComplete={(code) => {
                        if (selectedStudentName.trim()) {
                          void submitStudentLogin(code);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink cursor-pointer mt-0.5"
                    >
                      {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                      <span>{showPassword ? '数字を隠す' : '数字を表示'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      id="student-pw"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="例: 1234"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 text-sm font-bold font-numbers rounded-2xl border border-line bg-card text-ink focus:outline-none focus:border-primary shadow-subtle tracking-wider"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1 cursor-pointer"
                      aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                )}
              </div>

              {/* ログインボタン */}
              <button
                type="submit"
                disabled={submitting || !selectedStudentName.trim() || !studentPassword.trim()}
                className="w-full py-3 px-4 rounded-2xl bg-primary text-white font-bold text-sm shadow-subtle hover:bg-primary-hover active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {submitting ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" />
                    <span>ログイン中…</span>
                  </>
                ) : (
                  <>
                    <span>勉強ノートを開く</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* 先生ログインフォーム */
            <form onSubmit={handleTeacherLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5" htmlFor="teacher-name">
                  先生のお名前
                </label>
                <div className="relative">
                  <GraduationCap size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="teacher-name"
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="先生"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-semibold rounded-2xl border border-line bg-card text-ink focus:outline-none focus:border-primary shadow-subtle"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1.5" htmlFor="teacher-pw">
                  先生パスワード
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="teacher-pw"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="先生用パスワードを入力"
                    value={teacherPassword}
                    onChange={(e) => setTeacherPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-sm font-semibold rounded-2xl border border-line bg-card text-ink focus:outline-none focus:border-primary shadow-subtle"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1 cursor-pointer"
                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-[11px] text-muted mt-1.5">
                  ※初期パスワード、または設定された先生パスワードを入力してください。
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || !teacherName.trim() || !teacherPassword.trim()}
                className="w-full py-3 px-4 rounded-2xl bg-primary text-white font-bold text-sm shadow-subtle hover:bg-primary-hover active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {submitting ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" />
                    <span>認証中…</span>
                  </>
                ) : (
                  <>
                    <span>先生として管理画面に入る</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
