import { describe, expect, test } from "bun:test";
import { checkAuth, parseBasicAuth } from "../../src/server/auth";

function buildRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/anywhere", { headers });
}

function basicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

describe("parseBasicAuth", () => {
  test("returns null for missing or malformed headers", () => {
    expect(parseBasicAuth(null)).toBeNull();
    expect(parseBasicAuth("")).toBeNull();
    expect(parseBasicAuth("Bearer abc123")).toBeNull();
    expect(parseBasicAuth("Basic")).toBeNull();
    // Decoded payload without a colon is invalid Basic Auth.
    expect(parseBasicAuth(`Basic ${Buffer.from("noColon").toString("base64")}`)).toBeNull();
  });

  test("decodes well-formed Basic credentials", () => {
    expect(parseBasicAuth(basicHeader("alice", "s3cret"))).toEqual({
      user: "alice",
      pass: "s3cret",
    });
  });

  test("preserves colons inside the password", () => {
    expect(parseBasicAuth(basicHeader("alice", "p:a:s:s"))).toEqual({
      user: "alice",
      pass: "p:a:s:s",
    });
  });

  test("scheme match is case-insensitive", () => {
    expect(parseBasicAuth(`BASIC ${Buffer.from("u:p").toString("base64")}`)).toEqual({
      user: "u",
      pass: "p",
    });
  });
});

describe("checkAuth", () => {
  test("with no auth config, every request passes (LAN-only mode)", () => {
    const r = buildRequest({ "cf-connecting-ip": "1.2.3.4" });
    expect(checkAuth(null, r)).toEqual({ ok: true });
  });

  test("with auth config, direct LAN requests pass (no cf-connecting-ip)", () => {
    const r = buildRequest({}); // no tunnel headers
    expect(checkAuth({ user: "alice", pass: "s3cret" }, r)).toEqual({ ok: true });
  });

  test("tunneled request without Authorization → 401", () => {
    const r = buildRequest({ "cf-connecting-ip": "1.2.3.4" });
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("www-authenticate")).toContain("Basic");
    }
  });

  test("tunneled request with wrong password → 401", () => {
    const r = buildRequest({
      "cf-connecting-ip": "1.2.3.4",
      authorization: basicHeader("alice", "wrong"),
    });
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r);
    expect(result.ok).toBe(false);
  });

  test("tunneled request with wrong username → 401", () => {
    const r = buildRequest({
      "cf-connecting-ip": "1.2.3.4",
      authorization: basicHeader("eve", "s3cret"),
    });
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r);
    expect(result.ok).toBe(false);
  });

  test("tunneled request with correct credentials → ok", () => {
    const r = buildRequest({
      "cf-connecting-ip": "1.2.3.4",
      authorization: basicHeader("alice", "s3cret"),
    });
    expect(checkAuth({ user: "alice", pass: "s3cret" }, r)).toEqual({ ok: true });
  });

  test("malformed Authorization header still returns 401", () => {
    const r = buildRequest({
      "cf-connecting-ip": "1.2.3.4",
      authorization: "Bearer something-not-basic",
    });
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r);
    expect(result.ok).toBe(false);
  });
});
