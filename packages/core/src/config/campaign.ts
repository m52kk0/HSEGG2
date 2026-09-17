// Даты по правилам 2026; даты кампании 2027 уточняются.
// Единственный источник правды по срокам приёмной кампании: интерфейс всегда
// показывает их с пометкой «по правилам 2026 года».

/** Пометка, которой сопровождается любая дата кампании в интерфейсе. */
export const CAMPAIGN_RULES_NOTE = 'по правилам 2026 года';

/** Год кампании, к которой относятся правила. */
export const CAMPAIGN_YEAR = 2026;

export interface CampaignDate {
  /** Машинный ключ для тестов и аналитики. */
  id: string;
  /** Дата в формате ISO без года-привязки к конкретной кампании. */
  date: string;
  /** Человеческая формулировка для интерфейса. */
  label: string;
  /** Что именно происходит — одна фраза без канцелярита. */
  description: string;
}

export const CAMPAIGN_DATES: readonly CampaignDate[] = [
  {
    id: 'priorities_lock',
    date: '2026-07-25',
    label: 'до 25 июля',
    description: 'Последний день, когда можно менять порядок направлений. После — нельзя.',
  },
  {
    id: 'consent',
    date: '2026-07-25',
    label: 'до 25 июля',
    description: 'Согласие на зачисление подаётся только в один вуз и только на одно направление.',
  },
  {
    id: 'extra_admission',
    date: '2026-08-12',
    label: 'примерно с 12 августа',
    description: 'Дополнительный набор: вузы объявляют места, которые остались незаполненными.',
  },
  {
    id: 'college_free_places',
    date: '2026-11-25',
    label: 'до 25 ноября',
    description: 'Приём в колледжи на свободные места.',
  },
] as const;

export function campaignDate(id: string): CampaignDate {
  const found = CAMPAIGN_DATES.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown campaign date: ${id}`);
  return found;
}

/** Лимиты, заданные правилами приёма. */
export const LIMITS = {
  /** Не более чем в 5 вузов. */
  maxUniversities: 5,
  /** Не более чем на 5 направлений в каждом вузе. */
  maxProgramsPerUniversity: 5,
  /** Индивидуальные достижения — максимум 10 баллов суммарно. */
  maxAchievementsBonus: 10,
  /** Результаты ЕГЭ действительны 4 года. */
  egeValidYears: 4,
  /** Сколько направлений можно сравнить одновременно. */
  maxCompare: 3,
  /** Сколько интересов выбирает абитуриент в онбординге. */
  maxInterests: 3,
} as const;

/** Внешняя ссылка на подачу документов — это делают Госуслуги, не мы. */
export const GOSUSLUGI_URL = 'https://www.gosuslugi.ru/superservice/priem-v-vuz';
