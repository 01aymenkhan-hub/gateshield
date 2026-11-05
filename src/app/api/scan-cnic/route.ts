import { NextRequest } from 'next/server';
import { proxyOcr } from '@/lib/ocrProxy';

export async function POST(request: NextRequest) {
  return proxyOcr(request, 'cnic');
}
