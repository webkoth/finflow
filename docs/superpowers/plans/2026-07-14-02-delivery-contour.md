# План 2: Контур доставки (VPS + GitHub Actions + боевые команды)

**Goal:** Работающий контур доставки: push в `develop` → автодеплой в dev-окружение, PR `develop`→`main` с апрувом → автодеплой в production; боевые команды /ship, /request-prod, /status, /logs, /reset-dev.

**Входные данные (получены 2026-07-14):**
- VPS: `161.104.50.20` (root по SSH-ключу разработчика), Ubuntu 24.04 LTS, 8 CPU / 15 GB / 99 GB, чистый.
- GitHub: https://github.com/webkoth/finflow (main защищён, develop свободен).
- Домены: реальных пока нет → временно sslip.io:
  - dev: `http://dev.161.104.50.20.sslip.io`
  - prod: `http://finflow.161.104.50.20.sslip.io`
  - SSL пока НЕ ставим (Let's Encrypt лимиты на общий домен sslip.io); включим при переходе на реальные домены.
- Пароль basic auth: генерируется при установке, хранится в `/root/finflow-credentials.txt` и выдаётся разработчиком лично.

**Архитектура на сервере (по спеке, раздел 4):**

| Компонент | dev | prod |
|---|---|---|
| Каталог | /var/www/finflow-dev | /var/www/finflow-prod |
| pm2-процесс (под пользователем deploy) | finflow-dev | finflow-prod |
| Порт | 3001 | 3000 |
| БД | finflow_dev | finflow_prod |
| Роль приложения | finflow_app_dev | finflow_app_prod |
| nginx vhost | dev.161.104.50.20.sslip.io | finflow.161.104.50.20.sslip.io |

Плюс роль `finflow_ro` — read-only на finflow_prod, доступ по TCP c SSL (для опер-режима специалистов).

## Фазы

### A. База сервера
apt update/upgrade; установить: git, nginx, postgresql (16, из Ubuntu), ufw, apache2-utils (htpasswd), rsync; Node 26 из NodeSource; pm2 глобально. ufw: allow 22, 80, 443, 5432; enable. Таймзона Europe/Moscow.

### B. Пользователи и права
- `deploy` — владелец приложений и pm2; CI ходит под ним по отдельному ключу (пара генерируется, приватная часть → GitHub Secrets).
- `ops` — для специалистов (ключи раздадим в Плане 3). Никакого прямого доступа к pm2/файлам; только обёртки через sudoers NOPASSWD:
  - `/usr/local/bin/finflow-status` — pm2-статус обоих процессов + HTTP-проверки
  - `/usr/local/bin/finflow-logs {dev|prod} [строк]` — хвост логов
  - `/usr/local/bin/finflow-restart-dev` — рестарт ТОЛЬКО finflow-dev
  - `/usr/local/bin/finflow-reset-dev` — пересоздание dev-БД (migrate reset --force + seed)
  Прод не рестартуется через ops ни при каких условиях.

### C. PostgreSQL
Базы finflow_dev / finflow_prod; роли finflow_app_dev / finflow_app_prod (rw в своей БД, локально) и finflow_ro (SELECT на все таблицы finflow_prod, включая будущие через ALTER DEFAULT PRIVILEGES). listen_addresses='*', SSL on (self-signed), pg_hba: app-роли только local/127.0.0.1; finflow_ro — hostssl отовсюду, scram-sha-256. Пароли генерируются, хранятся в /root/finflow-credentials.txt.

### D. Приложения
Клонировать репо в оба каталога (dev — ветка develop, prod — main), `.env` на сервере (DATABASE_URL + PORT), npm ci, prisma migrate deploy, seed только в dev, next build, pm2 start `npm start` (name finflow-dev/finflow-prod), pm2 save + systemd startup.

### E. nginx + basic auth
Два vhost-проксирования на 3001/3000, общий htpasswd (`finflow` / сгенерированный пароль), сжатие, security-заголовки базово. HTTP-only до реальных доменов.

### F. GitHub Actions
- `.github/workflows/ci.yml` — на push в feature/* и PR: lint → typecheck → unit → build (с postgres service для будущих нужд не требуется: unit не трогает БД).
- `.github/workflows/deploy-dev.yml` — на push в develop: quality-гейт (lint, typecheck, unit) + e2e на раннере (postgres service, `next build && next start`) → ssh deploy@сервер: git fetch/reset на origin/develop, npm ci, prisma migrate deploy, build, pm2 reload, HTTP-проверка живости.
- `.github/workflows/deploy-prod.yml` — то же на push в main (merge PR), цель prod, без seed.
- Secrets: `DEPLOY_SSH_KEY`, `SERVER_HOST`. Строки БД в secrets не нужны — живут в server-side `.env`.
- playwright.config.ts: в CI webServer = `npm run build && npm run start` (по замечанию финального ревью Плана 1).

### G. Боевые команды и документы
Переписать заглушки: /ship (проверки → коммит → merge feature→develop → push → gh run watch → ссылка на dev), /request-prod (gh pr create develop→main), /status, /logs, /reset-dev (через ssh ops@… обёртки; у разработчика — root, у специалистов появится ops-ключ в Плане 3). Убрать из CLAUDE.md пометку «контур не развёрнут», вписать фактические адреса. Обновить спеку (раздел 15 → факт).

### H. Приёмка (сквозная)
1. Тривиальное изменение через feature-ветку → /ship → CI зелёный → изменение видно на dev-домене.
2. /request-prod → PR → апрув разработчика → merge → CI → изменение видно на prod-домене.
3. /status и /logs работают; /reset-dev пересоздаёт dev-БД (12 seed-транзакций).
4. finflow_ro: SELECT работает, INSERT — отказ.

## Открытые пункты (переносятся)
- Реальные домены + SSL (certbot) — когда появятся домены.
- Возврат репо в приватный (GitHub Pro/Team) — решение Минаса.
- Выдача ops-ключей и DATABASE_URL_PROD_RO специалистам — План 3 (onboarding).
