import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CAMPAIGN_RULES_NOTE, LIMITS, campaignDate, formatMargin } from '@cursus/core';
import { Alert, Card, Term, ZoneBadge } from '@/ui';
import { useAvailableUniversities, useStore } from '@/store/useStore';
import { planFromLayout } from '@/lib/plan';
import './planb.css';

interface Branch {
  id: string;
  title: string;
  summary: string;
  dates: string;
  pros: string[];
  cons: string[];
  todo: string[];
}

const BRANCHES: Branch[] = [
  {
    id: 'extra',
    title: 'Дополнительный набор',
    summary: 'Вузы, у которых остались незаполненные бюджетные места, объявляют добор.',
    dates: `${campaignDate('extra_admission').label} — следи за объявлениями приёмных комиссий`,
    pros: ['Это всё ещё бюджет и в этом же году', 'Конкурс обычно ниже, чем в основную волну'],
    cons: [
      'Список направлений заранее неизвестен',
      'Решение придётся принимать за несколько дней',
    ],
    todo: [
      'Подписаться на новости приёмных комиссий вузов из плана',
      'Держать документы готовыми к подаче',
      'Заранее решить, на какое направление согласишься',
    ],
  },
  {
    id: 'paid',
    title: 'Платное обучение с переводом на бюджет',
    summary: 'Поступить на платное, а после первого курса перейти на освободившееся место.',
    dates: 'Перевод рассматривают после первой сессии, обычно раз в семестр',
    pros: ['Начинаешь учиться сразу и в том же вузе', 'Перевод бесплатен и реален при хороших оценках'],
    cons: [
      'Перевод не гарантирован: нужны свободные места и отсутствие троек',
      'Первый год придётся платить',
    ],
    todo: [
      'Узнать в вузе правила перехода и сколько человек перевели в прошлом году',
      'Посчитать стоимость первого года',
      'Уточнить, есть ли скидки за высокие баллы ЕГЭ',
    ],
  },
  {
    id: 'college',
    title: 'Колледж, а потом вуз',
    summary: 'Поступление по аттестату без ЕГЭ, затем вуз — уже со специальностью в руках.',
    dates: `${campaignDate('college_free_places').label} — приём на свободные места`,
    pros: ['Не нужны результаты ЕГЭ', 'Профессия и доход появляются раньше', 'Практика с первого курса'],
    cons: ['Путь до диплома вуза длиннее', 'Не все колледжи дают удобный переход в нужный вуз'],
    todo: [
      'Выбрать колледж по той же укрупнённой группе, что и желаемое направление',
      'Проверить, есть ли у колледжа договор с вузом',
      'Уточнить условия поступления на сокращённую программу',
    ],
  },
  {
    id: 'gap',
    title: 'Год на подготовку',
    summary: `Результаты ЕГЭ действуют ${LIMITS.egeValidYears} года — можно пересдать и поступить с лучшим баллом.`,
    dates: 'Регистрация на ЕГЭ следующего года — до 1 февраля',
    pros: [
      'Прошлые результаты не сгорают: улучшаешь только то, что нужно',
      'Год можно потратить на работу или курсы',
    ],
    cons: [
      'Год без студенческого статуса',
      'Для юношей это вопрос отсрочки от армии — его надо решать отдельно',
    ],
    todo: [
      'Понять, каких баллов не хватило и по каким предметам',
      'Выбрать 1–2 предмета для пересдачи',
      'Юношам — уточнить про отсрочку в военкомате',
    ],
  },
];

export function PlanBScreen() {
  const profile = useStore((s) => s.profile);
  const layout = useStore((s) => s.layout);
  const available = useAvailableUniversities();

  const plan = useMemo(
    () => (profile && layout ? planFromLayout(profile, layout, available) : null),
    [profile, layout, available],
  );

  // Ближайшие «мечты» — самые реальные кандидаты на допнабор.
  const closeReach = useMemo(() => {
    if (!plan) return [];
    return plan.universities
      .flatMap((u) =>
        u.programs
          .filter((p) => p.zone === 'reach' && p.margin > -15)
          .map((p) => ({ university: u.university, item: p })),
      )
      .sort((a, b) => b.item.margin - a.item.margin)
      .slice(0, 3);
  }, [plan]);

  const recommended = closeReach.length > 0 ? 'extra' : plan?.universities.length === 0 ? 'college' : 'paid';

  return (
    <div className="stack-l planb-page">
      <div className="stack-s">
        <h1>Если не пройду никуда</h1>
        <p className="text-secondary">
          Это не тупик, а четыре обычных пути. Сроки — {CAMPAIGN_RULES_NOTE}.
        </p>
      </div>

      <Alert kind="info">
        Мы подсветили ветку, которая по твоему плану выглядит самой рабочей. Остальные тоже
        честные — выбирать тебе.
      </Alert>

      <ol className="branches">
        {BRANCHES.map((branch, index) => (
          <li key={branch.id} className="branch">
            <div className="branch-line" aria-hidden="true">
              <span className="branch-dot" />
              {index < BRANCHES.length - 1 ? <span className="branch-stem" /> : null}
            </div>

            <Card className={branch.id === recommended ? 'branch-card branch-card-best' : 'branch-card'}>
              <div className="stack">
                <div className="stack-s">
                  {branch.id === recommended ? (
                    <span className="branch-badge">Рекомендуем по твоему плану</span>
                  ) : null}
                  <h2>{branch.title}</h2>
                  <p className="text-secondary">{branch.summary}</p>
                </div>

                <div className="stack-s">
                  <h3>Сроки</h3>
                  <p className="small">{branch.dates}</p>
                </div>

                <div className="pros-cons">
                  <div className="stack-s">
                    <h3>Плюсы</h3>
                    <ul className="stack-s small">
                      {branch.pros.map((p) => (
                        <li key={p}>+ {p}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="stack-s">
                    <h3>Минусы</h3>
                    <ul className="stack-s small">
                      {branch.cons.map((c) => (
                        <li key={c}>− {c}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="stack-s">
                  <h3>Что сделать</h3>
                  <ul className="stack-s small">
                    {branch.todo.map((t) => (
                      <li key={t} className="todo-row">
                        <span className="todo-box" aria-hidden="true" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>

                {branch.id === 'extra' && closeReach.length > 0 ? (
                  <Card variant="flat">
                    <div className="stack-s">
                      <p className="field-label">
                        Ближе всего к проходному в твоём плане — сюда и смотри в допнаборе
                      </p>
                      <ul className="stack-s">
                        {closeReach.map(({ university, item }) => (
                          <li key={item.program.id} className="stack-s">
                            <Link to={`/program/${item.program.id}`} className="small">
                              <span className="code">{item.program.code}</span> ·{' '}
                              {item.program.name}
                            </Link>
                            <span className="small text-secondary">
                              {university.name} · не хватает {Math.abs(item.margin)} до прогноза (
                              {formatMargin(item.margin)})
                            </span>
                            <ZoneBadge zone={item.zone} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Card>
                ) : null}

                {branch.id === 'gap' ? (
                  <p className="small text-secondary">
                    <Term hint="Cursus не даёт юридических советов. По отсрочке от армии нужно уточнять в военкомате по месту учёта.">
                      Про отсрочку
                    </Term>{' '}
                    — уточни в военкомате.
                  </p>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Link to="/plan">← Вернуться к плану</Link>
    </div>
  );
}
