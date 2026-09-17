import { describe, expect, it } from 'vitest';
import { buildVerdict, pointsWord, programsWord, universitiesWord } from '../verdict';
import { buildWarnings } from '../warnings';
import { buildSimulation, likelyAdmissionLabel } from '../simulation';
import type { PlanProgram, PlanUniversity, Zone } from '../types';
import { programWithMargin, university } from './fixtures';

function planUniversity(
  id: string,
  zones: { zone: Zone; margin: number; code?: string }[],
): PlanUniversity {
  const programs: PlanProgram[] = zones.map((z, index) => {
    const program = programWithMargin(z.margin, {
      id: `${id}-${index}`,
      universityId: id,
      code: z.code ?? '15.03.04',
    });
    return {
      program,
      score: { examsSum: 226, bonus: 2, total: 228, picked: [], eligible: true, reasons: [] },
      forecast: {
        lastCutoff: 228 - z.margin,
        years: [2025],
        trend: 0,
        predictedCutoff: 228 - z.margin,
      },
      margin: z.margin,
      zone: z.zone,
      priority: index + 1,
    };
  });

  return {
    university: university({ wikidata: id, name: `Вуз ${id}` }),
    programs,
    likelyAdmission: likelyAdmissionLabel(programs),
  };
}

describe('buildVerdict', () => {
  it('две подушки в разных вузах — бюджет почти гарантирован', () => {
    const verdict = buildVerdict([
      planUniversity('A', [{ zone: 'safe', margin: 15 }]),
      planUniversity('B', [{ zone: 'safe', margin: 12 }]),
    ]);
    expect(verdict.level).toBe('good');
    expect(verdict.title).toBe('Бюджет почти гарантирован');
    expect(verdict.detail).toContain('2 вуза с запасом');
  });

  it('упоминает цели в пояснении, если они есть', () => {
    const verdict = buildVerdict([
      planUniversity('A', [{ zone: 'safe', margin: 15 }]),
      planUniversity('B', [
        { zone: 'safe', margin: 12 },
        { zone: 'target', margin: 0 },
      ]),
    ]);
    expect(verdict.detail).toContain('впритык');
  });

  it('одна подушка — просит добавить запасной и называет вуз', () => {
    const verdict = buildVerdict([
      planUniversity('A', [{ zone: 'safe', margin: 15 }]),
      planUniversity('B', [{ zone: 'target', margin: 0 }]),
    ]);
    expect(verdict.level).toBe('warning');
    expect(verdict.title).toBe('Бюджет вероятен, но добавь ещё запасной вариант');
    expect(verdict.detail).toContain('Вуз A');
  });

  it('только цели — рискованно', () => {
    const verdict = buildVerdict([planUniversity('A', [{ zone: 'target', margin: -2 }])]);
    expect(verdict.level).toBe('warning');
    expect(verdict.title).toBe('Рискованно: все варианты впритык');
  });

  it('только мечты — высокий риск', () => {
    const verdict = buildVerdict([planUniversity('A', [{ zone: 'reach', margin: -30 }])]);
    expect(verdict.level).toBe('danger');
    expect(verdict.title).toBe('Высокий риск остаться без бюджета');
  });

  it('пустой план ведёт в План Б', () => {
    const verdict = buildVerdict([]);
    expect(verdict.level).toBe('empty');
    expect(verdict.detail).toContain('Если не пройду никуда');
  });
});

describe('склонение числительных', () => {
  it.each([
    [1, 'вуз'],
    [2, 'вуза'],
    [5, 'вузов'],
    [11, 'вузов'],
    [21, 'вуз'],
    [22, 'вуза'],
    [25, 'вузов'],
    [101, 'вуз'],
    [112, 'вузов'],
  ] as const)('%i -> %s', (n, word) => {
    expect(universitiesWord(n)).toBe(word);
  });

  it('направления и баллы', () => {
    expect(programsWord(1)).toBe('направление');
    expect(programsWord(3)).toBe('направления');
    expect(programsWord(7)).toBe('направлений');
    expect(pointsWord(1)).toBe('балл');
    expect(pointsWord(-3)).toBe('балла');
    expect(pointsWord(19)).toBe('баллов');
  });
});

describe('buildWarnings', () => {
  it('нет подушки — просит добавить запасной', () => {
    const warnings = buildWarnings({
      universities: [planUniversity('A', [{ zone: 'target', margin: 0 }])],
      availableUniversities: 1,
    });
    expect(warnings.map((w) => w.id)).toContain('no_safe');
  });

  it('подушка на первом приоритете обесценивает всё, что ниже', () => {
    const warnings = buildWarnings({
      universities: [
        planUniversity('A', [
          { zone: 'safe', margin: 20 },
          { zone: 'reach', margin: -25 },
        ]),
      ],
      availableUniversities: 1,
    });
    const warning = warnings.find((w) => w.id === 'safe_above_reach');
    expect(warning).toBeDefined();
    expect(warning?.universityId).toBe('A');
    expect(warning?.text).toContain('Поставь самое желанное первым');
  });

  it('не предупреждает, если ниже подушки ничего интересного нет', () => {
    const warnings = buildWarnings({
      universities: [
        planUniversity('A', [
          { zone: 'safe', margin: 20 },
          { zone: 'safe', margin: 25 },
        ]),
      ],
      availableUniversities: 1,
    });
    expect(warnings.map((w) => w.id)).not.toContain('safe_above_reach');
  });

  it('меньше трёх вузов при наличии вариантов — предлагает добавить', () => {
    const warnings = buildWarnings({
      universities: [planUniversity('A', [{ zone: 'safe', margin: 15 }])],
      availableUniversities: 9,
    });
    const warning = warnings.find((w) => w.id === 'few_universities');
    // Доступно 9, но правила разрешают 5, значит предложить можно 4.
    expect(warning?.text).toContain('ещё в 4 вуза');
  });

  it('не предлагает добавить вуз, если их больше нет', () => {
    const warnings = buildWarnings({
      universities: [planUniversity('A', [{ zone: 'safe', margin: 15 }])],
      availableUniversities: 1,
    });
    expect(warnings.map((w) => w.id)).not.toContain('few_universities');
  });

  it('не предупреждает про число вузов, если их уже три', () => {
    const warnings = buildWarnings({
      universities: [
        planUniversity('A', [{ zone: 'safe', margin: 15 }]),
        planUniversity('B', [{ zone: 'safe', margin: 15 }]),
        planUniversity('C', [{ zone: 'safe', margin: 15 }]),
      ],
      availableUniversities: 9,
    });
    expect(warnings.map((w) => w.id)).not.toContain('few_universities');
  });

  it('у пустого плана предупреждений нет — там работает вердикт', () => {
    expect(buildWarnings({ universities: [], availableUniversities: 5 })).toEqual([]);
  });

  it('вуз без направлений не роняет расчёт', () => {
    const empty = planUniversity('A', []);
    expect(() => buildWarnings({ universities: [empty], availableUniversities: 1 })).not.toThrow();
  });
});

describe('buildSimulation', () => {
  it('строит цепочку по приоритетам и называет ожидаемый исход', () => {
    const simulation = buildSimulation([
      planUniversity('A', [
        { zone: 'reach', margin: -25, code: '09.03.04' },
        { zone: 'target', margin: -2, code: '15.03.04' },
        { zone: 'safe', margin: 19, code: '13.03.02' },
      ]),
    ]);

    expect(simulation[0]?.steps.map((s) => s.outcome)).toEqual([
      'вероятно не пройдёшь',
      'на грани',
      'проходишь',
    ]);
    expect(simulation[0]?.result).toContain('13.03.02');
  });

  it('без подушки честно предупреждает, что зачисления может не быть', () => {
    const simulation = buildSimulation([
      planUniversity('A', [{ zone: 'reach', margin: -30, code: '09.03.04' }]),
    ]);
    expect(simulation[0]?.result).toContain('В этом вузе запасного варианта нет');
  });

  it('при только целях называет цель, но отмечает, что это впритык', () => {
    const simulation = buildSimulation([
      planUniversity('A', [{ zone: 'target', margin: 0, code: '15.03.04' }]),
    ]);
    expect(simulation[0]?.result).toContain('15.03.04');
    expect(simulation[0]?.result).toContain('впритык');
  });
});

describe('likelyAdmissionLabel', () => {
  it('выбирает первую подушку, иначе первую цель', () => {
    const withSafe = planUniversity('A', [
      { zone: 'target', margin: 0, code: '15.03.04' },
      { zone: 'safe', margin: 19, code: '13.03.02' },
    ]);
    expect(withSafe.likelyAdmission).toContain('13.03.02');

    const onlyReach = planUniversity('B', [{ zone: 'reach', margin: -30 }]);
    expect(onlyReach.likelyAdmission).toBeNull();
  });
});
