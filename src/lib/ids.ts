import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 — time-ordered, so IDs sort chronologically and index well.
 *
 * Generated APP-SIDE on purpose (PLAN.md §2): the same IDs are used in the JSON
 * phase and in Postgres, so the Phase 1 import (§14) is a straight insert with
 * no ID remapping.
 *
 * Layout: 48-bit big-endian unix millis | version 7 | 12 random bits
 *         | variant 0b10 | 62 random bits
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = Date.now();

  // 48-bit timestamp, big-endian, into bytes 0..5
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  // version 7 in the high nibble of byte 6
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // RFC 4122 variant in the top two bits of byte 8
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Idempotency keys for Server Actions (PLAN.md §8). */
export function idempotencyKey(): string {
  return randomBytes(16).toString('hex');
}
