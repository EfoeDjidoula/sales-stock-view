// Outbound destination guard: integrations may only reach public HTTPS hosts.
const err = (m: string) => Object.assign(new Error(m), { retryable: false });

function v4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function v6Private(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? s.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  if (/^::ffff:/.test(s) || /^64:ff9b:/.test(s)) return true;
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || first === 0x2001 && s.startsWith("2001:db8");
}

export const isPrivateIp = (ip: string) => (ip.includes(":") ? v6Private(ip) : v4Private(ip));

/** Validates the final request URL: HTTPS, same host as base_url, public address only. */
export async function assertPublicHttpsUrl(base: string, full: string): Promise<URL> {
  let b: URL, u: URL;
  try { b = new URL(base); u = new URL(full); } catch { throw err("URL d'intégration invalide"); }
  if (b.protocol !== "https:" || u.protocol !== "https:") throw err("base_url HTTPS requise dans la configuration");
  if (u.username || u.password) throw err("Identifiants interdits dans l'URL");
  if (u.hostname !== b.hostname || u.port !== b.port) throw err("Le chemin ne peut pas changer de destination");
  if (u.port && !["443", "8443"].includes(u.port)) throw err("Port non autorisé (443 ou 8443)");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host) || !host.includes(".") && !host.includes(":")) {
    throw err("Destination interne interdite");
  }
  const literal = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
  const ips: string[] = [];
  if (literal) ips.push(host);
  else {
    for (const t of ["A", "AAAA"] as const) {
      try { ips.push(...(await Deno.resolveDns(host, t))); } catch { /* no record of this type */ }
    }
    if (!ips.length) throw err("Nom d'hôte introuvable");
  }
  if (ips.some(isPrivateIp)) throw err("Destination interne interdite");
  return u;
}
