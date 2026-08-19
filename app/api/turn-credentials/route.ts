import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET /api/turn-credentials
 * 
 * Returns ICE server configuration (STUN + TURN) for WebRTC calls.
 * TURN credentials are read from server-side environment variables — never exposed via NEXT_PUBLIC_*.
 * Only authenticated users can access this endpoint.
 * 
 * Supports:
 *   - Static credentials (TURN_USERNAME + TURN_CREDENTIAL)
 *   - HMAC-based temporary credentials (TURN_SECRET) — coturn's use-auth-secret mode
 *   - Fallback to free metered.ca TURN servers if no custom TURN is configured
 */
// Static fallback credentials provided by user
const STATIC_METERED_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.relay.metered.ca:80',
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ],
  },
  {
    urls: [
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turns:global.relay.metered.ca:443?transport=tcp',
    ],
    username: 'b861bc5468dd05aa2aff283d',
    credential: 'fJYY96O75HWDNLuH',
  },
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const meteredDomain = process.env.METERED_DOMAIN || 'myconnectapp.metered.live';
    const meteredApiKey = process.env.METERED_API_KEY || 'e1c37aa2510a0c7e0af21cbd53bdbb0b9fe8';

    // 1. Try fetching fresh, optimal regional ICE servers from Metered REST API
    if (meteredApiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const meteredRes = await fetch(
          `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredApiKey}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          }
        );
        clearTimeout(timeoutId);

        if (meteredRes.ok) {
          const freshServers = await meteredRes.json();
          if (Array.isArray(freshServers) && freshServers.length > 0) {
            return NextResponse.json({
              iceServers: freshServers,
              ttl: 7200, // 2 hours
            });
          }
        }
      } catch (apiErr) {
        console.warn('[TURN Credentials] Metered REST API fetch error, falling back to static config:', apiErr);
      }
    }

    // 2. Custom TURN server from environment variables if specified
    const turnUrl = process.env.TURN_SERVER_URL;
    const turnUsername = process.env.TURN_USERNAME || 'b861bc5468dd05aa2aff283d';
    const turnCredential = process.env.TURN_CREDENTIAL || 'fJYY96O75HWDNLuH';
    const turnSecret = process.env.TURN_SECRET;

    if (turnUrl) {
      const baseHost = turnUrl.replace(/^turns?:\/\//, '').replace(/:\d+$/, '');

      if (turnSecret) {
        const ttl = 86400;
        const timestamp = Math.floor(Date.now() / 1000) + ttl;
        const tempUsername = `${timestamp}:${session.user.email}`;

        const { createHmac } = await import('crypto');
        const hmac = createHmac('sha1', turnSecret);
        hmac.update(tempUsername);
        const tempCredential = hmac.digest('base64');

        return NextResponse.json({
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
            {
              urls: [
                `turn:${baseHost}:3478`,
                `turn:${baseHost}:3478?transport=tcp`,
                `turn:${baseHost}:443`,
                `turn:${baseHost}:443?transport=tcp`,
                `turns:${baseHost}:443?transport=tcp`,
              ],
              username: tempUsername,
              credential: tempCredential,
            },
          ],
          ttl,
        });
      }

      return NextResponse.json({
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
          {
            urls: [
              `turn:${baseHost}:3478`,
              `turn:${baseHost}:3478?transport=tcp`,
              `turn:${baseHost}:443`,
              `turn:${baseHost}:443?transport=tcp`,
              `turns:${baseHost}:443?transport=tcp`,
            ],
            username: turnUsername,
            credential: turnCredential,
          },
        ],
        ttl: 3600,
      });
    }

    // 3. Fallback: User's static Metered credentials
    return NextResponse.json({
      iceServers: STATIC_METERED_SERVERS,
      ttl: 3600,
    });
  } catch (error) {
    console.error('[TURN Credentials] Error:', error);
    return NextResponse.json(
      {
        iceServers: STATIC_METERED_SERVERS,
        ttl: 3600,
      }
    );
  }
}
