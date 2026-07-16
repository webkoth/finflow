// Демо-данные в формате DWH: покрывают все статусы исполнения.
// Используются в dev (DWH_MODE=fixture), seed и e2e.
import type { DwhDebitRow, DwhGateway, DwhRequestRow } from "./dwh"

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function buildRequests(): DwhRequestRow[] {
  const common = {
    orgInn: null,
    orgUid: null,
    department: null,
    partnerInn: null,
    partnerUid: null,
    comment: null,
    importance: 0,
    debitAccountUid: null as string | null,
    contractUid: null as string | null,
    orderUid: null as string | null,
    initiatorHead: null as string | null,
  }
  return [
    {
      ...common,
      uid: "fx-req-1",
      number: "REQ-0001",
      date: daysFromNow(-7),
      orgName: "ТОРИ БРЭНДС ООО",
      initiator: "Иванова А.",
      amountMinor: 1_250_000_00n,
      currency: "RUB",
      cashFlowItem: "Оплата поставщикам за товар",
      fund: "Закупки товара",
      partnerName: "ООО «Ткани Востока»",
      payDate: daysFromNow(-5),
      approvalStatus: "approved", // + списание ниже → executed (зелёная)
    },
    {
      ...common,
      uid: "fx-req-2",
      number: "REQ-0002",
      date: daysFromNow(-6),
      orgName: "ИП Бобровская",
      initiator: "Петров С.",
      amountMinor: 340_500_00n,
      currency: "RUB",
      cashFlowItem: "Реклама и продвижение",
      fund: "Маркетинг",
      partnerName: "ООО «Диджитал Плюс»",
      payDate: daysFromNow(-5),
      approvalStatus: "approved", // списания нет, дедлайн прошёл → overdue (красная)
    },
    {
      ...common,
      uid: "fx-req-3",
      number: "REQ-0003",
      date: daysFromNow(-2),
      orgName: "РУСБУБОН",
      initiator: "Иванова А.",
      amountMinor: 98_000_00n,
      currency: "RUB",
      cashFlowItem: "Аренда",
      fund: "Операционные расходы",
      partnerName: "ООО «БЦ Меркурий»",
      payDate: daysFromNow(3),
      approvalStatus: "approved", // дата оплаты впереди → awaiting
    },
    {
      ...common,
      uid: "fx-req-4",
      number: "REQ-0004",
      date: daysFromNow(-1),
      orgName: "ТОРИ БРЭНДС ООО",
      initiator: "Сидорова Е.",
      amountMinor: 25_700_000_00n, // 25,7 млн ₽ — больше Int-лимита
      currency: "RUB",
      cashFlowItem: "Оплата поставщикам за товар",
      fund: "Закупки товара",
      partnerName: "Guangzhou Textile Co.",
      payDate: daysFromNow(5),
      approvalStatus: "on_approval",
      debitAccountUid: "fx-acc-tori-rub",
      partnerUid: "fx-prt-guangzhou",
      contractUid: "fx-ctr-14",
      orderUid: "fx-ord-78",
      initiatorHead: "Петров С.",
      comment: "Аванс 25% по заказу №78, отгрузка августа",
    },
    {
      ...common,
      uid: "fx-req-5",
      number: "REQ-0005",
      date: daysFromNow(-4),
      orgName: "ИП Бобровская",
      initiator: "Петров С.",
      amountMinor: 56_000_00n,
      currency: "RUB",
      cashFlowItem: "Хозяйственные расходы",
      fund: "Операционные расходы",
      partnerName: "ООО «Канцторг»",
      payDate: daysFromNow(-3),
      approvalStatus: "declined",
    },
    {
      ...common,
      uid: "fx-req-6",
      number: "REQ-0006",
      date: daysFromNow(0),
      orgName: "ТОРИ БРЭНДС ООО",
      initiator: "Сидорова Е.",
      amountMinor: 780_000_00n,
      currency: "CNY",
      cashFlowItem: "Оплата поставщикам за товар",
      fund: "Закупки товара",
      partnerName: "Shenzhen Buttons Ltd.",
      payDate: daysFromNow(2),
      approvalStatus: "on_approval",
      importance: 1, // срочная
      debitAccountUid: "fx-acc-tori-cny",
      partnerUid: "fx-prt-shenzhen",
      orderUid: "fx-ord-91",
      initiatorHead: "Петров С.",
    },
    {
      ...common,
      uid: "fx-req-7",
      number: "REQ-0007",
      date: daysFromNow(0),
      orgName: "ИП Бобровская",
      initiator: "Смирнов К.",
      amountMinor: 620_000_00n,
      currency: "RUB",
      cashFlowItem: "Упаковка",
      fund: "Операционные расходы",
      partnerName: "ООО «НовоПак»",
      partnerUid: "fx-prt-novopak",
      debitAccountUid: "fx-acc-bobr-rub",
      payDate: daysFromNow(4),
      approvalStatus: "on_approval", // новый поставщик без основания → 🔴
    },
  ]
}

function buildDebits(): DwhDebitRow[] {
  return [
    {
      docUid: "fx-deb-1",
      date: daysFromNow(-4),
      amountMinor: 1_250_000_00n,
      bankAccount: "40702810900000012345",
      bankName: "Сбербанк",
      requestUid: "fx-req-1",
    },
    {
      // Списание по заявке вне окна синка — проверяет пропуск сирот.
      docUid: "fx-deb-orphan",
      date: daysFromNow(-4),
      amountMinor: 10_000_00n,
      bankAccount: "40702810900000012345",
      bankName: "Сбербанк",
      requestUid: "fx-req-missing",
    },
  ]
}

export const fixtureDwhGateway: DwhGateway = {
  async fetchRequests(since: Date): Promise<DwhRequestRow[]> {
    return buildRequests().filter((r) => r.date >= since)
  },
  async fetchDebits(since: Date): Promise<DwhDebitRow[]> {
    return buildDebits().filter((d) => d.date >= since)
  },
}
