/**
 * Клиент аналитики. Собираем только обезличенные события: ни имён, ни e-mail,
 * ни точных баллов (баллы — корзиной). Подробности — в docs/ANALYTICS.md.
 */
import { makeId, readJson, writeJson } from './storage';

export type EventName =
  | 'onboarding_start'
  | 'onboarding_step'
  | 'onboarding_complete'
  | 'plan_view'
  | 'plan_edit'
  | 'program_open'
  | 'compare_open'
  | 'planb_open'
  | 'vacancies_loaded'
  | 'plan_share';

export type EventProps = Record<string, string | number | boolean>;

interface QueuedEvent {
  name: EventName;
  props?: EventProps;
  ts: number;
}

const KEY_SESSION = 'cursus.session.v1';
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 50;

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function sessionId(): string {
  const stored = readJson<string>(KEY_SESSION);
  if (typeof stored === 'string' && stored.length > 0) return stored;
  const fresh = makeId();
  writeJson(KEY_SESSION, fresh);
  return fresh;
}

/** Баллы уходят только корзиной — восстановить конкретного человека нельзя. */
export function scoreBucket(total: number): '<200' | '200-239' | '240-269' | '270+' {
  if (total < 200) return '<200';
  if (total < 240) return '200-239';
  if (total < 270) return '240-269';
  return '270+';
}

function ymId(): string {
  return (import.meta.env.VITE_YM_ID as string | undefined) ?? '';
}

interface YmWindow {
  ym?: (id: number, action: string, goal: string, params?: EventProps) => void;
}

function sendToMetrika(name: EventName, props?: EventProps): void {
  const id = ymId();
  if (!id) return;
  const ym = (window as unknown as YmWindow).ym;
  if (typeof ym === 'function') ym(Number(id), 'reachGoal', name, props);
}

function flush(): void {
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(batch.length);

  const body = JSON.stringify({ sessionId: sessionId(), events: batch });

  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Аналитика никогда не ломает сценарий: /api может быть недоступен.
    });
  } catch {
    // См. выше.
  }
}

function ensureTimer(): void {
  if (timer !== null || typeof window === 'undefined') return;
  timer = setInterval(flush, FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

export function track(name: EventName, props?: EventProps): void {
  if (typeof window === 'undefined') return;
  queue.push({ name, props, ts: Date.now() });
  ensureTimer();
  sendToMetrika(name, props);
  if (queue.length >= MAX_BATCH) flush();
}

export function flushAnalytics(): void {
  flush();
}
