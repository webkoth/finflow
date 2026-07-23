# docs/contracts/yandex-messenger.md — бот для отправки платёжек

Статус: бот НЕ создан (предпосылка §11.3 спеки заявок). До закрытия —
`YM_BOT_MODE=mock`.

## Что нужно сделать (вне кода)

1. Создать бота в админке Яндекс 360 (messenger → боты), получить OAuth-токен.
2. Добавить бота в чаты поставщиков.
3. Для каждого чата получить `chat_id` (GUID чата; ссылка из карточки 1С —
   для человека, Bot API требует идентификатор). Пока формат соответствия
   «ссылка → chat_id» не подтверждён, бухгалтер вводит chat_id в черновике
   вручную.

## Зафиксированный формат вызова (проверить при появлении бота)

    POST https://botapi.messenger.yandex.net/bot/v1/messages/sendFile/
    Authorization: OAuth <YM_BOT_TOKEN>
    multipart/form-data: chat_id, text, document (файл)

При расхождении с фактическим API правится только
`lib/integrations/yandex-messenger.ts` (одна функция).
