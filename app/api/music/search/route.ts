import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim() || '';

  if (!query) {
    return NextResponse.json({ tracks: [] });
  }

  // Run Apple iTunes (Primary, ultra-fast Akamai CDN) & Deezer in parallel for blazing speed
  try {
    const itunesPromise = fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=30`,
      { next: { revalidate: 86400 } }
    ).then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.results)) {
        return data.results
          .filter((t: any) => t.previewUrl)
          .map((t: any) => ({
            id: `itunes-${t.trackId}`,
            title: t.trackName,
            artist: t.artistName,
            artworkUrl: (t.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
            audioUrl: t.previewUrl,
            duration: 30,
            source: 'itunes'
          }));
      }
      return [];
    }).catch(() => []);

    const deezerPromise = fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=30`,
      { headers: { 'User-Agent': 'ConnectApp/1.0' }, next: { revalidate: 86400 } }
    ).then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.data)) {
        return data.data
          .filter((t: any) => t.preview)
          .map((t: any) => ({
            id: `deezer-${t.id}`,
            title: t.title,
            artist: t.artist?.name || 'Unknown Artist',
            artworkUrl: t.album?.cover_big || t.album?.cover_medium || t.album?.cover || '',
            audioUrl: t.preview,
            duration: t.duration || 30,
            source: 'deezer'
          }));
      }
      return [];
    }).catch(() => []);

    const [itunesTracks, deezerTracks] = await Promise.all([itunesPromise, deezerPromise]);

    // Combine tracks with iTunes tracks prioritized (instant Apple Akamai CDN audio playback)
    const combinedTracks = itunesTracks.length > 0 ? itunesTracks : deezerTracks;

    return NextResponse.json(
      { tracks: combinedTracks },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('Music search failed:', err);
    return NextResponse.json({ tracks: [] });
  }
}
