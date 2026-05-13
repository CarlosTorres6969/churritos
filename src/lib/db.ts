import sql from "mssql"

// Usar una cadena de conexión completa
const connectionString = process.env.DB_CONNECTION_STRING || 
  "Server=tcp:invermejia.database.windows.net,1433;Database=MejiaDB;User Id=adminmejia;Password=Inver@2001;Encrypt=true;TrustServerCertificate=true;Connection Timeout=30;";

// Obtener conexión a la base de datos
export async function getConnection() {
  try {
    const pool = await sql.connect(connectionString)
    return pool
  } catch (err) {
    console.error("Error al conectar a SQL Server:", err)
    throw err
  }
}
// Cerrar conexión
export async function closeConnection(pool: sql.ConnectionPool) {
  try {
    await pool.close()
  } catch (err) {
    console.error("Error al cerrar la conexión:", err)
  }
}
//No tocar 