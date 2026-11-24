import { httpRequest } from './http';
import type { MediaSource, MusicItem } from './types';

/**
 * B 站 playurl 有时会把音频地址给到 P2P 节点（*.mcdn.bilivideo.cn:8082、
 * *.mountaintoys.cn:4483）。这些节点不支持「从末尾读」的字节范围请求
 * （`Range: bytes=-1024` 直接 416），而 AVPlayer 拉 DASH 分片时要靠它定位
 * moov，结果就是「能拿到地址但一直转圈/放不出来」。
 *
 * 这里在拿到地址后再问一次 playurl，从 backup_url 里挑一个正常的 CDN
 * （upos-sz-* 之类）并用一次末端范围请求验证，验证通过就换过去。
 */

const P2P_HOST = /(mcdn\.bilivideo\.cn|mountaintoys\.cn)/i;

function isP2P(url: string): boolean {
  try {
    return P2P_HOST.test(new URL(url).host);
  } catch {
    return false;
  }
}

async function supportsTailRange(url: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await httpRequest({
      url,
      headers: { ...headers, range: 'bytes=-1' },
      responseType: 'blob',
      timeoutMs: 8000,
    });
    return res.status === 206 || res.status === 200;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return status === 206 || status === 200;
  }
}

interface DashAudio {
  id?: number;
  bandwidth?: number;
  baseUrl?: string;
  base_url?: string;
  backupUrl?: string[];
  backup_url?: string[];
}

function collectCandidates(dash: { audio?: DashAudio[] } | undefined, originalUrl: string): string[] {
  if (!dash?.audio?.length) return [];
  const same = dash.audio.find((a) => (a.baseUrl ?? a.base_url) === originalUrl);
  const ordered = same ? [same, ...dash.audio.filter((a) => a !== same)] : dash.audio;

  const urls: string[] = [];
  for (const audio of ordered) {
    const own = audio.baseUrl ?? audio.base_url;
    if (own) urls.push(own);
    urls.push(...(audio.backupUrl ?? audio.backup_url ?? []));
  }
  // 去掉原地址和 P2P 节点，优先 upos CDN
  const unique = Array.from(new Set(urls)).filter((u) => u && u !== originalUrl && !isP2P(u));
  return unique.sort((a, b) => {
    const score = (u: string) => (/upos-[a-z0-9-]*\.bilivideo\.com/i.test(u) ? 0 : 1);
    return score(a) - score(b);
  });
}

/** 把 B 站音频地址里的 P2P 节点换成可用 CDN；无法改善时原样返回 */
export async function fixBilibiliSource(item: MusicItem, source: MediaSource): Promise<MediaSource> {
  if (!source?.url || !isP2P(source.url)) return source;
  const bvid = typeof item.bvid === 'string' ? item.bvid : undefined;
  const aid = typeof item.aid === 'number' ? item.aid : undefined;
  if (!bvid && !aid) return source;

  const baseHeaders: Record<string, string> = {
    ...(source.headers ?? {}),
    referer: `https://www.bilibili.com/video/${bvid ?? aid}`,
  };
  delete baseHeaders.host;

  try {
    let cid = typeof item.cid === 'number' ? item.cid : undefined;
    if (!cid && bvid) {
      const view = await httpRequest<{ code: number; data?: { cid?: number } }>({
        url: 'https://api.bilibili.com/x/web-interface/view',
        params: { bvid },
        headers: baseHeaders,
        responseType: 'json',
        timeoutMs: 10000,
      });
      cid = view.data?.data?.cid;
    }
    if (!cid) return source;

    const params: Record<string, unknown> = { cid, fnval: 16 };
    if (bvid) params.bvid = bvid;
    else if (aid) params.aid = aid;

    const res = await httpRequest<{ code: number; data?: { dash?: { audio?: DashAudio[] } } }>({
      url: 'https://api.bilibili.com/x/player/playurl',
      params,
      headers: baseHeaders,
      responseType: 'json',
      timeoutMs: 12000,
    });
    if (res.data?.code !== 0) return source;

    const candidates = collectCandidates(res.data.data?.dash, source.url).slice(0, 6);
    for (const url of candidates) {
      if (!(await supportsTailRange(url, baseHeaders))) continue;
      return { url, headers: { ...baseHeaders, host: new URL(url).host } };
    }
  } catch {
    // 换源失败就沿用原地址，交给播放器报错
  }
  return source;
}

/* -------------------- 作者作品列表（走搜索接口，按 mid 过滤） -------------------- */

const SPACE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SPACE_UA_DESK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface SearchVideo {
  mid?: number;
  author?: string;
  title?: string;
  bvid?: string;
  aid?: number;
  pic?: string;
  duration?: string;
  description?: string;
  pubdate?: number;
}

function parseClock(v?: string): number {
  if (!v) return 0;
  return v.split(':').reduce((acc, part) => acc * 60 + (Number(part) || 0), 0);
}

function toSearchTrack(v: SearchVideo): MusicItem {
  const pic = v.pic ?? '';
  return {
    id: v.bvid ?? String(v.aid ?? ''),
    title: (v.title ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    artist: v.author ?? '',
    artwork: pic ? (pic.startsWith('//') ? `https:${pic}` : pic) : undefined,
    duration: parseClock(v.duration),
    aid: v.aid,
    bvid: v.bvid,
    mid: v.mid,
    description: v.description,
    pubdate: v.pubdate,
  };
}

interface ArcVideo {
  aid?: number;
  bvid?: string;
  title?: string;
  pic?: string;
  duration?: number;
  author?: string;
  description?: string;
  pubdate?: number;
}

/** 空间接口被风控后先别再去撞，冷却 3 分钟，省得越撞越封。 */
let spaceBlockedUntil = 0;

/** 老版空间接口（无需 wbi 签名），部分网络环境下比 web 空间接口宽容。 */
async function fetchSpaceArc(mid: string | number, page: number): Promise<{ data: MusicItem[]; isEnd: boolean }> {
  const res = await httpRequest<{
    code?: number;
    message?: string;
    data?: { list?: { vlist?: ArcVideo[] }; page?: { count?: number } };
  }>({
    url: 'https://api.bilibili.com/x/space/arc/search',
    params: { mid: String(mid), pn: page, ps: 30, order: 'pubdate', keyword: '', platform: 'web' },
    headers: {
      'user-agent': SPACE_UA_DESK,
      referer: `https://space.bilibili.com/${mid}/video`,
      origin: 'https://space.bilibili.com',
      accept: 'application/json, text/plain, */*',
    },
    responseType: 'json',
    timeoutMs: 15000,
  });
  const code = res.data?.code;
  if (code !== 0) throw new Error(`${code === -799 || code === -412 ? '风控' : '空间'} ${code ?? ''} ${res.data?.message ?? ''}`);
  const vlist = res.data?.data?.list?.vlist ?? [];
  const count = res.data?.data?.page?.count ?? vlist.length;
  return {
    data: vlist.map((v) => ({
      id: v.bvid ?? String(v.aid ?? ''),
      title: (v.title ?? '').replace(/<[^>]+>/g, ''),
      artist: v.author ?? '',
      artwork: v.pic ? (v.pic.startsWith('//') ? `https:${v.pic}` : v.pic) : undefined,
      duration: v.duration ?? 0,
      aid: v.aid,
      bvid: v.bvid,
      mid: Number(mid),
      description: v.description,
      pubdate: v.pubdate,
    })),
    isEnd: page * 30 >= count,
  };
}

/**
 * 取某个 UP 主的投稿：先走空间接口（老接口，无需签名），
 * 被风控时退回「搜索接口按作者名搜 + 按 mid/作者名过滤」。
 * 空间接口（space/wbi/arc/search）风控很严，搜索接口正常得多，
 * 而且这里用的正是搜索结果本身，命中率有保证。
 * 一「页」对应搜索接口的两页（每页 20 条）。
 */
export async function fetchBiliArtistWorks(
  mid: string | number,
  name: string,
  page = 1,
): Promise<{ data: MusicItem[]; isEnd: boolean }> {
  if (Date.now() > spaceBlockedUntil) {
    try {
      const viaSpace = await fetchSpaceArc(mid, page);
      if (viaSpace.data.length > 0 || viaSpace.isEnd) return viaSpace;
    } catch (e) {
      console.error('[qingyin]', e);
      spaceBlockedUntil = Date.now() + 3 * 60 * 1000;
    }
  }
  const out: MusicItem[] = [];
  const seen = new Set<string>();
  let isEnd = true;
  for (const sp of [page * 2 - 1, page * 2]) {
    const res = await httpRequest<{
      code?: number;
      message?: string;
      data?: { result?: SearchVideo[]; numPages?: number; numResults?: number };
    }>({
      url: 'https://api.bilibili.com/x/web-interface/search/type',
      params: { search_type: 'video', keyword: name, page: sp, page_size: 20, platform: 'pc', highlight: 1 },
      headers: {
        'user-agent': SPACE_UA,
        referer: 'https://search.bilibili.com/',
        origin: 'https://search.bilibili.com',
        accept: 'application/json, text/plain, */*',
      },
      responseType: 'json',
      timeoutMs: 15000,
    });
    if (res.data?.code !== 0) throw new Error(res.data?.message || `搜索返回 ${res.data?.code}`);
    const list = res.data?.data?.result ?? [];
    for (const v of list) {
      const sameAuthor = v.author === name;
      if (String(v.mid) !== String(mid) && !sameAuthor) continue;
      const key = v.bvid ?? String(v.aid ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(toSearchTrack(v));
    }
    const numPages = res.data?.data?.numPages ?? 1;
    if (sp >= numPages) break;
    isEnd = false;
  }
  return { data: out, isEnd };
}
