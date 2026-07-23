import { createHash } from "node:crypto"
import { parse1CStatement } from "@/lib/domain/reconciliation/parse-1c-statement"
import type { StatementFetch, StatementSource } from "./statement-source"

// Демо-выписка для fx-acc-sber: сходится с фикстурой движений 1С.
// Списание 100 (Ромашка), приход 50 (Клиент); opening 1000 → closing 950.
function sampleFor(accountNumber: string, day: string): string {
  const d = day.split("-").reverse().join(".") // YYYY-MM-DD → dd.mm.yyyy
  return `1CClientBankExchange
ВерсияФормата=1.03
Кодировка=Windows
СекцияРасчСчет
РасчСчет=${accountNumber}
ДатаНачала=${d}
ДатаКонца=${d}
НачальныйОстаток=1000.00
КонецРасчСчет
СекцияДокумент=Платежное поручение
Номер=101
Дата=${d}
Сумма=100.00
ПлательщикСчет=${accountNumber}
ПлательщикИНН=2311366523
Плательщик=ТОРИ БРЭНДС ООО
ПолучательСчет=40817810099910004312
ПолучательИНН=7701234567
Получатель=ООО Ромашка
НазначениеПлатежа=Оплата по счету 5
КонецДокумента
СекцияДокумент=Платежное поручение
Номер=102
Дата=${d}
Сумма=50.00
ПлательщикСчет=40817810000000009999
ПлательщикИНН=7708888888
Плательщик=ООО Клиент
ПолучательСчет=${accountNumber}
ПолучательИНН=2311366523
Получатель=ТОРИ БРЭНДС ООО
НазначениеПлатежа=Поступление
КонецДокумента
КонецФайла`
}

export const fixtureStatementSource: StatementSource = {
  async getStatement(account, day): Promise<StatementFetch> {
    // Демо-выписка есть только для сбербанковского счёта фикстуры.
    if (account.accountNumber !== "40702810900000001111") {
      return { status: "absent" }
    }
    const raw = sampleFor(account.accountNumber, day)
    const statement = parse1CStatement(raw, account.accountNumber)
    const sha256 = createHash("sha256").update(raw, "utf8").digest("hex")
    return {
      status: "ok",
      statement,
      fileName: `fixture-${account.accountNumber}-${day}.txt`,
      sha256,
    }
  },
}
