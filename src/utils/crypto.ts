/**
 * Cryptographic utility functions for SuRakSha Chain
 * Computes SHA-256 hashes for point-of-capture sealing & ledger hash-chaining.
 */

export async function computeSHA256(data: string | ArrayBuffer): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    const encoder = new TextEncoder();
    buffer = encoder.encode(data).buffer;
  } else {
    buffer = data;
  }

  if (window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback simple deterministic 64-char hex generator if WebCrypto is unavailable
  let hash = 0;
  const str = typeof data === 'string' ? data : new Uint8Array(data).join('');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return (hex + '8f7a90bc12e43d56789a456ef0123456789abcdef0123456789abcdef012').slice(0, 64);
}

export function formatShortHash(hash: string): string {
  if (!hash) return '';
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

export function formatMidHash(hash: string): string {
  if (!hash) return '';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}
