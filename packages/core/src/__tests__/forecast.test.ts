import { describe, expect, it } from 'vitest';
import { evaluate, formatMargin, predictCutoff, zoneByMargin } from '../forecast';
import { program, programWithMargin, user } from './fixtures';

describe('predictCutoff', () => {
  it('считает тренд по трём годам', () => {
    // ((225−220) + (220−214)) / 2 = 5.5 -> прогноз round(225 + 5.5) = 231
    const forecast = predictCutoff(program({ cutoffs: { '2023': 214, '2024': 220, '2025': 225 } }));
    expect(forecast.trend).toBeCloseTo(5.5);
    expect(forecast.predictedCutoff).toBe(231);
    expect(forecast.lastCutoff).toBe(225);
    expect(forecast.years).toEqual([2023, 2024, 2025]);
  });

  it('по двум годам берёт разницу между ними', () => {
    const forecast = predictCutoff(program({ cutoffs: { '2024': 200, '2025': 210 } }));
    expect(forecast.trend).toBe(10);
    expect(forecast.predictedCutoff).toBe(220);
    expect(forecast.years).toEqual([2024, 2025]);
  });

  it('по одному году тренд нулевой', () => {
    const forecast = predictCutoff(program({ cutoffs: { '2025': 240 } }));
    expect(forecast.trend).toBe(0);
    expect(forecast.predictedCutoff).toBe(240);
  });

  it('использует более ранний год, если последнего нет', () => {
    const forecast = predictCutoff(program({ cutoffs: { '2023': 180 } }));
    expect(forecast.lastCutoff).toBe(180);
    expect(forecast.predictedCutoff).toBe(180);
  });

  it('без проходных прогноза нет', () => {
    const forecast = predictCutoff(program({ cutoffs: {} }));
    expect(forecast.predictedCutoff).toBeNull();
    expect(forecast.lastCutoff).toBeNull();
    expect(forecast.years).toEqual([]);
  });

  it('кламп тренда сверху: не больше +15', () => {
    const forecast = predictCutoff(program({ cutoffs: { '2023': 150, '2024': 200, '2025': 250 } }));
    expect(forecast.trend).toBe(15);
    expect(forecast.predictedCutoff).toBe(265);
  });

  it('кламп тренда снизу: не меньше −10', () => {
    const forecast = predictCutoff(program({ cutoffs: { '2023': 250, '2024': 200, '2025': 150 } }));
    expect(forecast.trend).toBe(-10);
    expect(forecast.predictedCutoff).toBe(140);
  });
});

describe('zoneByMargin — границы из config/zones', () => {
  it.each([
    [-100, 'reach'],
    [-6, 'reach'],
    [-5, 'target'],
    [0, 'target'],
    [9, 'target'],
    [10, 'safe'],
    [100, 'safe'],
  ] as const)('запас %i -> %s', (margin, zone) => {
    expect(zoneByMargin(margin)).toBe(zone);
  });
});

describe('evaluate', () => {
  it('считает запас и зону для подходящей программы', () => {
    const result = evaluate(program(), user());
    expect(result.score.total).toBe(228);
    expect(result.forecast.predictedCutoff).toBe(231);
    expect(result.margin).toBe(-3);
    expect(result.zone).toBe('target');
  });

  it.each([
    [19, 'safe'],
    [-3, 'target'],
    [-22, 'reach'],
  ] as const)('запас %i даёт зону %s', (margin, zone) => {
    const result = evaluate(programWithMargin(margin), user());
    expect(result.margin).toBe(margin);
    expect(result.zone).toBe(zone);
  });

  it('у неподходящей программы зоны и запаса нет', () => {
    const result = evaluate(program({ exams: ['chemistry', 'biology', 'russian'] }), user());
    expect(result.score.eligible).toBe(false);
    expect(result.margin).toBeNull();
    expect(result.zone).toBeNull();
  });

  it('без проходных зоны нет, даже если программа подходит', () => {
    const result = evaluate(program({ cutoffs: {} }), user());
    expect(result.score.eligible).toBe(true);
    expect(result.zone).toBeNull();
  });
});

describe('formatMargin — знак обязателен', () => {
  it.each([
    [12, '+12'],
    [-8, '−8'],
    [0, '0'],
  ] as const)('%i -> %s', (margin, text) => {
    expect(formatMargin(margin)).toBe(text);
  });
});
