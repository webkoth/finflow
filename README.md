# finflow

Внутреннее финансовое приложение. Разрабатывается доменными специалистами
через Claude Code по правилам из `CLAUDE.md`.

## Документы

- Правила работы: `CLAUDE.md`
- Спецификация окружения: `docs/superpowers/specs/2026-07-13-team-environment-design.md`
- Планы внедрения: `docs/superpowers/plans/`

## Быстрый старт (разработчик)

```bash
nvm use                          # Node 26
npm install
createdb finflow_dev             # локальный PostgreSQL
cp .env.example .env             # и подставь своего пользователя ОС в DATABASE_URL
npx prisma migrate dev
npx prisma db seed
npm run dev                      # http://localhost:3000
```

## Проверки

```bash
npm run lint && npm run typecheck && npm run test   # быстрые
npm run test:e2e                                    # e2e-смоук (Playwright)
```

Специалисты настраивают машину командой `/onboarding` в Claude Code
(активируется после внедрения этапа 5 спецификации).
