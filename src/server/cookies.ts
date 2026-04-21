export const DEVICE_COOKIE_NAME = "fh_device";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseDeviceCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === DEVICE_COOKIE_NAME && value.length > 0) return value;
  }
  return null;
}

export function buildSetCookieHeader(deviceId: string): string {
  return [
    `${DEVICE_COOKIE_NAME}=${deviceId}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
  ].join("; ");
}
