import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import {
  EXAM_SUBJECTS,
  INTEREST_GROUPS,
  LIMITS,
  SUBJECT_LABELS,
  type ExamSubject,
  type InterestId,
  type RegionMode,
  type UserProfile,
} from '@cursus/core';
import { regions, snapshotStats } from '@cursus/data';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Combobox,
  NumberInput,
  ProgressBar,
  Switch,
  Tile,
  Tooltip,
} from '@/ui';
import { useStore } from '@/store/useStore';
import { scoreBucket, track } from '@/lib/analytics';
import './onboarding.css';

const TOTAL_STEPS = 4;

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Индивидуальные достижения. Список — те основания, которые вузы реально
 * засчитывают в 2026 году; суммарно по правилам приёма не больше 10 баллов.
 * Итоговое сочинение раньше встречалось в перечнях, но сейчас почти никто
 * за него баллы не даёт, поэтому его тут нет.
 */
const ACHIEVEMENTS = [
  {
    id: 'medal',
    label: 'Золотая медаль или аттестат с отличием',
    points: 5,
    note: 'самое весомое достижение: обычно 4–6 баллов',
  },
  {
    id: 'olympiad',
    label: 'Призёр олимпиады или конкурса',
    points: 3,
    note: 'не тех, что дают поступление без экзаменов, а перечневых и вузовских',
  },
  {
    id: 'gto',
    label: 'Знак ГТО',
    points: 2,
    note: 'нужен действующий знак отличия',
  },
  {
    id: 'sport',
    label: 'Спортивный разряд от КМС',
    points: 2,
    note: 'кандидат в мастера спорта и выше',
  },
  {
    id: 'volunteer',
    label: 'Волонтёрство',
    points: 1,
    note: 'обычно нужна книжка волонтёра и стаж от года',
  },
] as const;

type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

interface Draft {
  subjects: ExamSubject[];
  scores: Partial<Record<ExamSubject, number | null>>;
  expected: boolean;
  achievements: AchievementId[];
  interests: InterestId[];
  regionMode: RegionMode;
  homeRegion: string | null;
  extraRegions: string[];
}

const EMPTY_DRAFT: Draft = {
  subjects: ['russian'],
  scores: {},
  expected: false,
  achievements: [],
  interests: [],
  regionMode: 'home',
  homeRegion: null,
  extraRegions: [],
};

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { step: stepParam } = useParams();
  const step = Math.min(Math.max(Number(stepParam) || 1, 1), TOTAL_STEPS);
  const setProfile = useStore((s) => s.setProfile);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    track('onboarding_step', { step });
  }, [step]);

  const bonus = useMemo(
    () =>
      Math.min(
        LIMITS.maxAchievementsBonus,
        draft.achievements.reduce(
          (sum, id) => sum + (ACHIEVEMENTS.find((a) => a.id === id)?.points ?? 0),
          0,
        ),
      ),
    [draft.achievements],
  );

  const scoreErrors = useMemo(() => {
    const errors: Partial<Record<ExamSubject, string>> = {};
    for (const subject of draft.subjects) {
      const value = draft.scores[subject];
      if (value === undefined || value === null) continue;
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        errors[subject] = 'Балл — целое число от 0 до 100';
      }
    }
    return errors;
  }, [draft.subjects, draft.scores]);

  const canContinue = (() => {
    if (step === 1) return draft.subjects.length >= 2;
    if (step === 2) {
      const filled = draft.subjects.every((s) => {
        const v = draft.scores[s];
        return typeof v === 'number';
      });
      return filled && Object.keys(scoreErrors).length === 0;
    }
    if (step === 3) return draft.interests.length >= 1;
    if (draft.regionMode === 'any') return true;
    return draft.homeRegion !== null;
  })();

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      navigate(`/onboarding/${step + 1}`);
      return;
    }
    finish();
  };

  const finish = () => {
    const scores: Partial<Record<ExamSubject, number>> = {};
    for (const subject of draft.subjects) {
      const value = draft.scores[subject];
      if (typeof value === 'number') scores[subject] = value;
    }

    const profile: UserProfile = {
      scores,
      scoresAreExpected: draft.expected,
      achievementsBonus: bonus,
      achievements: draft.achievements.map(
        (id) => ACHIEVEMENTS.find((a) => a.id === id)?.label ?? id,
      ),
      interests: draft.interests,
      regionMode: draft.regionMode,
      homeRegion: draft.regionMode === 'any' ? null : draft.homeRegion,
      regions: draft.regionMode === 'several' ? draft.extraRegions : [],
    };

    const total = Object.values(scores).reduce((a, b) => a + b, 0) + bonus;
    track('onboarding_complete', {
      scoreBucket: scoreBucket(total),
      interestsCount: profile.interests.length,
      regionMode: profile.regionMode,
    });

    setBuilding(true);
    // Экран загрузки не длиннее секунды: расчёт идёт в браузере и он быстрый.
    window.setTimeout(() => {
      setProfile(profile);
      navigate('/plan', { replace: true });
    }, 550);
  };

  if (building) {
    return (
      <div className="onboarding-loading" role="status">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <p>Сравниваем {snapshotStats.universities} вузов…</p>
      </div>
    );
  }

  return (
    <div className="stack-l onboarding">
      <div className="stack">
        <ProgressBar value={step} max={TOTAL_STEPS} label={`Шаг ${step} из ${TOTAL_STEPS}`} />
        <div className="row">
          <Button
            variant="text"
            onClick={() => (step === 1 ? navigate('/') : navigate(`/onboarding/${step - 1}`))}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Назад
          </Button>
        </div>
      </div>

      {step === 1 ? <StepSubjects draft={draft} setDraft={setDraft} /> : null}
      {step === 2 ? (
        <StepScores draft={draft} setDraft={setDraft} errors={scoreErrors} bonus={bonus} />
      ) : null}
      {step === 3 ? <StepInterests draft={draft} setDraft={setDraft} /> : null}
      {step === 4 ? <StepRegions draft={draft} setDraft={setDraft} /> : null}

      <div className="onboarding-actions">
        <Button full disabled={!canContinue} onClick={goNext}>
          {step === TOTAL_STEPS ? 'Построить план' : 'Дальше'}
        </Button>
      </div>
    </div>
  );
}

interface StepProps {
  draft: Draft;
  setDraft: (update: (draft: Draft) => Draft) => void;
}

function StepSubjects({ draft, setDraft }: StepProps) {
  const toggle = (subject: ExamSubject) => {
    if (subject === 'russian') return;
    setDraft((d) => ({
      ...d,
      subjects: d.subjects.includes(subject)
        ? d.subjects.filter((s) => s !== subject)
        : [...d.subjects, subject],
    }));
  };

  return (
    <section className="stack">
      <h1>Какие ЕГЭ ты сдаёшь?</h1>
      <p className="text-secondary">
        Отметь все предметы — даже те, в которых не уверен. Мы подберём направления, где они нужны.
      </p>
      <div className="tile-grid">
        {EXAM_SUBJECTS.map((subject) => (
          <Tile
            key={subject}
            title={SUBJECT_LABELS[subject]}
            active={draft.subjects.includes(subject)}
            disabled={subject === 'russian'}
            lockedNote={subject === 'russian' ? 'обязательный' : undefined}
            onClick={() => toggle(subject)}
          />
        ))}
      </div>
    </section>
  );
}

function StepScores({
  draft,
  setDraft,
  errors,
  bonus,
}: StepProps & { errors: Partial<Record<ExamSubject, string>>; bonus: number }) {
  return (
    <section className="stack-l">
      <div className="stack">
        <h1>Сколько баллов?</h1>
        <Switch
          label="Ещё не сдавал — ввести ожидаемые"
          checked={draft.expected}
          onChange={(expected) => setDraft((d) => ({ ...d, expected }))}
        />
        <div className="score-grid">
          {draft.subjects.map((subject) => (
            <NumberInput
              key={subject}
              label={SUBJECT_LABELS[subject]}
              value={draft.scores[subject] ?? null}
              error={errors[subject]}
              suffix="из 100"
              onChange={(value) =>
                setDraft((d) => ({ ...d, scores: { ...d.scores, [subject]: value } }))
              }
            />
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="row-tight">
          <h2>Что даст дополнительные баллы</h2>
          <Tooltip text="Индивидуальные достижения. Каждый вуз сам решает, что и сколько засчитывать, но суммарно по правилам приёма — не больше 10 баллов." />
        </div>
        <p className="small text-secondary">
          Отметь то, что у тебя есть. Значения — типичные: точные цифры смотри в перечне
          достижений своего вуза.
        </p>
        <Card variant="flat">
          <div className="stack-s">
            {ACHIEVEMENTS.map((a) => (
              <Checkbox
                key={a.id}
                label={a.label}
                note={`обычно +${a.points} · ${a.note}`}
                checked={draft.achievements.includes(a.id)}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    achievements: checked
                      ? [...d.achievements, a.id]
                      : d.achievements.filter((id) => id !== a.id),
                  }))
                }
              />
            ))}

            <div className="bonus-total">
              <span>
                Учтём <strong>+{bonus}</strong> к сумме ЕГЭ
              </span>
              {bonus >= LIMITS.maxAchievementsBonus ? (
                <span className="small text-secondary">
                  достигнут максимум {LIMITS.maxAchievementsBonus} баллов — больше правила приёма
                  не разрешают
                </span>
              ) : (
                <span className="small text-secondary">
                  максимум {LIMITS.maxAchievementsBonus} баллов
                </span>
              )}
            </div>

            <p className="small text-secondary">
              Чего в списке нет и почему: за итоговое сочинение баллы сейчас почти нигде не
              начисляют, а олимпиады уровня «поступление без экзаменов» работают иначе — они не
              добавляют баллы, а дают место вне конкурса. Такие льготы в прототипе не считаются.
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}

function StepInterests({ draft, setDraft }: StepProps) {
  const toggle = (id: InterestId) => {
    setDraft((d) => {
      if (d.interests.includes(id)) {
        return { ...d, interests: d.interests.filter((i) => i !== id) };
      }
      if (d.interests.length >= LIMITS.maxInterests) return d;
      return { ...d, interests: [...d.interests, id] };
    });
  };

  return (
    <section className="stack">
      <h1>Что тебе интересно?</h1>
      <p className="text-secondary">
        До {LIMITS.maxInterests} направлений. Порядок важен: что выберешь первым, то и будет
        стоять выше в плане.
      </p>
      {draft.interests.length >= LIMITS.maxInterests ? (
        <p className="small text-secondary">
          Выбрано {LIMITS.maxInterests} из {LIMITS.maxInterests}. Чтобы поменять — сними лишний
          выбор.
        </p>
      ) : null}
      <div className="tile-grid">
        {INTEREST_GROUPS.map((group) => {
          const index = draft.interests.indexOf(group.id);
          return (
            <Tile
              key={group.id}
              title={group.label}
              hint={group.hint}
              active={index >= 0}
              order={index >= 0 ? index + 1 : undefined}
              disabled={index < 0 && draft.interests.length >= LIMITS.maxInterests}
              onClick={() => toggle(group.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

const REGION_MODES: { value: RegionMode; label: string; hint: string }[] = [
  { value: 'home', label: 'В своём регионе', hint: 'ближе к дому и дешевле' },
  { value: 'several', label: 'Ещё в нескольких регионах', hint: 'больше бюджетных мест' },
  { value: 'any', label: 'Где угодно в России', hint: 'максимум вариантов' },
];

function StepRegions({ draft, setDraft }: StepProps) {
  const options = regions.map((r) => ({ value: r.name, label: r.name }));

  return (
    <section className="stack-l">
      <div className="stack">
        <h1>Где готов учиться?</h1>
        <div className="tile-grid">
          {REGION_MODES.map((mode) => (
            <Tile
              key={mode.value}
              title={mode.label}
              hint={mode.hint}
              active={draft.regionMode === mode.value}
              onClick={() => setDraft((d) => ({ ...d, regionMode: mode.value }))}
            />
          ))}
        </div>
      </div>

      {draft.regionMode !== 'any' ? (
        <div className="stack">
          <Combobox
            label="Твой регион"
            options={options}
            value={draft.homeRegion}
            onChange={(value) => setDraft((d) => ({ ...d, homeRegion: value }))}
          />

          {draft.regionMode === 'several' ? (
            <div className="stack-s">
              <p className="field-label">
                Куда ещё готов поехать{' '}
                {draft.extraRegions.length > 0 ? `(${draft.extraRegions.length})` : ''}
              </p>

              {draft.extraRegions.length > 0 ? (
                <div className="region-chips">
                  {draft.extraRegions.map((name) => (
                    <Chip
                      key={name}
                      active
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          extraRegions: d.extraRegions.filter((r) => r !== name),
                        }))
                      }
                    >
                      {name}
                      <X size={14} aria-hidden="true" />
                      <span className="visually-hidden">— убрать регион</span>
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="small text-secondary">
                  Пока выбран только свой регион. Добавь соседние — в плане появятся вузы оттуда,
                  и запасных вариантов станет больше.
                </p>
              )}

              <Combobox
                label="Добавить регион"
                options={options.filter(
                  (o) => o.value !== draft.homeRegion && !draft.extraRegions.includes(o.value),
                )}
                value={null}
                onChange={(value) =>
                  setDraft((d) => ({ ...d, extraRegions: [...d.extraRegions, value] }))
                }
              />

              {draft.extraRegions.length > 0 ? (
                <p className="small text-secondary">
                  Ищем в {draft.extraRegions.length + 1}{' '}
                  {plural(draft.extraRegions.length + 1, 'регионе', 'регионах', 'регионах')}. Вузы
                  из своего региона мы ставим выше: дорога и жильё тоже считаются, хотя денег
                  сервис не считает.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <Card variant="flat">
          <p className="small text-secondary">
            Будем искать по всем {snapshotStats.regions} регионам. Это даёт больше вариантов, но
            учти расходы на жильё — их сервис не считает.
          </p>
        </Card>
      )}
    </section>
  );
}
