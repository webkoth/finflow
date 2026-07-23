// app/settings/users/users-table.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createUser,
  resetUserPassword,
  toggleUserActive,
  updateUserRole,
  type FormState,
} from "./actions"

export type UserRow = {
  id: string
  login: string
  name: string
  role: string
  roleLabel: string
  isActive: boolean
  createdAtText: string
  isSelf: boolean
}

const initialState: FormState = { error: null }

const ROLE_OPTIONS = [
  { value: "owner", label: "Собственник" },
  { value: "accountant", label: "Бухгалтер" },
  { value: "viewer", label: "Читатель" },
]

// items → Select.Value рендерит label выбранной роли, а не сырое значение
// (все value здесь непустые, отдельный resolver функцией не нужен —
// см. app/requests/filters-form.tsx, где function children нужны были
// только из-за пустого значения "Все").
const ROLE_ITEMS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label])
)

function RoleSelect({
  name,
  defaultValue,
  id,
  "aria-label": ariaLabel,
}: {
  name: string
  defaultValue: string
  id?: string
  "aria-label"?: string
}) {
  return (
    <Select name={name} defaultValue={defaultValue} items={ROLE_ITEMS}>
      <SelectTrigger id={id} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RowControls({ user }: { user: UserRow }) {
  const [roleState, roleAction, rolePending] = useActionState(
    updateUserRole,
    initialState
  )
  const [pwdState, pwdAction, pwdPending] = useActionState(
    resetUserPassword,
    initialState
  )
  const [activeState, activeAction, activePending] = useActionState(
    toggleUserActive,
    initialState
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={roleAction} className="flex items-center gap-1">
        <input type="hidden" name="userId" value={user.id} />
        <RoleSelect
          name="role"
          defaultValue={user.role}
          aria-label={`Роль для ${user.login}`}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={rolePending}
        >
          Роль
        </Button>
      </form>
      <form action={pwdAction} className="flex items-center gap-1">
        <input type="hidden" name="userId" value={user.id} />
        <Input
          name="password"
          type="password"
          placeholder="Новый пароль"
          aria-label={`Новый пароль для ${user.login}`}
          className="h-9 w-36"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pwdPending}>
          Сбросить
        </Button>
      </form>
      {!user.isSelf && (
        <form action={activeAction}>
          <input type="hidden" name="userId" value={user.id} />
          <Button
            type="submit"
            variant={user.isActive ? "destructive" : "secondary"}
            size="sm"
            disabled={activePending}
          >
            {user.isActive ? "Деактивировать" : "Активировать"}
          </Button>
        </form>
      )}
      {(roleState.error || pwdState.error || activeState.error) && (
        <p className="w-full text-sm text-destructive">
          {roleState.error ?? pwdState.error ?? activeState.error}
        </p>
      )}
    </div>
  )
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const [createState, createAction, createPending] = useActionState(
    createUser,
    initialState
  )

  return (
    <div className="space-y-8">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Логин</TableHead>
            <TableHead>Имя</TableHead>
            <TableHead>Роль</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Создан</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                {u.login}
                {u.isSelf && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (вы)
                  </span>
                )}
              </TableCell>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.roleLabel}</TableCell>
              <TableCell>
                <Badge variant={u.isActive ? "outline" : "destructive"}>
                  {u.isActive ? "Активен" : "Деактивирован"}
                </Badge>
              </TableCell>
              <TableCell>{u.createdAtText}</TableCell>
              <TableCell>
                <RowControls user={u} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <form action={createAction} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="new-login">Логин</Label>
          <Input id="new-login" name="login" required className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-name">Имя</Label>
          <Input id="new-name" name="name" required className="w-48" />
        </div>
        <Field className="w-auto gap-1.5">
          <FieldLabel htmlFor="new-role-trigger">Роль</FieldLabel>
          <RoleSelect id="new-role-trigger" name="role" defaultValue="viewer" />
        </Field>
        <div className="grid gap-1.5">
          <Label htmlFor="new-password">Временный пароль</Label>
          <Input
            id="new-password"
            name="password"
            type="password"
            required
            className="w-40"
          />
        </div>
        <Button type="submit" disabled={createPending}>
          Создать
        </Button>
        {createState.error && (
          <p className="w-full text-sm text-destructive">{createState.error}</p>
        )}
      </form>
    </div>
  )
}
