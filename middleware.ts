// middleware.ts
import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE = "finflow_session"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith("/login")) return NextResponse.next()
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next()
  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.search = ""
  if (pathname !== "/")
    url.searchParams.set("callbackUrl", pathname + req.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = {
  // Всё, кроме: cron-эндпоинта синка (свой секрет), статики Next, favicon.
  matcher: ["/((?!api/jobs|_next/static|_next/image|favicon.ico).*)"],
}
