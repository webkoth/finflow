// Каркас приложения: без пользователя (страница /login) — голый контент,
// с пользователем — сайдбар и шапка с кнопкой сворачивания.
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

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
