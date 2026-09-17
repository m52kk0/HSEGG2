import type { InterestId } from './types';
import { INTEREST_IDS } from './types';

export interface InterestGroup {
  id: InterestId;
  label: string;
  /** Подпись на плитке — примеры, чтобы не нужно было знать УГСН. */
  hint: string;
  /** Первые две цифры кода направления (УГСН), которые относятся к группе. */
  prefixes: readonly string[];
}

/**
 * 8 плиток онбординга. Группы намеренно пересекаются (01 и 02 — и IT,
 * и естественные науки): абитуриент думал бы так же.
 */
export const INTEREST_GROUPS: readonly InterestGroup[] = [
  {
    id: 'it',
    label: 'IT и программирование',
    hint: 'разработка, данные, кибербезопасность',
    prefixes: ['09', '10', '02', '01', '11'],
  },
  {
    id: 'engineering',
    label: 'Инженерия и производство',
    hint: 'машины, автоматизация, стройка, транспорт',
    prefixes: [
      '15', '27', '12', '16', '17', '18', '19', '20', '22', '23', '24', '25', '26', '28', '29',
      '07', '08',
    ],
  },
  {
    id: 'energy',
    label: 'Энергетика',
    hint: 'электросети, теплоэнергетика, нефть и газ',
    prefixes: ['13', '14', '21'],
  },
  {
    id: 'economics',
    label: 'Экономика и управление',
    hint: 'финансы, менеджмент, логистика, туризм',
    prefixes: ['38', '43'],
  },
  {
    id: 'medicine',
    label: 'Медицина',
    hint: 'лечебное дело, фармация, здоровье',
    prefixes: ['30', '31', '32', '33', '34'],
  },
  {
    id: 'education',
    label: 'Педагогика',
    hint: 'преподавание, спорт, работа с детьми',
    prefixes: ['44', '49'],
  },
  {
    id: 'science',
    label: 'Естественные науки',
    hint: 'физика, химия, биология, экология, агро',
    prefixes: ['03', '04', '05', '06', '35', '36'],
  },
  {
    id: 'humanities',
    label: 'Гуманитарные и право',
    hint: 'юрист, психолог, языки, медиа, история',
    prefixes: ['40', '37', '39', '41', '42', '45', '46', '47', '48', '50', '51', '52', '53', '54', '55'],
  },
] as const;

const BY_ID = new Map<InterestId, InterestGroup>(INTEREST_GROUPS.map((g) => [g.id, g]));

export function interestGroup(id: InterestId): InterestGroup {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`Unknown interest: ${id}`);
  return g;
}

export function interestLabel(id: InterestId): string {
  return interestGroup(id).label;
}

/** УГСН направления — первые две цифры кода («15.03.04» → «15»). */
export function ugsn(code: string): string {
  return code.slice(0, 2);
}

/** Попадает ли код направления в группу интересов. */
export function matchesInterest(code: string, id: InterestId): boolean {
  return interestGroup(id).prefixes.includes(ugsn(code));
}

/**
 * Место кода в списке интересов пользователя: 0 — самый важный интерес.
 * Если ни в один не попадает — длина списка (хуже любого совпадения).
 */
export function interestRank(code: string, interests: readonly InterestId[]): number {
  for (let i = 0; i < interests.length; i += 1) {
    const id = interests[i];
    if (id && matchesInterest(code, id)) return i;
  }
  return interests.length;
}

/** Все УГСН, которые интересны пользователю. Пустой список интересов = интересно всё. */
export function allowedPrefixes(interests: readonly InterestId[]): Set<string> | null {
  if (interests.length === 0) return null;
  const set = new Set<string>();
  for (const id of interests) for (const p of interestGroup(id).prefixes) set.add(p);
  return set;
}

export const ALL_INTEREST_IDS = INTEREST_IDS;
