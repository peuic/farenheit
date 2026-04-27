import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

export type AuthConfig = { user: string; pass: string } | null;

/**
 * Decide whether a request needs to authenticate, and if so, validate.
 *
 *   - No `auth` configured → always pass (preserves the LAN-only mode that
 *     existed before this feature was added).
 *   - Auth configured + request originates from the local LAN (RFC 1918
 *     private range) → pass. Convenience for clients on the same Wi-Fi.
 *   - Auth configured + anything else (loopback from a tunnel daemon, public
 *     IP, etc.) → require Basic Auth.
 *
 * Tunnel daemons (cloudflared, tailscaled funnel, …) all relay incoming
 * traffic to the local service via 127.0.0.1, so loopback is treated as
 * "remote" — only direct LAN clients see the bypass.
 */
export type AuthResult = { ok: true } | { ok: false; response: Response };

export function checkAuth(
  auth: AuthConfig,
  req: Request,
  clientIP: string | null,
): AuthResult {
  if (!auth) return { ok: true };
  if (clientIP && isPrivateLanIP(clientIP)) return { ok: true };

  const creds = parseBasicAuth(req.headers.get("authorization"));
  if (!creds) return { ok: false, response: unauthorizedResponse() };

  const userOk = constantTimeEquals(creds.user, auth.user);
  const passOk = constantTimeEquals(creds.pass, auth.pass);
  if (!userOk || !passOk) {
    return { ok: false, response: unauthorizedResponse() };
  }
  return { ok: true };
}

/**
 * Match RFC 1918 IPv4 private ranges and their IPv6 equivalents.
 * Loopback (127.0.0.1, ::1) is intentionally NOT considered "LAN" — tunnel
 * daemons forward through loopback and we want those gated by Basic Auth.
 */
export function isPrivateLanIP(ip: string): boolean {
  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:192.168.1.5)
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  // 10.0.0.0/8
  if (/^10\./.test(v4)) return true;
  // 172.16.0.0 – 172.31.255.255
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(v4)) return true;
  // 192.168.0.0/16
  if (/^192\.168\./.test(v4)) return true;
  const lower = ip.toLowerCase();
  // IPv6 link-local fe80::/10
  if (lower.startsWith("fe80:")) return true;
  // IPv6 unique-local fc00::/7
  if (/^f[cd][0-9a-f][0-9a-f]:/.test(lower)) return true;
  return false;
}

export function parseBasicAuth(
  header: string | null,
): { user: string; pass: string } | null {
  if (!header) return null;
  const idx = header.indexOf(" ");
  if (idx < 0) return null;
  const scheme = header.slice(0, idx);
  const value = header.slice(idx + 1).trim();
  if (scheme.toLowerCase() !== "basic" || !value) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return null;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return null;
  return {
    user: decoded.slice(0, sep),
    pass: decoded.slice(sep + 1),
  };
}

// Compare two strings without leaking length or content via timing.
function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  if (ab.length !== bb.length) {
    // Still spend ~the same time on the comparison so length isn't trivially
    // observable through response timing.
    cryptoTimingSafeEqual(ab, ab);
    return false;
  }
  return cryptoTimingSafeEqual(ab, bb);
}

export function unauthorizedResponse(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Farenheit", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
