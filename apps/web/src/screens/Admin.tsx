import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Skeleton, Switch, Tabs } from '@/ui';
import { fetchAdminStats, seedDemoEvents, type AdminStats } from '@/lib/api';
import { readSession, writeSession } from '@/lib/storage';
import './admin.css';

type Period = '24h' | '7d' | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24 часа' },
  { value: '7d', label: '7 дней' },
  { value: 'all', label: 'Всё время' },
];

const TOKEN_KEY = 'cursus.admin.token';

/** Скрытый маршрут: в навигации его нет. Защита — токен из ADMIN_TOKEN. */
export function AdminScreen() {
  const [token, setToken] = useState<string>(() => readSession(TOKEN_KEY) ?? '');
  const [draftToken, setDraftToken] = useState('');
  const [period, setPeriod] = useState<Period>('7d');
  const [includeSynthetic, setIncludeSynthetic] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'offline'>('loading');

  const load = useCallback(() => {
    setState('loading');
    void fetchAdminStats(period, token || null, includeSynthetic).then((result) => {
      if (!result) {
        setState(token ? 'denied' : 'offline');
        return;
      }
      setStats(result);
      setState('ready');
    });
  }, [period, token, includeSynthetic]);

  useEffect(load, [load]);

  return (
    <div className="stack-l admin-page">
      <div className="stack-s">
        <h1>Аналитика</h1>
        <p className="text-secondary small">
          Обезличенные события: ни имён, ни контактов, ни точных баллов — только корзины.
        </p>
      </div>

      {stats?.demoMode ? (
        <Alert kind="info">
          Демо-режим: ADMIN_TOKEN не задан в окружении, поэтому страница открыта без пароля.
        </Alert>
      ) : null}

      {state === 'denied' || (state === 'offline' && !stats) ? (
        <Card>
          <div className="stack">
            <h2>Нужен токен</h2>
            <p className="small text-secondary">
              Введи значение ADMIN_TOKEN. Он хранится только в sessionStorage этой вкладки.
            </p>
            <Input
              label="ADMIN_TOKEN"
              type="password"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
            />
            <Button
              onClick={() => {
                writeSession(TOKEN_KEY, draftToken);
                setToken(draftToken);
              }}
            >
              Войти
            </Button>
            <p className="small text-secondary">
              Если сервер аналитики не запущен, экран останется пустым — сценарий продукта от него
              не зависит.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="row">
        <Tabs items={PERIODS} value={period} onChange={setPeriod} label="Период" />
        <span className="spacer" />
        <Switch
          label="Показывать синтетические"
          checked={includeSynthetic}
          onChange={setIncludeSynthetic}
        />
      </div>

      {state === 'loading' ? (
        <div className="stack-s">
          <Skeleton height={28} width="40%" />
          <Skeleton height={180} />
        </div>
      ) : null}

      {stats ? (
        <>
          <section className="stack">
            <h2>Воронка</h2>
            <ul className="stack-s">
              {stats.funnel.map((step) => {
                const first = stats.funnel[0]?.count ?? 0;
                const width = first > 0 ? Math.round((step.count / first) * 100) : 0;
                return (
                  <li key={step.name} className="funnel-row">
                    <span className="funnel-label small">{step.name}</span>
                    <span className="funnel-bar" aria-hidden="true">
                      <span className="funnel-fill" style={{ width: `${width}%` }} />
                    </span>
                    <span className="funnel-value small">
                      {step.count}
                      {step.conversion != null ? (
                        <span className="text-secondary"> · {step.conversion}%</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="small text-secondary">
              Всего сессий за период: {stats.sessions}
              {stats.synthetic > 0 ? ` (из них синтетических: ${stats.synthetic})` : ''}
            </p>
          </section>

          <div className="admin-grid">
            <TopList title="Топ-10 открываемых направлений" items={stats.topCodes.map((c) => ({ label: c.code, count: c.count }))} />
            <TopList
              title="Топ-10 сравниваемых пар"
              items={stats.topPairs.map((p) => ({ label: p.codes.replace(/\|/g, ' ↔ '), count: p.count }))}
              hint="Главный продуктовый инсайт: между чем именно люди выбирают."
            />
            <TopList
              title="Распределение вердиктов"
              items={stats.verdicts.map((v) => ({ label: v.verdict, count: v.count }))}
            />
          </div>

          {stats.demoMode ? (
            <div className="row no-print">
              <Button
                variant="secondary"
                onClick={() => {
                  void seedDemoEvents().then(load);
                }}
              >
                Заполнить демо-событиями
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function TopList({
  title,
  items,
  hint,
}: {
  title: string;
  items: { label: string; count: number }[];
  hint?: string;
}) {
  const max = items.reduce((acc, i) => Math.max(acc, i.count), 0);
  return (
    <Card>
      <div className="stack-s">
        <h3>{title}</h3>
        {hint ? <p className="small text-secondary">{hint}</p> : null}
        {items.length === 0 ? (
          <p className="small text-secondary">Пока нет событий за этот период.</p>
        ) : (
          <ul className="stack-s">
            {items.slice(0, 10).map((item) => (
              <li key={item.label} className="top-row">
                <span className="small">{item.label}</span>
                <span className="top-bar" aria-hidden="true">
                  <span
                    className="top-fill"
                    style={{ width: `${max > 0 ? (item.count / max) * 100 : 0}%` }}
                  />
                </span>
                <span className="small text-secondary">{item.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
