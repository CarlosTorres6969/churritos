import { catalog } from "@/lib/catalog"
const handlers = catalog("Clientes")
export const GET = handlers.GET
export const POST = handlers.POST
export const PUT = handlers.PUT
export const DELETE = handlers.DELETE
