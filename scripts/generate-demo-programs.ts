/**
 * Генератор демо-программ. Детерминирован: фиксированный seed -> одинаковый файл.
 *
 * Открытого API с проходными баллами не существует, поэтому проходные в прототипе —
 * тестовые. Каждая цифра помечена isDemo: true и показывается в интерфейсе с меткой «Демо».
 * Реальные значения вносятся вручную в data/snapshot/programs.real.json и перекрывают демо.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Direction, ExamRequirement, ExamSubject, Program, University } from '@cursus/core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SNAPSHOT = resolve(ROOT, 'data/snapshot');

const SEED = 20260917;

/** mulberry32 — маленький детерминированный PRNG. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(SNAPSHOT, file), 'utf8')) as T;

const directions = read<Direction[]>('directions.json');
const universities = read<University[]>('universities.json');

const byPrefix = new Map<string, Direction[]>();
for (const d of directions) {
  const key = d.code.slice(0, 2);
  const list = byPrefix.get(key);
  if (list) list.push(d);
  else byPrefix.set(key, [d]);
}
const byCode = new Map(directions.map((d) => [d.code, d]));

/** Ведомственные вузы — особый порядок приёма, в план не попадают. */
const EXCLUDE = /МВД|МЧС|ФСБ|ФСО|ФСИН|Росгвард|военн|Военн|пограничн|таможенн|прокуратур|Следственн|разведк|ракетных войск|Генеральн(ого|ой) штаб|артиллерийск|авиационн(ый|ая) (военн|инженерн)/;

type Profile =
  | 'technical'
  | 'pedagogical'
  | 'medical'
  | 'economic'
  | 'agrarian'
  | 'law'
  | 'arts'
  | 'transport'
  | 'linguistic'
  | 'classic';

/** Профиль вуза угадывается по названию — так поступил бы и человек. */
function detectProfile(name: string): Profile {
  const n = name.toLowerCase();
  if (/(политехн|техническ|технологическ|инженерн|машиностро|авиацион|станкоинстру|энергетическ|нефт|горн|строительн|архитектурно)/.test(n))
    return 'technical';
  if (/(транспорт|железнодорож|путей сообщения|водных коммуникаций|морск|флот|гражданской авиации|автомобильно)/.test(n))
    return 'transport';
  if (/(педагогическ|учитель|просвещения)/.test(n)) return 'pedagogical';
  if (/(медицинск|здравоохранени|фармацевтическ|стоматолог)/.test(n)) return 'medical';
  if (/(экономическ|финансов|управления|менеджмент|народного хозяйства|торгово|коммерч|бизнес|статистик)/.test(n))
    return 'economic';
  if (/(аграрн|сельскохозяйствен|агроинженер|землеустройств|ветеринарн|агротехнолог|лесотехническ|рыбопромышл|пищев)/.test(n))
    return 'agrarian';
  if (/(юридическ|права|правосуди|юстици)/.test(n)) return 'law';
  if (/(лингвистическ|иностранных языков|языковой|переводч)/.test(n)) return 'linguistic';
  if (/(искусств|консерватор|культуры|театральн|художествен|кинематограф|музык|хореограф|дизайна)/.test(n))
    return 'arts';
  return 'classic';
}

/** Веса УГСН по профилю вуза: больше вес — чаще направление у такого вуза. */
const PROFILE_WEIGHTS: Record<Profile, Record<string, number>> = {
  technical: { '09': 6, '15': 6, '13': 5, '27': 4, '08': 4, '11': 4, '12': 3, '22': 3, '16': 2, '18': 3, '20': 3, '21': 3, '23': 3, '24': 2, '01': 2, '02': 2, '10': 2, '38': 2, '29': 1, '19': 2, '28': 1, '17': 1, '26': 1 },
  transport: { '23': 6, '26': 5, '25': 4, '24': 4, '09': 4, '15': 3, '27': 3, '08': 3, '20': 3, '38': 3, '11': 2, '13': 2, '01': 1 },
  pedagogical: { '44': 8, '45': 3, '49': 3, '01': 2, '02': 2, '03': 2, '04': 2, '05': 2, '06': 2, '37': 2, '46': 2, '39': 1, '09': 1, '51': 1 },
  medical: { '31': 7, '32': 4, '33': 4, '34': 3, '30': 3, '06': 2, '04': 1, '37': 1, '49': 1 },
  economic: { '38': 8, '40': 4, '09': 3, '01': 2, '41': 2, '42': 2, '43': 3, '39': 2, '37': 2, '10': 1 },
  agrarian: { '35': 7, '36': 5, '19': 4, '20': 3, '21': 2, '23': 2, '38': 3, '06': 2, '05': 2, '04': 1 },
  law: { '40': 8, '38': 3, '41': 2, '39': 2, '37': 2, '46': 1 },
  linguistic: { '45': 8, '41': 3, '42': 3, '44': 3, '46': 2, '43': 2, '40': 2, '38': 2, '51': 2, '37': 1 },
  arts: { '50': 5, '51': 4, '52': 4, '53': 4, '54': 5, '55': 2, '42': 3, '45': 2, '44': 2, '07': 2 },
  classic: { '01': 3, '02': 3, '03': 3, '04': 3, '05': 3, '06': 3, '09': 4, '38': 4, '40': 3, '44': 3, '45': 3, '46': 3, '37': 2, '39': 2, '41': 2, '42': 2, '11': 2, '10': 2, '31': 1, '49': 1, '43': 2, '51': 1, '47': 1, '19': 1 },
};

/** Популярность УГСН — двигает проходной вверх. */
const POPULARITY: Record<string, number> = {
  '09': 22, '02': 20, '10': 18, '01': 10, '31': 24, '30': 14, '33': 12, '32': 8,
  '38': 14, '40': 16, '41': 18, '42': 14, '45': 12, '37': 12, '11': 8, '27': 8,
  '15': 4, '13': 6, '14': 8, '12': 4, '08': 2, '21': 6, '23': 2, '35': -6, '36': -6,
  '44': -4, '49': -6, '20': 0, '19': 0, '05': 0, '06': 4, '03': 4, '04': 2, '46': 6,
  '47': 2, '48': -4, '50': 4, '51': 0, '52': 6, '53': 6, '54': 6, '55': 2, '43': 4,
  '39': 2, '34': -2, '16': 2, '17': 2, '18': 0, '22': 0, '24': 4, '25': 4, '26': 0,
  '28': 6, '29': 0, '07': 8,
};

const CAPITAL_BONUS: Record<string, number> = { Москва: 34, 'Санкт-Петербург': 26 };
const BIG_CITY_BONUS = 10;
const BIG_REGIONS = new Set([
  'Республика Татарстан', 'Новосибирская область', 'Свердловская область',
  'Нижегородская область', 'Томская область', 'Республика Башкортостан',
  'Краснодарский край', 'Ростовская область', 'Самарская область',
]);

/** «Статусность» вуза: федеральные и национальные исследовательские — выше проходной. */
function statusBonus(name: string): number {
  const n = name.toLowerCase();
  if (/(московский государственный университет имени м\.?\s?в\.?\s?ломоносова|санкт-петербургский государственный университет$)/.test(n))
    return 30;
  if (/(национальный исследовательский|высшая школа экономики|мфти|физико-технический институт|мгимо|бауман|итмо|мифи)/.test(n))
    return 22;
  if (/(федеральный университет)/.test(n)) return 14;
  if (/(национальный исследовательский технологический|исследовательский)/.test(n)) return 10;
  if (/(государственный университет)$/.test(n)) return 6;
  return 0;
}

/** Наборы экзаменов по УГСН. Один из предметов может идти с альтернативой. */
const EXAM_SETS: Record<string, ExamRequirement[]> = {
  eng: ['math', 'russian', ['physics', 'informatics']],
  it: ['math', 'russian', ['informatics', 'physics']],
  math: ['math', 'russian', ['informatics', 'physics']],
  natural: ['math', 'russian', ['chemistry', 'biology']],
  bio: ['biology', 'russian', ['chemistry', 'math']],
  med: ['biology', 'russian', ['chemistry', 'math']],
  econ: ['math', 'russian', ['social', 'informatics']],
  law: ['russian', 'history', ['social', 'foreign']],
  human: ['russian', 'history', ['social', 'literature']],
  lang: ['russian', 'foreign', ['history', 'literature']],
  pedagogy: ['russian', 'social', ['math', 'biology']],
  sport: ['russian', 'biology', ['social', 'math']],
  arts: ['russian', 'literature', ['history', 'social']],
  agro: ['math', 'russian', ['biology', 'chemistry']],
  geo: ['math', 'russian', ['geography', 'physics']],
};

const EXAMS_BY_PREFIX: Record<string, keyof typeof EXAM_SETS> = {
  '01': 'math', '02': 'it', '03': 'eng', '04': 'natural', '05': 'geo', '06': 'bio',
  '07': 'arts', '08': 'eng', '09': 'it', '10': 'it', '11': 'eng', '12': 'eng',
  '13': 'eng', '14': 'eng', '15': 'eng', '16': 'eng', '17': 'eng', '18': 'natural',
  '19': 'natural', '20': 'eng', '21': 'geo', '22': 'natural', '23': 'eng', '24': 'eng',
  '25': 'eng', '26': 'eng', '27': 'eng', '28': 'eng', '29': 'eng',
  '30': 'med', '31': 'med', '32': 'med', '33': 'med', '34': 'med',
  '35': 'agro', '36': 'agro', '37': 'pedagogy', '38': 'econ', '39': 'human',
  '40': 'law', '41': 'law', '42': 'human', '43': 'econ', '44': 'pedagogy',
  '45': 'lang', '46': 'human', '47': 'human', '48': 'human', '49': 'sport',
  '50': 'arts', '51': 'arts', '52': 'arts', '53': 'arts', '54': 'arts', '55': 'arts',
};

function examSetFor(code: string): ExamRequirement[] {
  const key = EXAMS_BY_PREFIX[code.slice(0, 2)] ?? 'human';
  return EXAM_SETS[key]!.map((r) => (Array.isArray(r) ? [...r] : r));
}

function flatten(exams: ExamRequirement[]): ExamSubject[] {
  return exams.flatMap((e) => (Array.isArray(e) ? e : [e]));
}

/**
 * Демо-сценарий защиты закреплён вручную: НГТУ им. Р. Е. Алексеева и ННГУ
 * им. Лобачевского всегда получают эти направления, а проходные подобраны так,
 * чтобы зоны профиля из ТЗ (226 баллов + 2 за ГТО) были предсказуемыми.
 */
const PINNED: Record<string, { codes: string[]; cutoffs: Record<string, [number, number, number]> }> = {
  // НГТУ им. Р. Е. Алексеева
  Q4318652: {
    codes: ['15.03.04', '13.03.02', '27.03.04', '09.03.01', '09.03.04', '13.03.01'],
    cutoffs: {
      '15.03.04': [214, 220, 225], // прогноз 231 -> margin -3 -> Цель
      '13.03.02': [200, 203, 206], // прогноз 209 -> margin +19 -> Запасной
      '27.03.04': [216, 221, 224], // прогноз 228 -> margin 0 -> Цель
      '09.03.01': [228, 232, 236], // прогноз 240 -> margin -12 -> Мечта
      '09.03.04': [236, 241, 245], // прогноз 250 -> margin -22 -> Мечта
      '13.03.01': [186, 190, 194], // прогноз 198 -> margin +30 -> Запасной с большим запасом
    },
  },
  // ННГУ им. Н. И. Лобачевского
  Q492766: {
    codes: ['09.03.01', '09.03.04', '02.03.01', '01.03.02'],
    cutoffs: {
      '09.03.01': [234, 239, 243], // прогноз 248 -> Мечта
      '09.03.04': [240, 245, 250], // прогноз 255 -> Мечта
      '02.03.01': [222, 226, 229], // прогноз 233 -> Цель
      '01.03.02': [204, 208, 211], // прогноз 214 -> margin +14 -> Запасной
    },
  },
};

function weightedPick(
  weights: Record<string, number>,
  random: () => number,
  used: Set<string>,
): string | null {
  const entries = Object.entries(weights).filter(([prefix]) => byPrefix.has(prefix));
  const total = entries.reduce((acc, [prefix, w]) => acc + (used.has(prefix) ? w / 3 : w), 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (const [prefix, w] of entries) {
    roll -= used.has(prefix) ? w / 3 : w;
    if (roll <= 0) return prefix;
  }
  return entries[entries.length - 1]![0];
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function main(): void {
  const random = makeRandom(SEED);
  const programs: Program[] = [];
  const pool = universities
    .filter((u) => !EXCLUDE.test(u.name))
    .slice()
    .sort((a, b) => a.wikidata.localeCompare(b.wikidata));

  for (const university of pool) {
    const profile = detectProfile(university.name);
    const weights = PROFILE_WEIGHTS[profile];
    const regionBonus =
      (CAPITAL_BONUS[university.region] ?? 0) + (BIG_REGIONS.has(university.region) ? BIG_CITY_BONUS : 0);
    const status = statusBonus(university.name);

    const pinned = PINNED[university.wikidata];
    const codes = new Set<string>(pinned?.codes ?? []);
    const usedPrefixes = new Set<string>([...codes].map((c) => c.slice(0, 2)));
    // У вузов демо-сценария набор ровно закреплённый: сценарий защиты должен
    // проходиться одинаково при каждой генерации.
    const target = pinned ? codes.size : 6 + Math.floor(random() * 15); // 6-20 направлений

    let guard = 0;
    while (codes.size < Math.max(target, codes.size) && guard < 200) {
      guard += 1;
      const prefix = weightedPick(weights, random, usedPrefixes);
      if (!prefix) break;
      const list = byPrefix.get(prefix)!;
      const direction = list[Math.floor(random() * list.length)]!;
      if (codes.has(direction.code)) continue;
      codes.add(direction.code);
      usedPrefixes.add(prefix);
    }

    for (const code of [...codes].sort()) {
      const direction = byCode.get(code);
      if (!direction) continue;
      const exams = examSetFor(code);
      const subjects = flatten(exams);
      const minScores: Partial<Record<ExamSubject, number>> = {};
      for (const subject of subjects) {
        minScores[subject] = 39 + Math.floor(random() * 7); // 39-45
      }

      const pinnedCutoffs = pinned?.cutoffs[code];
      let cutoffs: Program['cutoffs'];

      if (pinnedCutoffs) {
        cutoffs = { '2023': pinnedCutoffs[0], '2024': pinnedCutoffs[1], '2025': pinnedCutoffs[2] };
      } else {
        // Калибровка: медиана прогноза ~221 балл, чтобы у профиля из демо-сценария
        // (228 баллов) набиралась осмысленная смесь зон, а не одни «Запасные».
        const base =
          178 +
          (POPULARITY[code.slice(0, 2)] ?? 0) +
          regionBonus +
          status +
          Math.floor(random() * 51);
        const c2025 = Math.min(290, Math.max(150, Math.round(base)));
        // Тренд за 3 года: от -10 до +15 суммарно.
        const total = -10 + Math.round(random() * 25);
        const c2023 = Math.min(290, Math.max(150, c2025 - total));
        const c2024 = Math.min(290, Math.max(150, Math.round((c2023 + c2025) / 2 + (random() < 0.5 ? -1 : 1))));
        cutoffs = { '2023': c2023, '2024': c2024, '2025': c2025 };
      }

      programs.push({
        id: `${university.wikidata}-${code}`,
        universityId: university.wikidata,
        code,
        name: direction.name,
        budgetPlaces: round(10 + Math.floor(random() * 111), 5) || 10,
        exams,
        minScores,
        cutoffs,
        isDemo: true,
      });
    }
  }

  const out = resolve(SNAPSHOT, 'programs.demo.json');
  writeFileSync(out, JSON.stringify(programs), 'utf8');

  const realPath = resolve(SNAPSHOT, 'programs.real.json');
  if (!existsSync(realPath)) writeFileSync(realPath, '[]\n', 'utf8');

  console.info(
    `programs.demo.json: ${programs.length} программ у ${pool.length} вузов (seed ${SEED}).`,
  );
}

main();
