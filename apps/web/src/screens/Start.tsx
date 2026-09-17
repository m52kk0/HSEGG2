import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CAMPAIGN_RULES_NOTE, LIMITS, ZONE_HINTS, ZONE_LABELS, decodeProfile } from '@cursus/core';
import { SNAPSHOT_DATE, snapshotStats } from '@cursus/data';
import { Button, Card, DemoTag, ZoneBadge } from '@/ui';
import { useStore } from '@/store/useStore';
import { DEMO_PROFILE } from '@/lib/demo';
import { formatDate } from '@/lib/format';
import { track } from '@/lib/analytics';
import './start.css';

/**
 * Вход. Если профиль уже есть — сразу план. Если в ссылке есть профиль
 * («Поделиться планом») — принимаем его и строим план по нему.
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

  const start = () => {
    track('onboarding_start');
    navigate('/onboarding/1');
  };

  return (
    <div className="start">
      <section className="start-hero">
        <div className="stack">
          <p className="small text-secondary">Навигатор поступления на бюджет</p>
          <h1>Не гадай — проложи курс</h1>
          <p className="start-lead">
            Справочник отвечает на вопрос «куда я могу поступить». Cursus отвечает на другой:
            <strong> как поступить так, чтобы не остаться без бюджета</strong>. Строит маршрут из{' '}
            {LIMITS.maxUniversities} вузов и {LIMITS.maxProgramsPerUniversity} направлений в
            каждом — и объясняет, в каком порядке их ставить.
          </p>
        </div>

        <div className="start-actions">
          <Button onClick={start}>
            Построить план за 4 вопроса <ArrowRight size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setProfile(DEMO_PROFILE);
              navigate('/plan');
            }}
          >
            Посмотреть на примере
          </Button>
        </div>
        <p className="small text-secondary">
          Без регистрации и личных данных. «На примере» — готовый профиль абитуриента из Нижнего
          Новгорода, его можно сбросить одной кнопкой.
        </p>
      </section>

      {/* Три зоны — главное понятие продукта. Объясняем до онбординга. */}
      <section className="stack">
        <h2>Вместо процентов «шанс 55%» — три зоны</h2>
        <p className="text-secondary start-lead">
          По открытым данным честно посчитать вероятность нельзя, а обманывать абитуриента на
          таком решении нельзя тем более. Поэтому Cursus показывает запас баллов к прогнозу
          проходного и называет зону словом.
        </p>
        <ul className="zone-cards">
          {(['reach', 'target', 'safe'] as const).map((zone) => (
            <li key={zone}>
              <Card>
                <div className="stack-s">
                  <ZoneBadge
                    zone={zone}
                    margin={zone === 'safe' ? 19 : zone === 'target' ? -3 : -22}
                    pill
                  />
                  <p className="small">{ZONE_HINTS[zone]}</p>
                  <p className="small text-secondary">
                    {zone === 'reach'
                      ? 'Ставится первым приоритетом: если не пройдёшь, зачислят на следующий.'
                      : zone === 'target'
                        ? 'Здесь и решается конкурс — именно такие направления надо считать.'
                        : 'Страховка от «не поступил никуда». Хотя бы одна должна быть в плане.'}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <p className="small text-secondary">
          {ZONE_LABELS.safe} — запас от {LIMITS.maxAchievementsBonus} баллов и выше. Пороги зон
          описаны в документации, их можно проверить.
        </p>
      </section>

      <section className="stack">
        <h2>Чем это отличается от справочника</h2>
        <ul className="compare-cards">
          <li>
            <Card variant="flat">
              <div className="stack-s">
                <h3>Справочники</h3>
                <ul className="stack-s small text-secondary">
                  <li>— Каталог вузов и фильтры</li>
                  <li>— Проценты «шанса» без объяснения</li>
                  <li>— Профориентационные тесты</li>
                  <li>— Решение остаётся на тебе</li>
                </ul>
              </div>
            </Card>
          </li>
          <li>
            <Card>
              <div className="stack-s">
                <h3>Cursus</h3>
                <ul className="stack-s small">
                  <li>— Готовый план: вузы, направления и порядок приоритетов</li>
                  <li>— Запас баллов «+12» или «−8» вместо процентов</li>
                  <li>— Предупреждения о рисках: нет запасного, порядок обесценивает мечту</li>
                  <li>— План Б со сроками, если не пройдёшь никуда</li>
                </ul>
              </div>
            </Card>
          </li>
        </ul>
        <p className="small text-secondary">
          Подавать документы Cursus не помогает — это делают Госуслуги. Мы помогаем решить, что
          именно подавать.
        </p>
      </section>

      <section className="stack-s start-footer">
        <h2>Что под капотом</h2>
        <ul className="facts-row">
          <li>
            <span className="data">{snapshotStats.universities}</span>
            <span className="small text-secondary">вузов в снимке</span>
          </li>
          <li>
            <span className="data">{snapshotStats.directions}</span>
            <span className="small text-secondary">направлений бакалавриата</span>
          </li>
          <li>
            <span className="data">{snapshotStats.regions}</span>
            <span className="small text-secondary">регионов</span>
          </li>
        </ul>
        <p className="small text-secondary">
          Зарплаты выпускников и трудоустройство — Росстат и Роструд. Вакансии — живой API
          «Работа России». Список вузов — Wikidata, он неполный, и это честно указано в
          документации. Данные на {formatDate(SNAPSHOT_DATE)}.
        </p>
        <p className="row-tight small text-secondary">
          <DemoTag /> проходные баллы в прототипе — тестовые: открытого источника по ним не
          существует. Правила и сроки — {CAMPAIGN_RULES_NOTE}.
        </p>
      </section>
    </div>
  );
}
