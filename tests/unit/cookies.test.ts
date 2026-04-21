import { describe, expect, test } from "bun:test";
import { parseDeviceCookie, buildSetCookieHeader, DEVICE_COOKIE_NAME } from "../../src/server/cookies";

describe("cookies", () => {
  test("parseDeviceCookie returns null when header absent", () => {
    expect(parseDeviceCookie(null)).toBeNull();
    expect(parseDeviceCookie("")).toBeNull();
  });

  test("parseDeviceCookie finds the right cookie among multiple", () => {
    const header = `foo=1; ${DEVICE_COOKIE_NAME}=abc-123; bar=2`;
    expect(parseDeviceCookie(header)).toBe("abc-123");
  });

  test("parseDeviceCookie returns null when cookie absent", () => {
    expect(parseDeviceCookie("foo=1; bar=2")).toBeNull();
  });

  test("buildSetCookieHeader has long max-age and SameSite=Lax", () => {
    const h = buildSetCookieHeader("uuid-xyz");
    expect(h).toContain(`${DEVICE_COOKIE_NAME}=uuid-xyz`);
    expect(h).toContain("Max-Age=31536000");
    expect(h).toContain("SameSite=Lax");
    expect(h).toContain("Path=/");
  });
});
