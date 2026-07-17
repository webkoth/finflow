// tests/e2e/verdict.spec.ts
// Светофор: карточка, реестр, настройки. Serial: тест настроек меняет
// глобальное состояние и восстанавливает его в конце.
import { expect, test } from "@playwright/test"
import { syncFixtureData } from "./helpers"

test.describe.configure({ mode: "serial" })

test.afterAll(async ({ browser, baseURL }) => {
  // Страховка: вернуть порог по умолчанию, даже если тест настроек упал
  // посреди — иначе он останется в общей dev-БД и уронит другие прогоны.
  // baseURL передаём явно: newPage() не наследует use.baseURL из конфига.
  const page = await browser.newPage({ baseURL })
  await page.goto("/settings/verdict")
  await page.getByLabel("«Постоянный контрагент» от, платежей").fill("3")
  await page.getByRole("button", { name: "Сохранить" }).click()
  await expect(page.getByText("Сохранено")).toBeVisible()
  await page.close()
})

test("карточка REQ-0004: вердикт «Можно согласовать» и секции контекста", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await expect(page.getByText("Авто-проверка: Можно согласовать")).toBeVisible()
  await expect(page.getByText("Денег на счёте достаточно")).toBeVisible()
  await expect(page.getByText("Постоянный контрагент")).toBeVisible()
  await expect(page.getByText("Заказ №78", { exact: false })).toBeVisible()
  await expect(page.getByText("invoice_78.pdf")).toBeVisible()
  await expect(page.getByText("Итого ТОРИ БРЭНДС ООО, ₽ экв.")).toBeVisible() // подытог ликвидности по юрлицу заявки, отдельно от группы
  await expect(
    page.getByText("нет данных — финмодель вне DWH").first()
  ).toBeVisible() // деградация: серые проверки финплана
  await expect(page.getByText("счёт списания")).toBeVisible()
})

test("карточка REQ-0007: «Требует внимания» — новый поставщик без основания", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0007" }).click()
  await expect(page.getByText("Авто-проверка: Требует внимания")).toBeVisible()
  // .first(): каждый ярлык критичной проверки виден и в чипе шапки, и в
  // панели авто-проверки (задача 9, шаг 3) — оба места валидны, .first()
  // просто снимает коллизию строгого режима Playwright.
  await expect(page.getByText("Новый поставщик").first()).toBeVisible()
  await expect(page.getByText("Нет основания").first()).toBeVisible()
  await expect(
    page.getByText("Нет ни заказа, ни договора").first()
  ).toBeVisible()
})

test("реестр: точки вердикта и фильтр «красные флаги»", async ({ page }) => {
  await syncFixtureData(page)
  await expect(
    page.getByLabel("Вердикт: Можно согласовать").first()
  ).toBeVisible()
  await expect(
    page.getByLabel("Вердикт: Требует внимания").first()
  ).toBeVisible()
  await page.getByText("Только красные флаги").click()
  await page.getByRole("button", { name: "Применить" }).click()
  await expect(page.getByRole("link", { name: "REQ-0007" })).toBeVisible()
  await expect(page.getByRole("link", { name: "REQ-0004" })).toHaveCount(0)
})

test("реестр: метрики и панель остатков с проекцией", async ({ page }) => {
  await syncFixtureData(page)
  // .first(): «На согласовании» — ещё и ярлык фильтра статуса, и статус
  // строк таблицы; метрика — первый по DOM-порядку узел с этим текстом.
  await expect(page.getByText("На согласовании").first()).toBeVisible()
  await expect(page.getByText("К оплате за 7 дней")).toBeVisible()
  await expect(page.getByText("Остаток группы")).toBeVisible()

  await page.getByText("Остатки и фонды").click()
  // До выбора: Сбербанк ₽ ТОРИ БРЭНДС — 40 000 000 → 40 000 000
  // Intl ru-RU разделяет разряды неразрывными пробелами → матчим через \s.
  const toriRow = page.getByRole("row", {
    name: /ТОРИ БРЭНДС ООО · Сбербанк ₽/,
  })
  await expect(toriRow).toContainText(
    /40\s000\s000,00\s₽\s→\s40\s000\s000,00\s₽/
  )
  // Отметили REQ-0004 (25,7 млн со Сбер ₽) → проекция уменьшилась
  await page.getByLabel("Выбрать REQ-0004").check()
  await expect(toriRow).toContainText(/→\s14\s300\s000,00\s₽/)

  // Фонд в минусе виден (карточка фонда — ссылка в панели), клик по фонду фильтрует
  await expect(page.getByRole("link", { name: "Маркетинг" })).toBeVisible()
  await page.getByRole("link", { name: "Закупки товара" }).click()
  await expect(page.getByRole("link", { name: "REQ-0004" })).toBeVisible()
  await expect(page.getByRole("link", { name: "REQ-0007" })).toHaveCount(0)

  // Ревью-фикс: отметка чекбокса не должна расходиться с проекцией после
  // клиентской навигации между фильтрами — строка REQ-0004 ремоунтится
  // (пропадает из фильтра «Исполненные», возвращается на «Все»), но
  // defaultChecked восстанавливает визуальную отметку из selected.
  await page.goto("/requests")
  await page.getByText("Остатки и фонды").click()
  await page.getByLabel("Выбрать REQ-0004").check()
  await expect(toriRow).toContainText(/→\s14\s300\s000,00\s₽/)
  await page.getByRole("link", { name: "Исполненные" }).click()
  await page.getByRole("link", { name: "Все" }).click()
  await expect(page.getByLabel("Выбрать REQ-0004")).toBeChecked()
  await expect(toriRow).toContainText(/→\s14\s300\s000,00\s₽/)
})

test("настройки: порог «постоянного» меняет вердикт (и восстанавливается)", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.goto("/settings/verdict")
  const minOps = page.getByLabel("«Постоянный контрагент» от, платежей")
  await minOps.fill("20")
  await page.getByRole("button", { name: "Сохранить" }).click()
  await page.waitForLoadState("networkidle")

  // Guangzhou (12 платежей) перестал быть «постоянным» → REQ-0004 теперь 🟡.
  await page.goto("/requests")
  await expect(page.getByLabel("Выбрать REQ-0004")).toHaveCount(0)
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await expect(
    page.getByText("Авто-проверка: Можно согласовать с оговоркой")
  ).toBeVisible()

  // Восстановить дефолт, чтобы не влиять на другие тесты.
  await page.goto("/settings/verdict")
  await minOps.fill("3")
  await page.getByRole("button", { name: "Сохранить" }).click()
  await page.waitForLoadState("networkidle")
})
