/**
 * Приём и агрегация обезличенных событий.
 * Что НЕ собираем: имена, e-mail, IP, user-agent, точные баллы. Подробности —
 * в docs/ANALYTICS.md.
 */
import type { Store } from './db';
import { EVENT_NAMES } from './schemas';

/**
 * Воронка: вложенная последовательность основного сценария. Каждый шаг —
 * подмножество предыдущего, поэтому конверсии читаются честно.
 */
export const FUNNEL: { event: string; label: string }[] = [
  { event: 'onboarding_start', label: 'Открыл онбординг' },
  { event: 'onboarding_complete', label: 'Ответил на 4 вопроса' },
  { event: 'plan_view', label: 'Увидел план' },
  { event: 'program_open', label: 'Открыл направление' },
  { event: 'compare_open', label: 'Сравнил направления' },
  { event: 'plan_share', label: 'Поделился планом' },
];

/**
 * Действия вне воронки: правка плана и переход в План Б случаются
 * на любом шаге, поэтому в воронку их ставить нельзя — она перестала бы
 * убывать и конверсии стали бы бессмысленными.
 */
export const SIDE_ACTIONS: { event: string; label: string }[] = [
  { event: 'plan_edit', label: 'Поправил план' },
  { event: 'planb_open', label: 'Открыл План Б' },
];

export interface FunnelStep {
  name: string;
  count: number;
  /** Конверсия к предыдущему шагу, %. У первого шага — null. */
  conversion: number | null;
}

export interface Stats {
  funnel: FunnelStep[];
  actions: { name: string; count: number }[];
  topCodes: { code: string; count: number }[];
  topPairs: { codes: string; count: number }[];
  verdicts: { verdict: string; count: number }[];
  sessions: number;
  synthetic: number;
  demoMode: boolean;
}

export function periodStart(period: '24h' | '7d' | 'all', now = Date.now()): number {
  if (period === '24h') return now - 24 * 60 * 60 * 1000;
  if (period === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  return 0;
}

export function buildStats(
  store: Store,
  period: '24h' | '7d' | 'all',
  includeSynthetic: boolean,
  demoMode: boolean,
  now = Date.now(),
): Stats {
  const since = periodStart(period, now);
  const sessionsByEvent = store.sessionsByEvent(since, includeSynthetic);

  const funnel: FunnelStep[] = FUNNEL.map((step, index) => {
    const count = sessionsByEvent.get(step.event) ?? 0;
    const previous = index === 0 ? null : (sessionsByEvent.get(FUNNEL[index - 1]!.event) ?? 0);
    return {
      name: step.label,
      count,
      conversion:
        previous === null ? null : previous === 0 ? 0 : Math.round((count / previous) * 100),
    };
  });

  return {
    funnel,
    actions: SIDE_ACTIONS.map((action) => ({
      name: action.label,
      count: sessionsByEvent.get(action.event) ?? 0,
    })),
    topCodes: store
      .topProps(since, includeSynthetic, 'program_open', 'code', 10)
      .map((r) => ({ code: r.value, count: r.count })),
    // Главный продуктовый инсайт: между чем именно абитуриенты выбирают.
    topPairs: store
      .topProps(since, includeSynthetic, 'compare_open', 'codes', 10)
      .map((r) => ({ codes: r.value, count: r.count })),
    verdicts: store
      .topProps(since, includeSynthetic, 'plan_view', 'verdict', 10)
      .map((r) => ({ verdict: r.value, count: r.count })),
    sessions: store.countSessions(since, includeSynthetic),
    synthetic: store.countSynthetic(since),
    demoMode,
  };
}

/** Простой rate-limit в памяти: 60 запросов в минуту на сессию. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit = 60,
    private readonly windowMs = 60_000,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const window = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > window);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

const CODES = [
  '15.03.04', '27.03.04', '13.03.02', '09.03.01', '09.03.04', '38.03.01',
  '40.03.01', '31.05.01', '44.03.01', '09.03.03', '01.03.02', '21.03.01',
];
const VERDICTS = ['good', 'warning', 'danger', 'empty'];
const BUCKETS = ['<200', '200-239', '240-269', '270+'];

/**
 * Синтетические события для демонстрации экрана аналитики: на защите воронка
 * не должна быть пустой. Все записи помечены synthetic=1 и фильтруются в UI.
 */
export function seedSyntheticEvents(store: Store, sessions = 500, now = Date.now()): number {
  let seed = 987654321;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;

  const rows: Parameters<Store['insertEvents']>[0] = [];

  for (let i = 0; i < sessions; i += 1) {
    const sessionId = `synthetic-${i}`;
    // Сессии распределены по последним 7 дням.
    let ts = Math.max(0, now - Math.floor(random() * 7 * 24 * 60 * 60 * 1000));
    const push = (name: string, props: Record<string, string | number | boolean> = {}) => {
      ts += 1000 + Math.floor(random() * 60_000);
      rows.push({ sessionId, name, props, createdAt: ts, synthetic: true });
    };

    push('onboarding_start');
    if (random() < 0.12) continue;

    for (let step = 1; step <= 4; step += 1) push('onboarding_step', { step });
    push('onboarding_complete', {
      scoreBucket: pick(BUCKETS),
      interestsCount: 1 + Math.floor(random() * 3),
      regionMode: pick(['home', 'several', 'any']),
    });

    const verdict = pick(VERDICTS);
    push('plan_view', {
      verdict,
      universities: 1 + Math.floor(random() * 5),
      hasSafe: verdict === 'good' || verdict === 'warning',
    });

    // Правка плана и План Б случаются на любом шаге — они вне воронки.
    if (random() < 0.4) {
      push('plan_edit', {
        action: pick(['move_up', 'move_down', 'remove_program', 'add_program', 'add_university']),
      });
    }
    if (verdict === 'danger' || verdict === 'empty' || random() < 0.15) {
      push('planb_open', { verdict });
    }

    // Дальше — вложенные шаги воронки: сравнение возможно только после
    // открытия карточки, шаринг — после сравнения.
    if (random() >= 0.62) continue;
    const opened = 1 + Math.floor(random() * 3);
    for (let k = 0; k < opened; k += 1) {
      push('program_open', { code: pick(CODES), zone: pick(['safe', 'target', 'reach']) });
    }

    if (random() >= 0.45) continue;
    const pair = [pick(CODES), pick(CODES)].sort();
    push('compare_open', { codes: pair.join('|'), count: 2 });

    if (random() < 0.3) push('plan_share', { method: random() < 0.6 ? 'link' : 'print' });
  }

  store.insertEvents(rows);
  return rows.length;
}

export const KNOWN_EVENTS = EVENT_NAMES;
