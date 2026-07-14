---
description: Первичная настройка машины специалиста — от чистой ОС до работающего локального finflow и доступов
---

Проведи полный onboarding специалиста. Иди по шагам, после каждого блока коротко
сообщай статус. Если шаг уже выполнен (что-то установлено) — проверь версию и иди дальше.
При ошибке установки — разберись, не бросай пользователя с сырой командой.

## 1. Знакомство
Спроси: имя и фамилию (для авторства коммитов) и рабочий email.

## 2. Определи ОС и установи базовый софт
Нужны: git, Node.js 26, PostgreSQL 18, GitHub CLI (gh).

- **Windows (PowerShell):**
  `winget install --silent Git.Git OpenJS.NodeJS GitHub.cli PostgreSQL.PostgreSQL.18`
  После установки PostgreSQL спроси у пользователя пароль суперпользователя postgres,
  который он задал установщику (или задай `postgres` и запиши это пользователю).
  Перезапусти терминал/обнови PATH, проверь: `git --version`, `node --version` (>=26),
  `psql --version` (18.x), `gh --version`.
- **macOS:** `brew install git node gh postgresql@18 && brew services start postgresql@18`
- **Linux (Ubuntu/Debian):** git и gh из apt (gh — репозиторий cli.github.com),
  Node 26 — NodeSource (`https://deb.nodesource.com/setup_26.x`),
  PostgreSQL 18 — PGDG (`apt.postgresql.org`).

## 3. GitHub-аккаунт (обязателен)
1. Спроси, есть ли у пользователя GitHub-аккаунт.
2. Если нет — помоги создать: открой https://github.com/signup, подскажи использовать
   рабочий email и включить двухфакторную аутентификацию. Дождись создания.
3. `gh auth login` (протокол HTTPS, авторизация через браузер).
4. Сообщи пользователю: «Передай разработчику свой GitHub-логин: <login>» — доступ
   к репозиторию выдаёт разработчик (руками, см. runbook add-specialist).
5. Дождись выдачи доступа: `gh api repos/webkoth/finflow --jq .permissions.push`
   должно вернуть `true`. Пока false — можно продолжать шаги 4–6 и вернуться.

## 4. Git-идентичность
`git config --global user.name "<Имя Фамилия>"` и
`git config --global user.email "<рабочий email>"`.

## 5. Клонирование и зависимости
```
gh repo clone webkoth/finflow
cd finflow
npm install
```

## 6. Локальная база данных
- **Windows:** создай роль и БД от суперпользователя:
  `psql -U postgres -c "CREATE ROLE finflow LOGIN PASSWORD 'finflow' CREATEDB;"`
  `psql -U postgres -c "CREATE DATABASE finflow_dev OWNER finflow;"`
  В `.env`: `DATABASE_URL="postgresql://finflow:finflow@localhost:5432/finflow_dev"`
- **macOS/Linux:** `createdb finflow_dev`,
  в `.env`: `DATABASE_URL="postgresql://<пользователь-ОС>@localhost:5432/finflow_dev"`

Затем: `cp .env.example .env` (или создай), подставь правильный DATABASE_URL,
`npx prisma migrate dev`, `npx prisma db seed` (ожидается «Seed: создано 12 транзакций»).

## 7. Ключ машины для опер-режима
```
ssh-keygen -t ed25519 -f ~/.ssh/finflow_ed25519 -N "" -C "finflow-<имя>-<машина>"
```
Добавь в `~/.ssh/config` блок:
```
Host finflow-ops
    HostName 161.104.50.20
    User ops
    IdentityFile ~/.ssh/finflow_ed25519
```
Выведи пользователю публичный ключ (`~/.ssh/finflow_ed25519.pub`) с текстом:
«Отправь этот ключ разработчику — он даст доступ к логам и статусу сервера».

## 8. Проверка работы
1. `npx playwright install chromium`
2. Запусти `npm run dev`, открой http://localhost:3000 — приложение с демо-данными.
   Останови dev-сервер.
3. `node scripts/onboarding-check.mjs` — покажи пользователю итоговую таблицу.
   WARN по ops-SSH и доступу к репо допустимы, пока разработчик не выдал доступы.

## 9. Финал
Сообщи пользователю, что осталось получить у разработчика лично:
- подтверждение доступа к репозиторию (по логину из шага 3);
- добавление ops-ключа (из шага 7);
- пароль basic auth от dev/prod-окружений;
- строку `DATABASE_URL_PROD_RO` для отчётов по реальным данным (добавить в `.env`).

И напомни: работа над фичами начинается со слов «хочу сделать …» (запустится
brainstorming), доставка в песочницу — командой /ship.
