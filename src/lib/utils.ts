import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { NextResponse } from "next/server"
import type { ApiResponse } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Función para crear respuestas de API consistentes
export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string,
  message?: string,
  status: number = success ? 200 : 400,
): NextResponse {
  const response: ApiResponse<T> = {
    success,
    ...(data !== undefined && { data }),
    ...(error && { error }),
    ...(message && { message }),
  }

  return NextResponse.json(response, { status })
}

// Función para formatear fechas para SQL Server
export function formatDateForSql(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ")
}

// Función para convertir un valor booleano a bit para SQL Server
export function boolToBit(value: boolean | undefined): number {
  return value === true ? 1 : 0
}

// Función para convertir un bit a booleano desde SQL Server
export function bitToBool(value: number | undefined): boolean {
  return value === 1
}
