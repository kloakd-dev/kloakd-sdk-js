/** Request helpers shared by the namespaces. */

/** A path segment, URL-encoded (ids, names, URLs). */
export function seg(value: string): string {
  return encodeURIComponent(String(value));
}

/** The defined option values as query parameters (undefined when there are none). */
export function query(params: Record<string, string | number | boolean | undefined | null>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
