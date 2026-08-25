import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "0:0:0:0:0:0:0:1",
]);

function isNumericEncodingHostname(hostname: string): boolean {
  // Block decimal single-number (e.g. 2130706433), hex single-number
  // (e.g. 0x7f000001), octal single-number, or dotted hex/octal.
  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    return true;
  }
  if (/^\d+$/.test(hostname)) {
    // Decimal 32-bit encoding – block if it parses as valid IPv4 integer
    const n = Number(hostname);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 4_294_967_295) {
      return true;
    }
  }
  const parts = hostname.split(".");
  for (const p of parts) {
    if (/^0x[0-9a-fA-F]+$/.test(p)) {
      return true;
    }
    // Octal with leading 0 (e.g. 0177) – must be octal digits only and length>1
    if (/^0[0-7]+$/.test(p) && p.length > 1) {
      return true;
    }
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  // Strip IPv4-mapped IPv6 prefix for range checks
  const normalized = ip.toLowerCase().replace(/^::ffff:/, "");

  // Try ipaddr.js for comprehensive range detection
  try {
    const addr = ipaddr.parse(normalized);
    const range = addr.range();
    // ipaddr.js ranges: 'private', 'loopback', 'linkLocal', 'carrierGradeNat',
    // 'reserved', 'multicast', 'broadcast', 'uniqueLocal', 'unicast', etc.
    if (
      range === "private" ||
      range === "loopback" ||
      range === "linkLocal" ||
      range === "carrierGradeNat" ||
      range === "uniqueLocal" ||
      range === "multicast" ||
      range === "reserved" ||
      range === "broadcast"
    ) {
      return true;
    }
    // Unspecified :: and 0.0.0.0 are also blocked
    if (range === "unspecified") {
      return true;
    }
    // For IPv6, block fc/fd (uniqueLocal) and fe80::/10 (linkLocal) already covered,
    // but ipaddr.js may return unicast for some; double-check prefixes
    if (addr.kind() === "ipv6") {
      const lower = normalized.toLowerCase();
      if (
        lower === "::" ||
        lower === "::1" ||
        lower.startsWith("fc") ||
        lower.startsWith("fd") ||
        lower.startsWith("fe8") ||
        lower.startsWith("fe9") ||
        lower.startsWith("fea") ||
        lower.startsWith("feb") ||
        lower.startsWith("fec") ||
        lower.startsWith("fed") ||
        lower.startsWith("fee") ||
        lower.startsWith("fef")
      ) {
        return true;
      }
    }
    return false;
  } catch {
    // Fallback to manual checks if parsing fails (treat as private)
    if (normalized.includes(":")) {
      return (
        normalized === "::" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe8") ||
        normalized.startsWith("fe9") ||
        normalized.startsWith("fea") ||
        normalized.startsWith("feb") ||
        normalized === "::1"
      );
    }

    const parts = normalized.split(".").map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
    ) {
      return true;
    }

    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
}

export async function assertPublicUrl(
  rawUrl: string,
  opts?: { allowPrivate?: boolean }
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new Error("Invalid URL.", { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  if (opts?.allowPrivate) {
    return url;
  }

  const hostnameLower = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostnameLower)) {
    throw new Error(
      "This URL points to a local or reserved address and cannot be fetched."
    );
  }

  if (isNumericEncodingHostname(hostnameLower)) {
    throw new Error(
      "This URL points to a local or reserved address and cannot be fetched."
    );
  }

  // If hostname is already a literal IP, check it directly without DNS
  try {
    if (ipaddr.isValid(hostnameLower) || ipaddr.isValid(url.hostname)) {
      const literal = url.hostname;
      if (isPrivateIp(literal)) {
        throw new Error(
          "This URL points to a local or reserved address and cannot be fetched."
        );
      }
      return url;
    }
  } catch {
    // not a literal IP, continue to DNS
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, {
      all: true,
      verbatim: true,
    } as unknown as { all: true });
  } catch (error) {
    throw new Error(
      "This URL points to a local or reserved address and cannot be fetched.",
      { cause: error }
    );
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(
        "This URL points to a local or reserved address and cannot be fetched."
      );
    }
  }

  return url;
}

export { isPrivateIp };
