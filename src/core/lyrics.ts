import { httpRequest } from './http';

/**
 * 歌词兜底源：B 站音源插件本身通常不提供歌词，插件返回空时依次尝试
 *   1. 网易云音乐（中文曲库最全，返回 LRC + 翻译）
 *   2. LRCLIB（https://lrclib.net，开放、免登录）
 * 返回「原文 LRC + 空行 + 翻译 LRC」，交由 src/core/lrc.ts 合并。
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const NET_EASE_HEADERS = {
  'user-agent': UA,
  referer: 'https://music.163.com/',
  origin: 'https://music.163.com',
  cookie: 'appver=8.0.0; os=pc',
  accept: 'application/json',
};

/** 把 B 站视频标题清洗成「歌名」：去掉【】前缀、括号后缀、BV 号等 */
export function cleanTitle(raw: string): string {
  let t = raw;
  t = t.replace(/BV[0-9A-Za-z]{10}/g, ' ');
  t = t.replace(/【[^】]*】/g, ' ');
  t = t.replace(/\[[^\]]*\]/g, ' ');
  t = t.replace(/[（(][^）)]*(翻唱|cover|Cover|COVER|伴奏|纯音乐|4K|1080|720)[^）)]*[）)]/g, ' ');
  t = t.replace(/《/g, '').replace(/》/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t || raw;
}

function firstArtist(raw: string): string {
  return raw.split(/[、/&,]| feat\.? | ft\.? /i)[0].trim();
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-_·・.,，。!！?？'"“”‘’~～]/g, '');
}

interface NeSong {
  id: number;
  name: string;
  artists?: { name: string }[];
  duration?: number;
}

async function neteaseSearch(name: string, singer: string): Promise<NeSong[]> {
  const kw = singer ? `${name} ${singer}` : name;
  const url =
    'https://music.163.com/api/search/get?type=1&offset=0&limit=10&s=' + encodeURIComponent(kw);
  try {
    const res = await httpRequest<{ result?: { songs?: NeSong[] } }>({
      url,
      headers: NET_EASE_HEADERS,
      responseType: 'json',
      timeoutMs: 12000,
    });
    return res.data?.result?.songs ?? [];
  } catch {
    return [];
  }
}

async function neteaseLyric(id: number): Promise<string> {
  const url = `https://music.163.com/api/song/lyric?lv=1&kv=1&tv=-1&id=${id}`;
  try {
    const res = await httpRequest<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string } }>({
      url,
      headers: NET_EASE_HEADERS,
      responseType: 'json',
      timeoutMs: 12000,
    });
    const main = res.data?.lrc?.lyric?.trim() ?? '';
    const tr = res.data?.tlyric?.lyric?.trim() ?? '';
    if (!main) return '';
    return tr ? `${main}\n\n${tr}` : main;
  } catch {
    return '';
  }
}

/** 歌名相似度：命中包含关系优先，其次取最短的匹配（避免「XX 翻唱版」这种超长标题） */
function pickBest(songs: NeSong[], name: string, singer: string): NeSong | undefined {
  const n = norm(name);
  const s = norm(firstArtist(singer));
  const scored = songs
    .map((song) => {
      const sn = norm(song.name);
      const singerNames = (song.artists ?? []).map((a) => norm(a.name)).join(' ');
      let score = 0;
      if (sn === n) score += 100;
      else if (sn.includes(n) || n.includes(sn)) score += 60;
      if (s && singerNames.includes(s)) score += 40;
      score -= Math.max(0, sn.length - n.length) * 0.5;
      return { song, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score && scored[0].score > 30 ? scored[0].song : undefined;
}

async function fromNetease(title: string, artist: string): Promise<string> {
  const name = cleanTitle(title);
  if (!name) return '';
  const songs = await neteaseSearch(name, firstArtist(artist));
  const best = pickBest(songs, name, artist);
  if (!best) return '';
  return neteaseLyric(best.id);
}

interface LrclibItem {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

async function requestLrclib(url: string): Promise<LrclibItem[]> {
  try {
    const res = await httpRequest<LrclibItem[]>({
      url,
      headers: { 'user-agent': UA, accept: 'application/json', 'accept-language': 'zh-CN,zh;q=0.9' },
      responseType: 'json',
      timeoutMs: 12000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

async function fromLrclib(title: string, artist: string): Promise<string> {
  const name = cleanTitle(title);
  const singer = firstArtist(artist || '');
  if (!name) return '';
  const p = new URLSearchParams({ track_name: name });
  if (singer) p.set('artist_name', singer);
  const tries = [
    `https://lrclib.net/api/search?${p.toString()}`,
    `https://lrclib.net/api/search?${new URLSearchParams({ q: `${name} ${singer}`.trim() }).toString()}`,
    `https://lrclib.net/api/search?${new URLSearchParams({ q: name }).toString()}`,
  ];
  for (const url of tries) {
    const items = await requestLrclib(url);
    const hit = items.find((x) => x.syncedLyrics && !x.instrumental);
    if (hit?.syncedLyrics) return hit.syncedLyrics;
  }
  return '';
}

/** 返回「原文 LRC 与翻译 LRC 以空行分隔」的文本；找不到返回空串 */
export async function fetchFallbackLyric(title: string, artist: string): Promise<string> {
  const netease = await fromNetease(title, artist);
  if (netease) return netease;
  return fromLrclib(title, artist);
}
