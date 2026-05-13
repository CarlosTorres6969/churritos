"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, User, Lock, Eye, EyeOff } from "lucide-react"

interface Personal {
  id_personal: number
  nombre: string
  apellido: string
  usuario: string
  contrasena: string
  rol: string
  activo: boolean
}

export default function LoginPage() {
  const [usuario, setUsuario] = useState("")
  const [contrasena, setContrasena] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/API/Personal", { cache: "no-store" })

      if (!response.ok) {
        throw new Error(`Error de autenticación: ${response.status}`)
      }

      let personal = await response.json()

      if (!Array.isArray(personal)) personal = [personal]

      if (personal.length === 0) {
        setError("No hay usuarios configurados en el sistema")
        return
      }

      const userFound = personal.find((p: Personal) => {
        return (
          p.usuario === usuario &&
          p.contrasena === contrasena &&
          p.activo !== false
        )
      })

      if (userFound) {
        const userData = {
          id_personal: userFound.id_personal,
          nombre: userFound.nombre,
          apellido: userFound.apellido,
          rol: userFound.rol,
          usuario: userFound.usuario,
        }

        localStorage.setItem("user", JSON.stringify(userData))

        const rol = (userFound.rol || "").toLowerCase()
        if (rol === "administrador" || rol === "admin") {
          window.location.assign("/admin")
        } else if (rol === "vendedor") {
          window.location.assign("/vendedor")
        } else {
          setError(`Rol no reconocido: ${userFound.rol}`)
        }
      } else {
        setError("Credenciales incorrectas o usuario inactivo")
      }
    } catch {
      // Censuramos datos sensibles, solo mostramos un mensaje genérico
      console.error("Error en el login (detalles censurados)")
      setError("Error de conexión con el servidor. Intente nuevamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Inversiones Mejía</CardTitle>
          <CardDescription className="text-center">Sistema de Gestión de Ventas</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuario</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="usuario"
                  type="text"
                  placeholder="Ingrese su usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contrasena">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="contrasena"
                  type={showPassword ? "text" : "password"}
                  placeholder="Ingrese su contraseña"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                "Iniciar Sesión"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}