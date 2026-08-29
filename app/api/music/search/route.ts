import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim() || '';

  if (!query) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    // 1. Try Deezer Search API (Primary)
    const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=30`;
    const deezerRes = await fetch(deezerUrl, {
      headers: { 'User-Agent': 'ConnectApp/1.0' },
      next: { revalidate: 3600 }
    });

    if (deezerRes.ok) {
      const data = await deezerRes.json();
      if (Array.isArray(data.data) && data.data.length > 0) {
        const tracks = data.data
          .filter((t: any) => t.preview) // Only tracks with playable audio previews
          .map((t: any) => ({
            id: `deezer-${t.id}`,
            title: t.title,
            artist: t.artist?.name || 'Unknown Artist',
            artworkUrl: t.album?.cover_big || t.album?.cover_medium || t.album?.cover || '',
            audioUrl: t.preview,
            duration: t.duration || 30,
            source: 'deezer'
          }));

        if (tracks.length > 0) {
          return NextResponse.json({ tracks });
        }
      }
    }
  } catch (err) {
    console.warn('Deezer search error, trying fallback:', err);
  }

  try {
    // 2. High-reliability Fallback: Apple iTunes Search API
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=30`;
    const itunesRes = await fetch(itunesUrl, { next: { revalidate: 3600 } });

    if (itunesRes.ok) {
      const data = await itunesRes.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        const tracks = data.results
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

        return NextResponse.json({ tracks });
      }
    }
  } catch (err) {
    console.error('Music search failed completely:', err);
  }

  return NextResponse.json({ tracks: [] });
}
