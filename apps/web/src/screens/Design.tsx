import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { ZONE_HINTS, ZONE_LABELS, type Zone } from '@cursus/core';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  Combobox,
  DemoTag,
  EmptyState,
  IconButton,
  Input,
  NumberInput,
  ProgressBar,
  SearchInput,
  Skeleton,
  Switch,
  Tabs,
  Term,
  Tile,
  Tooltip,
  ZoneBadge,
} from '@/ui';
import { MiniChart } from '@/ui/MiniChart';
import './design.css';

const TOKENS = [
  '--bg',
  '--bg-secondary',
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
  '--border',
  '--accent',
  '--accent-hover',
  '--accent-light',
  '--zone-safe',
  '--zone-target',
  '--zone-reach',
];

const ZONES: Zone[] = ['safe', 'target', 'reach'];

/** Витрина дизайн-системы. Доступна только в dev-режиме. */
export function DesignScreen() {
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [switched, setSwitched] = useState(true);
  const [checked, setChecked] = useState(false);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [score, setScore] = useState<number | null>(76);
  const [region, setRegion] = useState<string | null>('Нижегородская область');
  const [chip, setChip] = useState(true);

  return (
    <div className="stack-l design-page">
      <div className="stack-s">
        <h1>Дизайн-система Cursus</h1>
        <p className="text-secondary">
          Корпоративный минимализм: белое и серое, цвет только как сигнал. Все значения — из
          tokens.css.
        </p>
      </div>

      <Section title="Токены цвета">
        <div className="swatches">
          {TOKENS.map((token) => (
            <div key={token} className="swatch">
              <span className="swatch-box" style={{ background: `var(${token})` }} />
              <code className="small">{token}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Типографика">
        <div className="stack-s">
          <h1>H1 · 28/700 — вердикт плана</h1>
          <h2>H2 · 20/600 — заголовок блока</h2>
          <h3>H3 · 16/600 — подзаголовок</h3>
          <p>Body · 15/400 — основной текст, line-height 1.5.</p>
          <p className="small text-secondary">Small · 13/400 — пояснения и источники.</p>
          <p className="data">226</p>
          <p className="small text-secondary">Data · 24/700 с tabular-nums</p>
        </div>
      </Section>

      <Section title="Button — ровно три вида">
        <div className="stack">
          <div className="row">
            <Button>primary</Button>
            <Button variant="secondary">secondary</Button>
            <Button variant="text">text</Button>
          </div>
          <div className="row">
            <Button disabled>disabled</Button>
            <Button loading>loading</Button>
            <Button size="s">small</Button>
          </div>
          <div className="row">
            <IconButton label="Поднять приоритет">
              <ArrowUp size={18} />
            </IconButton>
            <IconButton label="Опустить приоритет">
              <ArrowDown size={18} />
            </IconButton>
            <IconButton label="Убрать">
              <X size={18} />
            </IconButton>
            <IconButton label="Недоступно" disabled>
              <ArrowUp size={18} />
            </IconButton>
          </div>
        </div>
      </Section>

      <Section title="ZoneBadge и DemoTag">
        <div className="stack">
          <div className="row">
            {ZONES.map((zone) => (
              <ZoneBadge key={zone} zone={zone} margin={zone === 'safe' ? 19 : zone === 'target' ? -3 : -22} />
            ))}
          </div>
          <div className="row">
            {ZONES.map((zone) => (
              <ZoneBadge key={zone} zone={zone} pill />
            ))}
          </div>
          <ul className="stack-s small text-secondary">
            {ZONES.map((zone) => (
              <li key={zone}>
                <strong>{ZONE_LABELS[zone]}</strong> — {ZONE_HINTS[zone]}
              </li>
            ))}
          </ul>
          <div className="row">
            <DemoTag />
            <span className="small text-secondary">рядом с любой тестовой цифрой</span>
          </div>
        </div>
      </Section>

      <Section title="Поля ввода">
        <div className="stack">
          <Input label="Обычное поле" value={text} onChange={(e) => setText(e.target.value)} hint="Подсказка под полем" />
          <Input label="С ошибкой" value="99999" error="Балл — целое число от 0 до 100" readOnly />
          <Input label="Заблокировано" value="нельзя менять" disabled />
          <SearchInput label="Поиск" value={search} onChange={setSearch} placeholder="Код или название направления, вуз" />
          <NumberInput label="Математика" value={score} onChange={setScore} suffix="из 100" />
          <Combobox
            label="Регион"
            options={[
              { value: 'Нижегородская область', label: 'Нижегородская область' },
              { value: 'Москва', label: 'Москва' },
              { value: 'Санкт-Петербург', label: 'Санкт-Петербург' },
            ]}
            value={region}
            onChange={setRegion}
          />
          <Switch label="Ещё не сдавал — ввести ожидаемые" checked={switched} onChange={setSwitched} />
          <Checkbox label="Знак ГТО" note="до +2 баллов" checked={checked} onChange={setChecked} />
        </div>
      </Section>

      <Section title="Плитки и чипы">
        <div className="stack">
          <div className="tile-grid">
            <Tile title="Русский язык" lockedNote="обязательный" disabled />
            <Tile title="IT и программирование" hint="разработка, данные, кибербезопасность" active order={1} />
            <Tile title="Энергетика" hint="электросети, теплоэнергетика" />
          </div>
          <div className="row">
            <Chip active={chip} onClick={() => setChip((v) => !v)}>
              Только подходящие мне
            </Chip>
            <Chip>Только с запасом</Chip>
            <Chip disabled>Недоступно</Chip>
          </div>
        </div>
      </Section>

      <Section title="Card, Tabs, ProgressBar">
        <div className="stack">
          <Card>
            <p>Card · фон bg, рамка 1px, радиус 12, без теней.</p>
          </Card>
          <Card variant="flat">
            <p>Card flat · фон bg-secondary.</p>
          </Card>
          <Card variant="accent">
            <p>Card accent · фон accent-light.</p>
          </Card>
          <Tabs
            items={[
              { value: 'a', label: 'Мой план' },
              { value: 'b', label: 'Найти' },
            ]}
            value={tab}
            onChange={setTab}
            label="Пример вкладок"
          />
          <ProgressBar value={2} max={4} label="Шаг 2 из 4" />
        </div>
      </Section>

      <Section title="Alert">
        <div className="stack-s">
          <Alert kind="info">Info — нейтральная подсказка.</Alert>
          <Alert kind="warning" action={<Button size="s" variant="secondary">Добавить запасной</Button>}>
            Warning — добавь запасной вариант с запасом от 10 баллов.
          </Alert>
          <Alert kind="danger">Danger — высокий риск остаться без бюджета.</Alert>
        </div>
      </Section>

      <Section title="Tooltip и термины">
        <div className="row">
          <Term hint="Приоритет — порядок желания внутри одного вуза. Зачислят на самый высокий приоритет, по которому проходишь.">
            Приоритет 1
          </Term>
          <Tooltip text="Пример пояснения к термину." />
        </div>
      </Section>

      <Section title="MiniChart">
        <Card>
          <MiniChart
            history={[
              { label: '2023', value: 214 },
              { label: '2024', value: 220 },
              { label: '2025', value: 225 },
            ]}
            forecast={{ label: 'прогноз', value: 231 }}
            userScore={228}
          />
        </Card>
      </Section>

      <Section title="Skeleton и EmptyState">
        <div className="stack">
          <div className="stack-s">
            <Skeleton height={20} width="50%" />
            <Skeleton height={56} />
          </div>
          <EmptyState
            title="Пока нечего сравнивать"
            text="Добавь направления для сравнения из карточки направления."
            action={<Button variant="secondary">Найти направление</Button>}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack design-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
