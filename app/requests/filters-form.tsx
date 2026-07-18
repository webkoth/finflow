// app/requests/filters-form.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { format, isValid, parse } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ISO_DATE_FORMAT = "yyyy-MM-dd"

// Сервер валидирует строго YYYY-MM-DD (см. validDate в page.tsx) — тот же
// формат уходит в скрытый input, чтобы не разойтись с серверной проверкой.
function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, ISO_DATE_FORMAT, new Date())
  return isValid(parsed) ? parsed : undefined
}

function DateField({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue: string
}) {
  const [date, setDate] = useState<Date | undefined>(() =>
    parseIsoDate(defaultValue)
  )
  const [open, setOpen] = useState(false)
  const triggerId = `${name}-trigger`

  return (
    <Field className="w-auto gap-1.5">
      <FieldLabel htmlFor={triggerId}>{label}</FieldLabel>
      <input
        type="hidden"
        name={name}
        value={date ? format(date, ISO_DATE_FORMAT) : ""}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={triggerId}
              type="button"
              variant="outline"
              className="w-40 justify-start font-normal"
            />
          }
        >
          <CalendarIcon className="opacity-60" />
          {date ? format(date, "d MMMM yyyy", { locale: ru }) : "Не задано"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={ru}
            selected={date}
            defaultMonth={date}
            onSelect={(value) => {
              setDate(value)
              setOpen(false)
            }}
          />
          <div className="flex justify-end border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!date}
              onClick={() => {
                setDate(undefined)
                setOpen(false)
              }}
            >
              Сбросить
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  )
}

function FilterSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string
  label: string
  defaultValue: string
  options: string[]
}) {
  const triggerId = `${name}-trigger`

  return (
    <Field className="w-auto gap-1.5">
      <FieldLabel htmlFor={triggerId}>{label}</FieldLabel>
      <Select name={name} defaultValue={defaultValue}>
        <SelectTrigger id={triggerId} className="w-48">
          {/* Значение "" (опция «Все») не совпадает с меткой «Все» —
              резолвим label функцией, а не полагаемся на items/children. */}
          <SelectValue>{(value: string) => value || "Все"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Все</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function FiltersForm({
  status,
  org,
  fund,
  partner,
  from,
  to,
  problems,
  orgs,
  funds,
  partners,
}: {
  status: string
  org: string
  fund: string
  partner: string
  from: string
  to: string
  problems: boolean
  orgs: string[]
  funds: string[]
  partners: string[]
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      {status && <input type="hidden" name="status" value={status} />}
      <FilterSelect
        name="org"
        label="Юрлицо"
        defaultValue={org}
        options={orgs}
      />
      <FilterSelect
        name="fund"
        label="Фонд"
        defaultValue={fund}
        options={funds}
      />
      <FilterSelect
        name="partner"
        label="Контрагент"
        defaultValue={partner}
        options={partners}
      />
      <Field orientation="horizontal" className="h-7 w-auto">
        <Checkbox
          id="problems"
          name="problems"
          value="1"
          defaultChecked={problems}
        />
        <FieldLabel htmlFor="problems">Только красные флаги</FieldLabel>
      </Field>
      <DateField name="from" label="Оплата с" defaultValue={from} />
      <DateField name="to" label="по" defaultValue={to} />
      <Button type="submit" variant="secondary">
        Применить
      </Button>
      <Link href="/requests" className="text-sm underline underline-offset-4">
        Сбросить
      </Link>
    </form>
  )
}
