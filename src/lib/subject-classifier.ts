export interface SubjectRule {
  name: string;
  color: string;
  pillClass: string;
  keywords: string[];
}

export interface ClassifiedSubject {
  name: string;
  color: string;
  pillClass: string;
  isOther: boolean;
}

export const SUBJECT_RULES: readonly SubjectRule[] = [
  {
    name: '数学',
    color: '#3B82F6',
    pillClass: 'bg-blue-500/12 text-blue-700 dark:bg-blue-400/18 dark:text-blue-300',
    keywords: ['算数', '数学', '計算', '図形', 'かけ算', 'わり算', '方程式', 'ドリル', '数研'],
  },
  {
    name: '国語',
    color: '#EF4444',
    pillClass: 'bg-rose-500/12 text-rose-700 dark:bg-rose-400/18 dark:text-rose-300',
    keywords: ['国語', '漢字', '読書', '作文', '音読', '本', '文学', '現代文', '古文'],
  },
  {
    name: '英語',
    color: '#10B981',
    pillClass: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/18 dark:text-emerald-300',
    keywords: ['英語', '英単語', 'リスニング', '文法', 'english', '単語'],
  },
  {
    name: '理科',
    color: '#8B5CF6',
    pillClass: 'bg-violet-500/12 text-violet-700 dark:bg-violet-400/18 dark:text-violet-300',
    keywords: ['理科', '実験', '生物', '化学', '物理', '地学', '観察'],
  },
  {
    name: '社会',
    color: '#F59E0B',
    pillClass: 'bg-amber-500/14 text-amber-800 dark:bg-amber-400/18 dark:text-amber-300',
    keywords: ['社会', '歴史', '地理', '公民', '日本史', '世界史', '地図'],
  },
  {
    name: '宿題',
    color: '#EC4899',
    pillClass: 'bg-pink-500/12 text-pink-700 dark:bg-pink-400/18 dark:text-pink-300',
    keywords: ['宿題', 'ワーク', 'プリント', '予習', '復習', '課題'],
  },
] as const;

export const OTHER_SUBJECT: ClassifiedSubject = {
  name: 'その他',
  color: '#9CA3AF',
  pillClass: 'bg-slate-500/10 text-slate-600 dark:bg-slate-400/14 dark:text-slate-300',
  isOther: true,
};

/**
 * 勉強内容テキストから教科・学習テーマを分類する（統計画面と同一ロジック）
 */
export function classifySubject(content: string): ClassifiedSubject {
  const text = (content || '').toLowerCase();
  for (const rule of SUBJECT_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      return {
        name: rule.name,
        color: rule.color,
        pillClass: rule.pillClass,
        isOther: false,
      };
    }
  }
  return OTHER_SUBJECT;
}
