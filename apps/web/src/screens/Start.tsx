import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CAMPAIGN_RULES_NOTE, LIMITS, ZONE_HINTS, decodeProfile, type Zone } from '@cursus/core';
import { SNAPSHOT_STATS } from '@cursus/data/stats';
import { Button, Card, DemoTag, ZoneBadge } from '@/ui';
import { useStore } from '@/store/useStore';
import { DEMO_PROFILE } from '@/lib/demo';
import { track } from '@/lib/analytics';
import './start.css';

/** Три зоны — единственное понятие, которое нужно знать до онбординга. */
const ZONES: { zone: Zone; margin: number }[] = [
  { zone: 'reach', margin: -22 },
  { zone: 'target', margin: -3 },
  { zone: 'safe', margin: 19 },
];

/**
 * Вход. Если профиль уже есть — сразу план. Если в ссылке есть профиль
 * («Поделиться планом») — принимаем его и строим план по нему.
 *
 * Экран намеренно короткий: это не лендинг, а вход в прототип. Одно главное
 * действие, одно объяснение понятия зон и честная строка про данные.
 */
export function Start() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const shared = params.get('p');

  useEffect(() => {
    if (!shared) return;
    const decoded = decodeProfile(shared);
    if (decoded) {
      setProfile(decoded);
      navigate('/plan', { replace: true });
    }
  }, [shared, setProfile, navigate]);

  if (profile && !shared) return <Navigate to="/plan" replace />;

  return (
    <div className="start">
      <section className="stack">
        <p className="small text-secondary">Навигатор поступления на бюджет</p>
        <h1>Не гадай — проложи курс</h1>
        <p className="start-lead">
          Справочник показывает, куда можно поступить. Cursus отвечает на другой вопрос:{' '}
          <strong>как поступить так, чтобы не остаться без бюджета</strong>. Собирает план из{' '}
          {LIMITS.maxUniversities} вузов и {LIMITS.maxProgramsPerUniversity} направлений в каждом,
          расставляет приоритеты и говорит, где план рискует развалиться.
        </p>

        <div className="start-actions">
          <Button
            onClick={() => {
              track('onboarding_start');
              navigate('/onboarding/1');
            }}
          >
            Построить план за 4 вопроса <ArrowRight size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setProfile(DEMO_PROFILE);
              navigate('/plan');
            }}
          >
            Открыть пример плана
          </Button>
        </div>

        <p className="small text-secondary">
          Без регистрации. Пример — профиль абитуриента из Нижнего Новгорода, сбрасывается кнопкой
          «Начать заново».
        </p>
      </section>

      <section className="stack">
        <h2>Три зоны вместо «шанс 55%»</h2>
        <Card>
          <ul className="zone-legend">
            {ZONES.map(({ zone, margin }) => (
              <li key={zone}>
                <ZoneBadge zone={zone} margin={margin} />
                <span className="small text-secondary">{ZONE_HINTS[zone]}</span>
              </li>
            ))}
          </ul>
        </Card>
        <p className="small text-secondary">
          Число рядом с зоной — запас твоих баллов к прогнозу проходного. Вероятность поступления
          по открытым данным посчитать честно нельзя, поэтому её здесь нет.
        </p>
      </section>

      <section className="stack-s start-footer">
        <p className="small text-secondary">
          В прототипе {SNAPSHOT_STATS.universities} вузов, {SNAPSHOT_STATS.directions} направлений
          и {SNAPSHOT_STATS.regions} регионов. Зарплаты выпускников — Росстат и Роструд, вакансии —
          открытое API «Работа России», список вузов — Wikidata.
        </p>
        <p className="row-tight small text-secondary">
          <DemoTag /> проходные баллы тестовые: открытого источника по ним не существует. Сроки и
          правила — {CAMPAIGN_RULES_NOTE}.
        </p>
      </section>
    </div>
  );
}
