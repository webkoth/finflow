// Сайдбар приложения: конфиг меню, фильтрация по роли (can()),
// футер с пользователем и выходом. Рендерится только для залогиненных.
import Link from "next/link"
import { logout } from "@/app/login/actions"
import { can, ROLE_LABELS, type Action, type Role } from "@/lib/domain/permissions"
import type { SessionUser } from "@/lib/auth/session"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavMain, type NavGroup } from "@/components/nav-main"

type NavItemConfig = {
  title: string
  href: string
  icon: string
  action?: Action // пункт виден, только если can(role, action)
}

const NAV_CONFIG: { label: string; items: NavItemConfig[] }[] = [
  {
    label: "Обзор",
    items: [{ title: "Дашборд", href: "/", icon: "dashboard" }],
  },
  {
    label: "Операции",
    items: [
      { title: "Транзакции", href: "/transactions", icon: "transactions" },
      { title: "Заявки на оплату", href: "/requests", icon: "requests" },
      { title: "Отправка платёжек", href: "/dispatch", icon: "dispatch" },
    ],
  },
  {
    label: "Справочники",
    items: [{ title: "Справочники", href: "/reference", icon: "reference" }],
  },
  {
    label: "Настройки",
    items: [
      {
        title: "Пользователи",
        href: "/settings/users",
        icon: "users",
        action: "manage_users",
      },
      {
        title: "Статьи для отправки",
        href: "/settings/cash-flow-items",
        icon: "cash-flow-items",
        action: "manage_cash_flow_items",
      },
      {
        title: "Светофор",
        href: "/settings/verdict",
        icon: "verdict",
        action: "manage_verdict_settings",
      },
    ],
  },
]

export function AppSidebar({ user }: { user: SessionUser }) {
  const role = user.role as Role
  const groups: NavGroup[] = NAV_CONFIG.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.action || can(role, item.action))
      .map(({ title, href, icon }) => ({ title, href, icon })),
  })).filter((group) => group.items.length > 0)

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />}>
              <span className="font-medium">finflow</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 text-sm">
          <span className="truncate">{user.name}</span>
          <Badge variant="outline">{ROLE_LABELS[role]}</Badge>
        </div>
        <div className="flex items-center justify-between gap-2 px-2">
          <Link
            href="/settings/password"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Сменить пароль
          </Link>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Выйти
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
