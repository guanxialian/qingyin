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
