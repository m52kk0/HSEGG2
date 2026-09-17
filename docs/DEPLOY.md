# Развёртывание

## Одна команда

```bash
docker build -t cursus . && docker run -d -p 8080:8080 -v cursus-data:/data --name cursus cursus
```

Открой <http://localhost:8080>. Внутри контейнера один процесс Node: он отдаёт собранный фронт
и API на одном порту. Обратный прокси для запуска не нужен.

Через compose (то же самое, но с перезапуском и переменными из `.env`):

```bash
docker compose up -d --build
```

---

## Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `PORT` | `8080` | Порт процесса |
| `DATABASE_PATH` | `/data/cursus.db` | Файл SQLite. В контейнере смонтируй volume на `/data` |
| `ADMIN_TOKEN` | пусто | Токен для `/admin` и `GET /api/admin/stats`. **Пусто → демо-режим:** страница открыта без пароля и доступен сид синтетики |
| `VITE_YM_ID` | пусто | ID Яндекс Метрики. Задаётся **на этапе сборки фронта**; пусто → внешний скрипт не подключается |
| `REFRESH_WIKIDATA` | `false` | Фоновое обновление списка вузов. По умолчанию выключено |
| `VACANCIES_TIMEOUT_MS` | `4000` | Таймаут запроса к API «Работа России» |
| `VACANCIES_CACHE_TTL_H` | `6` | Время жизни кэша вакансий |
| `WEB_DIST` | `/app/public` | Каталог со собранным фронтом |

Шаблон — в `.env.example`. Для продакшена **задай `ADMIN_TOKEN`**: иначе `/admin` открыт всем,
кто знает адрес.

```bash
docker run -d -p 8080:8080 -v cursus-data:/data \
  -e ADMIN_TOKEN='длинная-случайная-строка' \
  --name cursus cursus
```

---

## Проверка после запуска

```bash
curl -s http://localhost:8080/api/health          # {"status":"ok",...}
curl -s http://localhost:8080/ | grep -o Cursus   # главная отдаётся
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/plan   # 200, SPA-фолбэк
docker inspect --format='{{.State.Health.Status}}' cursus             # healthy
```

Автоматически то же делает `node scripts/docker-smoke.mjs`: собирает образ, запускает, проверяет
health, главную, SPA-фолбэк, вакансии, размер образа и что процесс работает не от root.

В образе есть `HEALTHCHECK` (интервал 30 с), поэтому оркестратор сам увидит нерабочий контейнер.

---

## Разработка без Docker

```bash
pnpm install
pnpm dev
```

- фронт: <http://localhost:5173> (Vite, запросы `/api` проксируются на 8080)
- API: <http://localhost:8080>

Только API:

```bash
pnpm -F @cursus/api dev
```

Собрать и запустить как в проде:

```bash
pnpm build
DATABASE_PATH=.data/cursus.db WEB_DIST=apps/web/dist node apps/api/dist/index.js
```

---

## nginx с HTTPS

Cursus слушает HTTP на 8080. Терминация TLS — на прокси.

```nginx
server {
    listen 443 ssl http2;
    server_name cursus.example.ru;

    ssl_certificate     /etc/letsencrypt/live/cursus.example.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cursus.example.ru/privkey.pem;

    # Ассеты Vite содержат хэш в имени — их можно кэшировать надолго.
    location /assets/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # Аналитика уходит через sendBeacon — тело маленькое, но пусть будет запас.
    client_max_body_size 128k;
}

server {
    listen 80;
    server_name cursus.example.ru;
    return 301 https://$host$request_uri;
}
```

Сервис не обрабатывает `X-Forwarded-For` и не логирует IP — см. [ANALYTICS.md](ANALYTICS.md).

---

## Бэкап SQLite

В базе только аналитика и кэш вакансий: потеря не ломает продукт, но историю воронки жалко.

```bash
# Горячая копия без остановки контейнера
docker exec cursus node -e "
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
const db = new DatabaseSync(process.env.DATABASE_PATH);
db.exec(\"VACUUM INTO '/data/backup.db'\");
db.close();
"
docker cp cursus:/data/backup.db ./cursus-$(date +%F).db
```

`VACUUM INTO` даёт согласованную копию даже при активной записи — просто скопировать файл
при включённом WAL нельзя.

Восстановление:

```bash
docker stop cursus
docker run --rm -v cursus-data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /backup/cursus-2026-09-17.db /data/cursus.db'
docker start cursus
```

Чтобы начать аналитику с нуля, достаточно удалить файл: схема создаётся при старте.

---

## Обновление версии

```bash
git pull
docker compose up -d --build   # или docker build + docker run с тем же volume
```

Volume переиспользуется, миграций нет: схема создаётся через `CREATE TABLE IF NOT EXISTS`.
Снимок данных вкомпилирован в образ, поэтому обновление данных — это пересборка образа.

---

## Ресурсы

| Показатель | Значение |
| --- | --- |
| Образ | 245 МБ |
| Память в покое | ~90 МБ |
| Первая загрузка фронта | ~69 КБ gzip: JS 8, vendor 56, CSS 5. Снимок на 405 КБ подгружается при первом расчёте плана |
| Пользователь в контейнере | `node`, не root |
| Данные | volume `/data`, только SQLite |
