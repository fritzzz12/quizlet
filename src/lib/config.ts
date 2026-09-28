export class ConfigError extends Error {}

export function postgresUrl() {
  return process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
}

export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}
