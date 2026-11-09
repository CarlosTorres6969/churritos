"use client"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { setLoggedUser, type UserData } from "@/lib/auth"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; user: UserData | null }>({ loading: true, user: null })
  const pathname = usePathname(), router = useRouter()
  useEffect(() => {
    let active = true
    try { localStorage.removeItem("user") } catch {}
    const refresh = async () => {
      try {
        const response = await fetch("/API/auth/me", { cache: "no-store" })
        const result = response.ok ? await response.json() : null
        const user = result?.data?.user || null
        if (active) { setLoggedUser(user); setState({ loading: false, user }) }
      } catch { if (active) { setLoggedUser(null); setState({ loading: false, user: null }) } }
    }
    void refresh()
    window.addEventListener("focus", refresh)
    return () => { active = false; window.removeEventListener("focus", refresh) }
  }, [])
  const protectedRoute = pathname.startsWith("/admin") || pathname.startsWith("/vendedor") || pathname === "/cambiar-contrasena"
  const requiredRole = pathname.startsWith("/admin") ? "administrador" : pathname.startsWith("/vendedor") ? "vendedor" : null
  const redirect = !state.loading && protectedRoute && !state.user ? "/" : state.user?.debe_cambiar_contrasena && pathname !== "/cambiar-contrasena" ? "/cambiar-contrasena" : state.user && requiredRole && state.user.rol !== requiredRole ? (state.user.rol === "administrador" ? "/admin" : "/vendedor") : null
  useEffect(() => { if (redirect) router.replace(redirect) }, [redirect, router])
  if (protectedRoute && (state.loading || redirect)) return <div className="min-h-screen grid place-items-center">Verificando sesión…</div>
  return children
}
