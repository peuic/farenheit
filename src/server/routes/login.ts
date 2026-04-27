import { renderLogin } from "../templates/login";
import { buildAuthCookieHeader, constantTimeEquals } from "../auth";
import type { AuthConfig } from "../auth";

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
): Promise<Response> {
  // No auth configured — login page is meaningless, send to home.
  if (!auth) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  let submitted = "";
  try {
    const form = await req.formData();
    submitted = String(form.get("token") ?? "").trim();
  } catch {
    submitted = "";
  }

  if (!submitted || !constantTimeEquals(submitted, auth.pass)) {
    return new Response(renderLogin("Senha incorreta"), {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/",
      "Set-Cookie": buildAuthCookieHeader(auth.pass),
      "Cache-Control": "no-store",
    },
  });
}
