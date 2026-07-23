import type { BankStatement } from "@/lib/domain/reconciliation/types"
import { fixtureStatementSource } from "./fixture-source"
import { manualFileStatementSource } from "./manual-file-source"

export type StatementAccount = {
  accountNumber: string
  accountUid: string | null
}

// Результат получения выписки по счёту за день.
export type StatementFetch =
  | {
      status: "ok"
      statement: BankStatement
      fileName: string
      sha256: string
    }
  | { status: "error"; error: string } // сбой источника → source_error
  | { status: "absent" } // выписки нет (не ошибка) → no_data

export interface StatementSource {
  getStatement(account: StatementAccount, day: string): Promise<StatementFetch>
}

// RECON_STATEMENT_MODE: "fixture" (dev/e2e) | "manual_file" (чтение из папки).
// Незаданный режим не даёт молчаливый mock — по умолчанию fixture в dev.
export function getStatementSource(): StatementSource {
  const mode = process.env.RECON_STATEMENT_MODE ?? "fixture"
  if (mode === "fixture") return fixtureStatementSource
  if (mode === "manual_file") return manualFileStatementSource
  throw new Error(`RECON_STATEMENT_MODE="${mode}" не поддерживается`)
}
