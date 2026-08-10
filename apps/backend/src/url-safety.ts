/**
 * Guard server-side fetches (probe / upstream proxy) against obvious SSRF.
 * Localhost is allowed so the Testnet seller-demo can run.
 */

const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

function isBlockedIp(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "0.0.0.0" || h === "::" || h === "::1") return false; // ::1 handled as local
  if (h === "169.254.169.254" || h.startsWith("169.254.")) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(h);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  // Decimal / hex / octal IPv4 tricks (e.g. 2852039166 → 169.254.169.254)
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) {
      const a = (n >>> 24) & 255;
      const b = (n >>> 16) & 255;
      const c = (n >>> 8) & 255;
      const d = n & 255;
      return isBlockedIp(`${a}.${b}.${c}.${d}`);
    }
  }
  if (/^0x[0-9a-f]+$/i.test(h)) {
    const n = Number.parseInt(h, 16);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) {
      const a = (n >>> 24) & 255;
      const b = (n >>> 16) & 255;
      const c = (n >>> 8) & 255;
      const d = n & 255;
      return isBlockedIp(`${a}.${b}.${c}.${d}`);
    }
  }
  return false;
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".localhost")
  );
}

export type SafeUrlResult =
  | { ok: true; url: URL }
  | { ok: false; error: string; message: string };

export function assertSafeOutboundUrl(
  raw: string | null | undefined,
): SafeUrlResult {
  if (!raw || !String(raw).trim()) {
    return {
      ok: false,
      error: "url_required",
      message: "URL is required",
    };
  }

  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return {
      ok: false,
      error: "url_invalid",
      message: "URL is invalid",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      error: "url_scheme_blocked",
      message: "Only http(s) URLs are allowed",
    };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    return {
      ok: false,
      error: "url_host_blocked",
      message: "Host is not allowed",
    };
  }

  if (isLocalHost(host)) {
    return { ok: true, url };
  }

  if (isBlockedIp(host)) {
    return {
      ok: false,
      error: "url_host_blocked",
      message: "Private / link-local hosts are not allowed",
    };
  }

  return { ok: true, url };
}
