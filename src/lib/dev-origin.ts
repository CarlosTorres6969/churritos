export function getDevelopmentAppOrigin(value?: string): string | undefined {
  if (!value?.trim()) return undefined
  const url = new URL(value.trim())
  if (url.protocol !== "https:" || url.hostname.includes("*") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("DEV_APP_URL debe ser una dirección HTTPS sin ruta, usuario ni parámetros")
  }
  return url.origin
}
