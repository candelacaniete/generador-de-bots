/**
 * Lee una env var aceptando mayúsculas o minúsculas
 * (algunas UIs solo permiten nombres en lowercase).
 * También limpia espacios y comillas alrededor del valor.
 */
export function env(name: string): string | undefined {
  const raw =
    process.env[name] ??
    process.env[name.toLowerCase()] ??
    process.env[name.toUpperCase()];

  if (raw == null) return undefined;

  const cleaned = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  return cleaned || undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Falta ${name} (o ${name.toLowerCase()}) en el entorno`);
  }
  return value;
}
