// Utility functions for user authentication
export interface UserData {
  id_ruta: number | null
  id_personal: number
  nombre: string
  apellido: string
  rol: string
  usuario: string
  debe_cambiar_contrasena?: boolean
}

let currentUser: UserData | null = null
export function setLoggedUser(user: UserData | null) { currentUser = user }
export async function logout() {
  const response = await fetch("/API/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  if (!response.ok && response.status !== 401) throw new Error("No se pudo cerrar la sesión")
  currentUser = null
  window.location.assign(new URL("/",window.location.origin).href)
}

export function getLoggedUser(): UserData | null {
  return currentUser
}

export function requireAuth(): UserData {
  const user = getLoggedUser()
  if (!user) {
    throw new Error("Usuario no autenticado. Por favor, inicie sesión nuevamente.")
  }
  return user
}
