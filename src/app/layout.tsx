import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "@/components/session-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Inversiones Mejía - Sistema de Ventas",
  description: "Sistema de gestión de ventas y clientes",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className}><SessionProvider>{children}</SessionProvider></body>
    </html>
  )
}
