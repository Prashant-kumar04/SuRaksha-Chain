import crypto from 'crypto';

// Real SHA-256 hash of a file buffer
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Hash used for chaining audit log entries / version chains
// (deterministic hash over the entry's own content + link to previous hash)
export function chainHash({ prev, ...fields }: any): string {
  const payload = JSON.stringify({ prev: prev || null, ...fields });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
