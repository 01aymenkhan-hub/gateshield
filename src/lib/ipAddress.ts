import { z } from 'zod';

const ipv4 = z.ipv4();
const ipv6 = z.ipv6();

export function normalizeIp(value: string): string | null {
  const ip = value.trim();
  if (ipv4.safeParse(ip).success) return ip;
  if (!ipv6.safeParse(ip).success) return null;

  const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}
