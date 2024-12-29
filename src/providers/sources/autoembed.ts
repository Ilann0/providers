import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://player.autoembed.cc/';
const serverRegex = /data-server="([^"]*)"/g;
const sourcesRegex1 = /sources:\s*(\[[^\]]*\])/;
const sourcesRegex2 = /file":\s*(\[[^\]]*\])/;

export interface TomAutoEmbedResult {
  videoSource: string
  subtitles: TomAutoEmbedSub[]
  posterImageUrl: string
}

export interface TomAutoEmbedSub {
  file: string
  kind: string
  label: string
  default: boolean
}


const tomAutoEmbedBaseUrl = 'https://tom.autoembed.cc/api/getVideoSource'
const tomAutoEmbedScraper = async (ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput['embeds']> => {
  const url = new URL(tomAutoEmbedBaseUrl);
  if (ctx.media.type === 'show') {
    url.searchParams.set('type', 'tv');
    const id = `${ctx.media.imdbId}/${ctx.media.season}/${ctx.media.episode}`;
    url.searchParams.set('id', id);
  } else {
    url.searchParams.set('type', 'movie');
    url.searchParams.set('id', String(ctx.media.imdbId));
  }

  const referer = new URL(url);
  referer.pathname = `${url.searchParams.get('type')}/${url.searchParams.get('id')}`
  let fileUrl: string | null = null;
  try {
    const apiResult: TomAutoEmbedResult = await ctx.proxiedFetcher(url.toString(), { headers: { Referer: referer.toString() } });
    fileUrl = apiResult.videoSource;
  } catch (error) {
    console.error(error);
  }

  const embeds = [];
  if (fileUrl) {
    embeds.push({
      embedId: 'tom-autoembed-api',
      url: fileUrl,
    });
  }

  return embeds;
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  let path = '/embed/';
  if (ctx.media.type === 'show') {
    path += `/tv/${ctx.media.tmdbId}/${ctx.media.season.number.toString()}/${ctx.media.episode.number.toString()}`;
  } else {
    path += `/movie/${ctx.media.imdbId}`;
  }

  const tomEmbed = await tomAutoEmbedScraper(ctx);
  if (tomEmbed.length) {
    return {
      embeds: tomEmbed,
    }
  }

  const playerPage = await ctx.fetcher(path, { baseUrl });

  const results = [];
  let match;
  while ((match = serverRegex.exec(playerPage)) !== null) {
    results.push(match[1]);
  }

  if (!results.length) {
    throw new NotFoundError('No data found');
  }

  const embeds: SourcererEmbed[] = [];

  for (const serverBase64 of results) {
    try {
      const url = atob(serverBase64);
      const page = await ctx.proxiedFetcher(url);
      [sourcesRegex1, sourcesRegex2].forEach((regex) => {
        const sources = page.match(regex)[1];
        if (!sources?.length) return;
        try {
          const sourcesArr: { file: string, label: string }[] = JSON.parse(sources);
          sourcesArr
            .filter(s => !s.label || !s.label.toLowerCase?.() || s.label.toLowerCase().startsWith('eng'))
            .map(s => embeds.push({ embedId: `auto-embed-${serverBase64}-${s.label}`, url: s.file }))
        } catch (err) {
          return;
        }
      })
    } catch (err) {
      continue;
    }
  }

  return {
    embeds,
  };
}

export const autoembedScraper = makeSourcerer({
  id: 'autoembed',
  name: 'Autoembed',
  rank: 800,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
