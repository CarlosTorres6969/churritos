"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
export default function ChangePassword() {
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [confirm, setConfirm] = useState("")
  const [error, setError] = useState(""), [saving, setSaving] = useState(false)
  return <main className="min-h-screen grid place-items-center p-4 bg-blue-50"><Card className="w-full max-w-md"><CardHeader><CardTitle>Actualizar contraseña</CardTitle></CardHeader><CardContent><form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); setError("")
    if (next !== confirm) { setError("Las contraseñas no coinciden"); return }
    setSaving(true)
    try { const response = await fetch("/API/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actual: current, nueva: next }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); window.location.assign(new URL("/",window.location.origin).href) }
    catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo actualizar") }
    finally { setSaving(false) }
  }}><p>Elige una contraseña nueva de al menos 12 caracteres. Después deberás iniciar sesión nuevamente.</p><Label htmlFor="current">Contraseña actual</Label><Input id="current" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required/><Label htmlFor="next">Nueva contraseña</Label><Input id="next" type="password" value={next} onChange={e => setNext(e.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required/><Label htmlFor="confirm">Repetir nueva contraseña</Label><Input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required/>{error && <p role="alert" className="text-red-700">{error}</p>}<Button disabled={saving} className="w-full">{saving ? "Guardando…" : "Guardar contraseña"}</Button></form></CardContent></Card></main>
}
