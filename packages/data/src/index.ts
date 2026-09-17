import type { Direction, Program, Region, University } from '@cursus/core';
import { ugsn } from '@cursus/core';
import type { DirectionContent, SalaryEntry, SimilarDirection } from './snapshot';
import {
  directions,
  directionsContent,
  programs,
  regions,
  salaries,
  universities,
} from './snapshot';

export * from './snapshot';

const directionByCode = new Map(directions.map((d) => [d.code, d]));
const universityById = new Map(universities.map((u) => [u.wikidata, u]));
const regionByName = new Map(regions.map((r) => [r.name, r]));
const programById = new Map(programs.map((p) => [p.id, p]));

const programsByUniversity = new Map<string, Program[]>();
const programsByCode = new Map<string, Program[]>();
const universitiesByRegion = new Map<string, University[]>();

for (const p of programs) {
  const byUni = programsByUniversity.get(p.universityId);
  if (byUni) byUni.push(p);
  else programsByUniversity.set(p.universityId, [p]);

  const byCode = programsByCode.get(p.code);
  if (byCode) byCode.push(p);
  else programsByCode.set(p.code, [p]);
}

for (const u of universities) {
  const list = universitiesByRegion.get(u.region);
  if (list) list.push(u);
  else universitiesByRegion.set(u.region, [u]);
}

export function getDirection(code: string): Direction | null {
  return directionByCode.get(code) ?? null;
}

export function getUniversity(id: string): University | null {
  return universityById.get(id) ?? null;
}

export function getRegion(name: string): Region | null {
  return regionByName.get(name) ?? null;
}

export function getProgram(id: string): Program | null {
  return programById.get(id) ?? null;
}

export function programsOfUniversity(universityId: string): Program[] {
  return programsByUniversity.get(universityId) ?? [];
}

export function programsOfCode(code: string): Program[] {
  return programsByCode.get(code) ?? [];
}

export function universitiesOfRegion(region: string): University[] {
  return universitiesByRegion.get(region) ?? [];
}

export function getContent(code: string): DirectionContent | null {
  return directionsContent[code] ?? null;
}

/** Зарплаты по региону с честным фолбэком на данные по всей России. */
export function getSalaries(
  code: string,
  region: string | null,
): { entry: SalaryEntry | null; fallbackToRussia: boolean } {
  if (region) {
    const byRegion = salaries[region]?.[code];
    if (byRegion && (byRegion.y1 || byRegion.y5)) return { entry: byRegion, fallbackToRussia: false };
  }
  const ru = salaries['RU']?.[code] ?? null;
  return { entry: ru, fallbackToRussia: region !== null && ru !== null };
}

export interface ProgramFilter {
  region?: string | null;
  regions?: readonly string[];
  code?: string | null;
  universityId?: string | null;
}

export function filterPrograms(filter: ProgramFilter): Program[] {
  const wanted = new Set<string>();
  if (filter.region) wanted.add(filter.region);
  for (const r of filter.regions ?? []) wanted.add(r);

  let source: Program[] = programs;
  if (filter.universityId) source = programsOfUniversity(filter.universityId);
  else if (filter.code) source = programsOfCode(filter.code);

  return source.filter((p) => {
    if (filter.code && p.code !== filter.code) return false;
    if (filter.universityId && p.universityId !== filter.universityId) return false;
    if (wanted.size > 0) {
      const u = universityById.get(p.universityId);
      if (!u || !wanted.has(u.region)) return false;
    }
    return true;
  });
}

const normalize = (s: string): string => s.toLowerCase().replaceAll('ё', 'е').trim();

/** Поиск направлений по коду и по названию — абитуриенты говорят и так, и так. */
export function searchDirections(query: string, limit = 30): Direction[] {
  const q = normalize(query);
  if (q.length === 0) return [];
  const digits = q.replace(/[^\d.]/g, '');

  const scored: { direction: Direction; score: number }[] = [];
  for (const d of directions) {
    const name = normalize(d.name);
    let score = -1;
    if (digits.length >= 2 && d.code.startsWith(digits)) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (normalize(d.group).includes(q)) score = 3;
    if (score >= 0) scored.push({ direction: d, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.direction.code.localeCompare(b.direction.code))
    .slice(0, limit)
    .map((s) => s.direction);
}

export function searchUniversities(query: string, limit = 10): University[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return universities
    .filter((u) => normalize(u.name).includes(q) || normalize(u.city).includes(q))
    .slice(0, limit);
}

/**
 * Похожие направления: сначала редакционный список, иначе — тот же УГСН.
 * `diff` для автоматических подбирается из данных вызывающей стороной.
 */
export function similarCodes(code: string, limit = 4): SimilarDirection[] {
  const editorial = getContent(code)?.similar;
  if (editorial && editorial.length > 0) return editorial.slice(0, limit);

  const prefix = ugsn(code);
  return directions
    .filter((d) => d.code !== code && ugsn(d.code) === prefix && programsByCode.has(d.code))
    .slice(0, limit)
    .map((d) => ({ code: d.code, diff: '' }));
}

export { SNAPSHOT_STATS as snapshotStats } from './stats';
export type { SnapshotStats } from './stats';
