import { NextRequest, NextResponse } from 'next/server';

const MERCLE_API_KEY = process.env.MERCLE_API_KEY!;
const MERCLE_API_URL = process.env.MERCLE_API_URL || 'https://oauth.mercle.ai/api/mercle-sdk';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });

  const res = await fetch(
    `${MERCLE_API_URL}/session/status?session_id=${encodeURIComponent(sessionId)}`,
    { headers: { 'X-API-Key': MERCLE_API_KEY } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Status check failed' }, { status: 502 });
  }

  const data = await res.json();

  if (data.status !== 'approved') {
    return NextResponse.json({
      status: data.status,
      rejection_reason: data.rejection_reason,
      missing_services: data.missing_services,
    });
  }

  // TODO: Find or create user in YOUR database using data.localized_user_id
  // TODO: Create YOUR session token

  return NextResponse.json({
    status: 'approved',
    user: {
      id: data.localized_user_id,
      mercleUserId: data.localized_user_id,
      username: data.username || 'User',
      verifiedServices: data.verified_services,
      pfpUrl: data.pfp_url,
    },
    session_token: data.localized_user_id, // Replace with YOUR session token
  });
}
