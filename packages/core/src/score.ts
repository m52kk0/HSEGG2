import type { ExamRequirement, ExamSubject, Program, ScoreResult, UserProfile } from './types';
import { SUBJECT_LABELS } from './types';
import { LIMITS } from './config/campaign';

function requirementSubjects(req: ExamRequirement): ExamSubject[] {
  return Array.isArray(req) ? req : [req];
}

/** Человеческая формулировка требования: «физика или информатика». */
export function requirementLabel(req: ExamRequirement): string {
  return requirementSubjects(req)
    .map((s) => SUBJECT_LABELS[s].toLowerCase())
    .join(' или ');
}

interface Pick {
  subject: ExamSubject;
  value: number;
  /** Балл не ниже минимального порога программы по этому предмету. */
  ok: boolean;
  min: number | undefined;
}

/**
 * Выбор предмета по одному требованию. Из альтернатив берётся лучший
 * ИЗ ПОДХОДЯЩИХ (сданных и не ниже минимума); если ни один не подходит —
 * лучший из сданных, чтобы объяснить пользователю причину отказа.
 */
function pickSubject(req: ExamRequirement, user: UserProfile, program: Program): Pick | null {
  let best: Pick | null = null;
  for (const subject of requirementSubjects(req)) {
    const value = user.scores[subject];
    if (value === undefined) continue;
    const min = program.minScores[subject];
    const candidate: Pick = { subject, value, min, ok: min === undefined || value >= min };
    if (best === null) {
      best = candidate;
      continue;
    }
    // Подходящий всегда лучше неподходящего; среди равных — балл выше.
    if (candidate.ok !== best.ok ? candidate.ok : candidate.value > best.value) best = candidate;
  }
  return best;
}

/**
 * Балл абитуриента для программы.
 *
 * examScore = сумма по экзаменам программы (для альтернативы — лучший подходящий)
 *           + min(achievementsBonus, 10)
 *
 * eligible = сдан каждый нужный предмет И каждый зачтённый балл ≥ minScores.
 */
export function examScore(program: Program, user: UserProfile): ScoreResult {
  const bonus = Math.min(Math.max(Math.trunc(user.achievementsBonus) || 0, 0), LIMITS.maxAchievementsBonus);
  const picked: (ExamSubject | null)[] = [];
  const reasons: string[] = [];
  let examsSum = 0;

  for (const req of program.exams) {
    const pick = pickSubject(req, user, program);

    if (pick === null) {
      picked.push(null);
      reasons.push(`нет ${requirementLabel(req)}`);
      continue;
    }

    picked.push(pick.subject);

    if (!pick.ok) {
      reasons.push(`${SUBJECT_LABELS[pick.subject].toLowerCase()} ниже минимума ${pick.min}`);
      continue;
    }

    examsSum += pick.value;
  }

  const eligible = reasons.length === 0;
  return { examsSum, bonus, total: examsSum + bonus, picked, eligible, reasons };
}

/** Готовая строка для метки в поиске: «Не подходит: нет физики». */
export function ineligibleLabel(score: ScoreResult): string | null {
  if (score.eligible) return null;
  return `Не подходит: ${score.reasons.join(', ')}`;
}
