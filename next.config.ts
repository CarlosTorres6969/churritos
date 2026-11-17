import type { NextConfig } from "next";
import { getDevelopmentAppOrigin } from "./src/lib/dev-origin";

const developmentOrigin = process.env.NODE_ENV === "development" ? getDevelopmentAppOrigin(process.env.DEV_APP_URL) : undefined;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mssql", "nodemailer"],
  outputFileTracingIncludes: {
    "/API/Cliente-Credito/*/pagos": ["./src/assets/inversiones-mejia-logo.png"],
    "/API/enviar-correo": ["./src/assets/inversiones-mejia-logo.png"],
  },
  allowedDevOrigins: developmentOrigin ? [new URL(developmentOrigin).hostname] : [],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
    ] }]
  },
};

export default nextConfig;
