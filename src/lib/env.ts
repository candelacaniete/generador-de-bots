/**
 * Lee una env var aceptando mayúsculas o minúsculas
 * (algunas UIs solo permiten nombres en lowercase).
 */
export function env(name: string): string | undefined {
  const direct = process.env[name];
  if (direct) return direct;

  const lower = process.env[name.toLowerCase()];
  if (lower) return lower;

  const upper = process.env[name.toUpperCase()];
  if (upper) return upper;

  return undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Falta ${name} (o ${name.toLowerCase()}) en el entorno`);
  }
  return value;
}
