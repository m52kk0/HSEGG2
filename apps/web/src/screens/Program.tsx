import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, ExternalLink } from 'lucide-react';
import {
  SUBJECT_LABELS,
  evaluate,
  formatMargin,
  pointsWord,
  requirementLabel,
  type Program,
  type UserProfile,
} from '@cursus/core';
import {
  SALARIES_SOURCE,
  SNAPSHOT_DATE,
  getContent,
  getProgram,
  getRegion,
  getSalaries,
  getUniversity,
  programsOfCode,
  similarCodes,
} from '@cursus/data';
import { Alert, Button, Card, DemoTag, EmptyState, Skeleton, Tooltip, ZoneBadge } from '@/ui';
import { MiniChart } from '@/ui/MiniChart';
import { useStore } from '@/store/useStore';
import { fetchVacancies, type VacanciesResponse } from '@/lib/api';
import { formatDate, formatEmployed, formatSalary, formatVacancySalary } from '@/lib/format';
import { track } from '@/lib/analytics';
import './program.css';

export function ProgramScreen() {
  const { id } = useParams();
  const profile = useStore((s) => s.profile);
  const program = id ? getProgram(id) : null;

  useEffect(() => {
    if (!program || !profile) return;
    const zone = evaluate(program, profile).zone;
    track('program_open', { code: program.code, zone: zone ?? 'none' });
  }, [program, profile]);

  if (!program) {
    return (
      <EmptyState
        title="Направление не найдено"
        text="Возможно, ссылка устарела. Найди направление по коду или названию в поиске."
        action={
          <Link to="/search">
            <Button>Открыть поиск</Button>
          </Link>
        }
      />
    );
  }

  return <ProgramBody program={program} profile={profile} />;
}

function ProgramBody({ program, profile }: { program: Program; profile: UserProfile | null }) {
  const university = getUniversity(program.universityId);
  const content = getContent(program.code);
  const layout = useStore((s) => s.layout);
  const addProgram = useStore((s) => s.addProgram);
  const compare = useStore((s) => s.compare);
  const toggleCompare = useStore((s) => s.toggleCompare);

  const evaluation = profile ? evaluate(program, profile) : null;
  const inPlan = Boolean(
    layout?.universities.some((u) => u.programIds.includes(program.id)),
  );
  const region = university?.region ?? null;
  const salaries = getSalaries(program.code, region);

  // Переключатель вуза: то же направление в других вузах региона.
  const sameCode = useMemo(
    () =>
      programsOfCode(program.code)
        .filter((p) => p.id !== program.id)
        .map((p) => ({ program: p, university: getUniversity(p.universityId) }))
        .filter((x) => x.university !== null && x.university.region === region)
        .slice(0, 6),
    [program, region],
  );

  const history = (['2023', '2024', '2025'] as const).flatMap((year) => {
    const value = program.cutoffs[year];
    return typeof value === 'number' ? [{ label: year as string, value }] : [];
  });

  const forecast =
    evaluation?.forecast.predictedCutoff != null
      ? { label: 'прогноз', value: evaluation.forecast.predictedCutoff }
      : null;

  return (
    <div className="stack-l program-page">
      <header className="stack">
        <div className="stack-s">
          <p className="small text-secondary">
            {university?.name ?? 'Вуз не найден'}
            {university ? ` · ${university.city}` : ''}
          </p>
          <h1>
            <span className="code">{program.code}</span> · {program.name}
          </h1>
        </div>

        {evaluation?.zone != null && evaluation.margin != null ? (
          <div className="row">
            <ZoneBadge zone={evaluation.zone} pill />
            <span className="text-secondary small">
              {formatMargin(evaluation.margin)} {pointsWord(evaluation.margin)} к прогнозу
              проходного
            </span>
          </div>
        ) : (
          <Alert kind="info">
            Чтобы увидеть зону и запас баллов, пройди 4 вопроса — расчёт идёт по твоим предметам.
            <Link to="/onboarding/1">Построить план</Link>
          </Alert>
        )}

        <div className="row no-print">
          {profile ? (
            <Button
              disabled={inPlan}
              onClick={() => addProgram(program.universityId, program.id)}
            >
              {inPlan ? (
                <>
                  <Check size={16} aria-hidden="true" /> В плане
                </>
              ) : (
                'Добавить в план'
              )}
            </Button>
          ) : (
            <Link to="/onboarding/1">
              <Button>Построить план</Button>
            </Link>
          )}
          <Button variant="secondary" onClick={() => toggleCompare(program.id)}>
            {compare.includes(program.id) ? 'Убрать из сравнения' : 'Сравнить'}
          </Button>
        </div>
      </header>

      {/* ---------- Сколько нужно баллов ---------- */}
      <section className="stack">
        <div className="row-tight">
          <h2>Сколько нужно баллов</h2>
          {program.isDemo ? <DemoTag /> : null}
        </div>

        {history.length > 0 ? (
          <Card>
            <div className="stack">
              <MiniChart
                history={history}
                forecast={forecast}
                userScore={evaluation?.score.eligible ? evaluation.score.total : null}
                userLabel="твой балл"
              />
              <p className="small text-secondary">
                Прогноз — это продолжение тренда за три года, а не вероятность поступления.
                Проходные в прототипе тестовые.
              </p>
            </div>
          </Card>
        ) : (
          <p className="text-secondary small">Проходных баллов по этому направлению нет.</p>
        )}

        <div className="facts">
          <div className="fact">
            <span className="data">{program.budgetPlaces}</span>
            <span className="small text-secondary">бюджетных мест</span>
          </div>
          {evaluation?.forecast.predictedCutoff != null ? (
            <div className="fact">
              <span className="data">{evaluation.forecast.predictedCutoff}</span>
              <span className="small text-secondary">прогноз проходного</span>
            </div>
          ) : null}
          {evaluation?.score.eligible ? (
            <div className="fact">
              <span className="data">{evaluation.score.total}</span>
              <span className="small text-secondary">
                твой балл{evaluation.score.bonus > 0 ? ` (+${evaluation.score.bonus} за достижения)` : ''}
              </span>
            </div>
          ) : null}
        </div>

        <div className="stack-s">
          <h3>Экзамены и минимальные баллы</h3>
          <ul className="stack-s">
            {program.exams.map((requirement, index) => {
              const picked = evaluation?.score.picked[index] ?? null;
              const subjects = Array.isArray(requirement) ? requirement : [requirement];
              // Для одного предмета название не повторяем — оно уже в заголовке строки.
              const mins =
                subjects.length === 1 && subjects[0]
                  ? `не ниже ${program.minScores[subjects[0]] ?? 39}`
                  : subjects
                      .map(
                        (s) => `${SUBJECT_LABELS[s].toLowerCase()} — не ниже ${program.minScores[s] ?? 39}`,
                      )
                      .join(', ');
              const failed =
                profile != null &&
                evaluation != null &&
                !evaluation.score.eligible &&
                picked === null;
              const belowMin =
                picked != null &&
                profile != null &&
                (profile.scores[picked] ?? 0) < (program.minScores[picked] ?? 0);

              return (
                <li key={index} className={failed || belowMin ? 'exam-row exam-row-failed' : 'exam-row'}>
                  <span>{requirementLabel(requirement)}</span>
                  <span className="small text-secondary">{mins}</span>
                  {failed ? <span className="small exam-note">не сдаёшь этот предмет</span> : null}
                  {belowMin ? (
                    <span className="small exam-note">
                      твой балл ниже минимума: {profile?.scores[picked!]}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ---------- Чему научат ---------- */}
      {content?.learn ? (
        <section className="stack-s">
          <h2>Чему научат</h2>
          <p>{content.learn}</p>
        </section>
      ) : null}

      {/* ---------- Кем будешь работать ---------- */}
      <section className="stack">
        <h2>Кем будешь работать</h2>
        {content?.jobs && content.jobs.length > 0 ? (
          <ul className="row">
            {content.jobs.map((job) => (
              <li key={job} className="job-chip">
                {job}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small text-secondary">
            Список профессий по этому направлению мы ещё не описали.
          </p>
        )}

        <Card variant="flat">
          <div className="stack-s">
            <p>
              <strong>
                Зарплата выпускников{' '}
                {salaries.fallbackToRussia ? 'по России' : `в регионе: ${region ?? 'Россия'}`}
              </strong>
            </p>
            <ul className="stack-s small">
              <li>
                Через год после выпуска:{' '}
                <strong>{formatSalary(salaries.entry?.y1?.salary) ?? 'нет данных'}</strong>
                {formatEmployed(salaries.entry?.y1?.employed)
                  ? `, ${formatEmployed(salaries.entry?.y1?.employed)}`
                  : ''}
              </li>
              <li>
                Через 5 лет:{' '}
                <strong>{formatSalary(salaries.entry?.y5?.salary) ?? 'нет данных'}</strong>
                {formatEmployed(salaries.entry?.y5?.employed)
                  ? `, ${formatEmployed(salaries.entry?.y5?.employed)}`
                  : ''}
              </li>
            </ul>
            <p className="source">
              Источник: {SALARIES_SOURCE}. Зарплата измерена в 2024 году.
              {salaries.fallbackToRussia ? ' По этому региону данных нет — показываем по России.' : ''}
            </p>
          </div>
        </Card>
      </section>

      {/* ---------- Вакансии сейчас ---------- */}
      <VacanciesBlock
        query={content?.vacancyQuery ?? program.name}
        regionCode={region ? (getRegion(region)?.trudvsemCode ?? null) : null}
        regionName={region}
      />

      {/* ---------- Похожие направления ---------- */}
      <SimilarBlock program={program} profile={profile} />

      {/* ---------- Тот же код в других вузах ---------- */}
      {sameCode.length > 0 ? (
        <section className="stack-s">
          <h2>Это же направление в других вузах</h2>
          <ul className="stack-s">
            {sameCode.map(({ program: other, university: otherUniversity }) => {
              const otherEval = profile ? evaluate(other, profile) : null;
              return (
                <li key={other.id} className="similar-row">
                  <Link to={`/program/${other.id}`} className="similar-main">
                    {otherUniversity?.name}
                  </Link>
                  {otherEval?.zone && otherEval.margin != null ? (
                    <ZoneBadge zone={otherEval.zone} margin={otherEval.margin} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Вакансии */

function VacanciesBlock({
  query,
  regionCode,
  regionName,
}: {
  query: string;
  regionCode: string | null;
  regionName: string | null;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [data, setData] = useState<VacanciesResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setState('loading');
    void fetchVacancies(query, regionCode).then((response) => {
      if (!alive) return;
      if (!response) {
        setState('offline');
        return;
      }
      setData(response);
      setState('ready');
      track('vacancies_loaded', { source: response.source });
    });
    return () => {
      alive = false;
    };
  }, [query, regionCode]);

  return (
    <section className="stack">
      <div className="row-tight">
        <h2>Вакансии сейчас</h2>
        <Tooltip text="Живые вакансии из открытого API «Работа России» по этому направлению и региону." />
      </div>

      {state === 'loading' ? (
        <div className="stack-s">
          <Skeleton height={20} width="60%" />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : null}

      {state === 'offline' ? (
        <Alert kind="info">
          Живые вакансии сейчас недоступны — сервер не отвечает. Остальной план работает без него.
        </Alert>
      ) : null}

      {state === 'ready' && data ? (
        <div className="stack">
          <p className="small text-secondary">
            {data.total > 0
              ? `${data.total} вакансий по запросу «${query}»${regionName ? `, ${regionName}` : ''}`
              : `По запросу «${query}» вакансий не нашлось`}
            {data.source !== 'live'
              ? ` · данные на ${formatDate(data.source === 'snapshot' ? SNAPSHOT_DATE : data.fetchedAt)}`
              : ''}
          </p>
          <ul className="stack-s">
            {data.items.slice(0, 3).map((item) => (
              <li key={item.url} className="vacancy-row">
                <div className="stack-s">
                  <span>{item.title}</span>
                  <span className="small text-secondary">
                    {item.company} · {formatVacancySalary(item.salaryMin, item.salaryMax)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <a
            href={`https://trudvsem.ru/search/vacancy?text=${encodeURIComponent(query)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="row-tight"
          >
            Все вакансии <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------ Похожие направления */

function SimilarBlock({ program, profile }: { program: Program; profile: UserProfile | null }) {
  const setCompare = useStore((s) => s.setCompare);
  const compare = useStore((s) => s.compare);
  const university = getUniversity(program.universityId);

  const items = useMemo(() => {
    const base = profile ? evaluate(program, profile) : null;
    return similarCodes(program.code)
      .map((similar) => {
        // Сначала ищем то же направление в этом же вузе, иначе — в этом регионе.
        const candidates = programsOfCode(similar.code);
        const sameUniversity = candidates.find((p) => p.universityId === program.universityId);
        const sameRegion = candidates.find(
          (p) => getUniversity(p.universityId)?.region === university?.region,
        );
        const target = sameUniversity ?? sameRegion ?? candidates[0];
        if (!target) return null;

        const targetEval = profile ? evaluate(target, profile) : null;
        // Для автоматических похожих diff генерируется из данных.
        let diff = similar.diff;
        if (!diff) {
          const a = base?.forecast.predictedCutoff;
          const b = targetEval?.forecast.predictedCutoff;
          if (a != null && b != null && a !== b) {
            diff = b < a ? `проходной ниже на ${a - b}` : `проходной выше на ${b - a}`;
          } else {
            diff = 'та же укрупнённая группа направлений';
          }
        }

        return { program: target, diff, evaluation: targetEval };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [program, profile, university]);

  if (items.length === 0) return null;

  return (
    <section className="stack">
      <h2>Похожие направления</h2>
      <ul className="stack-s">
        {items.map((item) => (
          <li key={item.program.id} className="similar-row">
            <div className="similar-main">
              <Link to={`/program/${item.program.id}`}>
                <span className="code">{item.program.code}</span> · {item.program.name}
              </Link>
              <p className="small text-secondary">{item.diff}</p>
            </div>
            <div className="row similar-actions">
              {item.evaluation?.zone && item.evaluation.margin != null ? (
                <ZoneBadge zone={item.evaluation.zone} margin={item.evaluation.margin} />
              ) : null}
              <Button
                size="s"
                variant="secondary"
                className="no-print"
                onClick={() => setCompare([program.id, item.program.id])}
              >
                Сравнить
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {compare.length > 0 ? (
        <Link to="/compare" className="no-print">
          Открыть сравнение ({compare.length})
        </Link>
      ) : null}
    </section>
  );
}
