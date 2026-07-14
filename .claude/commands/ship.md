---
description: Доставить изменения в dev-окружение («песочницу») — проверки → коммит → merge в develop → контроль деплоя
---

Выполни доставку текущей работы в dev-окружение. Строго по шагам:

1. Проверь текущую ветку (`git branch --show-current`). Если это `main` или
   `develop` с незакоммиченными изменениями фичи — сначала создай feature-ветку:
   `git switch -c feature/<короткий-слаг-фичи>`.
2. Если есть незакоммиченные изменения: прогони
   `npm run format && npm run lint && npm run typecheck && npm run test`,
   исправь падения, затем закоммить (conventional commit, описание на русском).
3. `git fetch origin && git switch develop && git pull origin develop`
4. `git merge --no-ff feature/<ветка>` — конфликты решай сам по смыслу;
   если конфликт затрагивает чужую незнакомую логику — остановись и спроси пользователя.
5. `git push origin develop`
6. Дождись CI и деплоя:
   `gh run watch $(gh run list --branch develop -L1 --json databaseId -q '.[0].databaseId') --exit-status`
   Если прогон красный — прочитай логи (`gh run view --log-failed`), почини причину
   на feature-ветке и повтори процесс с шага 2.
7. После зелёного прогона удали слитую feature-ветку (`git branch -d feature/<ветка>`)
   и сообщи пользователю: «Выложено в песочницу: http://dev.161.104.50.20.sslip.io
   (логин finflow, пароль выдаёт разработчик)».

ЗАПРЕЩЕНО: пушить или мержить в `main` (это делает только разработчик через PR),
пушить в `develop` без прохождения проверок шага 2.
