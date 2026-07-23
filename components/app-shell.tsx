// Каркас приложения: без пользователя (страница /login) — голый контент,
// с пользователем — сайдбар и шапка с кнопкой сворачивания.
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth/session"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) return <>{children}</>

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger
            className="-ml-1"
            aria-label="Свернуть или развернуть меню"
          />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
