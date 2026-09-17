/**
 * Валидация снимка данных. Снимок — это вход всего продукта: если в нём
 * появится вуз с неизвестным регионом или направление без экзаменов,
 * интерфейс покажет пустоту, а не ошибку. Поэтому проверяем схемой.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EXAM_SUBJECTS } from '@cursus/core';
import {
  SNAPSHOT_DATE,
  directions,
  directionsContent,
  programs,
  regions,
  salaries,
  universities,
} from '../snapshot';
import { snapshotStats } from '../index';

const subject = z.enum(EXAM_SUBJECTS);
const code = z.string().regex(/^\d{2}\.\d{2}\.\d{2}$/, 'код направления вида 15.03.04');

const directionSchema = z.object({
  code,
  name: z.string().min(2),
  area: z.string().min(2),
  group: z.string().min(2),
});

const regionSchema = z.object({
  name: z.string().min(2),
  trudvsemCode: z.string().regex(/^\d{13}$/, '13-значный код API «Работа России»'),
  trudvsemName: z.string().min(2),
});

const universitySchema = z.object({
  wikidata: z.string().regex(/^Q\d+$/),
  name: z.string().min(2),
  city: z.string().min(1),
  region: z.string().min(2),
  site: z.string().nullable(),
  lat: z.number().min(40).max(82).nullable(),
  lon: z.number().min(19).max(191).nullable(),
});

const programSchema = z.object({
  id: z.string().min(3),
  universityId: z.string().regex(/^Q\d+$/),
  code,
  name: z.string().min(2),
  budgetPlaces: z.number().int().min(1).max(500),
  exams: z.array(z.union([subject, z.array(subject).min(2)])).length(3),
  minScores: z.record(subject, z.number().int().min(0).max(100)),
  cutoffs: z
    .object({
      '2023': z.number().int().min(100).max(310).optional(),
      '2024': z.number().int().min(100).max(310).optional(),
      '2025': z.number().int().min(100).max(310).optional(),
    })
    .strict(),
  isDemo: z.boolean(),
});

const contentSchema = z.object({
  learn: z.string().min(40).optional(),
  jobs: z.array(z.string().min(3)).min(1).max(5).optional(),
  vacancyQuery: z.string().min(3).optional(),
  similar: z
    .array(z.object({ code, diff: z.string().min(5) }))
    .min(1)
    .max(4)
    .optional(),
});

describe('снимок валиден по схемам', () => {
  it('directions.json', () => {
    expect(() => z.array(directionSchema).min(200).parse(directions)).not.toThrow();
  });

  it('regions.json', () => {
    expect(() => z.array(regionSchema).min(80).parse(regions)).not.toThrow();
  });

  it('universities.json', () => {
    expect(() => z.array(universitySchema).min(500).parse(universities)).not.toThrow();
  });

  it('programs.demo.json + programs.real.json', () => {
    expect(() => z.array(programSchema).min(1000).parse(programs)).not.toThrow();
  });

  it('directions.ru.json', () => {
    expect(() => z.record(code, contentSchema).parse(directionsContent)).not.toThrow();
  });

  it('дата снимка — валидная дата', () => {
    expect(SNAPSHOT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(SNAPSHOT_DATE).getTime())).toBe(false);
  });
});

describe('ссылочная целостность', () => {
  it('регион каждого вуза есть в regions.json', () => {
    const known = new Set(regions.map((r) => r.name));
    const broken = universities.filter((u) => !known.has(u.region)).map((u) => u.name);
    expect(broken).toEqual([]);
  });

  it('у каждого вуза определён регион и город', () => {
    const broken = universities.filter((u) => !u.region || !u.city);
    expect(broken).toEqual([]);
  });

  it('код каждой программы есть в справочнике направлений', () => {
    const known = new Set(directions.map((d) => d.code));
    const broken = [...new Set(programs.filter((p) => !known.has(p.code)).map((p) => p.code))];
    expect(broken).toEqual([]);
  });

  it('вуз каждой программы есть в universities.json', () => {
    const known = new Set(universities.map((u) => u.wikidata));
    const broken = [
      ...new Set(programs.filter((p) => !known.has(p.universityId)).map((p) => p.universityId)),
    ];
    expect(broken).toEqual([]);
  });

  it('идентификаторы программ уникальны', () => {
    const ids = programs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('у каждой программы есть минимум по каждому нужному предмету', () => {
    const broken = programs.filter((p) =>
      p.exams.some((requirement) =>
        (Array.isArray(requirement) ? requirement : [requirement]).some(
          (s) => p.minScores[s] === undefined,
        ),
      ),
    );
    expect(broken).toEqual([]);
  });

  it('коды направлений в редакционных текстах существуют', () => {
    const known = new Set(directions.map((d) => d.code));
    const broken = Object.keys(directionsContent).filter((c) => !known.has(c));
    expect(broken).toEqual([]);
  });

  it('похожие направления в редакционных текстах существуют', () => {
    const known = new Set(directions.map((d) => d.code));
    const broken: string[] = [];
    for (const [from, content] of Object.entries(directionsContent)) {
      for (const similar of content.similar ?? []) {
        if (!known.has(similar.code)) broken.push(`${from} -> ${similar.code}`);
        if (similar.code === from) broken.push(`${from} ссылается на себя`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('редакционных текстов не меньше 30, как требует ТЗ', () => {
    const withLearn = Object.values(directionsContent).filter((c) => c.learn).length;
    expect(withLearn).toBeGreaterThanOrEqual(30);
  });

  it('зарплаты есть по России и по регионам из справочника', () => {
    expect(salaries['RU']).toBeDefined();
    const known = new Set([...regions.map((r) => r.name), 'RU']);
    const broken = Object.keys(salaries).filter((r) => !known.has(r));
    expect(broken).toEqual([]);
  });
});

describe('проходные баллы', () => {
  it('в прототипе все демо — значит каждая цифра получит метку «Демо»', () => {
    // programs.real.json пока пуст: реальные значения вносятся вручную.
    expect(programs.every((p) => p.isDemo)).toBe(true);
  });

  it('проходные лежат в правдоподобном диапазоне', () => {
    for (const p of programs) {
      for (const value of Object.values(p.cutoffs)) {
        expect(value).toBeGreaterThanOrEqual(150);
        expect(value).toBeLessThanOrEqual(290);
      }
    }
  });

  it('у каждой программы известен хотя бы один год', () => {
    const broken = programs.filter((p) => Object.keys(p.cutoffs).length === 0);
    expect(broken).toEqual([]);
  });
});

describe('статистика снимка', () => {
  it('совпадает с содержимым', () => {
    expect(snapshotStats.directions).toBe(directions.length);
    expect(snapshotStats.universities).toBe(universities.length);
    expect(snapshotStats.regions).toBe(regions.length);
    expect(snapshotStats.programs).toBe(programs.length);
  });
});
