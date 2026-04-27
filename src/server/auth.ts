import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

export type AuthConfig = { user: string; pass: string } | null;

/**
 * Decide whether a request needs to authenticate, and if so, validate.
 *
 *   - No `auth` configured → always pass (preserves the LAN-only mode that
 *     existed before this feature was added).
 *   - Auth configured + request looks like a direct LAN connection (no
 *     `cf-connecting-ip` header from Cloudflare Tunnel) → pass. Convenience
 *     for clients on the local network.
 *   - Auth configured + tunneled request → require Basic Auth credentials.
 */
export type AuthResult = { ok: true } | { ok: false; response: Response };

export function checkAuth(auth: AuthConfig, req: Request): AuthResult {
  if (!auth) return { ok: true };
  if (!req.headers.has("cf-connecting-ip")) return { ok: true };

  const creds = parseBasicAuth(req.headers.get("authorization"));
  if (!creds) return { ok: false, response: unauthorizedResponse() };

  const userOk = constantTimeEquals(creds.user, auth.user);
  const passOk = constantTimeEquals(creds.pass, auth.pass);
  if (!userOk || !passOk) {
    return { ok: false, response: unauthorizedResponse() };
  }
  return { ok: true };
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
