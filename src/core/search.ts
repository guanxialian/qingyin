import type { ArtistRow, MusicItem, Track } from './types';

/** 去掉标题里的装饰性括号、BV 号、多余符号，用于「搜不到时再试一次」 */
export function cleanKeyword(raw: string): string {
  let s = raw.trim();
  // 【原创PV付】「完整版」『』 这类装饰
  s = s.replace(/【[^】]*】/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/[「」『』]/g, ' ');
  // 全角/半角括号里带这些词的，整段去掉（多半是版本说明）
  s = s.replace(/[（(][^）)]*(原创|PV|pv|翻唱|完整|高清|4K|1080|混剪|纯享|神曲|MV)[^）)]*[）)]/g, ' ');
  // BV 号
  s = s.replace(/BV[0-9A-Za-z]{10}/g, ' ');
  // “…” 引号
  s = s.replace(/[“”"]/g, ' ');
  s = s.replace(/\s*[-—–|/]\s*$/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** 依次尝试的关键词：原样 → 清洗后 → 去掉空格 */
export function keywordVariants(raw: string): string[] {
  const list = [raw.trim(), cleanKeyword(raw), cleanKeyword(raw).replace(/\s+/g, '')];
  const out: string[] = [];
  for (const k of list) {
    if (k && !out.includes(k)) out.push(k);
  }
  return out.length ? out : [raw];
}

export function dedupeTracks(list: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of list) {
    const k = `${t.platform}:${String(t.id)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function pickNumber(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function fixUrl(u: unknown): string | undefined {
  if (typeof u !== 'string' || !u) return undefined;
  return u.startsWith('//') ? `https:${u}` : u;
}

/** 把插件返回的 artist 条目（name/id/avatar/fans/worksNum）整理成 UI 用的结构 */
export function toArtistRow(item: MusicItem, platform: string): ArtistRow {
  const anyItem = item as MusicItem & {
    name?: string;
    avatar?: string;
    fans?: number;
    worksNum?: number;
    description?: string;
  };
  return {
    key: `${platform}:${String(item.id)}`,
    id: item.id,
    name: anyItem.name ?? anyItem.title ?? String(item.id),
    avatar: fixUrl(anyItem.avatar ?? (item.artwork as string | undefined)),
    fans: pickNumber(anyItem.fans),
    works: pickNumber(anyItem.worksNum),
    description: anyItem.description,
    platform,
    raw: item,
  };
}

/** 粉丝数 / 作品数的人话展示 */
export function fmtCount(n?: number): string {
  if (n == null) return '';
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万`;
  return String(n);
}
