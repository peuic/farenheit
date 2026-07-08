import { renderLogin } from "../templates/login";
import { buildAuthCookieHeader, constantTimeEquals, isPrivateLanIP } from "../auth";
import type { AuthConfig } from "../auth";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "../loginRateLimit";

export function handleLoginGet(_auth: AuthConfig): Response {
  return new Response(renderLogin(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleLoginPost(
  auth: AuthConfig,
  req: Request,
  clientIP: string | null,
): Promise<Response> {
  // No auth configured — login page is meaningless, send to home.
  if (!auth) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  // LAN bypasses rate limiting (your own Wi-Fi isn't a brute-force vector).
  // Rate limit applies to non-LAN clients — the public Funnel path.
  const rateLimitedIp = clientIP && !isPrivateLanIP(clientIP) ? clientIP : null;
  if (rateLimitedIp) {
    const rl = checkLoginRateLimit(rateLimitedIp);
    if (!rl.allowed) {
      return new Response(
        renderLogin(`Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterSeconds / 60)} min.`),
        {
          status: 429,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Retry-After": String(rl.retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }

  let submitted = "";
  try {
    const form = await req.formData();
    submitted = String(form.get("token") ?? "").trim();
  } catch {
    submitted = "";
  }

  if (!submitted || !constantTimeEquals(submitted, auth.pass)) {
    if (rateLimitedIp) recordLoginFailure(rateLimitedIp);
    return new Response(renderLogin("Senha incorreta"), {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (rateLimitedIp) recordLoginSuccess(rateLimitedIp);
  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/",
      "Set-Cookie": buildAuthCookieHeader(auth.pass),
      "Cache-Control": "no-store",
    },
  });
}
