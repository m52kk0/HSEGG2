import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { AlertTriangle, Info, OctagonAlert, Search } from 'lucide-react';
import { ZONE_HINTS, ZONE_LABELS, formatMargin, type Zone } from '@cursus/core';
import './ui.css';

/* ------------------------------------------------------------------ Button */

export type ButtonVariant = 'primary' | 'secondary' | 'text';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'm' | 's';
  full?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'm', full, loading, className, children, disabled, ...rest },
  ref,
) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 's' ? 'btn-s' : '',
    full ? 'btn-full' : '',
    loading ? 'btn-loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
      {children}
      {loading ? (
        <span className="btn-spinner" aria-hidden="true">
          <span className="spinner" />
        </span>
      ) : null}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={['icon-btn', className ?? ''].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  children,
  variant = 'default',
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  variant?: 'default' | 'flat' | 'accent';
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  const classes = [
    'card',
    variant === 'flat' ? 'card-flat' : '',
    variant === 'accent' ? 'card-accent' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <Tag className={classes}>{children}</Tag>;
}

/* --------------------------------------------------------------- ZoneBadge */

/**
 * Зона всегда словом. Цветная точка — только дополнение:
 * цвет никогда не единственный носитель смысла.
 */
export function ZoneBadge({
  zone,
  margin,
  pill,
}: {
  zone: Zone;
  margin?: number | null;
  pill?: boolean;
}) {
  const classes = ['zone', `zone-${zone}`, pill ? 'zone-pill' : ''].filter(Boolean).join(' ');
  return (
    <span className={classes} title={ZONE_HINTS[zone]}>
      <span className="zone-dot" aria-hidden="true" />
      <span>{ZONE_LABELS[zone]}</span>
      {typeof margin === 'number' ? (
        <span className="zone-margin">· {formatMargin(margin)}</span>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------- DemoTag */

export function DemoTag({ text = 'Проходные баллы в прототипе — тестовые данные' }: { text?: string }) {
  return (
    <span className="demo-tag" title={text} aria-label={`Демо: ${text}`}>
      Демо
    </span>
  );
}

/* ----------------------------------------------------------------- Tooltip */

/** Термин + «?». Все термины приёма объясняются только так. */
export function Tooltip({ text, label = 'Что это значит' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <span className="tooltip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="tooltip-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        // Клик только открывает: на телефоне перед click приходит mouseenter,
        // и переключение закрывало подсказку сразу после касания.
        // Закрывают: Escape, клик вне, уход курсора и потеря фокуса.
        onClick={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className="tooltip-dot" aria-hidden="true">
          ?
        </span>
      </button>
      {open ? (
        <span className="tooltip-bubble" id={id} role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}

/** Термин с пояснением: «приоритет ?». */
export function Term({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <span className="row-tight">
      <span>{children}</span>
      <Tooltip text={hint} />
    </span>
  );
}

/* -------------------------------------------------------------------- Chip */

export function Chip({
  active,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active ?? false}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Tile */

export function Tile({
  title,
  hint,
  active,
  order,
  disabled,
  lockedNote,
  onClick,
}: {
  title: string;
  hint?: string;
  active?: boolean;
  order?: number;
  disabled?: boolean;
  lockedNote?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="tile"
      aria-pressed={active ?? false}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="tile-title">{title}</span>
      {hint ? <span className="tile-hint">{hint}</span> : null}
      {lockedNote ? <span className="tile-locked">{lockedNote}</span> : null}
      {typeof order === 'number' ? (
        <span className="tile-order" aria-hidden="true">
          {order}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------- Input */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="field">
      {label ? (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={['input', error ? 'input-invalid' : '', className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <span className="field-error" id={`${inputId}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <div className="search-field">
        <Search className="search-icon" size={18} aria-hidden="true" />
        <input
          id={id}
          type="search"
          className="input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

/** Балл ЕГЭ: 0–100, с валидацией и понятной ошибкой. */
export function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  error,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  error?: string;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="number-row">
        <input
          id={id}
          className={['input', 'number-input', error ? 'input-invalid' : ''].filter(Boolean).join(' ')}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ''}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(null);
              return;
            }
            onChange(Number(raw));
          }}
        />
        {suffix ? <span className="text-secondary small">{suffix}</span> : null}
      </div>
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Combobox */

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

/** Выбор региона: список большой, поэтому с поиском. */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Начни вводить название',
  emptyText = 'Ничего не найдено',
}: {
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter((o) => o.label.toLowerCase().includes(normalized)).slice(0, 40)
    : options.slice(0, 40);

  return (
    <div className="field combobox" ref={wrapRef}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && filtered[0]) {
            onChange(filtered[0].value);
            setOpen(false);
            e.preventDefault();
          }
        }}
      />
      {open ? (
        <div className="combobox-list" id={`${id}-list`} role="listbox">
          {filtered.length === 0 ? (
            <p className="combobox-empty">{emptyText}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className="combobox-option"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- Switch / Checkbox */

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Checkbox({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox-body">
        <span>{label}</span>
        {note ? <span className="checkbox-note">{note}</span> : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------- ProgressBar */

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className="progress-fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="progress-label">{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------- Tabs */

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Alert */

export function Alert({
  kind = 'info',
  children,
  action,
}: {
  kind?: 'info' | 'warning' | 'danger';
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = kind === 'danger' ? OctagonAlert : kind === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'info' ? 'note' : 'alert'}>
      <Icon className="alert-icon" size={18} aria-hidden="true" />
      <div className="alert-body">
        <div>{children}</div>
        {action}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <span className="skeleton" style={{ height, width, display: 'block' }} aria-hidden="true" />;
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p className="empty-text">{text}</p>
      {action}
    </div>
  );
}
