'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const LIVE_LAP_SECONDS = 30 * 60; // 30分 = 1周
export const LIVE_MAX_SESSION_SEC = 4 * 60 * 60; // 4時間上限

export interface LiveTimerState {
  status: 'running' | 'paused';
  elapsedSec: number;
  accumulatedSec: number;
  startedAt: string;
  resumedAt: string | null;
  lastHeartbeatAt: string;
  isStale: boolean;
  isCapped: boolean;
}

export interface LiveMember {
  studentId: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl: string;
  isMe: boolean;
  status: 'running' | 'paused';
  elapsedSec: number;
  accumulatedSec: number;
  startedAt: string;
  resumedAt: string | null;
  isStale: boolean;
  isCapped: boolean;
}

export interface LiveMemberComputed extends LiveMember {
  liveElapsedSec: number;
  liveFlooredMinutes: number;
}

export interface PrepareFinishResult {
  totalSec: number;
  flooredMinutes: number;
  startedAt: string;
  endedAt: string;
}

export function formatTimerClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function getLapProgress(totalSec: number) {
  const safe = Math.max(0, Math.floor(totalSec));
  const completedLaps = Math.floor(safe / LIVE_LAP_SECONDS);
  const lapNumber = completedLaps + 1;
  const lapElapsedSec = safe % LIVE_LAP_SECONDS;
  const lapProgressPct = Math.min(100, (lapElapsedSec / LIVE_LAP_SECONDS) * 100);
  const remainingSecInLap = LIVE_LAP_SECONDS - lapElapsedSec;
  const secInMinute = safe % 60;
  const minuteProgressPct = (secInMinute / 60) * 100;
  return {
    completedLaps,
    lapNumber,
    lapElapsedSec,
    lapProgressPct,
    remainingSecInLap,
    secInMinute,
    minuteProgressPct,
  };
}

export function computeInterpolatedSec(
  item: { status: 'running' | 'paused'; elapsedSec: number; accumulatedSec: number; resumedAt: string | null },
  serverNowMs: number
): number {
  if (item.status !== 'running' || !item.resumedAt || serverNowMs <= 0) {
    return Math.min(LIVE_MAX_SESSION_SEC, Math.max(0, Math.floor(item.elapsedSec)));
  }
  const resumedMs = Date.parse(item.resumedAt);
  if (Number.isNaN(resumedMs)) {
    return Math.min(LIVE_MAX_SESSION_SEC, Math.max(0, Math.floor(item.elapsedSec)));
  }
  const deltaSec = Math.max(0, Math.floor((serverNowMs - resumedMs) / 1000));
  return Math.min(LIVE_MAX_SESSION_SEC, Math.max(0, Math.floor(item.accumulatedSec) + deltaSec));
}

const POLL_INTERVAL_MS = 8000;
const HEARTBEAT_INTERVAL_MS = 60000;

export function useLiveTimer(token: string, enabled: boolean) {
  const [myTimerState, setMyTimer] = useState<LiveTimerState | null>(null);
  const [rawMembersState, setRawMembers] = useState<LiveMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [tickNow, setTickNow] = useState<number>(0);
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  // 古いレスポンスが新しい操作結果を上書きしないための単調増加シーケンス
  const seqRef = useRef<number>(0);

  const isActive = enabled && Boolean(token);
  const myTimer = isActive ? myTimerState : null;
  const rawMembers = useMemo(
    () => (isActive ? rawMembersState : []),
    [isActive, rawMembersState]
  );

  const syncServerTime = useCallback((serverNow?: string) => {
    if (!serverNow) return;
    const parsed = Date.parse(serverNow);
    if (!Number.isNaN(parsed)) {
      setServerOffsetMs(parsed - Date.now());
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !token) return;
    const reqSeq = ++seqRef.current;
    try {
      const res = await fetch('/api/live', {
        headers: { 'x-app-token': token },
        cache: 'no-store',
      });
      if (!res.ok || reqSeq !== seqRef.current) return;
      const data = (await res.json()) as {
        serverNow?: string;
        myTimer?: LiveTimerState | null;
        liveMembers?: LiveMember[];
      };
      if (reqSeq !== seqRef.current) return;
      syncServerTime(data.serverNow);
      setMyTimer(data.myTimer ?? null);
      setRawMembers(Array.isArray(data.liveMembers) ? data.liveMembers : []);
      setTickNow(Date.now());
    } catch {
      // ignore transient network errors
    }
  }, [enabled, token, syncServerTime]);

  // 初回取得 + 8秒ポーリング（画面表示中のみ）
  useEffect(() => {
    if (!isActive) return;

    let active = true;
    const doFetch = () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refresh();
    };

    const initialId = window.setTimeout(doFetch, 0);
    const pollId = window.setInterval(doFetch, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.clearTimeout(initialId);
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isActive, refresh]);

  // 誰か1人でも勉強中なら1秒ごとにローカル補間を更新
  const hasAnyRunning = useMemo(() => {
    if (myTimer?.status === 'running') return true;
    return rawMembers.some((m) => m.status === 'running');
  }, [myTimer, rawMembers]);

  useEffect(() => {
    if (!enabled || !hasAnyRunning) return;
    const id = window.setInterval(() => {
      setTickNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, hasAnyRunning]);

  // 自分が勉強中なら60秒ごとにハートビートを送信
  useEffect(() => {
    if (!enabled || !token || myTimer?.status !== 'running') return;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetch('/api/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({ action: 'heartbeat' }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data === 'object') {
            syncServerTime(data.serverNow);
            if ('myTimer' in data) setMyTimer(data.myTimer ?? null);
          }
        })
        .catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, token, myTimer?.status, syncServerTime]);

  const postAction = useCallback(
    async (action: string) => {
      if (!enabled || !token) return null;
      const reqSeq = ++seqRef.current;
      setBusy(true);
      try {
        const res = await fetch('/api/live', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-token': token,
          },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (reqSeq === seqRef.current) {
          syncServerTime(data.serverNow);
          if ('myTimer' in data) {
            setMyTimer(data.myTimer ?? null);
          }
          setTickNow(Date.now());
          void refresh();
        }
        return data;
      } catch {
        return null;
      } finally {
        setBusy(false);
      }
    },
    [enabled, token, syncServerTime, refresh]
  );

  const start = useCallback(async () => {
    const res = await postAction('start');
    return Boolean(res?.myTimer);
  }, [postAction]);

  const pause = useCallback(async () => {
    const res = await postAction('pause');
    return Boolean(res);
  }, [postAction]);

  const resume = useCallback(async () => {
    const res = await postAction('resume');
    return Boolean(res?.myTimer);
  }, [postAction]);

  const cancel = useCallback(async () => {
    const res = await postAction('cancel');
    return Boolean(res);
  }, [postAction]);

  const prepareFinish = useCallback(async (): Promise<PrepareFinishResult | null> => {
    const res = await postAction('prepare-finish');
    if (!res) return null;
    return {
      totalSec: Number(res.totalSec) || 0,
      flooredMinutes: Number(res.flooredMinutes) || 0,
      startedAt: typeof res.startedAt === 'string' ? res.startedAt : new Date().toISOString(),
      endedAt: typeof res.endedAt === 'string' ? res.endedAt : new Date().toISOString(),
    };
  }, [postAction]);

  const estimatedServerNowMs = tickNow + serverOffsetMs;

  const myElapsedSec = useMemo(() => {
    if (!myTimer) return 0;
    return computeInterpolatedSec(myTimer, estimatedServerNowMs);
  }, [myTimer, estimatedServerNowMs]);

  const liveMembers = useMemo<LiveMemberComputed[]>(() => {
    return rawMembers.map((m) => {
      const liveElapsedSec = computeInterpolatedSec(m, estimatedServerNowMs);
      return {
        ...m,
        liveElapsedSec,
        liveFlooredMinutes: Math.floor(liveElapsedSec / 60),
      };
    });
  }, [rawMembers, estimatedServerNowMs]);

  const otherRunningMembers = useMemo(
    () => liveMembers.filter((m) => !m.isMe && m.status === 'running'),
    [liveMembers]
  );

  // 誰かのライブ状態（開始・一時停止・再開・終了）が変化したことを検知するための署名
  const liveSignature = useMemo(() => {
    const myPart = myTimer
      ? `me:${myTimer.status}:${myTimer.startedAt}:${myTimer.resumedAt || ''}:${myTimer.accumulatedSec}`
      : 'me:none';
    const membersPart = rawMembers
      .map((m) => `${m.studentId}:${m.status}:${m.startedAt}:${m.resumedAt || ''}:${m.accumulatedSec}`)
      .sort()
      .join(',');
    return `${myPart}|${membersPart}`;
  }, [myTimer, rawMembers]);

  return {
    myTimer,
    myElapsedSec,
    liveMembers,
    otherRunningMembers,
    liveSignature,
    busy,
    start,
    pause,
    resume,
    cancel,
    prepareFinish,
    refresh,
  };
}
