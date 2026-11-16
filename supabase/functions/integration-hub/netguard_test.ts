import { assert, assertRejects } from "jsr:@std/assert@1";
import { assertPublicHttpsUrl, isPrivateIp } from "./netguard.ts";

Deno.test("private ranges are blocked", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert(isPrivateIp(ip), ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700::1111"]) assert(!isPrivateIp(ip), ip);
});

Deno.test("unsafe destinations are rejected", async () => {
  await assertRejects(() => assertPublicHttpsUrl("http://example.com", "http://example.com/"));
  await assertRejects(() => assertPublicHttpsUrl("https://169.254.169.254", "https://169.254.169.254/latest"));
  await assertRejects(() => assertPublicHttpsUrl("https://localhost", "https://localhost/"));
  await assertRejects(() => assertPublicHttpsUrl("https://example.com", "https://example.com@127.0.0.1/"));
  await assertRejects(() => assertPublicHttpsUrl("https://[::1]", "https://[::1]/"));
});

Deno.test("public HTTPS host is accepted", async () => {
  const u = await assertPublicHttpsUrl("https://1.1.1.1", "https://1.1.1.1/x");
  assert(u.hostname === "1.1.1.1");
});
