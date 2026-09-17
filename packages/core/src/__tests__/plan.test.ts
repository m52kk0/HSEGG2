import { describe, expect, it } from 'vitest';
import { buildPlan, collectCandidates, recomputePlan, selectUniversities, targetRegions } from '../plan';
import { LIMITS } from '../config/campaign';
import type { Program, University } from '../types';
import { program, programWithMargin, university, user } from './fixtures';

/** Вуз с набором программ, заданных запасом баллов относительно 228. */
function withPrograms(
  id: string,
  margins: { margin: number; code: string }[],
  patch: Partial<University> = {},
): { university: University; programs: Program[] } {
  return {
    university: university({ wikidata: id, name: `Вуз ${id}`, ...patch }),
    programs: margins.map((m, index) =>
      programWithMargin(m.margin, { id: `${id}-${index}`, universityId: id, code: m.code }),
    ),
  };
}

describe('targetRegions', () => {
  it('«где угодно» не ограничивает регионы', () => {
    expect(targetRegions(user({ regionMode: 'any' }))).toBeNull();
  });

  it('свой регион — один регион', () => {
    expect(targetRegions(user({ regionMode: 'home' }))).toEqual(
      new Set(['Нижегородская область']),
    );
  });

  it('несколько регионов складываются с домашним', () => {
    const regions = targetRegions(
      user({ regionMode: 'several', regions: ['Москва', 'Республика Татарстан'] }),
    );
    expect(regions).toEqual(
      new Set(['Нижегородская область', 'Москва', 'Республика Татарстан']),
    );
  });

  it('без указанного региона ограничения нет', () => {
    expect(targetRegions(user({ regionMode: 'home', homeRegion: null }))).toBeNull();
  });
});

describe('collectCandidates', () => {
  it('отбрасывает программы вне выбранных регионов', () => {
    const local = withPrograms('U1', [{ margin: 15, code: '15.03.04' }]);
    const far = withPrograms('U2', [{ margin: 15, code: '15.03.04' }], { region: 'Москва' });

    const candidates = collectCandidates({
      user: user(),
      programs: [...local.programs, ...far.programs],
      universities: [local.university, far.university],
    });

    expect(candidates.map((c) => c.university.wikidata)).toEqual(['U1']);
  });

  it('отбрасывает направления вне интересов', () => {
    const uni = withPrograms('U1', [
      { margin: 15, code: '15.03.04' }, // инженерия — интересно
      { margin: 15, code: '40.03.01' }, // юриспруденция — нет
    ]);

    const candidates = collectCandidates({
      user: user(),
      programs: uni.programs,
      universities: [uni.university],
    });

    expect(candidates[0]?.programs.map((p) => p.program.code)).toEqual(['15.03.04']);
  });

  it('пустой список интересов означает «интересно всё»', () => {
    const uni = withPrograms('U1', [{ margin: 15, code: '40.03.01' }]);
    const candidates = collectCandidates({
      user: user({ interests: [] }),
      programs: uni.programs,
      universities: [uni.university],
    });
    expect(candidates).toHaveLength(1);
  });

  it('отбрасывает программы без известного вуза', () => {
    const candidates = collectCandidates({
      user: user(),
      programs: [program({ universityId: 'нет-такого' })],
      universities: [university()],
    });
    expect(candidates).toHaveLength(0);
  });

  it('отбрасывает неподходящие по экзаменам программы', () => {
    const uni = university();
    const candidates = collectCandidates({
      user: user(),
      programs: [program({ universityId: uni.wikidata, exams: ['chemistry', 'biology', 'russian'] })],
      universities: [uni],
    });
    expect(candidates).toHaveLength(0);
  });

  it('вуз с запасом получает рейтинг выше, чем вуз без него', () => {
    const safe = withPrograms('U1', [{ margin: 15, code: '15.03.04' }]);
    const reach = withPrograms('U2', [{ margin: -30, code: '15.03.04' }]);

    const candidates = collectCandidates({
      user: user(),
      programs: [...safe.programs, ...reach.programs],
      universities: [safe.university, reach.university],
    });

    expect(candidates[0]?.university.wikidata).toBe('U1');
  });
});

describe('selectUniversities', () => {
  it('не берёт больше лимита', () => {
    const candidates = collectCandidates({
      user: user(),
      programs: Array.from({ length: 8 }, (_, i) =>
        programWithMargin(15, { id: `p${i}`, universityId: `U${i}`, code: '15.03.04' }),
      ),
      universities: Array.from({ length: 8 }, (_, i) => university({ wikidata: `U${i}` })),
    });

    expect(selectUniversities(candidates)).toHaveLength(LIMITS.maxUniversities);
    expect(selectUniversities(candidates, 2)).toHaveLength(2);
  });

  it('гарантирует два вуза с запасом, если они есть', () => {
    const safeA = withPrograms('S1', [{ margin: 12, code: '15.03.04' }]);
    const safeB = withPrograms('S2', [{ margin: 11, code: '15.03.04' }]);
    // Куча «целей» с высоким рейтингом, которые иначе вытеснили бы запасные.
    const targets = Array.from({ length: 6 }, (_, i) =>
      withPrograms(`T${i}`, [
        { margin: 0, code: '15.03.04' },
        { margin: 1, code: '09.03.01' },
        { margin: 2, code: '13.03.02' },
      ]),
    );

    const candidates = collectCandidates({
      user: user(),
      programs: [...safeA.programs, ...safeB.programs, ...targets.flatMap((t) => t.programs)],
      universities: [safeA.university, safeB.university, ...targets.map((t) => t.university)],
    });

    const chosen = selectUniversities(candidates).map((c) => c.university.wikidata);
    expect(chosen).toContain('S1');
    expect(chosen).toContain('S2');
  });

  it('добавляет вуз с мечтой, если её иначе не было бы в плане', () => {
    const safes = Array.from({ length: 5 }, (_, i) =>
      withPrograms(`S${i}`, [{ margin: 20, code: '15.03.04' }]),
    );
    const dream = withPrograms('DREAM', [{ margin: -25, code: '15.03.04' }]);

    const candidates = collectCandidates({
      user: user(),
      programs: [...safes.flatMap((s) => s.programs), ...dream.programs],
      universities: [...safes.map((s) => s.university), dream.university],
    });

    const chosen = selectUniversities(candidates);
    expect(chosen.some((c) => c.hasReach)).toBe(true);
  });
});

describe('buildPlan', () => {
  const engineering = { margin: -3, code: '15.03.04' };
  const it2 = { margin: -20, code: '09.03.01' };
  const energy = { margin: 19, code: '13.03.02' };

  it('нумерует приоритеты подряд с единицы внутри каждого вуза', () => {
    const uni = withPrograms('U1', [engineering, it2, energy]);
    const plan = buildPlan(user(), uni.programs, [uni.university]);

    expect(plan.universities[0]?.programs.map((p) => p.priority)).toEqual([1, 2, 3]);
  });

  it('соблюдает лимиты правил приёма: 5 вузов и 5 направлений', () => {
    const unis = Array.from({ length: 9 }, (_, i) =>
      withPrograms(
        `U${i}`,
        Array.from({ length: 9 }, (_, j) => ({ margin: j - 4, code: '15.03.04' })).map(
          (m, j) => ({ ...m, code: ['15.03.04', '09.03.01', '13.03.02'][j % 3]! }),
        ),
      ),
    );

    const plan = buildPlan(
      user(),
      unis.flatMap((u) => u.programs),
      unis.map((u) => u.university),
    );

    expect(plan.universities.length).toBeLessThanOrEqual(LIMITS.maxUniversities);
    for (const u of plan.universities) {
      expect(u.programs.length).toBeLessThanOrEqual(LIMITS.maxProgramsPerUniversity);
    }
  });

  it('уважает порядок интересов: первый интерес выше', () => {
    const uni = withPrograms('U1', [
      { margin: 0, code: '09.03.01' }, // интерес №2
      { margin: 0, code: '15.03.04' }, // интерес №1
      { margin: 0, code: '13.03.02' }, // интерес №3
    ]);

    const plan = buildPlan(user(), uni.programs, [uni.university]);
    expect(plan.universities[0]?.programs.map((p) => p.program.code)).toEqual([
      '15.03.04',
      '09.03.01',
      '13.03.02',
    ]);
  });

  it('внутри одного интереса мечта стоит выше запасного', () => {
    const uni = withPrograms('U1', [
      { margin: 20, code: '15.03.04' },
      { margin: -20, code: '15.03.05' },
    ]);

    const plan = buildPlan(user(), uni.programs, [uni.university]);
    const zones = plan.universities[0]?.programs.map((p) => p.zone);
    expect(zones).toEqual(['reach', 'safe']);
  });

  it('оставляет в плане подушку, даже если целей и мечт больше пяти', () => {
    const uni = withPrograms('U1', [
      { margin: 0, code: '15.03.04' },
      { margin: 1, code: '15.03.05' },
      { margin: -2, code: '15.03.02' },
      { margin: -30, code: '09.03.01' },
      { margin: -31, code: '09.03.04' },
      { margin: -32, code: '09.03.02' },
      { margin: 25, code: '13.03.02' },
    ]);

    const plan = buildPlan(user(), uni.programs, [uni.university]);
    const zones = plan.universities[0]!.programs.map((p) => p.zone);
    expect(zones).toContain('safe');
    expect(zones).toContain('reach');
  });

  it('вытесняет мечту ради подушки, когда все слоты уже заняты', () => {
    // Слоты интересов забирают цели и мечты; единственный запасной лежит
    // в первом интересе и по полезности проигрывает — но план без подушки
    // бесполезен, поэтому она обязана вытеснить самую далёкую мечту.
    const uni = withPrograms('U1', [
      { margin: 0, code: '15.03.04' },
      { margin: 1, code: '15.03.05' },
      { margin: 40, code: '15.03.02' },
      { margin: -30, code: '09.03.01' },
      { margin: -35, code: '09.03.04' },
      { margin: -2, code: '13.03.02' },
    ]);

    const plan = buildPlan(user(), uni.programs, [uni.university]);
    const programs = plan.universities[0]!.programs;
    expect(programs.map((p) => p.zone)).toContain('safe');
    expect(programs.map((p) => p.program.code)).toContain('15.03.02');
    // Вытеснили самую далёкую мечту, а не ближнюю.
    expect(programs.map((p) => p.program.code)).not.toContain('09.03.04');
  });

  it('при лимите в одно направление берёт подушку и не ломается без мечты', () => {
    const uni = withPrograms('U1', [
      { margin: -30, code: '09.03.01' },
      { margin: 12, code: '13.03.02' },
    ]);

    const plan = buildPlan(user(), uni.programs, [uni.university], {
      maxProgramsPerUniversity: 1,
    });

    const programs = plan.universities[0]!.programs;
    expect(programs).toHaveLength(1);
    expect(programs[0]?.zone).toBe('safe');
  });

  it('пустой план получает вердикт-заглушку и ведёт в План Б', () => {
    const plan = buildPlan(user(), [], []);
    expect(plan.universities).toEqual([]);
    expect(plan.verdict.level).toBe('empty');
    expect(plan.verdict.title).toBe('Под твои баллы бюджетных мест не нашлось');
    expect(plan.warnings).toEqual([]);
    expect(plan.simulation).toEqual([]);
  });

  it('не берёт в план неподходящие программы', () => {
    const uni = university();
    const plan = buildPlan(
      user(),
      [
        program({ id: 'ok', universityId: uni.wikidata, code: '15.03.04' }),
        program({
          id: 'bad',
          universityId: uni.wikidata,
          code: '15.03.05',
          exams: ['chemistry', 'biology', 'russian'],
        }),
      ],
      [uni],
    );

    const ids = plan.universities.flatMap((u) => u.programs.map((p) => p.program.id));
    expect(ids).toContain('ok');
    expect(ids).not.toContain('bad');
  });

  it('уважает переданные лимиты', () => {
    const unis = Array.from({ length: 4 }, (_, i) =>
      withPrograms(`U${i}`, [
        { margin: 0, code: '15.03.04' },
        { margin: 5, code: '09.03.01' },
      ]),
    );

    const plan = buildPlan(
      user(),
      unis.flatMap((u) => u.programs),
      unis.map((u) => u.university),
      { maxUniversities: 2, maxProgramsPerUniversity: 1 },
    );

    expect(plan.universities).toHaveLength(2);
    expect(plan.universities.every((u) => u.programs.length === 1)).toBe(true);
  });
});

describe('recomputePlan', () => {
  it('перенумеровывает приоритеты после ручной правки', () => {
    const uni = withPrograms('U1', [
      { margin: 19, code: '13.03.02' },
      { margin: -3, code: '15.03.04' },
    ]);
    const plan = buildPlan(user(), uni.programs, [uni.university]);

    const reordered = [
      {
        ...plan.universities[0]!,
        programs: [...plan.universities[0]!.programs].reverse(),
      },
    ];

    const next = recomputePlan(reordered, 1);
    expect(next.universities[0]?.programs.map((p) => p.priority)).toEqual([1, 2]);
    expect(next.universities[0]?.programs[0]?.program.code).toBe('13.03.02');
  });

  it('пересчитывает вердикт по новому составу', () => {
    const uni = withPrograms('U1', [
      { margin: 19, code: '13.03.02' },
      { margin: -25, code: '15.03.04' },
    ]);
    const plan = buildPlan(user(), uni.programs, [uni.university]);
    expect(plan.verdict.level).toBe('warning');

    const withoutSafe = [
      {
        ...plan.universities[0]!,
        programs: plan.universities[0]!.programs.filter((p) => p.zone !== 'safe'),
      },
    ];

    expect(recomputePlan(withoutSafe, 1).verdict.level).toBe('danger');
  });
});

describe('несколько регионов', () => {
  const home = 'Нижегородская область';

  it('вузы своего региона стоят выше вузов соседних при равных зонах', () => {
    const local = withPrograms('LOCAL', [{ margin: 0, code: '15.03.04' }], {
      region: home,
      lat: 56.3,
      lon: 44.0,
    });
    const far = withPrograms('FAR', [{ margin: 0, code: '15.03.04' }], {
      region: 'Республика Татарстан',
      lat: 55.8,
      lon: 49.1,
    });

    const plan = buildPlan(
      user({ regionMode: 'several', regions: ['Республика Татарстан'] }),
      [...local.programs, ...far.programs],
      [local.university, far.university],
    );

    expect(plan.universities.map((u) => u.university.wikidata)).toEqual(['LOCAL', 'FAR']);
  });

  it('берёт вузы всех выбранных регионов и отбрасывает невыбранные', () => {
    const a = withPrograms('A', [{ margin: 5, code: '15.03.04' }], { region: home });
    const b = withPrograms('B', [{ margin: 5, code: '15.03.04' }], { region: 'Москва' });
    const c = withPrograms('C', [{ margin: 5, code: '15.03.04' }], { region: 'Омская область' });

    const plan = buildPlan(
      user({ regionMode: 'several', regions: ['Москва'] }),
      [...a.programs, ...b.programs, ...c.programs],
      [a.university, b.university, c.university],
    );

    const ids = plan.universities.map((u) => u.university.wikidata);
    expect(ids).toEqual(expect.arrayContaining(['A', 'B']));
    expect(ids).not.toContain('C');
  });

  it('«где угодно» игнорирует регионы профиля', () => {
    const far = withPrograms('FAR', [{ margin: 5, code: '15.03.04' }], {
      region: 'Камчатский край',
    });
    const plan = buildPlan(user({ regionMode: 'any' }), far.programs, [far.university]);
    expect(plan.universities).toHaveLength(1);
  });

  it('вуз без координат не ломает расчёт близости', () => {
    const noCoords = withPrograms('NC', [{ margin: 5, code: '15.03.04' }], {
      region: home,
      lat: null,
      lon: null,
    });
    expect(() => buildPlan(user(), noCoords.programs, [noCoords.university])).not.toThrow();
  });
});
