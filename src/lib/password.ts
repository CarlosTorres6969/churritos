import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, hash) => error ? reject(error) : resolve(hash))
})
export async function hashPassword(password: string, minimumLength = 12): Promise<string> {
  if (password.length < minimumLength || password.length > 128) throw new Error("La contraseña debe tener entre 12 y 128 caracteres")
  const salt = randomBytes(16).toString("hex")
  const hash = await derive(password, salt)
  return `scrypt$32768$8$3$${salt}$${hash.toString("hex")}`
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded) || password.length > 128) return false
  const [, , , , salt, stored] = encoded.split("$")
  const hash = await derive(password, salt)
  return timingSafeEqual(hash, Buffer.from(stored, "hex"))
}
