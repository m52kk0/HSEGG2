import { describe, expect, it } from 'vitest';
import {
  INTEREST_GROUPS,
  allowedPrefixes,
  interestGroup,
  interestLabel,
  interestRank,
  matchesInterest,
  ugsn,
} from '../interests';
import { INTEREST_IDS } from '../types';
import { CAMPAIGN_DATES, campaignDate } from '../config/campaign';

describe('группы интересов', () => {
  it('в онбординге ровно 8 плиток, как в ТЗ', () => {
    expect(INTEREST_GROUPS).toHaveLength(8);
    expect(INTEREST_GROUPS.map((g) => g.id)).toEqual([...INTEREST_IDS]);
  });

  it('у каждой группы есть подпись, подсказка и хотя бы один УГСН', () => {
    for (const group of INTEREST_GROUPS) {
      expect(group.label.length).toBeGreaterThan(2);
      expect(group.hint.length).toBeGreaterThan(2);
      expect(group.prefixes.length).toBeGreaterThan(0);
      for (const prefix of group.prefixes) expect(prefix).toMatch(/^\d{2}$/);
    }
  });

  it('покрывают все УГСН с 01 по 55 — иначе направление выпало бы из поиска по интересам', () => {
    const covered = new Set(INTEREST_GROUPS.flatMap((g) => [...g.prefixes]));
    for (let i = 1; i <= 55; i += 1) {
      expect(covered.has(String(i).padStart(2, '0'))).toBe(true);
    }
  });

  it('неизвестная группа — это ошибка программиста, а не пустой результат', () => {
    // @ts-expect-error проверяем защиту от неверного идентификатора
    expect(() => interestGroup('нет-такой')).toThrow();
  });

  it('подпись берётся из группы', () => {
    expect(interestLabel('it')).toBe('IT и программирование');
  });
});

describe('ugsn и matchesInterest', () => {
  it('УГСН — первые две цифры кода', () => {
    expect(ugsn('15.03.04')).toBe('15');
    expect(ugsn('01.03.02')).toBe('01');
  });

  it('инженерия ловит машиностроение, но не юриспруденцию', () => {
    expect(matchesInterest('15.03.04', 'engineering')).toBe(true);
    expect(matchesInterest('40.03.01', 'engineering')).toBe(false);
    expect(matchesInterest('40.03.01', 'humanities')).toBe(true);
  });
});

describe('interestRank — порядок выбора важен', () => {
  const interests = ['engineering', 'it', 'energy'] as const;

  it('код из первого интереса получает нулевой ранг', () => {
    expect(interestRank('15.03.04', interests)).toBe(0);
    expect(interestRank('09.03.01', interests)).toBe(1);
    expect(interestRank('13.03.02', interests)).toBe(2);
  });

  it('код вне интересов хуже любого совпадения', () => {
    expect(interestRank('40.03.01', interests)).toBe(3);
  });

  it('при пустом списке интересов все коды равны', () => {
    expect(interestRank('40.03.01', [])).toBe(0);
  });

  it('первое совпадение побеждает при пересечении групп', () => {
    // 09 есть и в it, и (через 01/02) рядом с наукой: важен порядок выбора.
    expect(interestRank('09.03.01', ['it', 'engineering'])).toBe(0);
    expect(interestRank('09.03.01', ['engineering', 'it'])).toBe(1);
  });
});

describe('allowedPrefixes', () => {
  it('пустые интересы означают «интересно всё»', () => {
    expect(allowedPrefixes([])).toBeNull();
  });

  it('объединяет УГСН выбранных групп', () => {
    const prefixes = allowedPrefixes(['energy'])!;
    expect(prefixes.has('13')).toBe(true);
    expect(prefixes.has('15')).toBe(false);
  });
});

describe('даты кампании', () => {
  it('известная дата находится', () => {
    expect(campaignDate('priorities_lock').date).toBe('2026-07-25');
    expect(campaignDate('extra_admission').label).toBe('примерно с 12 августа');
  });

  it('неизвестный идентификатор — ошибка, а не молчаливый undefined', () => {
    expect(() => campaignDate('нет-такой')).toThrow(/Unknown campaign date/);
  });

  it('у каждой даты есть человеческая формулировка и описание', () => {
    for (const date of CAMPAIGN_DATES) {
      expect(date.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(date.label.length).toBeGreaterThan(3);
      expect(date.description.length).toBeGreaterThan(10);
    }
  });
});
