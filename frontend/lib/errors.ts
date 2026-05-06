export function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;

  if (typeof error !== "object") return fallback;

  const data = error as Record<string, unknown>;
  const direct = data.detail || data.error || data.message;
  if (typeof direct === "string" && direct.trim()) return direct;

  const nonField = data.non_field_errors;
  if (Array.isArray(nonField) && nonField.length > 0) {
    return String(nonField[0]);
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0) {
      return String(value[0]);
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}
