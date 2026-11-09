// Outbound requests the agent makes on the owner's behalf (x402 APIs, other A2A agents)
// go only to public HTTPS hosts. Blocks requests into our own network or cloud metadata
// (SSRF) and refuses redirects, which could point somewhere private after the check.
import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, including cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3], // multicast and reserved
];

const v4num = (ip: string) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return PRIVATE_V4.some(([base, bits]) => v4num(ip) >>> (32 - bits) === v4num(base) >>> (32 - bits));
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That isn't a valid URL.");
  }
  const allowHttp = process.env.ALLOW_HTTP_FETCH === "true"; // local testing only
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) throw new Error("Only https:// URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs with credentials aren't allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || (!allowHttp && addrs.some(isPrivateIp))) throw new Error("That address isn't reachable from here.");
  return url;
}

export async function guardedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  await assertPublicUrl(url);
  const res = await fetch(input, { ...init, redirect: "manual", signal: init?.signal ?? AbortSignal.timeout(20_000) });
  if (res.status >= 300 && res.status < 400) throw new Error("The site tried to redirect; redirects aren't followed.");
  return res;
}
