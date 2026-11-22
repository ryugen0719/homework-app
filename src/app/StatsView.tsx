'use client';

import { useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  BarChart3,
  Calendar,
  Clock,
  Compass,
  Flame,
  LoaderCircle,
  PieChart,
  Sparkles,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import type { DayEntry } from './TimelineView';
import CountUp from '../components/CountUp/CountUp';
import GlareHover from '../components/GlareHover/GlareHover';

interface StatsViewProps {
  entries: Record<string, DayEntry>;
  today: string;
  onRequestAllData?: () => void;
  hasLoadedAll?: boolean;
  loadingAll?: boolean;
}

type PeriodType = 'this-month' | 'last-month' | 'last-30' | 'all';

interface SubjectStat {
  name: string;
  color: string;
  minutes: number;
  count: number;
}

export interface BadgeTier {
  level: number;
  title: string;
  targetValue: number;
  condition: string;
  coachMessage: string;
}

export interface GrowableBadge {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  currentValue: number;
  unit: string;
  tiers: BadgeTier[];
  currentLevel: number; // 0 (未達成), 1, 2, 3, 4 (MAX)
  maxLevel: number;
  currentTier: BadgeTier | null;
  nextTier: BadgeTier | null;
  progressPercent: number;
  progressText: string;
}

const LEVEL_STYLES: Record<
  number,
  {
    label: string;
    pill: string;
    border: string;
    bg: string;
    iconBg: string;
    iconColor: string;
    barColor: string;
    stars: string;
    glow: string;
  }
> = {
  0: {
    label: 'Lv.0 未達成',
    pill: 'bg-card-subtle text-muted border-line',
    border: 'border-line',
    bg: 'bg-card',
    iconBg: 'bg-card-subtle border-line',
    iconColor: 'text-muted',
    barColor: 'bg-primary/40',
    stars: '☆☆☆☆',
    glow: '',
  },
  1: {
    label: 'Lv.1 ブロンズ',
    pill: 'bg-gradient-to-r from-amber-700/15 to-orange-700/15 text-amber-900 dark:text-amber-200 border-amber-700/30 font-semibold',
    border: 'border-amber-700/40 hover:border-amber-700/70',
    bg: 'bg-gradient-to-br from-amber-600/10 via-card to-orange-600/5 shadow-subtle',
    iconBg: 'bg-gradient-to-br from-amber-600/20 to-amber-700/30 border-amber-600/40 shadow-inner',
    iconColor: 'text-amber-700 dark:text-amber-300',
    barColor: 'bg-gradient-to-r from-amber-700 to-amber-500',
    stars: '★☆☆☆',
    glow: 'hover:shadow-[0_4px_20px_rgba(180,83,9,0.15)]',
  },
  2: {
    label: 'Lv.2 シルバー',
    pill: 'bg-gradient-to-r from-slate-400/20 to-zinc-400/20 text-slate-800 dark:text-slate-100 border-slate-400/40 font-semibold',
    border: 'border-slate-300 dark:border-slate-500 hover:border-slate-400 shadow-sm',
    bg: 'bg-gradient-to-br from-slate-200/40 via-card to-zinc-200/20 dark:from-slate-800/40 dark:to-zinc-800/20 shadow-subtle',
    iconBg: 'bg-gradient-to-br from-slate-300/60 to-slate-400/50 dark:from-slate-700/60 dark:to-slate-600/60 border-slate-400/50 shadow-inner',
    iconColor: 'text-slate-700 dark:text-slate-100',
    barColor: 'bg-gradient-to-r from-slate-400 via-slate-300 to-slate-500',
    stars: '★★☆☆',
    glow: 'hover:shadow-[0_4px_20px_rgba(148,163,184,0.25)]',
  },
  3: {
    label: 'Lv.3 ゴールド',
    pill: 'bg-gradient-to-r from-amber-400/25 via-yellow-400/20 to-amber-500/25 text-amber-900 dark:text-amber-100 border-amber-400/50 font-bold shadow-xs',
    border: 'border-amber-400/70 dark:border-amber-400 hover:border-amber-300 shadow-md',
    bg: 'bg-gradient-to-br from-amber-500/15 via-yellow-400/10 to-amber-600/15 dark:from-amber-950/50 dark:via-yellow-950/30 dark:to-amber-900/40 shadow-subtle',
    iconBg: 'bg-gradient-to-br from-amber-400/40 via-yellow-300/30 to-amber-500/40 border-amber-400/60 shadow-[0_2px_10px_rgba(245,158,11,0.25)]',
    iconColor: 'text-amber-600 dark:text-amber-300 drop-shadow-sm',
    barColor: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400',
    stars: '★★★☆',
    glow: 'hover:shadow-[0_6px_24px_rgba(245,158,11,0.3)]',
  },
  4: {
    label: 'Lv.MAX マスター',
    pill: 'bg-gradient-to-r from-cyan-500/25 via-indigo-500/25 to-purple-500/25 text-cyan-900 dark:text-cyan-100 border-cyan-400/50 font-extrabold shadow-sm tracking-wide',
    border: 'border-cyan-400/80 dark:border-cyan-400 hover:border-cyan-300 shadow-lg ring-1 ring-cyan-400/30',
    bg: 'bg-gradient-to-br from-cyan-500/20 via-blue-500/15 to-purple-600/20 dark:from-cyan-950/60 dark:via-blue-950/50 dark:to-purple-950/60 shadow-md',
    iconBg: 'bg-gradient-to-br from-cyan-400/40 via-blue-400/30 to-purple-500/40 border-cyan-300/60 shadow-[0_4px_16px_rgba(6,182,212,0.35)]',
    iconColor: 'text-cyan-500 dark:text-cyan-300 drop-shadow-md',
    barColor: 'bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500',
    stars: '★★★★',
    glow: 'hover:shadow-[0_8px_30px_rgba(6,182,212,0.35)]',
  },
};

const SUBJECT_RULES = [
  { name: '算数・数学', color: '#3B82F6', keywords: ['算数', '数学', '計算', '図形', 'かけ算', 'わり算', '方程式', 'ドリル', '数研'] },
  { name: '国語・読書', color: '#EF4444', keywords: ['国語', '漢字', '読書', '作文', '音読', '本', '文学', '現代文', '古文'] },
  { name: '英語', color: '#10B981', keywords: ['英語', '英単語', 'リスニング', '文法', 'english', '単語'] },
  { name: '理科', color: '#8B5CF6', keywords: ['理科', '実験', '生物', '化学', '物理', '地学', '観察'] },
  { name: '社会', color: '#F59E0B', keywords: ['社会', '歴史', '地理', '公民', '日本史', '世界史', '地図'] },
  { name: '宿題・ワーク', color: '#EC4899', keywords: ['宿題', 'ワーク', 'プリント', '予習', '復習', '課題'] },
];

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
}

export default function StatsView({
  entries,
  today,
  onRequestAllData,
  hasLoadedAll,
  loadingAll,
}: StatsViewProps) {
  const [period, setPeriod] = useState<PeriodType>('this-month');
  const [hoveredBar, setHoveredBar] = useState<{ date: string; minutes: number; label: string } | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<GrowableBadge | null>(null);

  const currentMonth = today ? today.slice(0, 7) : '';
  const lastMonth = useMemo(() => {
    if (!currentMonth) return '';
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [currentMonth]);

  // 選択された期間に含まれる日付一覧とエントリー
  const { periodDates, periodEntries } = useMemo(() => {
    if (!today) return { periodDates: [], periodEntries: [] };

    let start = '';
    let end = today;

    if (period === 'this-month') {
      start = `${currentMonth}-01`;
    } else if (period === 'last-month') {
      const [y, m] = lastMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      start = `${lastMonth}-01`;
      end = `${lastMonth}-${String(lastDay).padStart(2, '0')}`;
    } else if (period === 'last-30') {
      start = offsetDate(today, -29);
      end = today;
    } else {
      // all: 全登録データから最古の日付を取得
      const dates = Object.keys(entries).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      start = dates[0] || `${currentMonth}-01`;
      end = dates[dates.length - 1] && dates[dates.length - 1] > today ? dates[dates.length - 1] : today;
    }

    // start から end までの全日付配列を生成
    const dates: string[] = [];
    let cur = start;
    let safety = 0;
    while (cur <= end && safety < 1000) {
      dates.push(cur);
      cur = offsetDate(cur, 1);
      safety++;
    }

    const filteredEntries = dates.map((date) => entries[date] || { date, sessions: [] });
    return { periodDates: dates, periodEntries: filteredEntries };
  }, [entries, period, today, currentMonth, lastMonth]);

  // 主要サマリーの計算
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let totalSessions = 0;
    let recordedDaysCount = 0;
    let reviewedDaysCount = 0;

    periodEntries.forEach((dayEntry) => {
      const hasRecord = dayEntry.sessions && dayEntry.sessions.length > 0;
      if (hasRecord) {
        recordedDaysCount++;
        totalSessions += dayEntry.sessions.length;
        totalMinutes += dayEntry.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
      }
      if (dayEntry.review?.reviewedAt) {
        reviewedDaysCount++;
      }
    });

    const totalDaysInPeriod = periodDates.length || 1;
    const studyRate = Math.round((recordedDaysCount / totalDaysInPeriod) * 100);
    const avgMinutesPerStudyDay = recordedDaysCount > 0 ? Math.round(totalMinutes / recordedDaysCount) : 0;
    const avgMinutesPerDay = Math.round(totalMinutes / totalDaysInPeriod);

    return {
      totalMinutes,
      totalSessions,
      recordedDaysCount,
      reviewedDaysCount,
      totalDaysInPeriod,
      studyRate,
      avgMinutesPerStudyDay,
      avgMinutesPerDay,
    };
  }, [periodEntries, periodDates]);

  // ストリーク（連続記録日数）の計算（全期間エントリーから計算）
  const streakInfo = useMemo(() => {
    if (!today) return { current: 0, longest: 0 };
    const dates = Object.keys(entries)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && entries[d]?.sessions?.length > 0)
      .sort();

    const recordSet = new Set(dates);

    // 現在のストリーク
    let curStreak = 0;
    let checkDate = today;
    // 今日まだ記録がなければ昨日のストリークを見る
    if (!recordSet.has(checkDate)) {
      checkDate = offsetDate(today, -1);
    }
    while (recordSet.has(checkDate)) {
      curStreak++;
      checkDate = offsetDate(checkDate, -1);
    }

    // 最長ストリーク
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate = '';

    dates.forEach((d) => {
      if (!prevDate) {
        tempStreak = 1;
      } else {
        const expected = offsetDate(prevDate, 1);
        if (d === expected) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      prevDate = d;
    });

    return { current: curStreak, longest: Math.max(longestStreak, curStreak) };
  }, [entries, today]);

  // 曜日別の学習時間と日数
  const dayOfWeekStats = useMemo(() => {
    const daysName = ['日', '月', '火', '水', '木', '金', '土'];
    const distribution = daysName.map((name) => ({ name, minutes: 0, count: 0 }));

    periodEntries.forEach((dayEntry) => {
      if (!dayEntry.sessions || dayEntry.sessions.length === 0) return;
      const d = new Date(`${dayEntry.date}T12:00:00+09:00`);
      const dayIdx = d.getDay();
      const mins = dayEntry.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
      distribution[dayIdx].minutes += mins;
      distribution[dayIdx].count += 1;
    });

    const maxMins = Math.max(...distribution.map((d) => d.minutes), 1);
    return { distribution, maxMins };
  }, [periodEntries]);

  // 教科・キーワード別の内訳
  const subjectStats = useMemo(() => {
    const counts: Record<string, { minutes: number; count: number; color: string }> = {};
    SUBJECT_RULES.forEach((r) => {
      counts[r.name] = { minutes: 0, count: 0, color: r.color };
    });
    counts['その他'] = { minutes: 0, count: 0, color: '#9CA3AF' };

    periodEntries.forEach((dayEntry) => {
      dayEntry.sessions?.forEach((session) => {
        const text = session.content.toLowerCase();
        let matched = false;
        for (const rule of SUBJECT_RULES) {
          if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
            counts[rule.name].minutes += session.minutes || 0;
            counts[rule.name].count += 1;
            matched = true;
            break;
          }
        }
        if (!matched) {
          counts['その他'].minutes += session.minutes || 0;
          counts['その他'].count += 1;
        }
      });
    });

    const result: SubjectStat[] = Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.minutes - a.minutes);

    const totalSubjectMinutes = result.reduce((sum, s) => sum + s.minutes, 0) || 1;

    return { list: result, totalMinutes: totalSubjectMinutes };
  }, [periodEntries]);

  // 育成型実績バッジ（レベルアップシステム）
  const badges = useMemo((): GrowableBadge[] => {
    const allDays = Object.values(entries).filter((d) => (d?.sessions?.length || 0) > 0);
    const allDaysCount = allDays.length;
    const allSessions = Object.values(entries).flatMap((d) => d?.sessions || []);
    const allTotalMinutes = allSessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
    const maxSingleSessionMinutes = Math.max(0, ...allSessions.map((s) => s.minutes || 0));
    const allReviewedCount = Object.values(entries).filter((d) => Boolean(d?.review?.reviewedAt)).length;

    // 科目判定
    const touchedSubjects = new Set<string>();
    allSessions.forEach((s) => {
      const text = s.content.toLowerCase();
      for (const rule of SUBJECT_RULES) {
        if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
          touchedSubjects.add(rule.name);
          break;
        }
      }
    });
    const touchedSubjectsCount = touchedSubjects.size;

    // 6大育成実績の定義
    const badgeDefinitions = [
      {
        id: 'streak_flame',
        name: '継続のともしび',
        icon: Flame,
        currentValue: streakInfo.longest,
        unit: '日連続',
        tiers: [
          {
            level: 1,
            title: '火種（3日連続）',
            targetValue: 3,
            condition: '3日連続で勉強を記録する',
            coachMessage: '三日坊主の壁を突破！心の中に小さな学びの火が灯りました。この火を大切に育てよう。',
          },
          {
            level: 2,
            title: 'かがり火（7日連続）',
            targetValue: 7,
            condition: '7日連続で勉強を記録する',
            coachMessage: '1週間完全達成！平日も週末もリズムを崩さず学べた証です。立派な習慣が育っています。',
          },
          {
            level: 3,
            title: '大業火（14日連続）',
            targetValue: 14,
            condition: '14日連続で勉強を記録する',
            coachMessage: '2週間連続という圧倒的継続力！勉強が「特別なこと」から「自然な当たり前」へと進化しました。',
          },
          {
            level: 4,
            title: '不滅の太陽（21日連続）',
            targetValue: 21,
            condition: '21日連続で勉強を記録する',
            coachMessage: '3週間連続達成の最高峰！どんな日も火を絶やさず学び続けたキミは、真のレジェンドです。',
          },
        ],
      },
      {
        id: 'time_hourglass',
        name: '努力の砂時計',
        icon: Clock,
        currentValue: allTotalMinutes,
        unit: '分',
        tiers: [
          {
            level: 1,
            title: 'はじめの1時間',
            targetValue: 60,
            condition: '累計学習時間 60分突破',
            coachMessage: '勉強の時計が動き出しました。最初の60分を積み上げた、素晴らしいスタートダッシュ！',
          },
          {
            level: 2,
            title: '見習い探求者（5時間）',
            targetValue: 300,
            condition: '累計学習時間 300分（5時間）突破',
            coachMessage: '5時間突破！机に向かって集中した時間の重みが、確かな自信へと変わり始めています。',
          },
          {
            level: 3,
            title: '熟練の学習者（10時間）',
            targetValue: 600,
            condition: '累計学習時間 600分（10時間）突破',
            coachMessage: '二桁の大台10時間を達成！ノートの厚みは、誰にも奪えないキミ自身の努力そのものです。',
          },
          {
            level: 4,
            title: '努力の金字塔（30時間）',
            targetValue: 1800,
            condition: '累計学習時間 1800分（30時間）突破',
            coachMessage: '堂々たる30時間の金字塔！長い時間を自分自身の成長に注ぎ込んできた最高の証拠です。',
          },
        ],
      },
      {
        id: 'deep_focus',
        name: '集中フォーカス',
        icon: Zap,
        currentValue: maxSingleSessionMinutes,
        unit: '分',
        tiers: [
          {
            level: 1,
            title: 'クイックスパート（15分）',
            targetValue: 15,
            condition: '1回の勉強で15分以上集中する',
            coachMessage: '短時間集中！まとまった時間が取れない日でも、サッと始めて前進するスマートな戦い方です。',
          },
          {
            level: 2,
            title: 'ポモドーロ（30分）',
            targetValue: 30,
            condition: '1回の勉強で30分以上集中する',
            coachMessage: '30分の充実した没頭！適度な集中を保ちながら最大の学習効率を引き出しています。',
          },
          {
            level: 3,
            title: 'ディープゾーン（45分）',
            targetValue: 45,
            condition: '1回の勉強で45分以上集中する',
            coachMessage: '授業1コマ分の深い集中ゾーン！周りの音を忘れて勉強の世界に入り込めました。',
          },
          {
            level: 4,
            title: '無我の境地（60分）',
            targetValue: 60,
            condition: '1回の勉強で60分以上集中する',
            coachMessage: '1時間以上の圧倒的な没頭！ひとつの課題にじっくり向き合い切る最高峰の集中力です。',
          },
        ],
      },
      {
        id: 'calendar_footprints',
        name: 'カレンダーの足跡',
        icon: Calendar,
        currentValue: allDaysCount,
        unit: '日',
        tiers: [
          {
            level: 1,
            title: '歩きはじめ（3日）',
            targetValue: 3,
            condition: '通算3日以上勉強を記録する',
            coachMessage: 'カレンダーに最初の足跡がつきました。焦らずマイペースに積み重ねていきましょう。',
          },
          {
            level: 2,
            title: '習慣の芽（7日）',
            targetValue: 7,
            condition: '通算7日以上勉強を記録する',
            coachMessage: '通算1週間達成！途中で休む日があっても大丈夫。トータルで着実に前進しています。',
          },
          {
            level: 3,
            title: 'コツコツの達人（15日）',
            targetValue: 15,
            condition: '通算15日以上勉強を記録する',
            coachMessage: '半月分の足跡！休んでもまた戻ってこられるキミのしなやかな粘り強さが光っています。',
          },
          {
            level: 4,
            title: '月間マイスター（30日）',
            targetValue: 30,
            condition: '通算30日以上勉強を記録する',
            coachMessage: '通算30日の大台！1ヶ月分の努力を積み上げた、一生モノの自律学習スキルです。',
          },
        ],
      },
      {
        id: 'subject_palette',
        name: '学びのパレット',
        icon: Compass,
        currentValue: touchedSubjectsCount,
        unit: '教科',
        tiers: [
          {
            level: 1,
            title: '二刀流（2教科）',
            targetValue: 2,
            condition: '2教科以上で勉強を記録する',
            coachMessage: '得意な教科だけでなく、もう1つの分野にも挑戦！視野が広がり始めました。',
          },
          {
            level: 2,
            title: 'トリコロール（3教科）',
            targetValue: 3,
            condition: '3教科以上で勉強を記録する',
            coachMessage: '3教科に手を出してみる好奇心！頭のスイッチを切り替えながら楽しく学べます。',
          },
          {
            level: 3,
            title: '四方八方（4教科）',
            targetValue: 4,
            condition: '4教科以上で勉強を記録する',
            coachMessage: '4つの領域をバランスよく攻略！苦手科目からも逃げずに立ち向かう素晴らしい姿勢です。',
          },
          {
            level: 4,
            title: '五教科オールラウンダー',
            targetValue: 5,
            condition: '主要5教科（算数/国語/英語/理科/社会）すべて記録',
            coachMessage: '全5教科コンプリート達成！全方位にアンテナを張った万能の学習マスターです。',
          },
        ],
      },
      {
        id: 'teacher_bond',
        name: '先生との絆',
        icon: BadgeCheck,
        currentValue: allReviewedCount,
        unit: '回',
        tiers: [
          {
            level: 1,
            title: 'はじめましての印（1回）',
            targetValue: 1,
            condition: '先生から確認スタンプを1回もらう',
            coachMessage: '先生から最初の確認スタンプ！誰かが見守ってくれている安心感を力にしよう。',
          },
          {
            level: 2,
            title: '信頼のキャッチボール（3回）',
            targetValue: 3,
            condition: '先生から確認スタンプを3回もらう',
            coachMessage: '先生とのやりとりがリズミカルに続いています。日々の頑張りがしっかり届いています！',
          },
          {
            level: 3,
            title: '深まるパートナーシップ（7回）',
            targetValue: 7,
            condition: '先生から確認スタンプを7回もらう',
            coachMessage: '先生と生徒のワンチーム！困ったことも喜びも共有できる最高の関係です。',
          },
          {
            level: 4,
            title: '黄金の信頼関係（15回）',
            targetValue: 15,
            condition: '先生から確認スタンプを15回もらう',
            coachMessage: '15回のやりとりを重ねた黄金の絆！先生からの励ましを背に、どこまでも伸びていこう。',
          },
        ],
      },
    ];

    return badgeDefinitions.map((def) => {
      let currentLevel = 0;
      for (const tier of def.tiers) {
        if (def.currentValue >= tier.targetValue) {
          currentLevel = tier.level;
        } else {
          break;
        }
      }

      const currentTier = currentLevel > 0 ? def.tiers[currentLevel - 1] : null;
      const nextTier = currentLevel < def.tiers.length ? def.tiers[currentLevel] : null;

      let progressPercent = 100;
      let progressText = '★ MAX到達！';

      if (nextTier) {
        const prevTarget = currentTier ? currentTier.targetValue : 0;
        const curProgress = Math.max(0, def.currentValue - prevTarget);
        const neededForNext = nextTier.targetValue - prevTarget;
        progressPercent = Math.min(100, Math.max(0, Math.round((curProgress / neededForNext) * 100)));
        const remain = Math.max(0, nextTier.targetValue - def.currentValue);
        progressText = `${def.currentValue} / ${nextTier.targetValue}${def.unit}（あと${remain}${def.unit}）`;
      }

      return {
        ...def,
        currentLevel,
        maxLevel: def.tiers.length,
        currentTier,
        nextTier,
        progressPercent,
        progressText,
      };
    });
  }, [entries, streakInfo.longest]);

  // グラフ用最大値の計算
  const maxDayMinutes = useMemo(() => {
    const max = Math.max(
      ...periodEntries.map((d) => d.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0)),
      60
    );
    return Math.ceil(max / 30) * 30; // 30分刻みで丸める
  }, [periodEntries]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 期間選択＆ヘッダー */}
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary-soft text-primary-ink">
              <BarChart3 size={18} />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-ink m-0">
              統計
            </h2>
          </div>

          {/* 全期間データ読み込みボタン */}
          {!hasLoadedAll && onRequestAllData && (
            <button
              type="button"
              onClick={onRequestAllData}
                disabled={loadingAll}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover px-3 py-1.5 rounded-xl border border-primary/30 bg-primary-soft/60 hover:bg-primary-soft transition-all shadow-subtle w-fit active:scale-95"
            >
                {loadingAll ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Sparkles size={13} />}
                <span>{loadingAll ? '全期間を読み込み中…' : '全期間データを反映'}</span>
            </button>
          )}
        </div>

        {/* 期間切り替えボタン */}
        <div className="mt-4 pt-4 border-t border-line/60 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setPeriod('this-month')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border active:scale-95 ${
              period === 'this-month'
                ? 'bg-primary text-white border-primary shadow-subtle'
                : 'bg-card text-muted hover:text-ink hover:border-line-strong border-line shadow-subtle'
            }`}
          >
            今月
          </button>
          <button
            type="button"
            onClick={() => setPeriod('last-month')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border active:scale-95 ${
              period === 'last-month'
                ? 'bg-primary text-white border-primary shadow-subtle'
                : 'bg-card text-muted hover:text-ink hover:border-line-strong border-line shadow-subtle'
            }`}
          >
            先月
          </button>
          <button
            type="button"
            onClick={() => setPeriod('last-30')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border active:scale-95 ${
              period === 'last-30'
                ? 'bg-primary text-white border-primary shadow-subtle'
                : 'bg-card text-muted hover:text-ink hover:border-line-strong border-line shadow-subtle'
            }`}
          >
            直近30日間
          </button>
          <button
            type="button"
            onClick={() => setPeriod('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border active:scale-95 ${
              period === 'all'
                ? 'bg-primary text-white border-primary shadow-subtle'
                : 'bg-card text-muted hover:text-ink hover:border-line-strong border-line shadow-subtle'
            }`}
          >
            全期間
          </button>
        </div>
      </section>

      {/* エディトリアル・学習サマリー（主役と脇役の明確な階層設計） */}
      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6 shadow-card">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* 主役: 総学習時間 */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-line/60 pb-5 lg:pb-0 lg:pr-6">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">
              累計学習時間
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold font-numbers tracking-tight text-ink">
                {stats.totalMinutes >= 60 ? (
                  <>
                    <CountUp to={Math.floor(stats.totalMinutes / 60)} duration={0.7} trigger="load" />
                    <span className="text-base sm:text-lg font-bold text-muted ml-1 mr-2">時間</span>
                    <CountUp to={stats.totalMinutes % 60} duration={0.7} trigger="load" />
                    <span className="text-base sm:text-lg font-bold text-muted ml-1">分</span>
                  </>
                ) : (
                  <>
                    <CountUp to={stats.totalMinutes} duration={0.7} trigger="load" />
                    <span className="text-base sm:text-lg font-bold text-muted ml-1">分</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-muted mt-2 m-0 leading-relaxed">
              {stats.totalMinutes > 0
                ? '日々の小さな積み重ねが、見上げるほど大きな山になっています。'
                : 'まだ学習記録がありません。最初の一歩を記録してみましょう。'}
            </p>
          </div>

          {/* 脇役: 4分割メトリクス */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">勉強した日</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-ink tabular-nums">
                {stats.recordedDaysCount}
                <span className="text-xs font-normal text-muted ml-1">/ {stats.totalDaysInPeriod}日</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">記録率 {stats.studyRate}%</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">継続ストリーク</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-ink tabular-nums flex items-baseline gap-1">
                <span>{streakInfo.current}</span>
                <span className="text-xs font-normal text-muted">日</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">最長: {streakInfo.longest}日</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">勉強日の平均</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-ink tabular-nums">
                {stats.avgMinutesPerStudyDay}
                <span className="text-xs font-normal text-muted ml-1">分</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">全体 {stats.avgMinutesPerDay}分/日</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">先生の確認</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-emerald-600 dark:text-emerald-400 tabular-nums">
                {stats.reviewedDaysCount}
                <span className="text-xs font-normal text-muted ml-1">日分</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">
                {stats.recordedDaysCount > 0 ? `確認率 ${Math.round((stats.reviewedDaysCount / stats.recordedDaysCount) * 100)}%` : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 学習時間の推移チャート（日別バーグラフ・横揺れ防止コンテナ） */}
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-6 shadow-card w-full min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2 m-0">
              <BarChart3 size={17} className="text-primary" />
              <span>日別の学習時間推移</span>
            </h3>
            <p className="text-xs text-muted mt-0.5 m-0">
              各日のバーをホバー（タップ）すると、その日の合計学習時間を確認できます。
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary inline-block" />
              学習時間
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-reward inline-block" />
              先生確認済み
            </span>
          </div>
        </div>

        {/* ツールチップ情報 */}
        <div className="min-h-6 mb-2">
          {hoveredBar ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-primary-soft text-primary-ink text-xs font-bold shadow-subtle animate-in fade-in">
              <span>{hoveredBar.label}:</span>
              <span className="font-numbers">{hoveredBar.minutes} 分</span>
            </div>
          ) : (
            <span className="text-xs text-muted">日付を選択するとここに時間が表示されます</span>
          )}
        </div>

        {/* スクロール可能なチャートエリア（親を押し広げないレスポンシブ設計） */}
        <div className="w-full min-w-0 overflow-x-auto pb-2">
          <div
            className="flex items-end gap-1 sm:gap-2 h-44 pt-6 pb-6 border-b border-line/70"
            style={{ width: `${Math.max(100, periodEntries.length * 28)}px`, minWidth: '100%' }}
          >
            {periodEntries.map((dayEntry) => {
              const dayMins = dayEntry.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
              const heightPercent = maxDayMinutes > 0 ? Math.min(100, Math.round((dayMins / maxDayMinutes) * 100)) : 0;
              const isReviewed = Boolean(dayEntry.review?.reviewedAt);
              const isToday = dayEntry.date === today;
              const dayNum = Number(dayEntry.date.slice(8, 10));

              return (
                <div
                  key={dayEntry.date}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                  onMouseEnter={() =>
                    setHoveredBar({
                      date: dayEntry.date,
                      minutes: dayMins,
                      label: `${Number(dayEntry.date.slice(5, 7))}月${dayNum}日`,
                    })
                  }
                  onMouseLeave={() => setHoveredBar(null)}
                  onClick={() =>
                    setHoveredBar({
                      date: dayEntry.date,
                      minutes: dayMins,
                      label: `${Number(dayEntry.date.slice(5, 7))}月${dayNum}日`,
                    })
                  }
                >
                  {/* 分数ラベル（ホバー時または勉強時間がある場合） */}
                  {dayMins > 0 && (
                    <span className="text-[10px] font-numbers font-semibold text-muted mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {dayMins}m
                    </span>
                  )}

                  {/* 棒グラフ本体 */}
                  <div
                    className={`w-full max-w-[20px] rounded-t-md transition-all duration-300 ${
                      dayMins === 0
                        ? 'h-1 bg-line/60'
                        : isReviewed
                        ? 'bg-reward group-hover:brightness-110 shadow-subtle'
                        : 'bg-primary group-hover:brightness-110 shadow-subtle'
                    } ${isToday ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                    style={{ height: `${Math.max(4, heightPercent)}%` }}
                  />

                  {/* 日付ラベル */}
                  <span
                    className={`mt-2 text-[10px] sm:text-xs font-numbers leading-none ${
                      isToday ? 'font-bold text-primary' : 'text-muted'
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2カラム構成: 曜日別分布 & 教科別内訳 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 曜日別の学習傾向 */}
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-card">
          <h3 className="text-base font-bold text-ink flex items-center gap-2 mb-1 m-0">
            <Calendar size={17} className="text-primary" />
            <span>曜日ごとの学習傾向</span>
          </h3>
          <p className="text-xs text-muted mb-4 m-0">
            どの曜日に勉強時間が多く確保できているかの集計です。
          </p>

          <div className="flex flex-col gap-3">
            {dayOfWeekStats.distribution.map((dow, index) => {
              const percent = dayOfWeekStats.maxMins > 0 ? Math.round((dow.minutes / dayOfWeekStats.maxMins) * 100) : 0;
              const isWeekend = index === 0 || index === 6;

              return (
                <div key={dow.name} className="flex items-center gap-3 text-xs">
                  <span
                    className={`w-6 font-bold text-center ${
                      index === 0 ? 'text-reward-ink' : index === 6 ? 'text-primary-ink' : 'text-ink'
                    }`}
                  >
                    {dow.name}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-card-subtle border border-line/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isWeekend ? 'bg-reward' : 'bg-primary'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-numbers font-semibold text-muted tabular-nums">
                    {dow.minutes} 分
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 教科・学習テーマ別の内訳 */}
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-card">
          <h3 className="text-base font-bold text-ink flex items-center gap-2 mb-1 m-0">
            <PieChart size={17} className="text-primary" />
            <span>教科・学習テーマの内訳</span>
          </h3>
          <p className="text-xs text-muted mb-4 m-0">
            記録された勉強内容からキーワードを自動分類しています。
          </p>

          {subjectStats.list.length === 0 ? (
            <p className="text-xs sm:text-sm text-muted py-6 text-center">
              この期間の記録がありません。
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {subjectStats.list.map((sub) => {
                const percent = Math.round((sub.minutes / subjectStats.totalMinutes) * 100);
                return (
                  <div key={sub.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold flex items-center gap-1.5 text-ink">
                        <span className="size-2 rounded-full inline-block" style={{ backgroundColor: sub.color }} />
                        {sub.name}
                      </span>
                      <span className="text-muted font-numbers text-[11px]">
                        <strong className="text-ink">{sub.minutes}</strong> 分（{sub.count}回 / {percent}%）
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-card-subtle border border-line/40 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: sub.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* がんばり実績バッジ（育成型レベルアップシステム） */}
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-card space-y-4">
        {/* ヘッダー＆総合成長度 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2 m-0">
            <Trophy size={18} className="text-amber-700 dark:text-amber-400" />
            <span>実績バッジ</span>
          </h3>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/12 text-amber-800 dark:text-amber-300 border border-amber-500/25 font-numbers flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-700 dark:text-amber-400" />
              <span>
                Lv.{badges.reduce((sum, b) => sum + b.currentLevel, 0)}/{badges.length * 4}
              </span>
            </span>
          </div>
        </div>

        {/* 総合レベル進捗バー */}
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-card-subtle border border-line/50 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 transition-all duration-700"
              style={{
                width: `${Math.round((badges.reduce((sum, b) => sum + b.currentLevel, 0) / (badges.length * 4)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* 6つの育成カードグリッド */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
          {badges.map((badge) => {
            const BadgeIcon = badge.icon;
            const lvlStyle = LEVEL_STYLES[badge.currentLevel];
            const isMax = badge.currentLevel === badge.maxLevel;

            return (
              <GlareHover
                key={badge.id}
                width="100%"
                height="100%"
                borderRadius="16px"
                glareColor={badge.currentLevel >= 3 ? '#FDE68A' : '#FFFFFF'}
                glareOpacity={badge.currentLevel > 0 ? 0.35 : 0.12}
                glareAngle={-35}
                glareSize={45}
                transitionDuration={650}
                className="block"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBadge(badge)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedBadge(badge);
                    }
                  }}
                  className={`group relative w-full h-full rounded-2xl border p-4.5 flex flex-col justify-between transition-all duration-300 cursor-pointer select-none text-left focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    badge.currentLevel > 0
                      ? `${lvlStyle.border} ${lvlStyle.bg} ${lvlStyle.glow} hover:-translate-y-0.5 shadow-card`
                      : 'border-line bg-card hover:border-line-strong hover:bg-card-subtle/50'
                  }`}
                >
                {/* カード上部: テーマ名＆レベルピル */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-3">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border font-numbers ${lvlStyle.pill}`}>
                      {lvlStyle.label}
                    </span>
                    <span className="text-xs font-bold tracking-widest text-amber-700 dark:text-amber-400 font-numbers">
                      {lvlStyle.stars}
                    </span>
                  </div>

                  <div className="flex items-start gap-3.5">
                    {/* アイコン（メダル調リッチフレーム） */}
                    <span
                      className={`size-12 shrink-0 rounded-2xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110 shadow-sm ${
                        badge.currentLevel > 0
                          ? `${lvlStyle.iconBg} ${lvlStyle.iconColor}`
                          : 'bg-card-subtle border-line text-muted'
                      }`}
                      aria-hidden="true"
                    >
                      <BadgeIcon size={24} strokeWidth={badge.currentLevel > 0 ? 2.4 : 1.8} />
                    </span>

                    {/* テーマ名と現在の称号 */}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-ink truncate m-0">
                        {badge.name}
                      </h4>
                      <p className="text-xs font-bold text-primary mt-0.5 m-0 truncate">
                        {badge.currentTier ? badge.currentTier.title : '未点火（Lv.0）'}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 m-0 leading-tight line-clamp-1">
                        {isMax
                          ? '最高峰マスター到達！'
                          : badge.nextTier
                          ? `次: Lv.${badge.nextTier.level} ${badge.nextTier.title}`
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* カード下部: 経験値プログレスバー */}
                <div className="mt-4 pt-3 border-t border-line/40 space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-card-subtle border border-line/40 overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out shadow-xs ${lvlStyle.barColor}`}
                      style={{ width: `${Math.min(100, Math.max(5, badge.progressPercent))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted font-numbers pt-0.5">
                    <span className="font-medium">{isMax ? '育成完了' : `Lv.${badge.currentLevel} → Lv.${badge.currentLevel + 1}`}</span>
                    <span className="font-bold text-ink">{badge.progressText}</span>
                  </div>
                </div>
                </div>
              </GlareHover>
            );
          })}
        </div>
      </section>

      {/* バッジ育成ツリーモーダル（クリックでポップアップ表示） */}
      {selectedBadge && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl bg-card border border-line p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 閉じるボタン */}
            <button
              type="button"
              onClick={() => setSelectedBadge(null)}
              className="absolute top-5 right-5 p-2 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>

            {/* モーダルヘッダー */}
            <div className="flex items-start gap-4 pr-8">
              <span
                className={`size-16 shrink-0 rounded-2xl flex items-center justify-center border shadow-md ${
                  selectedBadge.currentLevel > 0
                    ? `${LEVEL_STYLES[selectedBadge.currentLevel].iconBg} ${LEVEL_STYLES[selectedBadge.currentLevel].iconColor}`
                    : 'bg-card-subtle border-line text-muted'
                }`}
              >
                {(() => {
                  const Icon = selectedBadge.icon;
                  return <Icon size={32} strokeWidth={2.4} />;
                })()}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${LEVEL_STYLES[selectedBadge.currentLevel].pill}`}>
                    {LEVEL_STYLES[selectedBadge.currentLevel].label}
                  </span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 font-numbers tracking-wider">
                    {LEVEL_STYLES[selectedBadge.currentLevel].stars}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-ink m-0 leading-tight">
                  {selectedBadge.name}
                </h3>
                <p className="text-xs text-muted mt-1 m-0">
                  現在の称号: <strong className="text-primary font-bold">{selectedBadge.currentTier ? selectedBadge.currentTier.title : '未点火（Lv.0）'}</strong>
                </p>
              </div>
            </div>

            {/* 進捗ゲージ */}
            <div className="rounded-2xl bg-card-subtle/80 border border-line/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Clock size={14} className="text-primary" />
                  <span>現在の育成状況</span>
                </span>
                <span className="font-numbers font-bold text-xs text-ink">
                  {selectedBadge.progressText}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-card border border-line/50 overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out shadow-xs ${LEVEL_STYLES[selectedBadge.currentLevel].barColor}`}
                  style={{ width: `${Math.min(100, Math.max(5, selectedBadge.progressPercent))}%` }}
                />
              </div>
            </div>

            {/* 進化ツリー（Lv.1〜Lv.4のロードマップ） */}
            <div className="space-y-2.5 pt-1">
              <h4 className="text-xs font-bold text-ink m-0 flex items-center gap-1.5">
                <Award size={15} className="text-amber-700 dark:text-amber-400" />
                <span>進化ロードマップ</span>
              </h4>

              <div className="space-y-2.5">
                {selectedBadge.tiers.map((tier) => {
                  const isUnlocked = selectedBadge.currentLevel >= tier.level;
                  const isCurrent = selectedBadge.currentLevel === tier.level;
                  const isNext = selectedBadge.currentLevel + 1 === tier.level;
                  const tierStyle = LEVEL_STYLES[tier.level];

                  return (
                    <div
                      key={tier.level}
                      className={`rounded-2xl border p-3.5 flex items-start gap-3.5 transition-all ${
                        isCurrent
                          ? `${tierStyle.border} ${tierStyle.bg} ring-2 ring-primary/30 shadow-subtle`
                          : isUnlocked
                          ? 'border-line/70 bg-card/80'
                          : isNext
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-line bg-card-subtle/60'
                      }`}
                    >
                      <span
                        className={`size-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold font-numbers border shadow-xs ${
                          isUnlocked
                            ? `${tierStyle.iconBg} ${tierStyle.iconColor}`
                            : isNext
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-card border-line text-muted'
                        }`}
                      >
                        {isUnlocked ? '✓' : `L${tier.level}`}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h5 className="text-xs font-bold text-ink m-0">
                            Lv.{tier.level} {tier.title}
                          </h5>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                              現在地
                            </span>
                          )}
                          {isNext && (
                            <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 shrink-0">
                              次の目標
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted mt-1 m-0">
                          {tier.condition}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 学習アドバイザーからのワンポイント */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Sparkles size={14} />
                <span>学習アドバイザーからの育成のヒント</span>
              </div>
              <p className="text-xs text-ink leading-relaxed m-0">
                {selectedBadge.currentTier
                  ? selectedBadge.currentTier.coachMessage
                  : selectedBadge.tiers[0].coachMessage}
              </p>
            </div>

            {/* モーダル下部閉じるボタン */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedBadge(null)}
                className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-hover active:scale-95 transition-all shadow-subtle"
              >
                とじる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
