/**
 * Компонентные тесты UI-кита. Проверяем то, что легко сломать незаметно:
 * зона называется словом (а не только цветом), состояния кнопок, метку «Демо»,
 * тултип по клавиатуре и валидацию ввода баллов.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZONE_LABELS } from '@cursus/core';
import { Button, Checkbox, DemoTag, IconButton, NumberInput, Tooltip, ZoneBadge } from '../index';
import { MiniChart } from '../MiniChart';

describe('ZoneBadge', () => {
  it('всегда пишет зону словом — цвет не единственный носитель смысла', () => {
    render(<ZoneBadge zone="safe" />);
    expect(screen.getByText(ZONE_LABELS.safe)).toBeInTheDocument();
  });

  it.each([
    ['safe', 19, '· +19'],
    ['target', -3, '· −3'],
    ['reach', -22, '· −22'],
  ] as const)('зона %s показывает запас со знаком', (zone, margin, expected) => {
    render(<ZoneBadge zone={zone} margin={margin} />);
    expect(screen.getByText(ZONE_LABELS[zone])).toBeInTheDocument();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('без запаса показывает только зону', () => {
    render(<ZoneBadge zone="target" />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('цветная точка скрыта от скринридера — она дублирует слово', () => {
    const { container } = render(<ZoneBadge zone="reach" margin={-10} />);
    const dot = container.querySelector('.zone-dot');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Button', () => {
  it('три вида и ничего больше', () => {
    const { container } = render(
      <>
        <Button>primary</Button>
        <Button variant="secondary">secondary</Button>
        <Button variant="text">text</Button>
      </>,
    );
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(container.querySelectorAll('.btn-secondary')).toHaveLength(1);
    expect(container.querySelectorAll('.btn-text')).toHaveLength(1);
  });

  it('disabled не кликается', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Дальше
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading блокирует кнопку и показывает индикатор', () => {
    const { container } = render(<Button loading>Строим</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('кликается мышью и с клавиатуры', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Построить план</Button>);
    const button = screen.getByRole('button', { name: 'Построить план' });

    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('IconButton всегда имеет подпись для скринридера', () => {
    render(
      <IconButton label="Поднять приоритет">
        <span aria-hidden="true">↑</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Поднять приоритет' })).toBeInTheDocument();
  });
});

describe('DemoTag', () => {
  it('объясняет, что цифра тестовая', () => {
    render(<DemoTag />);
    const tag = screen.getByText('Демо');
    expect(tag).toHaveAttribute('title', expect.stringContaining('тестовые данные'));
  });
});

describe('Tooltip', () => {
  it('открывается по клику и закрывается по Escape', async () => {
    render(<Tooltip text="Приоритет — порядок желания внутри вуза" />);
    const trigger = screen.getByRole('button', { name: 'Что это значит' });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('порядок желания');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('открывается при фокусе с клавиатуры', async () => {
    render(<Tooltip text="Пояснение" />);
    screen.getByRole('button', { name: 'Что это значит' }).focus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });
});

describe('NumberInput — баллы ЕГЭ', () => {
  /** Обёртка с состоянием: поле управляемое, без неё ввод не накапливается. */
  function StatefulScore({ onValue }: { onValue: (value: number | null) => void }) {
    const [value, setValue] = useState<number | null>(null);
    return (
      <NumberInput
        label="Математика"
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
      />
    );
  }

  it('накапливает введённое число', async () => {
    const onValue = vi.fn();
    render(<StatefulScore onValue={onValue} />);

    await userEvent.type(screen.getByLabelText('Математика'), '76');
    expect(onValue).toHaveBeenLastCalledWith(76);
  });

  it('очистка поля даёт null, а не ноль', async () => {
    const onValue = vi.fn();
    render(<StatefulScore onValue={onValue} />);
    const input = screen.getByLabelText('Математика');

    await userEvent.type(input, '76');
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('ограничен диапазоном 0–100', () => {
    render(<NumberInput label="Русский" value={78} onChange={() => undefined} />);
    const input = screen.getByLabelText('Русский');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
  });

  it('ошибка связана с полем через aria-describedby', () => {
    render(
      <NumberInput
        label="Русский"
        value={500}
        onChange={() => undefined}
        error="Балл — целое число от 0 до 100"
      />,
    );
    const input = screen.getByLabelText('Русский');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Балл — целое число от 0 до 100');
  });
});

describe('Checkbox', () => {
  it('переключается по подписи, а не только по квадратику', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Знак ГТО" note="обычно +2" checked={false} onChange={onChange} />);

    await userEvent.click(screen.getByText('Знак ГТО'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('MiniChart', () => {
  it('описывает график текстом для скринридера', () => {
    render(
      <MiniChart
        history={[
          { label: '2023', value: 214 },
          { label: '2024', value: 220 },
          { label: '2025', value: 225 },
        ]}
        forecast={{ label: 'прогноз', value: 231 }}
        userScore={228}
      />,
    );

    const chart = screen.getByRole('img');
    expect(chart).toHaveAccessibleName(/2023: 214/);
    expect(chart).toHaveAccessibleName(/прогноз/);
    expect(chart).toHaveAccessibleName(/твой балл: 228/);
  });

  it('без данных ничего не рисует', () => {
    const { container } = render(<MiniChart history={[]} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('работает без прогноза и без балла пользователя', () => {
    render(<MiniChart history={[{ label: '2025', value: 200 }]} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.queryByText('прогноз')).not.toBeInTheDocument();
  });
});
