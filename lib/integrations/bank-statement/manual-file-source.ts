import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { parse1CStatement } from "@/lib/domain/reconciliation/parse-1c-statement"
import type { StatementFetch, StatementSource } from "./statement-source"

// Папка с выписками: RECON_STATEMENTS_DIR/<НомерСчёта>/<YYYY-MM-DD>.txt
// Файлы кладёт собственник из независимого read-only доступа — казначей
// сюда не пишет. Это организационная гарантия независимости эталона.
function baseDir(): string {
  const dir = process.env.RECON_STATEMENTS_DIR
  if (!dir) throw new Error("Не задан RECON_STATEMENTS_DIR")
  return dir
}

// Декодирование: win1251 (типично для kl_to_1c) или utf8. Определяем по
// строке "Кодировка=" в файле; иначе читаем как windows-1251.
function decode(buf: Buffer): string {
  const isUtf8 =
    /Кодировка\s*=\s*UTF-?8/i.test(buf.toString("utf8", 0, 300)) ||
    buf.toString("utf8", 0, 3) === "﻿"
  return isUtf8
    ? buf.toString("utf8")
    : new TextDecoder("windows-1251").decode(buf)
}

export const manualFileStatementSource: StatementSource = {
  async getStatement(account, day): Promise<StatementFetch> {
    const dir = path.join(baseDir(), account.accountNumber)
    let file: string | null = null
    try {
      const names = await readdir(dir)
      // Файл дня: <day>.txt; допускаем любой .txt, начинающийся с даты.
      file = names.find((n) => n === `${day}.txt` || n.startsWith(day)) ?? null
    } catch {
      return { status: "absent" } // папки счёта нет — выписки ещё не клали
    }
    if (!file) return { status: "absent" }

    try {
      const buf = await readFile(path.join(dir, file))
      const raw = decode(buf)
      const statement = parse1CStatement(raw, account.accountNumber)
      const sha256 = createHash("sha256").update(buf).digest("hex")
      return { status: "ok", statement, fileName: file, sha256 }
    } catch (e) {
      // Файл есть, но не разобрался — это сбой источника, НЕ «нет данных».
      return {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
}
