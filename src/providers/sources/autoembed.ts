import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://player.autoembed.cc/';
const serverRegex = /data-server="([^"]*)"/g;
const sourcesRegex1 = /sources:\s*(\[[^\]]*\])/;
const sourcesRegex2 = /file":\s*(\[[^\]]*\])/;

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  let path = '/embed/';
  if (ctx.media.type === 'show') {
    path += `/tv/${ctx.media.tmdbId}/${ctx.media.season.number.toString()}/${ctx.media.episode.number.toString()}`;
  } else {
    path += `/movie/${ctx.media.imdbId}`;
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
  rank: 10,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
