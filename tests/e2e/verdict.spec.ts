// tests/e2e/verdict.spec.ts
// Светофор: карточка, реестр, настройки. Serial: тест настроек меняет
// глобальное состояние и восстанавливает его в конце.
import { expect, test } from "@playwright/test"
import { syncFixtureData } from "./helpers"

test.describe.configure({ mode: "serial" })

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
