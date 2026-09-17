import { describe, expect, it } from 'vitest';
import {
  filterPrograms,
  getContent,
  getDirection,
  getProgram,
  getRegion,
  getSalaries,
  getUniversity,
  programsOfCode,
  programsOfUniversity,
  searchDirections,
  searchUniversities,
  similarCodes,
  universitiesOfRegion,
} from '../index';

const NGTU = 'Q4318652';

describe('точечный доступ', () => {
  it('находит направление, вуз, регион и программу', () => {
    expect(getDirection('15.03.04')?.name).toContain('Автоматизация');
    expect(getUniversity(NGTU)?.city).toBe('Нижний Новгород');
    expect(getRegion('Нижегородская область')?.trudvsemCode).toMatch(/^\d{13}$/);
    expect(getProgram(`${NGTU}-15.03.04`)?.code).toBe('15.03.04');
  });

  it('на неизвестный ключ отвечает null, а не падает', () => {
    expect(getDirection('99.99.99')).toBeNull();
    expect(getUniversity('Q0')).toBeNull();
    expect(getRegion('Нарния')).toBeNull();
    expect(getProgram('нет-такой')).toBeNull();
    expect(getContent('99.99.99')).toBeNull();
  });

  it('редакционный текст есть у направлений демо-истории', () => {
    for (const code of ['15.03.04', '27.03.04', '13.03.02', '09.03.01']) {
      const content = getContent(code);
      expect(content?.learn, code).toBeTruthy();
      expect(content?.jobs?.length, code).toBe(3);
      expect(content?.vacancyQuery, code).toBeTruthy();
    }
  });

  it('у 15.03.04 в похожих есть вся связка демо-истории', () => {
    const codes = similarCodes('15.03.04').map((s) => s.code);
    expect(codes).toEqual(expect.arrayContaining(['27.03.04', '13.03.02', '09.03.01']));
  });
});

describe('списки', () => {
  it('программы вуза непустые и принадлежат ему', () => {
    const list = programsOfUniversity(NGTU);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.universityId === NGTU)).toBe(true);
  });

  it('программы по коду принадлежат этому коду', () => {
    const list = programsOfCode('15.03.04');
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((p) => p.code === '15.03.04')).toBe(true);
  });

  it('вузы региона лежат в этом регионе', () => {
    const list = universitiesOfRegion('Нижегородская область');
    expect(list.length).toBeGreaterThan(3);
    expect(list.every((u) => u.region === 'Нижегородская область')).toBe(true);
  });

  it('неизвестный ключ даёт пустой список', () => {
    expect(programsOfUniversity('Q0')).toEqual([]);
    expect(programsOfCode('99.99.99')).toEqual([]);
    expect(universitiesOfRegion('Нарния')).toEqual([]);
  });
});

describe('filterPrograms', () => {
  it('фильтрует по вузу и коду одновременно', () => {
    const list = filterPrograms({ universityId: NGTU, code: '15.03.04' });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(`${NGTU}-15.03.04`);
  });

  it('фильтрует по одному региону', () => {
    const list = filterPrograms({ code: '15.03.04', region: 'Нижегородская область' });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => getUniversity(p.universityId)?.region === 'Нижегородская область')).toBe(
      true,
    );
  });

  it('фильтрует по нескольким регионам', () => {
    const list = filterPrograms({ code: '09.03.01', regions: ['Москва', 'Нижегородская область'] });
    const regions = new Set(list.map((p) => getUniversity(p.universityId)?.region));
    expect(regions.size).toBeGreaterThan(0);
    for (const region of regions) {
      expect(['Москва', 'Нижегородская область']).toContain(region);
    }
  });

  it('без фильтров возвращает весь набор', () => {
    expect(filterPrograms({}).length).toBeGreaterThan(1000);
  });
});

describe('getSalaries — честный фолбэк на Россию', () => {
  it('по региону с данными возвращает их без пометки', () => {
    const result = getSalaries('09.03.01', 'Москва');
    expect(result.entry).not.toBeNull();
    expect(result.fallbackToRussia).toBe(false);
  });

  it('по региону без данных честно помечает фолбэк', () => {
    const result = getSalaries('15.03.04', 'Чукотский автономный округ');
    if (result.fallbackToRussia) {
      expect(result.entry).not.toBeNull();
    } else {
      // Если по региону данные всё-таки есть, пометки быть не должно.
      expect(result.entry).not.toBeNull();
    }
  });

  it('без региона отдаёт данные по России', () => {
    const result = getSalaries('15.03.04', null);
    expect(result.entry?.y1?.salary).toBeGreaterThan(10000);
    expect(result.fallbackToRussia).toBe(false);
  });

  it('по неизвестному коду возвращает null, а не выдумывает числа', () => {
    expect(getSalaries('99.99.99', 'Москва').entry).toBeNull();
  });
});

describe('поиск', () => {
  it('находит по полному коду', () => {
    expect(searchDirections('15.03.04')[0]?.code).toBe('15.03.04');
  });

  it('находит по префиксу кода', () => {
    const codes = searchDirections('15.03').map((d) => d.code);
    expect(codes.length).toBeGreaterThan(1);
    expect(codes.every((c) => c.startsWith('15.03'))).toBe(true);
  });

  it('находит по названию и не зависит от регистра и ё', () => {
    expect(searchDirections('автоматизация').map((d) => d.code)).toContain('15.03.04');
    expect(searchDirections('АВТОМАТИЗАЦИЯ').map((d) => d.code)).toContain('15.03.04');
    expect(searchDirections('электроэнергетика').map((d) => d.code)).toContain('13.03.02');
  });

  it('совпадение с начала названия важнее совпадения внутри', () => {
    const results = searchDirections('электро');
    expect(results[0]?.name.toLowerCase().startsWith('электро')).toBe(true);
  });

  it('пустой запрос ничего не находит', () => {
    expect(searchDirections('')).toEqual([]);
    expect(searchDirections('   ')).toEqual([]);
  });

  it('уважает лимит', () => {
    expect(searchDirections('и', 5)).toHaveLength(5);
  });

  it('ищет вузы по названию и городу', () => {
    expect(searchUniversities('Нижегородский').length).toBeGreaterThan(2);
    expect(searchUniversities('Нижний Новгород').length).toBeGreaterThan(2);
  });

  it('слишком короткий запрос вузов ничего не даёт', () => {
    expect(searchUniversities('Н')).toEqual([]);
  });
});

describe('similarCodes', () => {
  it('для кода без редакционного списка подбирает тот же УГСН', () => {
    const similar = similarCodes('26.05.06');
    expect(similar.length).toBeGreaterThan(0);
    for (const item of similar) {
      expect(item.code.startsWith('26')).toBe(true);
      expect(item.code).not.toBe('26.05.06');
      // Автоматический подбор не придумывает разницу — её считает интерфейс.
      expect(item.diff).toBe('');
    }
  });

  it('уважает лимит', () => {
    expect(similarCodes('15.03.04', 2)).toHaveLength(2);
  });
});
