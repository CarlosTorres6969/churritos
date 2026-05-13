// Utility functions for user authentication
export interface UserData {
  id_ruta: null
  id_personal: number
  nombre: string
  apellido: string
  rol: string
  usuario: string
}

export function getLoggedUser(): UserData | null {
  if (typeof window === "undefined") return null

  try {
    const userData = localStorage.getItem("user")
    if (!userData) return null

    const user = JSON.parse(userData)

    // Validate that the user object has the required fields
    if (!user.id_personal || !user.nombre || !user.rol) {
      console.error("Invalid user data in localStorage")
      return null
    }

    return user
  } catch (error) {
    console.error("Error parsing user data from localStorage:", error)
    return null
  }
}

export function requireAuth(): UserData {
  const user = getLoggedUser()
  if (!user) {
    throw new Error("Usuario no autenticado. Por favor, inicie sesión nuevamente.")
  }
  return user
}
