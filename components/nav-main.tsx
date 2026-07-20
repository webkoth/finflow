"use client"

// Список групп меню с подсветкой активного пункта. Группы приходят
// пропсами с сервера уже отфильтрованные по роли; иконки мапятся
// по имени — компоненты не сериализуются через границу server/client.
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  BookOpen,
  FileCheck,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  transactions: ArrowLeftRight,
  requests: FileCheck,
  dispatch: Send,
  reference: BookOpen,
  users: Users,
  "cash-flow-items": ListChecks,
  verdict: Gauge,
}

export type NavItem = { title: string; href: string; icon: string }
export type NavGroup = { label: string; items: NavItem[] }

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon]
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={<Link href={item.href} />}
                    >
                      {Icon && <Icon />}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
