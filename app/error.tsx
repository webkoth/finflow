"use client" // Error boundary обязан быть клиентским компонентом

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex max-w-4xl flex-col items-start gap-4 p-8">
      <h1 className="text-2xl font-semibold">Что-то пошло не так</h1>
      <Button onClick={() => unstable_retry()}>Попробовать снова</Button>
    </main>
  )
}
