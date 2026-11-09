import { catalog } from "@/lib/catalog"
const handlers = catalog("inventario-ruta")
export const GET = handlers.GET
export const POST = handlers.POST
export const PUT = handlers.PUT
export const DELETE = handlers.DELETE
