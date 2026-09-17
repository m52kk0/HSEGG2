import type {
  BuildPlanOptions,
  Evaluation,
  Plan,
  PlanProgram,
  PlanUniversity,
  Program,
  University,
  UserProfile,
  Zone,
} from './types';
import { LIMITS } from './config/campaign';
import { ZONE_DESIRE_ORDER } from './config/zones';
import { evaluate } from './forecast';
import { allowedPrefixes, interestRank, ugsn } from './interests';
import { buildVerdict } from './verdict';
import { buildWarnings } from './warnings';
import { buildSimulation, likelyAdmissionLabel } from './simulation';

/** Регионы, в которых пользователь готов учиться. null — вся Россия. */
export function targetRegions(user: UserProfile): Set<string> | null {
  if (user.regionMode === 'any') return null;
  const set = new Set<string>();
  if (user.homeRegion) set.add(user.homeRegion);
  if (user.regionMode === 'several') for (const r of user.regions) set.add(r);
  return set.size === 0 ? null : set;
}

function desireIndex(zone: Zone): number {
  return ZONE_DESIRE_ORDER.indexOf(zone);
}

/** Оценённая программа, гарантированно попадающая в план. */
type Scored = Evaluation & { zone: Zone; margin: number };

function isScored(e: Evaluation): e is Scored {
  return e.zone !== null && e.margin !== null && e.score.eligible;
}

/**
 * Полезность направления при ОТБОРЕ (не при сортировке приоритетов).
 * Сначала «Цель» — там и решается конкурс, потом «Мечта», потом «Запасной».
 * Внутри зоны — то, что ближе к прогнозу проходного: слишком большой запас
 * означает, что абитуриент недоцелился.
 */
function selectionRank(item: Scored): number {
  if (item.zone === 'target') return 0;
  if (item.zone === 'reach') return 1;
  return 2;
}

function byUsefulness(a: Scored, b: Scored): number {
  return selectionRank(a) - selectionRank(b) || Math.abs(a.margin) - Math.abs(b.margin);
}

/** Сколько слотов отдать каждому интересу: первый интерес получает больше. */
function slotsPerInterest(interestCount: number, max: number): number[] {
  if (interestCount <= 1) return [max];
  const slots = new Array<number>(interestCount).fill(0);
  for (let i = 0; i < max; i += 1) {
    // Раздача по кругу, но первый интерес начинает каждый круг:
    // при 3 интересах и 5 слотах получается 2 / 2 / 1.
    slots[i % interestCount] = (slots[i % interestCount] ?? 0) + 1;
  }
  return slots;
}

/**
 * Шаг 4а: какие направления вуза вообще берём в план (их не больше 5).
 *
 * Слоты делятся между интересами в порядке важности, внутри интереса берётся
 * самое полезное. Затем план достраивается так, чтобы в нём точно была
 * «подушка» (safe) и, если она существует, одна «мечта» — мечтать бесплатно:
 * зачислят на высший приоритет, по которому абитуриент проходит.
 */
function selectPrograms(items: Scored[], user: UserProfile, max: number): Scored[] {
  const taken = new Set<string>();
  const chosen: Scored[] = [];

  const take = (item: Scored | undefined): boolean => {
    if (!item || taken.has(item.program.id) || chosen.length >= max) return false;
    taken.add(item.program.id);
    chosen.push(item);
    return true;
  };

  const rank = (item: Scored) => interestRank(item.program.code, user.interests);
  const interestCount = Math.max(user.interests.length, 1);

  const buckets = new Map<number, Scored[]>();
  for (const item of items) {
    const key = Math.min(rank(item), interestCount - 1);
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  for (const list of buckets.values()) list.sort(byUsefulness);

  const slots = slotsPerInterest(interestCount, max);
  for (let r = 0; r < slots.length; r += 1) {
    const bucket = buckets.get(r) ?? [];
    let placed = 0;
    for (const item of bucket) {
      if (placed >= (slots[r] ?? 0)) break;
      if (take(item)) placed += 1;
    }
  }

  // Незанятые слоты (у какого-то интереса не хватило направлений) — по полезности.
  for (const item of [...items].sort(byUsefulness)) {
    if (chosen.length >= max) break;
    take(item);
  }

  // Гарантии состава: хотя бы одна подушка и хотя бы одна мечта, если они есть.
  // Гарантированные направления защищаются, иначе вторая гарантия вытеснит первую.
  const protectedIds = new Set<string>();

  const ensure = (zone: Zone, pick: (a: Scored, b: Scored) => number) => {
    const present = chosen.filter((i) => i.zone === zone).sort(pick)[0];
    if (present) {
      protectedIds.add(present.program.id);
      return;
    }

    const candidate = [...items].filter((i) => i.zone === zone).sort(pick)[0];
    if (!candidate) return;

    if (take(candidate)) {
      protectedIds.add(candidate.program.id);
      return;
    }

    // Плана уже максимум направлений — вытесняем наименее полезное из незащищённых.
    let worstIndex = -1;
    for (let i = 0; i < chosen.length; i += 1) {
      const item = chosen[i]!;
      if (protectedIds.has(item.program.id)) continue;
      if (worstIndex < 0 || byUsefulness(item, chosen[worstIndex]!) > 0) worstIndex = i;
    }
    if (worstIndex < 0) return;

    taken.delete(chosen[worstIndex]!.program.id);
    chosen[worstIndex] = candidate;
    taken.add(candidate.program.id);
    protectedIds.add(candidate.program.id);
  };

  ensure('safe', (a, b) => a.margin - b.margin);
  ensure('reach', (a, b) => b.margin - a.margin);

  return chosen;
}

/**
 * Шаг 4б: порядок направлений внутри вуза — сначала совпадение с интересами
 * (порядок интересов важен), затем «желанность» зоны reach -> target -> safe.
 * Нумерация после сортировки и есть приоритет.
 */
function orderPrograms(items: Scored[], user: UserProfile): Scored[] {
  return [...items].sort((a, b) => {
    const ra = interestRank(a.program.code, user.interests);
    const rb = interestRank(b.program.code, user.interests);
    if (ra !== rb) return ra - rb;
    const da = desireIndex(a.zone);
    const db = desireIndex(b.zone);
    if (da !== db) return da - db;
    // При равных зонах выше тот, кто ближе к проходному: меньше запаса — желаннее.
    if (a.margin !== b.margin) return a.margin - b.margin;
    return a.program.code.localeCompare(b.program.code);
  });
}

function distanceKm(a: University, b: University): number | null {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat = toRad((a.lat + b.lat) / 2);
  const x = dLon * Math.cos(lat);
  return Math.round(6371 * Math.sqrt(dLat * dLat + x * x));
}

export interface UniversityCandidate {
  university: University;
  programs: Scored[];
  /** Оценка привлекательности вуза для этого профиля. Больше — лучше. */
  rating: number;
  hasSafe: boolean;
  hasTarget: boolean;
  hasReach: boolean;
}

export interface BuildPlanInput {
  user: UserProfile;
  programs: readonly Program[];
  universities: readonly University[];
}

/** Шаг 1-2: отфильтровать программы и собрать кандидатов-вузов с оценкой. */
export function collectCandidates({
  user,
  programs,
  universities,
}: BuildPlanInput): UniversityCandidate[] {
  const regions = targetRegions(user);
  const prefixes = allowedPrefixes(user.interests);
  const byId = new Map(universities.map((u) => [u.wikidata, u]));
  const homeUniversity = user.homeRegion
    ? (universities.find((u) => u.region === user.homeRegion && u.lat !== null) ?? null)
    : null;

  const grouped = new Map<string, Scored[]>();

  for (const program of programs) {
    const university = byId.get(program.universityId);
    if (!university) continue;
    if (regions && !regions.has(university.region)) continue;
    if (prefixes && !prefixes.has(ugsn(program.code))) continue;

    const evaluation = evaluate(program, user);
    if (!isScored(evaluation)) continue;

    const list = grouped.get(university.wikidata);
    if (list) list.push(evaluation);
    else grouped.set(university.wikidata, [evaluation]);
  }

  const candidates: UniversityCandidate[] = [];

  for (const [universityId, items] of grouped) {
    const university = byId.get(universityId)!;
    const hasSafe = items.some((i) => i.zone === 'safe');
    const hasTarget = items.some((i) => i.zone === 'target');
    const hasReach = items.some((i) => i.zone === 'reach');

    const matchedRanks = new Set(
      items
        .map((i) => interestRank(i.program.code, user.interests))
        .filter((r) => r < user.interests.length),
    );
    const bestInterestRank = Math.min(
      ...items.map((i) => interestRank(i.program.code, user.interests)),
    );
    const isHomeRegion = user.homeRegion !== null && university.region === user.homeRegion;
    const km = homeUniversity ? distanceKm(homeUniversity, university) : null;

    let rating = 0;
    if (hasSafe) rating += 100;
    if (hasTarget) rating += 60;
    if (hasReach) rating += 10;
    rating += Math.min(items.length, LIMITS.maxProgramsPerUniversity) * 6;
    rating += (user.interests.length - bestInterestRank) * 12;
    // Вуз, который закрывает все интересы сразу, полезнее узкопрофильного:
    // в одном заявлении получается разнообразный набор приоритетов.
    rating += matchedRanks.size * 15;
    // Есть направление ровно под твой балл — это самый сильный сигнал:
    // именно там конкурс решается, а не там, где запас в 40 баллов.
    const topInterestFit = items
      .filter((i) => interestRank(i.program.code, user.interests) === bestInterestRank)
      .reduce((best, i) => Math.min(best, Math.abs(i.margin)), Number.POSITIVE_INFINITY);
    if (Number.isFinite(topInterestFit)) rating += Math.max(0, 20 - topInterestFit);
    if (isHomeRegion) rating += 40;
    if (km !== null) rating += Math.max(0, 20 - km / 100);

    candidates.push({ university, programs: items, rating, hasSafe, hasTarget, hasReach });
  }

  return candidates.sort(
    (a, b) => b.rating - a.rating || a.university.name.localeCompare(b.university.name),
  );
}

/**
 * Шаг 3: выбрать до 5 вузов так, чтобы в плане было 1-2 вуза с safe
 * и хотя бы одна reach-программа, если она вообще существует
 * (мечтать бесплатно: зачислят на высший приоритет, по которому проходишь).
 */
export function selectUniversities(
  candidates: UniversityCandidate[],
  limit: number = LIMITS.maxUniversities,
): UniversityCandidate[] {
  const chosen: UniversityCandidate[] = [];
  const taken = new Set<string>();

  const take = (c: UniversityCandidate | undefined) => {
    if (!c || taken.has(c.university.wikidata) || chosen.length >= limit) return;
    taken.add(c.university.wikidata);
    chosen.push(c);
  };

  // Сначала гарантируем две «подушки» в разных вузах.
  const safe = candidates.filter((c) => c.hasSafe);
  take(safe[0]);
  take(safe[1]);
  // Затем мечту, если её ещё нет в наборе.
  if (!chosen.some((c) => c.hasReach)) take(candidates.find((c) => c.hasReach));
  // Остальное — по рейтингу.
  for (const c of candidates) take(c);

  return chosen.sort((a, b) => b.rating - a.rating);
}

/**
 * Сборка плана поступления по правилам 2026:
 * до 5 вузов на 5 направлений, приоритеты — внутри каждого вуза отдельно.
 */
export function buildPlan(
  user: UserProfile,
  programs: readonly Program[],
  universities: readonly University[],
  options: BuildPlanOptions = {},
): Plan {
  const maxUniversities = options.maxUniversities ?? LIMITS.maxUniversities;
  const maxPrograms = options.maxProgramsPerUniversity ?? LIMITS.maxProgramsPerUniversity;

  const candidates = collectCandidates({ user, programs, universities });
  const selected = selectUniversities(candidates, maxUniversities);

  const planUniversities: PlanUniversity[] = selected.map((c) => {
    const ordered = orderPrograms(selectPrograms(c.programs, user, maxPrograms), user);
    const withPriority: PlanProgram[] = ordered.map((item, index) => ({
      ...item,
      priority: index + 1,
    }));
    return {
      university: c.university,
      programs: withPriority,
      likelyAdmission: likelyAdmissionLabel(withPriority),
    };
  });

  return {
    universities: planUniversities,
    verdict: buildVerdict(planUniversities),
    warnings: buildWarnings({
      universities: planUniversities,
      availableUniversities: candidates.length,
    }),
    simulation: buildSimulation(planUniversities),
  };
}

/** Пересчёт вердикта, предупреждений и симуляции после ручной правки плана. */
export function recomputePlan(universities: PlanUniversity[], availableUniversities: number): Plan {
  const renumbered: PlanUniversity[] = universities.map((u) => {
    const programs = u.programs.map((p, index) => ({ ...p, priority: index + 1 }));
    return { university: u.university, programs, likelyAdmission: likelyAdmissionLabel(programs) };
  });

  return {
    universities: renumbered,
    verdict: buildVerdict(renumbered),
    warnings: buildWarnings({ universities: renumbered, availableUniversities }),
    simulation: buildSimulation(renumbered),
  };
}
