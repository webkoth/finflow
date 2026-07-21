"use client"

// График прихода/расхода по дням. Получает с сервера сразу 90 дней
// (значения — целые копейки), переключатель фильтрует на клиенте.
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { formatDate } from "@/lib/domain/dates"
import { formatMoney } from "@/lib/domain/money"
import type { DailyCashflowPoint } from "@/lib/domain/transactions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const chartConfig = {
  incomeMinor: { label: "Поступления", color: "var(--chart-1)" },
  expenseMinor: { label: "Списания", color: "var(--chart-2)" },
} satisfies ChartConfig

const PERIODS = ["7", "30", "90"] as const

// "2026-07-15" → "15.07"
function dayLabel(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`
}

export function CashflowChart({ points }: { points: DailyCashflowPoint[] }) {
  const [period, setPeriod] = useState<string>("90")
  const visible = points.slice(-Number(period))
  const hasData = visible.some(
    (p) => p.incomeMinor !== 0 || p.expenseMinor !== 0
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Движение денег</CardTitle>
        <ToggleGroup
          value={[period]}
          onValueChange={(value: string[]) => {
            if (value[0]) setPeriod(value[0])
          }}
        >
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p} value={p}>
              {p} дней
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart accessibilityLayer data={visible}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={dayLabel}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) =>
                      // "YYYY-MM-DD" парсится как UTC-полночь — по Москве это
                      // те же сутки, formatDate вернёт правильную дату
                      formatDate(new Date(String(label)))
                    }
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {chartConfig[name as keyof typeof chartConfig]
                            ?.label ?? name}
                        </span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatMoney(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar
                dataKey="incomeMinor"
                fill="var(--color-incomeMinor)"
                radius={4}
              />
              <Bar
                dataKey="expenseMinor"
                fill="var(--color-expenseMinor)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Нет операций за период
          </div>
        )}
      </CardContent>
    </Card>
  )
}
