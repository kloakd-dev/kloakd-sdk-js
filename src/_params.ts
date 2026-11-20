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

/**
 * The option that acknowledges a robots.txt stop (`robots_acknowledged_hosts`).
 *
 * A route whose page the site's robots.txt disallows, or whose robots.txt
 * cannot be read, stops with `RobotsDisallowedError` (409). Name the stopped
 * host (the error's `host`) here to go past it for this request.
 */
export interface RobotsAcknowledgementOption {
  /**
   * Hosts whose robots.txt stop you acknowledge for this request, sent as
   * `robots_acknowledged_hosts` (bare host names such as `www.example.com`;
   * at most 50). By naming a host you confirm you have the right to access
   * its content despite its robots.txt and accept responsibility for doing
   * so under the Terms. KLOAKD records each acknowledgement it uses (with
   * the terms version). It applies to this request and these exact hosts
   * only: nothing is remembered. Sent only when non-empty; the API checks
   * the names (422).
   */
  robotsAcknowledgedHosts?: string[];
}

/** Put `robots_acknowledged_hosts` in a request body when hosts are given. */
export function withRobotsAck(body: Record<string, unknown>, hosts: string[] | undefined): Record<string, unknown> {
  if (hosts !== undefined && hosts.length > 0) body['robots_acknowledged_hosts'] = [...hosts];
  return body;
}
