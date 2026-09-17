import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, MoveHorizontal, X } from 'lucide-react';
import { LIMITS, evaluate, formatMargin, type Program, type UserProfile } from '@cursus/core';
import { getContent, getProgram, getSalaries, getUniversity } from '@cursus/data';
import { Button, DemoTag, EmptyState, IconButton, ZoneBadge } from '@/ui';
import { useStore } from '@/store/useStore';
import { formatSalary } from '@/lib/format';
import { track } from '@/lib/analytics';
import './compare.css';

interface Column {
  program: Program;
  universityName: string;
  region: string | null;
  evaluation: ReturnType<typeof evaluate> | null;
  y1: number | null;
  y5: number | null;
  employed: number | null;
  learnFirstSentence: string | null;
  inPlan: boolean;
}

/** Ровно эти строки и в этом порядке — так сравнение читается по одним правилам. */
const ROWS = [
  'Зона и запас',
  'Проходной 2025 и тренд',
  'Бюджетных мест',
  'Зарплата через год',
  'Зарплата через 5 лет',
  'Трудоустроены',
  'Чему научат',
] as const;

export function CompareScreen() {
  const [params, setParams] = useSearchParams();
  const profile = useStore((s) => s.profile);
  const compare = useStore((s) => s.compare);
  const setCompare = useStore((s) => s.setCompare);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const addProgram = useStore((s) => s.addProgram);
  const layout = useStore((s) => s.layout);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ссылка вида /compare?ids=a,b,c — источник правды, если она есть.
  const idsFromUrl = params.get('ids');

  useEffect(() => {
    if (!idsFromUrl) return;
    const ids = idsFromUrl.split(',').filter(Boolean);
    if (ids.length > 0 && ids.join(',') !== compare.join(',')) setCompare(ids);
  }, [idsFromUrl, compare, setCompare]);

  useEffect(() => {
    if (compare.length === 0) return;
    const codes = compare
      .map((id) => getProgram(id)?.code)
      .filter((c): c is string => Boolean(c))
      .sort();
    track('compare_open', { codes: codes.join('|'), count: codes.length });
  }, [compare]);

  const columns = useMemo(() => buildColumns(compare, profile, layout), [compare, profile, layout]);

  // Таблица всегда открывается с первой колонки, а не там, где браузер
  // восстановил горизонтальную прокрутку.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [columns.length]);

  if (columns.length === 0) {
    return (
      <EmptyState
        title="Пока нечего сравнивать"
        text="Добавь направления для сравнения из карточки направления — кнопка «Сравнить» под блоком «Похожие направления»."
        action={
          <Link to="/search">
            <Button>Найти направление</Button>
          </Link>
        }
      />
    );
  }

  const best = {
    margin: maxOf(columns.map((c) => c.evaluation?.margin ?? null)),
    places: maxOf(columns.map((c) => c.program.budgetPlaces)),
    y1: maxOf(columns.map((c) => c.y1)),
    y5: maxOf(columns.map((c) => c.y5)),
    employed: maxOf(columns.map((c) => c.employed)),
    cutoff: minOf(columns.map((c) => c.program.cutoffs['2025'] ?? null)),
  };

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Сравнение направлений</h1>
        <p className="text-secondary small">
          Лучшее значение в строке выделено. Сравнивать можно до {LIMITS.maxCompare} направлений.
        </p>
        {columns.length > 1 ? (
          <p className="compare-hint small text-secondary">
            <MoveHorizontal size={16} aria-hidden="true" /> Листай таблицу в сторону, чтобы увидеть
            остальные колонки.
          </p>
        ) : null}
      </div>

      <div className="compare-scroll" ref={scrollRef}>
        <table className="compare-table">
          <caption className="visually-hidden">
            Сравнение выбранных направлений по зонам, проходным баллам и зарплатам выпускников
          </caption>
          <thead>
            <tr>
              <th scope="col" className="compare-corner">
                <span className="visually-hidden">Показатель</span>
              </th>
              {columns.map((column) => (
                <th key={column.program.id} scope="col">
                  <div className="compare-head">
                    <div className="compare-head-main">
                      <Link to={`/program/${column.program.id}`} className="compare-title">
                        <span className="code">{column.program.code}</span> · {column.program.name}
                      </Link>
                      <span className="small text-secondary">{column.universityName}</span>
                    </div>
                    <IconButton
                      label={`Убрать ${column.program.code} из сравнения`}
                      className="no-print compare-remove"
                      onClick={() => toggleCompare(column.program.id)}
                    >
                      <X size={16} aria-hidden="true" />
                    </IconButton>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                {columns.map((column) => (
                  <td key={column.program.id}>{renderCell(row, column, best)}</td>
                ))}
              </tr>
            ))}
            <tr className="no-print">
              <th scope="row">
                <span className="visually-hidden">Действие</span>
              </th>
              {columns.map((column) => (
                <td key={column.program.id}>
                  {profile ? (
                    <Button
                      size="s"
                      variant={column.inPlan ? 'secondary' : 'primary'}
                      disabled={column.inPlan}
                      onClick={() => addProgram(column.program.universityId, column.program.id)}
                    >
                      {column.inPlan ? (
                        <>
                          <Check size={14} aria-hidden="true" /> В плане
                        </>
                      ) : (
                        'В план'
                      )}
                    </Button>
                  ) : (
                    <Link to="/onboarding/1">
                      <Button size="s">Построить план</Button>
                    </Link>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {columns.some((c) => c.program.isDemo) ? (
        <p className="row-tight small text-secondary">
          <DemoTag /> проходные баллы в прототипе — тестовые данные.
        </p>
      ) : null}

      {compare.length > 0 ? (
        <Button
          variant="text"
          className="no-print"
          onClick={() => {
            setCompare([]);
            setParams(new URLSearchParams());
          }}
        >
          Очистить сравнение
        </Button>
      ) : null}
    </div>
  );
}

function maxOf(values: (number | null)[]): number | null {
  const filtered = values.filter((v): v is number => v != null);
  return filtered.length === 0 ? null : Math.max(...filtered);
}

function minOf(values: (number | null)[]): number | null {
  const filtered = values.filter((v): v is number => v != null);
  return filtered.length === 0 ? null : Math.min(...filtered);
}

function buildColumns(
  ids: readonly string[],
  profile: UserProfile | null,
  layout: { universities: { id: string; programIds: string[] }[] } | null,
): Column[] {
  const inPlanIds = new Set(layout?.universities.flatMap((u) => u.programIds) ?? []);

  return ids
    .map((id) => getProgram(id))
    .filter((p): p is Program => p !== null)
    .map((program) => {
      const university = getUniversity(program.universityId);
      const region = university?.region ?? null;
      const salaries = getSalaries(program.code, region);
      const learn = getContent(program.code)?.learn ?? null;

      return {
        program,
        universityName: university?.name ?? 'Вуз не найден',
        region,
        evaluation: profile ? evaluate(program, profile) : null,
        y1: salaries.entry?.y1?.salary ?? null,
        y5: salaries.entry?.y5?.salary ?? null,
        employed: salaries.entry?.y1?.employed ?? null,
        learnFirstSentence: learn ? `${learn.split('. ')[0]}.` : null,
        inPlan: inPlanIds.has(program.id),
      };
    });
}

function BestValue({ children, best }: { children: React.ReactNode; best: boolean }) {
  return best ? (
    <strong className="compare-best">
      <span className="compare-best-dot" aria-hidden="true" />
      {children}
      <span className="visually-hidden"> — лучшее значение в строке</span>
    </strong>
  ) : (
    <span>{children}</span>
  );
}

function renderCell(
  row: (typeof ROWS)[number],
  column: Column,
  best: {
    margin: number | null;
    places: number | null;
    y1: number | null;
    y5: number | null;
    employed: number | null;
    cutoff: number | null;
  },
): React.ReactNode {
  const { program, evaluation } = column;

  switch (row) {
    case 'Зона и запас':
      if (!evaluation?.zone || evaluation.margin == null) {
        return <span className="text-secondary">нужен профиль</span>;
      }
      return (
        <BestValue best={evaluation.margin === best.margin}>
          <ZoneBadge zone={evaluation.zone} margin={evaluation.margin} />
        </BestValue>
      );

    case 'Проходной 2025 и тренд': {
      const c2025 = program.cutoffs['2025'];
      if (c2025 == null) return <span className="text-secondary">нет данных</span>;
      const trend = evaluation?.forecast.trend ?? 0;
      return (
        <BestValue best={c2025 === best.cutoff}>
          <span className="row-tight">
            {c2025}
            <span className="small text-secondary">
              {trend === 0 ? 'без тренда' : `тренд ${formatMargin(Math.round(trend))}`}
            </span>
            {program.isDemo ? <DemoTag /> : null}
          </span>
        </BestValue>
      );
    }

    case 'Бюджетных мест':
      return <BestValue best={program.budgetPlaces === best.places}>{program.budgetPlaces}</BestValue>;

    case 'Зарплата через год':
      return (
        <BestValue best={column.y1 != null && column.y1 === best.y1}>
          {formatSalary(column.y1) ?? 'нет данных'}
        </BestValue>
      );

    case 'Зарплата через 5 лет':
      return (
        <BestValue best={column.y5 != null && column.y5 === best.y5}>
          {formatSalary(column.y5) ?? 'нет данных'}
        </BestValue>
      );

    case 'Трудоустроены':
      return (
        <BestValue best={column.employed != null && column.employed === best.employed}>
          {column.employed != null ? `${Math.round(column.employed)}%` : 'нет данных'}
        </BestValue>
      );

    case 'Чему научат':
      return (
        <span className="small">
          {column.learnFirstSentence ?? <span className="text-secondary">описания пока нет</span>}
        </span>
      );

    default:
      return null;
  }
}
