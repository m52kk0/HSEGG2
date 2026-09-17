import type { SalaryPoint } from '@cursus/data';

/** Зарплата всегда с единицами: «72 тыс. ₽». */
export function formatSalary(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value / 1000)} тыс. ₽`;
}

export function formatEmployed(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value)}% трудоустроены`;
}

export function salaryLine(point: SalaryPoint | null): string {
  const salary = formatSalary(point?.salary);
  return salary ?? 'нет данных';
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatVacancySalary(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'зарплата не указана';
  if (min != null && max != null && min !== max) {
    return `${min.toLocaleString('ru-RU')}–${max.toLocaleString('ru-RU')} ₽`;
  }
  const value = min ?? max!;
  return `от ${value.toLocaleString('ru-RU')} ₽`;
}
