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
  Scale,
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
  useSidebar,
} from "@/components/ui/sidebar"

const ICONS = {
  dashboard: LayoutDashboard,
  transactions: ArrowLeftRight,
  requests: FileCheck,
  dispatch: Send,
  reference: BookOpen,
  reconciliation: Scale,
  users: Users,
  "cash-flow-items": ListChecks,
  verdict: Gauge,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS
export type NavItem = { title: string; href: string; icon: IconName }
export type NavGroup = { label: string; items: NavItem[] }

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

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
                      onClick={() => setOpenMobile(false)}
                      render={
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                        />
                      }
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
