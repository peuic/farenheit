import { describe, expect, test } from "bun:test";
import {
  checkAuth,
  isPrivateLanIP,
  parseBasicAuth,
} from "../../src/server/auth";

function buildRequest(headers: Record<string, string> = {}): Request {
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

  test("decodes passwords with spaces", () => {
    expect(parseBasicAuth(basicHeader("peu", "pq choras alexandria"))).toEqual({
      user: "peu",
      pass: "pq choras alexandria",
    });
  });
});

describe("isPrivateLanIP", () => {
  test("recognises RFC 1918 v4 ranges", () => {
    expect(isPrivateLanIP("10.0.0.31")).toBe(true);
    expect(isPrivateLanIP("172.16.5.10")).toBe(true);
    expect(isPrivateLanIP("172.31.255.255")).toBe(true);
    expect(isPrivateLanIP("192.168.1.42")).toBe(true);
  });

  test("rejects loopback (so tunnel daemons relaying via 127.0.0.1 require auth)", () => {
    expect(isPrivateLanIP("127.0.0.1")).toBe(false);
    expect(isPrivateLanIP("::1")).toBe(false);
  });

  test("rejects public IPv4", () => {
    expect(isPrivateLanIP("8.8.8.8")).toBe(false);
    expect(isPrivateLanIP("1.2.3.4")).toBe(false);
    expect(isPrivateLanIP("172.32.0.1")).toBe(false); // just outside the 172.16-31 range
  });

  test("recognises IPv6 link-local + unique-local", () => {
    expect(isPrivateLanIP("fe80::1234")).toBe(true);
    expect(isPrivateLanIP("fc00::abcd")).toBe(true);
    expect(isPrivateLanIP("fd00::1")).toBe(true);
  });

  test("strips IPv4-mapped IPv6 prefix", () => {
    expect(isPrivateLanIP("::ffff:192.168.1.42")).toBe(true);
    expect(isPrivateLanIP("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("checkAuth", () => {
  test("with no auth config, every request passes", () => {
    expect(checkAuth(null, buildRequest(), "8.8.8.8")).toEqual({ ok: true });
  });

  test("LAN client passes without credentials", () => {
    const r = buildRequest();
    expect(checkAuth({ user: "alice", pass: "s3cret" }, r, "192.168.1.10")).toEqual({ ok: true });
  });

  test("loopback client (tunnel daemon) requires credentials", () => {
    const r = buildRequest();
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r, "127.0.0.1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  test("public IP without credentials → 401", () => {
    const r = buildRequest();
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r, "1.2.3.4");
    expect(result.ok).toBe(false);
  });

  test("loopback with wrong password → 401", () => {
    const r = buildRequest({ authorization: basicHeader("alice", "wrong") });
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r, "127.0.0.1");
    expect(result.ok).toBe(false);
  });

  test("loopback with correct credentials → ok", () => {
    const r = buildRequest({ authorization: basicHeader("alice", "s3cret") });
    expect(checkAuth({ user: "alice", pass: "s3cret" }, r, "127.0.0.1")).toEqual({ ok: true });
  });

  test("missing clientIP defaults to requiring auth", () => {
    const r = buildRequest();
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r, null);
    expect(result.ok).toBe(false);
  });

  test("malformed Authorization header still returns 401", () => {
    const r = buildRequest({ authorization: "Bearer something-not-basic" });
    const result = checkAuth({ user: "alice", pass: "s3cret" }, r, "127.0.0.1");
    expect(result.ok).toBe(false);
  });
});
