---
description: Состояние контуров dev и production (pm2, HTTP, последние деплои)
---

Покажи состояние обоих контуров finflow:

1. Серверное состояние (pm2 + внутренние HTTP-проверки):
   `ssh ops@161.104.50.20 sudo -u deploy /usr/local/bin/finflow-status`
   Если SSH-доступ отклонён — сообщи пользователю: «нужен ops-ключ, его выдаёт
   разработчик» и продолжи с шага 2.
2. Последние прогоны CI/деплоев:
   `gh run list -L5 --json name,headBranch,status,conclusion,updatedAt`
3. Сведи в короткий ответ: оба ли процесса online, коды HTTP, статус последнего
   деплоя dev и prod. Адреса: dev http://dev.161.104.50.20.sslip.io,
   prod http://finflow.161.104.50.20.sslip.io (basic auth: finflow / пароль у разработчика).
