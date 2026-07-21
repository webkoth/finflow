// Демо-справочники в формате 1С. Используются в dev (ONEC_ODATA_MODE=fixture),
// seed и e2e. UID имитируют GUID из 1С, но узнаваемы по префиксу.
import type {
  OneCArticle,
  OneCArticleKind,
  OneCBankAccount,
  OneCGateway,
} from "./one-c-odata"

const CASHFLOW: OneCArticle[] = [
  {
    uid: "fx-cf-group-op",
    code: "1",
    name: "Операционная деятельность",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-in-buyers",
    code: "1.1",
    name: "Поступления от покупателей",
    parentUid: "fx-cf-group-op",
    isGroup: false,
    flow: "INFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-out-suppliers",
    code: "1.2",
    name: "Оплата поставщикам",
    parentUid: "fx-cf-group-op",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-group-fin",
    code: "2",
    name: "Финансовая деятельность",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-in-loans",
    code: "2.1",
    name: "Кредиты и займы",
    parentUid: "fx-cf-group-fin",
    isGroup: false,
    flow: "INFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-out-old",
    code: "2.9",
    name: "Устаревшая статья",
    parentUid: "fx-cf-group-fin",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: true, // проверяем, что удалённые в 1С не заводятся
  },
]

const PNL: OneCArticle[] = [
  {
    uid: "fx-pnl-group-inc",
    code: "1",
    name: "Доходы",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-revenue",
    code: "1.1",
    name: "Выручка",
    parentUid: "fx-pnl-group-inc",
    isGroup: false,
    flow: "INFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-group-exp",
    code: "2",
    name: "Расходы",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-salary",
    code: "2.1",
    name: "Зарплата",
    parentUid: "fx-pnl-group-exp",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-rent",
    code: "2.2",
    name: "Аренда",
    parentUid: "fx-pnl-group-exp",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: false,
  },
]

const ACCOUNTS: OneCBankAccount[] = [
  {
    uid: "fx-acc-sber",
    name: "Расчётный счёт Сбербанк",
    accountNumber: "40702810900000001111",
    bankName: "ПАО Сбербанк",
    bankBic: "044525225",
    currency: "RUB",
    organization: "ТОРИ БРЭНДС ООО",
    isDeletedIn1c: false,
  },
  {
    uid: "fx-acc-tbank",
    name: "Расчётный счёт Т-Банк",
    accountNumber: "40702810900000002222",
    bankName: "АО «ТБанк»",
    bankBic: "044525974",
    currency: "RUB",
    organization: "ИП Бобровская",
    isDeletedIn1c: false,
  },
]

export const fixtureOneCGateway: OneCGateway = {
  async fetchArticles(kind: OneCArticleKind) {
    return kind === "CASHFLOW" ? CASHFLOW : PNL
  },
  async fetchBankAccounts() {
    return ACCOUNTS
  },
}
