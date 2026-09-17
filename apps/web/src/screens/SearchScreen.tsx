import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ZONE_LABELS,
  evaluate,
  ineligibleLabel,
  targetRegions,
  type Program,
  type UserProfile,
  type Zone,
} from '@cursus/core';
import { getUniversity, programsOfCode, searchDirections } from '@cursus/data';
import { Button, Card, Chip, DemoTag, EmptyState, SearchInput, ZoneBadge } from '@/ui';
import { useStore } from '@/store/useStore';
import './search.css';

interface ResultRow {
  code: string;
  name: string;
  /** Лучшая по запасу программа — на неё и ведём. */
  best: { program: Program; zone: Zone | null; margin: number | null } | null;
  universitiesCount: number;
  zones: Set<Zone>;
  eligible: boolean;
  ineligibleReason: string | null;
}

export function SearchScreen() {
  const [params] = useSearchParams();
  const profile = useStore((s) => s.profile);
  const [query, setQuery] = useState('');
  const [onlyFit, setOnlyFit] = useState(true);
  const [onlySafe, setOnlySafe] = useState(params.get('safe') === '1');
  const [inMyRegions, setInMyRegions] = useState(true);

  const rows = useMemo(
    () => buildRows(query, profile, { onlyFit, onlySafe, inMyRegions }),
    [query, profile, onlyFit, onlySafe, inMyRegions],
  );

  const regionsFilter = profile ? targetRegions(profile) : null;
  const regionLabel = regionsFilter ? [...regionsFilter].join(', ') : 'вся Россия';

  return (
    <div className="stack-l search-page">
      <div className="stack">
        <h1>Найти направление</h1>
        <SearchInput
          label="Поиск направления"
          value={query}
          onChange={setQuery}
          placeholder="Код или название направления, вуз"
        />
        <div className="row no-print">
          <Chip active={onlyFit} onClick={() => setOnlyFit((v) => !v)}>
            Только подходящие мне
          </Chip>
          <Chip active={onlySafe} onClick={() => setOnlySafe((v) => !v)}>
            Только с запасом
          </Chip>
          <Chip active={inMyRegions} onClick={() => setInMyRegions((v) => !v)}>
            {regionsFilter ? 'Мои регионы' : 'Вся Россия'}
          </Chip>
        </div>
        <p className="small text-secondary">
          Искать можно и по коду, и по названию: «15.03.04» или «автоматизация». Регион поиска:{' '}
          {inMyRegions ? regionLabel : 'вся Россия'}.
        </p>
      </div>

      {query.trim().length === 0 ? (
        <Card variant="flat">
          <div className="stack-s">
            <h3>С чего начать</h3>
            <div className="row">
              {['15.03.04', '09.03.04', 'электроэнергетика', 'лечебное дело'].map((hint) => (
                <Chip key={hint} onClick={() => setQuery(hint)}>
                  {hint}
                </Chip>
              ))}
            </div>
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Ничего не нашлось"
          text="Попробуй другой код или название — или сними фильтры: возможно, отсеклись подходящие варианты."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setOnlyFit(false);
                setOnlySafe(false);
                setInMyRegions(false);
              }}
            >
              Снять фильтры
            </Button>
          }
        />
      ) : (
        <ul className="stack-s">
          {rows.map((row) => (
            <li key={row.code}>
              <Card>
                <div className="result-row">
                  <div className="stack-s result-main">
                    {row.best ? (
                      <Link to={`/program/${row.best.program.id}`} className="result-name">
                        <span className="code">{row.code}</span> · {row.name}
                      </Link>
                    ) : (
                      <span className="result-name">
                        <span className="code">{row.code}</span> · {row.name}
                      </span>
                    )}
                    <p className="small text-secondary">
                      {row.universitiesCount > 0
                        ? `${row.universitiesCount} ${vuzWord(row.universitiesCount)} ${
                            inMyRegions ? 'в выбранных регионах' : 'в России'
                          }`
                        : 'нет вузов в выбранных регионах'}
                      {row.zones.size > 0
                        ? ` · зоны: ${[...row.zones].map((z) => ZONE_LABELS[z]).join(', ')}`
                        : ''}
                    </p>
                    {!row.eligible && row.ineligibleReason ? (
                      <p className="small result-blocked">{row.ineligibleReason}</p>
                    ) : null}
                  </div>
                  <div className="row-tight">
                    {row.best?.zone && row.best.margin != null ? (
                      <ZoneBadge zone={row.best.zone} margin={row.best.margin} />
                    ) : null}
                    {row.best?.program.isDemo ? <DemoTag /> : null}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function vuzWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вуз';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'вуза';
  return 'вузов';
}

function buildRows(
  query: string,
  profile: UserProfile | null,
  filters: { onlyFit: boolean; onlySafe: boolean; inMyRegions: boolean },
): ResultRow[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const regions = profile && filters.inMyRegions ? targetRegions(profile) : null;

  return searchDirections(trimmed, 25)
    .map<ResultRow>((direction) => {
      const candidates = programsOfCode(direction.code).filter((p) => {
        if (!regions) return true;
        const u = getUniversity(p.universityId);
        return u !== null && regions.has(u.region);
      });

      const evaluated = candidates.map((program) => {
        const e = profile ? evaluate(program, profile) : null;
        return {
          program,
          zone: e?.zone ?? null,
          margin: e?.margin ?? null,
          eligible: e?.score.eligible ?? true,
          reason: e ? ineligibleLabel(e.score) : null,
        };
      });

      const fitting = evaluated.filter((x) => x.eligible && x.zone !== null);
      const best = [...fitting].sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))[0] ?? null;
      const zones = new Set<Zone>();
      for (const item of fitting) if (item.zone) zones.add(item.zone);

      return {
        code: direction.code,
        name: direction.name,
        best: best ? { program: best.program, zone: best.zone, margin: best.margin } : null,
        universitiesCount: fitting.length > 0 ? fitting.length : candidates.length,
        zones,
        eligible: fitting.length > 0,
        ineligibleReason: evaluated.find((x) => !x.eligible)?.reason ?? null,
      };
    })
    .filter((row) => {
      if (filters.onlyFit && !row.eligible) return false;
      if (filters.onlySafe && !row.zones.has('safe')) return false;
      return true;
    });
}
