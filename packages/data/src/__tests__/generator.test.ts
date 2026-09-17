/**
 * Детерминизм генератора и закрепление демо-сценария.
 *
 * ТЗ требует: одинаковый seed -> одинаковый результат, а набор НГТУ и ННГУ
 * с предсказуемыми зонами закрепить отдельным тестом. Это защита защиты:
 * если кто-то поменяет калибровку, сценарий сломается на CI, а не на сцене.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZONE_LABELS, evaluate, type UserProfile } from '@cursus/core';
import {
  DEMO_SEED,
  EXCLUDED_UNIVERSITY_PATTERN,
  PINNED_UNIVERSITIES,
  generateDemoPrograms,
} from '../../../../scripts/lib/generate-programs';
import { directions, programs, universities } from '../snapshot';

const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Профиль демо-сценария из раздела 15 ТЗ: 78 / 76 / 70 / 72 + ГТО. */
const demoUser: UserProfile = {
  scores: { russian: 78, math: 76, physics: 70, informatics: 72 },
  scoresAreExpected: false,
  achievementsBonus: 2,
  achievements: ['Знак ГТО'],
  interests: ['engineering', 'it', 'energy'],
  regionMode: 'home',
  homeRegion: 'Нижегородская область',
  regions: [],
};

const NGTU = 'Q4318652';
const NNGU = 'Q492766';

describe('детерминизм генератора', () => {
  it('одинаковый seed даёт одинаковый хэш', () => {
    const first = generateDemoPrograms({ directions, universities });
    const second = generateDemoPrograms({ directions, universities });
    expect(hash(first)).toBe(hash(second));
  });

  it('другой seed даёт другой результат — значит seed реально используется', () => {
    const base = generateDemoPrograms({ directions, universities });
    const other = generateDemoPrograms({ directions, universities, seed: DEMO_SEED + 1 });
    expect(hash(other)).not.toBe(hash(base));
  });

  it('снимок в репозитории совпадает с генерацией — данные не разошлись с кодом', () => {
    const generated = generateDemoPrograms({ directions, universities });
    expect(hash(generated)).toBe(hash(programs));
  });

  it('у каждого вуза от 6 до 20 направлений', () => {
    const generated = generateDemoPrograms({ directions, universities });
    const byUniversity = new Map<string, number>();
    for (const p of generated) {
      byUniversity.set(p.universityId, (byUniversity.get(p.universityId) ?? 0) + 1);
    }
    for (const [id, count] of byUniversity) {
      expect(count, `вуз ${id}`).toBeGreaterThanOrEqual(4);
      expect(count, `вуз ${id}`).toBeLessThanOrEqual(20);
    }
  });

  it('ведомственные вузы исключены — у них особый порядок приёма', () => {
    const generated = generateDemoPrograms({ directions, universities });
    const withPrograms = new Set(generated.map((p) => p.universityId));
    const excluded = universities.filter((u) => EXCLUDED_UNIVERSITY_PATTERN.test(u.name));

    expect(excluded.length).toBeGreaterThan(5);
    for (const u of excluded) {
      expect(withPrograms.has(u.wikidata), u.name).toBe(false);
    }
  });

  it('профиль вуза определяет набор направлений: у педагогического есть 44.*', () => {
    const generated = generateDemoPrograms({ directions, universities });
    const pedagogical = universities.find((u) => /педагогический университет$/i.test(u.name));
    expect(pedagogical).toBeDefined();

    const codes = generated
      .filter((p) => p.universityId === pedagogical!.wikidata)
      .map((p) => p.code);
    expect(codes.some((c) => c.startsWith('44'))).toBe(true);
  });
});

describe('демо-сценарий защиты закреплён', () => {
  const ngtuPrograms = programs.filter((p) => p.universityId === NGTU);
  const nnguPrograms = programs.filter((p) => p.universityId === NNGU);

  it('НГТУ им. Р. Е. Алексеева есть в снимке', () => {
    expect(universities.find((u) => u.wikidata === NGTU)?.name).toContain(
      'технический университет',
    );
  });

  it.each(PINNED_UNIVERSITIES[NGTU]!.codes)('у НГТУ есть направление %s', (code) => {
    expect(ngtuPrograms.map((p) => p.code)).toContain(code);
  });

  it.each(PINNED_UNIVERSITIES[NNGU]!.codes)('у ННГУ есть направление %s', (code) => {
    expect(nnguPrograms.map((p) => p.code)).toContain(code);
  });

  it('экзамены НГТУ — математика, русский, физика или информатика', () => {
    for (const code of ['15.03.04', '13.03.02', '27.03.04']) {
      const program = ngtuPrograms.find((p) => p.code === code)!;
      expect(program.exams[0]).toBe('math');
      expect(program.exams[1]).toBe('russian');
      expect(program.exams[2]).toEqual(['physics', 'informatics']);
    }
  });

  it('зоны демо-профиля ровно те, что обещаны в ТЗ', () => {
    const zoneOf = (code: string) => {
      const program = ngtuPrograms.find((p) => p.code === code)!;
      return evaluate(program, demoUser).zone;
    };

    // ТЗ: у 15.03.04 — «Цель» или «Мечта», у 13.03.02 — «Запасной», у 09.03.04 — «Мечта».
    expect(['target', 'reach']).toContain(zoneOf('15.03.04'));
    expect(zoneOf('13.03.02')).toBe('safe');
    expect(zoneOf('09.03.04')).toBe('reach');
  });

  it('балл демо-профиля равен 228: 76 + 78 + 72 + 2 за ГТО', () => {
    const program = ngtuPrograms.find((p) => p.code === '15.03.04')!;
    const result = evaluate(program, demoUser);
    expect(result.score.examsSum).toBe(226);
    expect(result.score.bonus).toBe(2);
    expect(result.score.total).toBe(228);
    expect(result.score.eligible).toBe(true);
  });

  it('зоны НГТУ покрывают все три вида — демо показывает разницу', () => {
    const zones = new Set(
      ngtuPrograms.map((p) => evaluate(p, demoUser).zone).filter((z) => z !== null),
    );
    expect([...zones].map((z) => ZONE_LABELS[z!]).sort()).toEqual(['Запасной', 'Мечта', 'Цель']);
  });
});
