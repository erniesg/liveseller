export const RUNTIME_ORIGIN = "http://127.0.0.1:8787";

export function hasLongLivedOpenAiKey(value: unknown): boolean {
  return typeof value === "string" && /^sk-[A-Za-z0-9]/.test(value);
}
