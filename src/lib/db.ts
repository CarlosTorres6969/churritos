import "server-only"
import sql from "mssql"

function getDatabaseConfig(): string | sql.config {
  if (process.env.NODE_ENV === "development") {
    const developmentConnectionString = process.env.DEV_DB_CONNECTION_STRING?.trim()

    if (!developmentConnectionString) {
      throw new Error(
        "Configura DEV_DB_CONNECTION_STRING en .env.development.local con una base de datos de desarrollo independiente",
      )
    }

    return developmentConnectionString
  }

  const connectionString = process.env.DB_CONNECTION_STRING?.trim()

  if (connectionString) return connectionString

  const requiredVariables = ["DB_SERVER", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const
  const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim())

  if (missingVariables.length > 0) {
    throw new Error(`Falta configurar la base de datos: ${missingVariables.join(", ")}`)
  }

  const port = Number(process.env.DB_PORT || "1433")
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT debe ser un puerto válido entre 1 y 65535")
  }

  return {
    server: process.env.DB_SERVER!.trim(),
    database: process.env.DB_NAME!.trim(),
    user: process.env.DB_USER!.trim(),
    password: process.env.DB_PASSWORD!,
    port,
    connectionTimeout: 30000,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  }
}

// Obtener conexión a la base de datos
const state = globalThis as typeof globalThis & { churritosPool?: Promise<sql.ConnectionPool> }
export async function getConnection() {
  if (!state.churritosPool) {
    const config = getDatabaseConfig()
    const pool = typeof config === "string" ? new sql.ConnectionPool(config) : new sql.ConnectionPool(config)
    state.churritosPool = pool.connect().then(async connected => {
      if (process.env.NODE_ENV === "development") {
        try {
          const marker = await connected.request().query("SELECT value FROM sys.extended_properties WHERE class=0 AND name='ChurritosDevelopment'")
          if (String(marker.recordset[0]?.value) !== "1") throw new Error("La base no está marcada para desarrollo")
        } catch (error) { await connected.close(); throw error }
      }
      return connected
    }).catch(() => {
      state.churritosPool = undefined
      throw new Error("No se pudo conectar a la base de datos")
    })
  }
  return state.churritosPool
}
