import { useId } from 'react';

export interface ChartPoint {
  label: string;
  value: number;
}

/**
 * График проходных за 3 года + пунктир прогноза + горизонталь «твой балл».
 * Чистый SVG: тяжёлые библиотеки графиков в проект не тянем.
 */
export function MiniChart({
  history,
  forecast,
  userScore,
  userLabel = 'твой балл',
  height = 160,
}: {
  history: ChartPoint[];
  forecast?: ChartPoint | null;
  userScore?: number | null;
  userLabel?: string;
  height?: number;
}) {
  const titleId = useId();
  const points = forecast ? [...history, forecast] : history;
  if (points.length === 0) return null;

  const width = 320;
  const padding = { top: 22, right: 16, bottom: 26, left: 16 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = [...points.map((p) => p.value), ...(userScore != null ? [userScore] : [])];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(8, Math.round((rawMax - rawMin) * 0.25));
  const min = rawMin - pad;
  const max = rawMax + pad;

  const x = (index: number) =>
    padding.left + (points.length === 1 ? innerW / 2 : (innerW * index) / (points.length - 1));
  const y = (value: number) => padding.top + innerH - ((value - min) / (max - min)) * innerH;

  const historyPath = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const lastHistoryIndex = history.length - 1;
  const forecastPath =
    forecast && history.length > 0
      ? `M${x(lastHistoryIndex)},${y(history[lastHistoryIndex]!.value)} L${x(points.length - 1)},${y(forecast.value)}`
      : '';

  const description = [
    history.map((p) => `${p.label}: ${p.value}`).join(', '),
    forecast ? `прогноз ${forecast.label}: ${forecast.value}` : '',
    userScore != null ? `${userLabel}: ${userScore}` : '',
  ]
    .filter(Boolean)
    .join('; ');

  return (
    <div className="stack-s">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
      >
        <title id={titleId}>Проходные баллы — {description}</title>

        <line
          className="chart-axis"
          x1={padding.left}
          y1={padding.top + innerH}
          x2={width - padding.right}
          y2={padding.top + innerH}
        />

        {userScore != null ? (
          <>
            <line
              className="chart-user-line"
              x1={padding.left}
              y1={y(userScore)}
              x2={width - padding.right}
              y2={y(userScore)}
            />
            <text className="chart-user-label" x={padding.left} y={y(userScore) - 6}>
              {userLabel} {userScore}
            </text>
          </>
        ) : null}

        {historyPath ? <path className="chart-line" d={historyPath} /> : null}
        {forecastPath ? <path className="chart-line-forecast" d={forecastPath} /> : null}

        {points.map((p, i) => {
          const isForecast = forecast != null && i === points.length - 1;
          return (
            <g key={`${p.label}-${i}`}>
              <circle
                className={isForecast ? 'chart-point-forecast' : 'chart-point'}
                cx={x(i)}
                cy={y(p.value)}
                r={4}
              />
              <text className="chart-value" x={x(i)} y={y(p.value) - 10} textAnchor="middle">
                {p.value}
              </text>
              <text
                className="chart-label"
                x={x(i)}
                y={padding.top + innerH + 16}
                textAnchor="middle"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch" aria-hidden="true" />
          проходной по годам
        </span>
        {forecast ? (
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-forecast" aria-hidden="true" />
            прогноз
          </span>
        ) : null}
        {userScore != null ? (
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-user" aria-hidden="true" />
            {userLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
