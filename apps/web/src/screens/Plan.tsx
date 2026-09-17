import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, Plus, Printer, X } from 'lucide-react';
import {
  CAMPAIGN_RULES_NOTE,
  GOSUSLUGI_URL,
  LIMITS,
  ZONE_LABELS,
  campaignDate,
  encodeProfile,
  pointsWord,
  type Plan,
  type PlanUniversity,
  type UserProfile,
} from '@cursus/core';
import { Alert, Button, Card, DemoTag, IconButton, Term, Tooltip, ZoneBadge } from '@/ui';
import { useAvailableUniversities, useStore } from '@/store/useStore';
import {
  addableProgramsOfUniversity,
  addableUniversities,
  planFromLayout,
} from '@/lib/plan';
import { track } from '@/lib/analytics';
import './plan.css';

export function PlanScreen() {
  const profile = useStore((s) => s.profile);
  const layout = useStore((s) => s.layout);
  const available = useAvailableUniversities();

  const plan = useMemo(
    () => (profile && layout ? planFromLayout(profile, layout, available) : null),
    [profile, layout, available],
  );

  useEffect(() => {
    if (!plan) return;
    track('plan_view', {
      verdict: plan.verdict.level,
      universities: plan.universities.length,
      hasSafe: plan.universities.some((u) => u.programs.some((p) => p.zone === 'safe')),
    });
  }, [plan]);

  if (!profile || !layout) return <Navigate to="/" replace />;
  if (!plan) return null;

  return (
    <div className="stack-l plan">
      <VerdictBlock plan={plan} />
      <WarningsBlock plan={plan} />

      {plan.universities.length === 0 ? (
        <EmptyPlan />
      ) : (
        <ul className="stack">
          {plan.universities.map((entry) => (
            <UniversityCard key={entry.university.wikidata} entry={entry} plan={plan} profile={profile} />
          ))}
        </ul>
      )}

      <AddUniversityBlock plan={plan} profile={profile} available={available} />
      <PlanBTeaser verdict={plan.verdict.level} />
      <NextSteps />
      <ShareBlock profile={profile} />
      <ResetBlock />
    </div>
  );
}

/* ---------------------------------------------------------------- Вердикт */

function VerdictBlock({ plan }: { plan: Plan }) {
  const { verdict } = plan;
  return (
    <section className="stack-s verdict" aria-live="polite">
      <div className="row-tight">
        <span className={`verdict-dot verdict-${verdict.level}`} aria-hidden="true" />
        <span className="small text-secondary">Вердикт по твоему плану</span>
      </div>
      <h1>{verdict.title}</h1>
      <p className="text-secondary">{verdict.detail}</p>
    </section>
  );
}

function WarningsBlock({ plan }: { plan: Plan }) {
  const navigate = useNavigate();
  if (plan.warnings.length === 0) return null;

  return (
    <ul className="stack-s no-print">
      {plan.warnings.map((warning) => (
        <li key={`${warning.id}-${warning.universityId ?? ''}`}>
          <Alert
            kind={warning.id === 'no_safe' ? 'warning' : 'info'}
            action={
              warning.id === 'no_safe' ? (
                <Button size="s" variant="secondary" onClick={() => navigate('/search?safe=1')}>
                  {warning.actionLabel}
                </Button>
              ) : null
            }
          >
            {warning.text}
          </Alert>
        </li>
      ))}
    </ul>
  );
}

function EmptyPlan() {
  return (
    <Card>
      <div className="stack">
        <h2>В плане пока нет вузов</h2>
        <p className="text-secondary">
          Добавь вуз из подходящих ниже или найди направление через поиск — план пересчитается сразу.
        </p>
        <Link to="/search">
          <Button variant="secondary">Открыть поиск</Button>
        </Link>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Карточка вуза */

function UniversityCard({
  entry,
  plan,
  profile,
}: {
  entry: PlanUniversity;
  plan: Plan;
  profile: UserProfile;
}) {
  const moveProgram = useStore((s) => s.moveProgram);
  const removeProgram = useStore((s) => s.removeProgram);
  const removeUniversity = useStore((s) => s.removeUniversity);
  const [adding, setAdding] = useState(false);
  const [simOpen, setSimOpen] = useState(false);

  const universityId = entry.university.wikidata;
  const simulation = plan.simulation.find((s) => s.universityId === universityId);
  const inPlanIds = entry.programs.map((p) => p.program.id);
  const canAddMore = entry.programs.length < LIMITS.maxProgramsPerUniversity;

  return (
    <Card as="li">
      <div className="stack">
        <header className="stack-s">
          <h2>{entry.university.name}</h2>
          <p className="small text-secondary">{entry.university.city}</p>
          {entry.likelyAdmission ? (
            <p className="small">
              <span className="text-secondary">Скорее всего зачислят на: </span>
              <strong>{entry.likelyAdmission}</strong>
            </p>
          ) : (
            <p className="small text-secondary">
              Запасного варианта в этом вузе нет — зачисление не гарантировано.
            </p>
          )}
        </header>

        <ol className="program-list">
          {entry.programs.map((item, index) => (
            <li key={item.program.id} className="program-row">
              <div className="program-priority">
                <span className="program-priority-num">{item.priority}</span>
                <span className="program-priority-label">
                  {item.priority === 1 ? 'Хочу больше всего' : `Приоритет ${item.priority}`}
                </span>
              </div>

              <div className="program-main">
                <Link to={`/program/${item.program.id}`} className="program-name">
                  <span className="code">{item.program.code}</span> · {item.program.name}
                </Link>
                <div className="row-tight small">
                  <ZoneBadge zone={item.zone} margin={item.margin} />
                  <span className="text-secondary">
                    {pointsWord(item.margin)} к прогнозу проходного
                  </span>
                  {item.program.isDemo ? <DemoTag /> : null}
                </div>
              </div>

              <div className="program-actions no-print">
                <IconButton
                  label="Поднять приоритет"
                  disabled={index === 0}
                  onClick={() => moveProgram(universityId, item.program.id, -1)}
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="Опустить приоритет"
                  disabled={index === entry.programs.length - 1}
                  onClick={() => moveProgram(universityId, item.program.id, 1)}
                >
                  <ArrowDown size={18} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="Убрать направление"
                  onClick={() => removeProgram(universityId, item.program.id)}
                >
                  <X size={18} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
          {entry.programs.length === 0 ? (
            <li className="small text-secondary">
              Все направления убраны. Добавь хотя бы одно или убери вуз из плана.
            </li>
          ) : null}
        </ol>

        <div className="row no-print">
          {canAddMore ? (
            <Button variant="secondary" size="s" onClick={() => setAdding((v) => !v)}>
              <Plus size={16} aria-hidden="true" /> Добавить направление
            </Button>
          ) : (
            <p className="small text-secondary">
              {LIMITS.maxProgramsPerUniversity} из {LIMITS.maxProgramsPerUniversity} направлений —
              больше в один вуз подать нельзя.
            </p>
          )}
          <span className="spacer" />
          <Button variant="text" size="s" onClick={() => removeUniversity(universityId)}>
            Убрать вуз
          </Button>
        </div>

        {adding ? (
          <AddProgramList
            profile={profile}
            universityId={universityId}
            inPlanIds={inPlanIds}
            onDone={() => setAdding(false)}
          />
        ) : null}

        {simulation && entry.programs.length > 0 ? (
          <div className="simulation">
            <button
              type="button"
              className="simulation-toggle"
              aria-expanded={simOpen}
              onClick={() => setSimOpen((v) => !v)}
            >
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={simOpen ? 'chevron chevron-open' : 'chevron'}
              />
              Что будет, если…
            </button>
            {simOpen ? (
              <div className="stack-s simulation-body">
                <ol className="stack-s">
                  {simulation.steps.map((step) => (
                    <li key={step.priority} className="small">
                      <strong>Приоритет {step.priority}</strong> ({ZONE_LABELS[step.zone]}) ·{' '}
                      {step.code} — {step.outcome}
                    </li>
                  ))}
                </ol>
                <p className="small">
                  <strong>{simulation.result}</strong>
                </p>
                <p className="small text-secondary">
                  Это не вероятность, а следствие правил: зачисляют на самый высокий приоритет, по
                  которому ты проходишь.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function AddProgramList({
  profile,
  universityId,
  inPlanIds,
  onDone,
}: {
  profile: UserProfile;
  universityId: string;
  inPlanIds: string[];
  onDone: () => void;
}) {
  const addProgram = useStore((s) => s.addProgram);
  const options = useMemo(
    () => addableProgramsOfUniversity(profile, universityId, inPlanIds).slice(0, 12),
    [profile, universityId, inPlanIds],
  );

  if (options.length === 0) {
    return (
      <Card variant="flat">
        <p className="small text-secondary">
          Других подходящих направлений в этом вузе нет: остальные требуют предметов, которые ты не
          сдаёшь.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="flat">
      <div className="stack-s">
        <p className="field-label">Подходящие направления этого вуза</p>
        <ul className="stack-s">
          {options.map((option) => (
            <li key={option.program.id} className="add-row">
              <div className="stack-s add-row-main">
                <span className="small">
                  <span className="code">{option.program.code}</span> · {option.program.name}
                </span>
                <div className="row-tight">
                  <ZoneBadge zone={option.zone} margin={option.margin} />
                  {option.program.isDemo ? <DemoTag /> : null}
                </div>
              </div>
              <Button
                size="s"
                variant="secondary"
                onClick={() => {
                  addProgram(universityId, option.program.id);
                  onDone();
                }}
              >
                В план
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------- Добавление вуза */

function AddUniversityBlock({
  plan,
  profile,
  available,
}: {
  plan: Plan;
  profile: UserProfile;
  available: number;
}) {
  const addUniversity = useStore((s) => s.addUniversity);
  const [open, setOpen] = useState(false);
  const inPlan = plan.universities.map((u) => u.university.wikidata);
  const options = useMemo(
    () => (open ? addableUniversities(profile, inPlan, 10) : []),
    [open, profile, inPlan],
  );

  if (plan.universities.length >= LIMITS.maxUniversities) {
    return (
      <p className="small text-secondary no-print">
        В плане максимум — {LIMITS.maxUniversities} вузов. Больше правила приёма не разрешают.
      </p>
    );
  }

  if (available <= inPlan.length) return null;

  return (
    <section className="stack-s no-print">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        <Plus size={16} aria-hidden="true" /> Добавить вуз
      </Button>

      {open ? (
        <Card variant="flat">
          <ul className="stack-s">
            {options.map((option) => (
              <li key={option.id} className="add-row">
                <div className="stack-s add-row-main">
                  <span className="small">{option.name}</span>
                  <div className="row-tight small text-secondary">
                    <span>{option.city}</span>
                    <span>·</span>
                    <span>{option.programsCount} подходящих направлений</span>
                    <ZoneBadge zone={option.bestZone} margin={option.bestMargin} />
                  </div>
                </div>
                <Button
                  size="s"
                  variant="secondary"
                  onClick={() => {
                    addUniversity(option.id);
                    setOpen(false);
                  }}
                >
                  В план
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- План Б */

function PlanBTeaser({ verdict }: { verdict: string }) {
  return (
    <Link
      to="/plan-b"
      className="planb-teaser no-print"
      onClick={() => track('planb_open', { verdict })}
    >
      <span>
        <strong>Если не пройду никуда</strong>
        <span className="small text-secondary"> — 4 рабочих варианта со сроками</span>
      </span>
      <ChevronDown size={18} aria-hidden="true" className="chevron-right" />
    </Link>
  );
}

/* --------------------------------------------------- Что сделать сейчас */

function NextSteps() {
  const priorities = campaignDate('priorities_lock');
  const consent = campaignDate('consent');

  return (
    <section className="stack">
      <div className="row-tight">
        <h2>Что сделать сейчас</h2>
        <Tooltip
          text={`Сроки указаны ${CAMPAIGN_RULES_NOTE}. Даты кампании 2027 года уточняются.`}
        />
      </div>
      <ol className="stack-s">
        <li className="step-row">
          <span className="step-date">{priorities.label}</span>
          <span>
            Зафиксировать порядок направлений. {priorities.description}
          </span>
        </li>
        <li className="step-row">
          <span className="step-date">{consent.label}</span>
          <span>
            <Term hint="Согласие на зачисление — подтверждение, что ты идёшь именно сюда. Его подают только в один вуз и только на одно направление.">
              Подать согласие на зачисление
            </Term>
          </span>
        </li>
        <li className="step-row">
          <span className="step-date">сейчас</span>
          <span>
            Подать документы через Госуслуги —{' '}
            <a href={GOSUSLUGI_URL} target="_blank" rel="noreferrer noopener">
              как подать на Госуслугах
            </a>
            . Cursus документы не подаёт: это делает суперсервис.
          </span>
        </li>
      </ol>
    </section>
  );
}

/* --------------------------------------------------------------- Поделиться */

function ShareBlock({ profile }: { profile: UserProfile }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = `${window.location.origin}/?p=${encodeProfile(profile)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Скопируй ссылку вручную:', url);
    }
    track('plan_share', { method: 'link' });
  };

  return (
    <section className="stack-s no-print">
      <h2>Поделиться планом</h2>
      <p className="small text-secondary">
        В ссылке только баллы, интересы и регионы — ни имени, ни контактов.
      </p>
      <div className="row">
        <Button variant="secondary" onClick={copyLink}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            track('plan_share', { method: 'print' });
            window.print();
          }}
        >
          <Printer size={16} aria-hidden="true" /> Скачать план
        </Button>
      </div>
    </section>
  );
}

function ResetBlock() {
  const resetAll = useStore((s) => s.resetAll);
  const navigate = useNavigate();

  return (
    <section className="stack-s no-print reset-block">
      <Button
        variant="text"
        onClick={() => {
          resetAll();
          navigate('/');
        }}
      >
        Начать заново
      </Button>
    </section>
  );
}
