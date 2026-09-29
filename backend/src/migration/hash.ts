import { createHash } from 'node:crypto';

export function fnv1a32(input: string) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
export function legacyPayloadHash(value: unknown) {
  return `fnv1a32:${fnv1a32(JSON.stringify(value))}`;
}
export function payloadHash(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
export function payloadHashMatches(expected: string, value: unknown) {
  return expected === payloadHash(value) || expected === legacyPayloadHash(value);
}
