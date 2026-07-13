import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createTransaction } from "./actions"

export function TransactionForm() {
  return (
    <form action={createTransaction} className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="category">Категория</Label>
        <Input id="category" name="category" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="amount">Сумма</Label>
        <Input
          id="amount"
          name="amount"
          placeholder="-500 или 1000,50"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note">Заметка</Label>
        <Input id="note" name="note" />
      </div>
      <Button type="submit">Добавить</Button>
    </form>
  )
}
