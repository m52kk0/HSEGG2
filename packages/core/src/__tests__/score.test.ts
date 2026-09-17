import { describe, expect, it } from 'vitest';
import { examScore, ineligibleLabel, requirementLabel } from '../score';
import { program, user } from './fixtures';

describe('examScore', () => {
  it('складывает три экзамена и бонус', () => {
    const result = examScore(program(), user());
    // math 76 + russian 78 + информатика 72 (лучше физики 70) + 2 за ГТО
    expect(result.examsSum).toBe(226);
    expect(result.bonus).toBe(2);
    expect(result.total).toBe(228);
    expect(result.eligible).toBe(true);
    expect(result.picked).toEqual(['math', 'russian', 'informatics']);
  });

  it('по альтернативе берёт лучший сданный предмет', () => {
    const result = examScore(
      program({ exams: ['math', 'russian', ['physics', 'informatics']] }),
      user({ scores: { math: 60, russian: 60, physics: 90, informatics: 50 } }),
    );
    expect(result.picked[2]).toBe('physics');
    expect(result.examsSum).toBe(210);
  });

  it('из альтернатив предпочитает подходящий предмет, даже если его балл ниже', () => {
    // Физика выше по баллу, но не добирает минимум — значит зачитываем информатику.
    const result = examScore(
      program({
        exams: ['math', 'russian', ['physics', 'informatics']],
        minScores: { math: 40, russian: 40, physics: 70, informatics: 40 },
      }),
      user({ scores: { math: 60, russian: 60, physics: 65, informatics: 50 } }),
    );
    expect(result.eligible).toBe(true);
    expect(result.picked[2]).toBe('informatics');
    expect(result.examsSum).toBe(170);
  });

  it('бонус за достижения ограничен 10 баллами', () => {
    const result = examScore(program(), user({ achievementsBonus: 25 }));
    expect(result.bonus).toBe(10);
    expect(result.total).toBe(236);
  });

  it('отрицательный и дробный бонус не ломают расчёт', () => {
    expect(examScore(program(), user({ achievementsBonus: -5 })).bonus).toBe(0);
    expect(examScore(program(), user({ achievementsBonus: 3.7 })).bonus).toBe(3);
    expect(examScore(program(), user({ achievementsBonus: Number.NaN })).bonus).toBe(0);
  });

  it('не подходит, если предмет не сдавался — и объясняет почему', () => {
    const result = examScore(
      program({ exams: ['math', 'russian', 'chemistry'] }),
      user({ scores: { math: 76, russian: 78 } }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['нет химия']);
    expect(ineligibleLabel(result)).toBe('Не подходит: нет химия');
  });

  it('не подходит, если балл ниже минимального порога', () => {
    const result = examScore(
      program({ minScores: { math: 40, russian: 40, physics: 40, informatics: 90 } }),
      user({ scores: { math: 76, russian: 78, informatics: 72 } }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['информатика ниже минимума 90']);
    expect(ineligibleLabel(result)).toBe('Не подходит: информатика ниже минимума 90');
  });

  it('копит несколько причин отказа сразу', () => {
    const result = examScore(
      program({ exams: ['chemistry', 'biology', 'russian'], minScores: { russian: 95 } }),
      user({ scores: { russian: 78 } }),
    );
    expect(result.reasons).toHaveLength(3);
    expect(result.eligible).toBe(false);
  });

  it('у подходящей программы причин нет', () => {
    expect(ineligibleLabel(examScore(program(), user()))).toBeNull();
  });

  it('не засчитывает в сумму предмет, не добравший минимум', () => {
    const result = examScore(
      program({ exams: ['math', 'russian', 'physics'], minScores: { physics: 80 } }),
      user({ scores: { math: 76, russian: 78, physics: 70 } }),
    );
    expect(result.examsSum).toBe(154);
  });

  it('человеческая формулировка требования', () => {
    expect(requirementLabel('math')).toBe('математика (профиль)');
    expect(requirementLabel(['physics', 'informatics'])).toBe('физика или информатика');
  });
});
