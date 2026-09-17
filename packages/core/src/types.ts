/** Предметы ЕГЭ, которые встречаются в требованиях направлений. */
export const EXAM_SUBJECTS = [
  'russian',
  'math',
  'physics',
  'informatics',
  'chemistry',
  'biology',
  'history',
  'social',
  'literature',
  'geography',
  'foreign',
] as const;

export type ExamSubject = (typeof EXAM_SUBJECTS)[number];

/** Русские названия предметов — единственное место, где они задаются. */
export const SUBJECT_LABELS: Record<ExamSubject, string> = {
  russian: 'Русский язык',
  math: 'Математика (профиль)',
  physics: 'Физика',
  informatics: 'Информатика',
  chemistry: 'Химия',
  biology: 'Биология',
  history: 'История',
  social: 'Обществознание',
  literature: 'Литература',
  geography: 'География',
  foreign: 'Иностранный язык',
};

/** Короткое имя — для узких мест интерфейса (чипы, графики). */
export const SUBJECT_SHORT: Record<ExamSubject, string> = {
  russian: 'русский',
  math: 'математика',
  physics: 'физика',
  informatics: 'информатика',
  chemistry: 'химия',
  biology: 'биология',
  history: 'история',
  social: 'обществознание',
  literature: 'литература',
  geography: 'география',
  foreign: 'ин. язык',
};

/**
 * Требование по экзамену: либо конкретный предмет, либо выбор «физика или информатика».
 * Массив = альтернатива, берётся лучший из сданных.
 */
export type ExamRequirement = ExamSubject | ExamSubject[];

export type Zone = 'safe' | 'target' | 'reach';

export interface Direction {
  code: string;
  name: string;
  area: string;
  group: string;
}

export interface Region {
  name: string;
  trudvsemCode: string;
  trudvsemName: string;
}

export interface University {
  wikidata: string;
  name: string;
  city: string;
  region: string;
  site: string | null;
  lat: number | null;
  lon: number | null;
}

export interface Program {
  id: string;
  universityId: string;
  code: string;
  name: string;
  budgetPlaces: number;
  exams: ExamRequirement[];
  minScores: Partial<Record<ExamSubject, number>>;
  cutoffs: Partial<Record<'2023' | '2024' | '2025', number>>;
  /** true — проходные сгенерированы для прототипа, в интерфейсе метка «Демо». */
  isDemo: boolean;
}

/** Группы интересов из онбординга. Порядок выбора = важность. */
export const INTEREST_IDS = [
  'it',
  'engineering',
  'energy',
  'economics',
  'medicine',
  'education',
  'science',
  'humanities',
] as const;

export type InterestId = (typeof INTEREST_IDS)[number];

export type RegionMode = 'home' | 'several' | 'any';

export interface UserProfile {
  /** Баллы по сданным (или ожидаемым) предметам. */
  scores: Partial<Record<ExamSubject, number>>;
  /** true — баллы ожидаемые, ЕГЭ ещё не сдан. */
  scoresAreExpected: boolean;
  /** Сумма за индивидуальные достижения; в расчёте ограничивается 10. */
  achievementsBonus: number;
  /** Отмеченные достижения — нужны только для интерфейса. */
  achievements: string[];
  /** До 3 групп в порядке важности. */
  interests: InterestId[];
  regionMode: RegionMode;
  /** Свой регион (по названию из regions.json). */
  homeRegion: string | null;
  /** Дополнительные регионы при regionMode === 'several'. */
  regions: string[];
}

export interface ScoreResult {
  /** Сумма трёх экзаменов без бонуса. */
  examsSum: number;
  /** Учтённый бонус за достижения (≤ 10). */
  bonus: number;
  /** examsSum + bonus. */
  total: number;
  /** Какой предмет выбран по каждому требованию (null — не сдан). */
  picked: (ExamSubject | null)[];
  eligible: boolean;
  /** Причина, почему не подходит: «Не подходит: нет физики». Пусто, если подходит. */
  reasons: string[];
}

export interface CutoffForecast {
  /** Последний известный проходной. */
  lastCutoff: number | null;
  /** Годы, по которым есть данные. */
  years: number[];
  /** Клампленный тренд. */
  trend: number;
  /** Прогноз проходного на текущую кампанию. */
  predictedCutoff: number | null;
}

export interface Evaluation {
  program: Program;
  score: ScoreResult;
  forecast: CutoffForecast;
  /** examScore − predictedCutoff. null, если проходных нет вообще. */
  margin: number | null;
  zone: Zone | null;
}

export interface PlanProgram extends Evaluation {
  /** Приоритет внутри вуза, начиная с 1. */
  priority: number;
  zone: Zone;
  margin: number;
}

export interface PlanUniversity {
  university: University;
  programs: PlanProgram[];
  /** «Скорее всего зачислят на: …» или null, если ни на что не проходит. */
  likelyAdmission: string | null;
}

export type VerdictLevel = 'good' | 'warning' | 'danger' | 'empty';

export interface Verdict {
  level: VerdictLevel;
  /** Крупная фраза сверху экрана. */
  title: string;
  /** Одна строка пояснения: «2 вуза с запасом, 1 — впритык». */
  detail: string;
}

export type WarningId =
  | 'no_safe'
  | 'safe_above_reach'
  | 'few_universities'
  | 'few_programs'
  | 'several_regions';

export interface PlanWarning {
  id: WarningId;
  text: string;
  /** Подпись кнопки-действия, если действие есть. */
  actionLabel?: string;
  /** Вуз, к которому относится предупреждение. */
  universityId?: string;
}

export interface SimulationStep {
  priority: number;
  programName: string;
  code: string;
  zone: Zone;
  /** «вероятно не пройдёшь» / «на грани» / «проходишь». */
  outcome: string;
}

export interface UniversitySimulation {
  universityId: string;
  universityName: string;
  steps: SimulationStep[];
  /** «Скорее всего зачислят на: …» либо честное «ни на одно из выбранных». */
  result: string;
}

export interface Plan {
  universities: PlanUniversity[];
  verdict: Verdict;
  warnings: PlanWarning[];
  simulation: UniversitySimulation[];
}

export interface BuildPlanOptions {
  /** Сколько вузов было доступно после фильтрации — для предупреждения «можно ещё». */
  maxUniversities?: number;
  maxProgramsPerUniversity?: number;
}
