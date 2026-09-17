# API

Базовый адрес — тот же, что у фронта: `http://localhost:8080`. Один процесс отдаёт и статику,
и API. Машиночитаемая спецификация: `GET /api/openapi.json` (собирается из zod-схем).

Формат ошибки всегда одинаковый:

```json
{ "error": "Некорректные параметры", "details": { } }
```

---

## Служебные

### `GET /api/health`

```bash
curl -s http://localhost:8080/api/health
```

```json
{ "status": "ok", "version": "1.0.0", "snapshotDate": "2026-09-17", "uptime": 42 }
```

### `GET /api/meta`

Даты приёмной кампании, пороги зон, лимиты правил приёма, группы интересов, статистика снимка.

```bash
curl -s http://localhost:8080/api/meta | jq '{campaignYear, rulesNote, zones: .zones.thresholds, limits}'
```

```json
{
  "campaignYear": 2026,
  "rulesNote": "по правилам 2026 года",
  "zones": { "safe": 10, "target": -5 },
  "limits": { "maxUniversities": 5, "maxProgramsPerUniversity": 5, "maxAchievementsBonus": 10 }
}
```

### `GET /api/openapi.json`

```bash
curl -s http://localhost:8080/api/openapi.json | jq '.paths | keys'
```

---

## Каталог

### `GET /api/regions`

87 регионов с кодами для API «Работа России».

```bash
curl -s http://localhost:8080/api/regions | jq '.items[0]'
```

```json
{ "name": "Алтайский край", "trudvsemCode": "2200000000000", "trudvsemName": "Алтайский край" }
```

### `GET /api/directions?q=&limit=`

Поиск по коду и по названию. Работает и «15.03», и «автоматизация».

```bash
curl -s "http://localhost:8080/api/directions?q=15.03.04" | jq '.items[0]'
```

```json
{
  "code": "15.03.04",
  "name": "Автоматизация технологических процессов и производств",
  "area": "Инженерное дело, технологии и технические науки",
  "group": "Машиностроение"
}
```

### `GET /api/universities?region=`

```bash
curl -s "http://localhost:8080/api/universities?region=Нижегородская%20область" | jq '.total'
```

### `GET /api/programs?region=&code=&universityId=&limit=`

Демо-снимок с реальными значениями поверх. Короткий код работает как префикс: `15`, `15.03`
или полный `15.03.04`.

```bash
curl -s "http://localhost:8080/api/programs?universityId=Q4318652&code=15.03.04" | jq '.items[0]'
```

```json
{
  "id": "Q4318652-15.03.04",
  "universityId": "Q4318652",
  "code": "15.03.04",
  "name": "Автоматизация технологических процессов и производств",
  "budgetPlaces": 65,
  "exams": ["math", "russian", ["physics", "informatics"]],
  "minScores": { "math": 45, "russian": 44, "physics": 41, "informatics": 43 },
  "cutoffs": { "2023": 214, "2024": 220, "2025": 225 },
  "isDemo": true
}
```

`400` — если код или `universityId` не подходят по формату, либо `limit` больше 500.

### `GET /api/programs/:id`

Программа вместе с вузом, редакционным текстом и зарплатами выпускников (с фолбэком на Россию).

```bash
curl -s http://localhost:8080/api/programs/Q4318652-15.03.04 | jq '{university: .university.name, learn: .content.learn, y1: .salaries.entry.y1}'
```

`404` — направление не найдено.

### `GET /api/salaries/:code?region=`

```bash
curl -s "http://localhost:8080/api/salaries/09.03.01?region=Москва" | jq '{entry, fallbackToRussia}'
```

`404` — по этому коду данных нет. Выдуманных чисел API не возвращает.

---

## Вакансии

### `GET /api/vacancies?q=&region=`

Прокси к открытому API «Работа России». `region` — 13-значный код из `/api/regions`.

```bash
curl -s "http://localhost:8080/api/vacancies?q=инженер%20АСУ%20ТП&region=5200000000000" | jq '{source, total, first: .items[0]}'
```

```json
{
  "source": "live",
  "total": 1,
  "first": {
    "title": "Инженер автоматизированных систем управления технологическими процессами (АСУ ТП)",
    "company": "АО \"НОКК\"",
    "salaryMin": 79736,
    "salaryMax": 79736,
    "url": "https://trudvsem.ru/vacancy/card/..."
  }
}
```

Поле `source` показывает, откуда данные:

| `source` | Значение |
| --- | --- |
| `live` | только что получено от «Работы России» |
| `cache` | из кэша (в памяти или SQLite); в интерфейсе подписывается датой |
| `snapshot` | внешний API недоступен, отдан пример из репозитория |

**Эндпоинт никогда не отвечает 5xx из-за внешнего API.** Таймаут 4 секунды, кэш 6 часов —
настраиваются переменными `VACANCIES_TIMEOUT_MS` и `VACANCIES_CACHE_TTL_H`.

`400` — запрос короче двух символов или код региона не 13-значный.

---

## План

### `POST /api/plan`

Считает план той же функцией `buildPlan`, что и браузер. Нужен для шаринга и тестов.

```bash
curl -s -X POST http://localhost:8080/api/plan \
  -H 'Content-Type: application/json' \
  -d '{
    "scores": { "russian": 78, "math": 76, "physics": 70, "informatics": 72 },
    "achievementsBonus": 2,
    "interests": ["engineering", "it", "energy"],
    "regionMode": "home",
    "homeRegion": "Нижегородская область"
  }' | jq '{verdict: .verdict.title, universities: [.universities[].university.name]}'
```

```json
{
  "verdict": "Бюджет почти гарантирован",
  "universities": [
    "Нижегородский государственный технический университет",
    "Нижегородский государственный архитектурно-строительный университет",
    "Волжский государственный университет водного транспорта",
    "Нижегородский институт управления",
    "Нижегородский государственный университет"
  ]
}
```

`400` — балл вне диапазона 0–100, незнакомый предмет, бонус больше 10, больше трёх интересов.

---

## Аналитика

### `POST /api/events`

До 50 обезличенных событий за раз. Что можно отправлять — в [ANALYTICS.md](ANALYTICS.md).

```bash
curl -s -X POST http://localhost:8080/api/events \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"demo-session-1","events":[{"name":"plan_view","props":{"verdict":"good"}}]}'
```

```json
{ "accepted": 1, "stored": true }
```

`400` — незнакомое событие, пустой или слишком большой батч, непримитивные значения в `props`.
`429` — больше 60 запросов в минуту с одной сессии.

### `GET /api/admin/stats?period=&synthetic=`

`period` — `24h`, `7d` или `all`. `synthetic=0` скрывает синтетические события.

```bash
# Если ADMIN_TOKEN задан:
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:8080/api/admin/stats?period=7d" | jq '{sessions, funnel, topPairs}'
```

Если `ADMIN_TOKEN` пуст, включён демо-режим: эндпоинт открыт без токена, в ответе `demoMode: true`.
`401` — токен задан, но не совпал.

### `POST /api/admin/seed`

500 синтетических сессий, чтобы экран аналитики не был пустым на защите. Доступно **только
в демо-режиме**; повторный вызов заменяет предыдущую синтетику, а не накапливает её.

```bash
curl -s -X POST http://localhost:8080/api/admin/seed
```

```json
{ "created": 4287, "sessions": 500 }
```

`403` — `ADMIN_TOKEN` задан.
