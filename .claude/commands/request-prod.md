---
description: Создать PR develop → main на ревью разработчику (релиз в production)
---

Создай релизный PR из develop в main:

1. `git fetch origin`
2. Собери список изменений с прошлого релиза:
   `git log origin/main..origin/develop --oneline --no-merges`
   Если список пуст — сообщи пользователю, что релизить нечего, и остановись.
3. Создай PR:
   `gh pr create --base main --head develop --title "release: <краткая суть пачки>" --body "<маркированный список изменений человеческим языком + список коммитов>"`
   В body обязательно отметь, есть ли в пачке миграции БД (посмотри
   `git diff origin/main..origin/develop --stat -- prisma/migrations/`) и деструктивные
   операции в них.
4. Сообщи пользователю ссылку на PR и что дальше: разработчик ревьюит и мержит,
   после merge production обновится автоматически (workflow deploy-prod).

Сам PR НЕ мержи и не апрувь — это делает только разработчик.
