# Runbook: подключение и отключение специалиста

Действия разработчика. Специалист к этому моменту прошёл `/onboarding` и прислал:
GitHub-логин, публичный ключ машины (`finflow_ed25519.pub`), имя/email.

## Выдача доступов

1. **Репозиторий (write):**
   ```bash
   gh api -X PUT repos/webkoth/finflow/collaborators/<login> -f permission=push
   ```
   (Специалист принимает приглашение; проверка у него: `gh api repos/webkoth/finflow --jq .permissions.push` → true.)

2. **Опер-режим (ops на сервере):**
   ```bash
   ssh root@161.104.50.20 "echo '<pubkey одной строкой>' >> /home/ops/.ssh/authorized_keys"
   ```

3. **Лично передать** (из `/root/finflow-credentials.txt` на сервере):
   - пароль basic auth (логин `finflow`) — для браузерного доступа к dev/prod;
   - строку `DATABASE_URL_PROD_RO` — специалист добавляет её в свой `.env`.

4. Попросить специалиста прогнать `node scripts/onboarding-check.mjs` — все пункты
   должны стать PASS.

## Отзыв доступов (уход/ротация)

1. `gh api -X DELETE repos/webkoth/finflow/collaborators/<login>`
2. Удалить строку ключа из `/home/ops/.ssh/authorized_keys` на сервере.
3. Сменить пароль basic auth: `htpasswd -bB /etc/nginx/.htpasswd finflow '<новый>'`
   + `systemctl reload nginx`; раздать новый пароль оставшимся.
4. Сменить пароль роли `finflow_ro` в PostgreSQL и обновить строку у оставшихся:
   `ALTER ROLE finflow_ro PASSWORD '<новый>';` (обновить /root/finflow-credentials.txt).
