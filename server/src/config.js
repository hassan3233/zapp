// Central configuration. Override via environment variables in production.
export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// In production, ALWAYS set ZAPP_JWT_SECRET to a long random value.
export const JWT_SECRET =
  process.env.ZAPP_JWT_SECRET || "dev-only-insecure-secret-change-me";

export const JWT_EXPIRES_IN = "30d";

export const DB_PATH = process.env.ZAPP_DB_PATH || "zapp.db";
