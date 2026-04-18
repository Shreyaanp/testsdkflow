import { NextResponse } from 'next/server';

const MERCLE_API_KEY = process.env.MERCLE_API_KEY!;
const MERCLE_API_URL = process.env.MERCLE_API_URL || 'https://oauth.mercle.ai/api/mercle-sdk';

export async function POST() {
  const res = await fetch(`${MERCLE_API_URL}/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': MERCLE_API_KEY },
    body: JSON.stringify({ metadata: { source: 'miniapp' } }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({
    session_id: data.session_id,
    deep_link: data.deep_link,
    qr_data: data.qr_data,
    base64_qr: data.base64_qr,
    required_services: data.required_services,
    expires_in_seconds: data.expires_in_seconds,
  });
}
