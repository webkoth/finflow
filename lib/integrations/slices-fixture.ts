// lib/integrations/slices-fixture.ts
// Демо-срезы светофора, согласованы с dwh-fixture.ts:
// REQ-0004 → 🟢 (всё в порядке), REQ-0006 → 🟡 (перевод + эпизодический),
// REQ-0007 → 🔴 (новый поставщик, без основания и договора).
import type { SliceFetchers } from "./slices"

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export const fixtureSlices: SliceFetchers = {
  balances: {
    async fetch() {
      return [
        {
          accountUid: "fx-acc-tori-rub",
          orgUid: null,
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          bankName: "Сбербанк",
          currency: "RUB",
          balanceMinor: 40_000_000_00n, // хватает на REQ-0004 (25,7 млн)
        },
        {
          accountUid: "fx-acc-tori-cny",
          orgUid: null,
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "ВТБ ¥",
          bankName: "ВТБ",
          currency: "CNY",
          balanceMinor: 500_000_00n, // меньше 780 000 ¥ REQ-0006 → «нужен перевод»
        },
        {
          accountUid: "fx-acc-bobr-rub",
          orgUid: null,
          orgName: "ИП Бобровская",
          accountName: "Сбербанк ₽",
          bankName: "Сбербанк",
          currency: "RUB",
          balanceMinor: 8_400_000_00n,
        },
        {
          accountUid: "fx-acc-rusb-rub",
          orgUid: null,
          orgName: "РУСБУБОН",
          accountName: "Альфа-Банк ₽",
          bankName: "Альфа-Банк",
          currency: "RUB",
          balanceMinor: 5_100_000_00n,
        },
      ]
    },
  },
  rates: {
    async fetch() {
      return [
        { currencyCode: "CNY", rate: 11.5, rateDate: daysFromNow(0) },
        { currencyCode: "USD", rate: 76, rateDate: daysFromNow(0) },
      ]
    },
  },
  funds: {
    async fetch() {
      return [
        {
          fundUid: "fx-fund-goods",
          name: "Закупки товара",
          planWeekMinor: 40_000_000_00n,
          factWeekMinor: 5_000_000_00n,
          balanceMinor: 35_000_000_00n, // REQ-0004 (25,7 млн) остаётся в плюсе
        },
        {
          fundUid: "fx-fund-opex",
          name: "Операционные расходы",
          planWeekMinor: 3_000_000_00n,
          factWeekMinor: 1_100_000_00n,
          balanceMinor: 1_900_000_00n,
        },
        {
          fundUid: "fx-fund-marketing",
          name: "Маркетинг",
          planWeekMinor: 2_000_000_00n,
          factWeekMinor: 2_300_000_00n,
          balanceMinor: -300_000_00n, // фонд в минусе — виден на панели фондов
        },
      ]
    },
  },
  partners: {
    async fetch() {
      return [
        {
          partnerUid: "fx-prt-guangzhou",
          firstOperationAt: daysFromNow(-700),
          lastPaymentAt: daysFromNow(-10),
          paymentCount: 12, // постоянный → ok
          totalPaidMinor: 480_000_000_00n,
          receivableMinor: 1_400_000_00n,
          payableMinor: 0n,
          recentPayments: [
            {
              date: daysFromNow(-10).toISOString(),
              basis: "Заказ №71",
              amountMinor: "200000000",
            },
            {
              date: daysFromNow(-40).toISOString(),
              basis: "Заказ №65",
              amountMinor: "180000000",
            },
            {
              date: daysFromNow(-70).toISOString(),
              basis: "Заказ №58",
              amountMinor: "150000000",
            },
          ],
          chatUrl: "https://messenger.example/guangzhou",
        },
        {
          partnerUid: "fx-prt-shenzhen",
          firstOperationAt: daysFromNow(-200),
          lastPaymentAt: daysFromNow(-40),
          paymentCount: 2, // эпизодический → warn
          totalPaidMinor: 9_000_000_00n,
          receivableMinor: 0n,
          payableMinor: 350_000_00n,
          recentPayments: [
            {
              date: daysFromNow(-40).toISOString(),
              basis: "Заказ №84",
              amountMinor: "45000000",
            },
          ],
          chatUrl: null,
        },
        // fx-prt-novopak сознательно отсутствует: срез непуст, записи нет →
        // paymentCount 0 → «новый поставщик» (🔴 у REQ-0007).
      ]
    },
  },
  contracts: {
    async fetch() {
      return [
        {
          contractUid: "fx-ctr-14",
          partnerUid: "fx-prt-guangzhou",
          number: "14",
          date: new Date("2025-03-02"),
          isActive: true,
          amountMinor: 2_000_000_000_00n,
          paidMinor: 480_000_000_00n,
          debtMinor: 0n,
          currency: "RUB",
        },
      ]
    },
  },
  orders: {
    async fetch() {
      return [
        {
          orderUid: "fx-ord-78",
          partnerUid: "fx-prt-guangzhou",
          contractUid: "fx-ctr-14",
          number: "78",
          date: daysFromNow(-14),
          amountMinor: 102_800_000_00n, // REQ-0004 = ровно 25% заказа
          paidMinor: 0n,
          currency: "RUB",
        },
        {
          orderUid: "fx-ord-91",
          partnerUid: "fx-prt-shenzhen",
          contractUid: null,
          number: "91",
          date: daysFromNow(-7),
          amountMinor: 780_000_00n, // REQ-0006 = 100% заказа
          paidMinor: 0n,
          currency: "CNY",
        },
      ]
    },
  },
  attachments: {
    async fetch() {
      return [
        {
          requestUid: "fx-req-4",
          fileName: "invoice_78.pdf",
          fileType: "инвойс",
          createdAt: daysFromNow(-1),
        },
        {
          requestUid: "fx-req-4",
          fileName: "spec_78.pdf",
          fileType: "спецификация",
          createdAt: daysFromNow(-1),
        },
        {
          requestUid: "fx-req-6",
          fileName: "invoice_91.pdf",
          fileType: "инвойс",
          createdAt: daysFromNow(0),
        },
        // у fx-req-7 вложений нет → «нет основания» (🔴)
      ]
    },
  },
}
