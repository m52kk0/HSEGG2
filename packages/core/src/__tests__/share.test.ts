import { describe, expect, it } from 'vitest';
import { decodeProfile, encodeProfile } from '../share';
import { demoUser, user } from './fixtures';

/**
 * base64url от UTF-8. Встроенный btoa кириллицу не кодирует,
 * а именно её и надо проверить: регионы и достижения — русские строки.
 */
function b64(json: string): string {
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('ссылка «Поделиться планом»', () => {
  it('профиль выживает в кодировании и обратно', () => {
    const encoded = encodeProfile(demoUser);
    expect(decodeProfile(encoded)).toEqual(demoUser);
  });

  it('ссылка безопасна для URL: без +, / и =', () => {
    const encoded = encodeProfile(demoUser);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('кириллица в регионах и достижениях не портится', () => {
    const decoded = decodeProfile(encodeProfile(demoUser));
    expect(decoded?.homeRegion).toBe('Нижегородская область');
    expect(decoded?.achievements).toEqual(['Знак ГТО']);
  });

  it.each([
    ['пустой профиль', user({ scores: {}, interests: [], homeRegion: null, achievements: [] })],
    ['все регионы', user({ regionMode: 'any', homeRegion: null })],
    ['несколько регионов', user({ regionMode: 'several', regions: ['Москва', 'Омская область'] })],
    ['ожидаемые баллы', user({ scoresAreExpected: true })],
  ])('%s', (_name, profile) => {
    expect(decodeProfile(encodeProfile(profile))).toEqual(profile);
  });

  it('битая ссылка даёт null, а не исключение', () => {
    expect(decodeProfile('не-base64!!!')).toBeNull();
    expect(decodeProfile('')).toBeNull();
    expect(decodeProfile(b64('{"v":1'))).toBeNull();
  });

  it('чужая версия формата отклоняется', () => {
    expect(decodeProfile(b64(JSON.stringify({ v: 2, s: {} })))).toBeNull();
  });

  it('не массив и не объект отклоняются', () => {
    expect(decodeProfile(b64('"строка"'))).toBeNull();
    expect(decodeProfile(b64('null'))).toBeNull();
  });

  it('отбрасывает мусорные баллы и незнакомые предметы', () => {
    const encoded = b64(
      JSON.stringify({
        v: 1,
        s: { math: 76, квантовая: 90, russian: 500, physics: -10 },
        e: 0,
        b: 2,
        a: [],
        i: [],
        m: 'any',
        h: null,
        r: [],
      }),
    );
    const decoded = decodeProfile(encoded);
    expect(decoded?.scores).toEqual({ math: 76 });
  });

  it('ограничивает бонус десятью баллами и чинит неверный режим региона', () => {
    const encoded = b64(
      JSON.stringify({ v: 1, s: {}, e: 0, b: 99, a: [], i: [], m: 'луна', h: null, r: [] }),
    );
    const decoded = decodeProfile(encoded);
    expect(decoded?.achievementsBonus).toBe(10);
    expect(decoded?.regionMode).toBe('any');
  });

  it('отбрасывает незнакомые интересы и нестроковые регионы', () => {
    const encoded = b64(
      JSON.stringify({
        v: 1,
        s: {},
        e: 1,
        b: 0,
        a: ['ГТО', 42],
        i: ['it', 'астрология'],
        m: 'several',
        h: 'Москва',
        r: ['Омская область', 7],
      }),
    );
    const decoded = decodeProfile(encoded);
    expect(decoded?.interests).toEqual(['it']);
    expect(decoded?.achievements).toEqual(['ГТО']);
    expect(decoded?.regions).toEqual(['Омская область']);
  });

  it('отсутствующие поля заменяются безопасными значениями', () => {
    const decoded = decodeProfile(b64(JSON.stringify({ v: 1 })));
    expect(decoded).toEqual({
      scores: {},
      scoresAreExpected: false,
      achievementsBonus: 0,
      achievements: [],
      interests: [],
      regionMode: 'any',
      homeRegion: null,
      regions: [],
    });
  });
});
