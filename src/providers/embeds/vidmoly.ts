import { EmbedOutput, makeEmbed } from '@/providers/base';
import { NotFoundError } from '@/utils/errors';

const headers = {
  Origin: 'https://vidmoly.to',
  Referer: 'https://vidmoly.to/'
}

const PLAYLIST_URL_REGEX = /file:\s*"([^"]*\.m3u8)"/;


const getUrl = (videoId: string) => `https://vidmoly.to/embed-${encodeURIComponent(videoId)}.html`

export const vidMolyScraper = makeEmbed({
  id: 'vidmoly',
  name: 'Vidmoly',
  rank: 194,
  async scrape(ctx) {
    let url = ctx.url;
    if (ctx.url.includes('primewire')) {
      const request = await ctx.proxiedFetcher.full(ctx.url);
      url = request.finalUrl;
    }

    // Match the URL pattern for vidmoly.to or vidmoly.me/w/[videoID]
    const idMatch = url.match(/https?:\/\/vidmoly\.(to|me)\/w\/([^?]+)/);
    if (!idMatch) {
      throw new NotFoundError('Invalid URL format');
    }

    const videoID = idMatch[2];
    const htmlReq = await ctx.proxiedFetcher.full(getUrl(videoID), { headers });
    const html = await htmlReq.body;
    const hlsPlaylistUrl = html.match(PLAYLIST_URL_REGEX)?.[1];
    ctx.progress(50);
    if (!hlsPlaylistUrl) {
      throw new NotFoundError('HLS playlist not found');
    }
    const proxiedUrl = `https://doesnmatterwhat.wafflehacker.io/m3u8?url=${encodeURIComponent(hlsPlaylistUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
    ctx.progress(100);
    return {
      stream: [{
        id: 'some',
        playlist: proxiedUrl,
        headers,
        type: 'hls',
        captions: [],
        flags: ['cors-allowed'],
      }]
    } as EmbedOutput;
  },
});
