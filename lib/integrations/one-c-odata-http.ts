// Реальный клиент OData появится в Task 7 этого плана.
import type { OneCGateway } from "./one-c-odata"

export const httpOneCGateway: OneCGateway = {
  async fetchArticles() {
    throw new Error("HTTP-клиент OData ещё не реализован")
  },
  async fetchBankAccounts() {
    throw new Error("HTTP-клиент OData ещё не реализован")
  },
}
