import { NextRequest, NextResponse } from 'next/server';

const MERCLE_API_KEY = process.env.MERCLE_API_KEY;
const MERCLE_API_URL = process.env.MERCLE_API_URL || 'https://oauth.mercle.ai/api/mercle-sdk';

if (!MERCLE_API_KEY) throw new Error('MERCLE_API_KEY environment variable is required');

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const res = await fetch(`${MERCLE_API_URL}/mini-app/verify-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': MERCLE_API_KEY! },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: 'Verification failed', detail: err }, { status: 401 });
  }

  const data = await res.json();

  // TODO: Find or create user in YOUR database using data.localized_user_id
  // TODO: Create YOUR session token (replace 'token' below with your own JWT)

  return NextResponse.json({
    success: true,
    user: {
      id: data.localized_user_id,
      mercleUserId: data.localized_user_id,
      username: data.username || 'User',
      verifiedServices: data.verified_services,
      pfpUrl: data.pfp_url,
    },
    session_token: token, // Replace with YOUR session token
  });
}
