import axiosShim from './shims/axios';
import cheerioShim from './shims/cheerio';
import dayjs from 'dayjs';
import he from 'he';
import CryptoJS from 'crypto-js';
import type { MediaSource, MusicItem, PluginApi, Quality, SearchResult } from './types';

/**
 * 音源插件沙箱：用 new Function 执行 CommonJS 插件代码，
 * 并把 require 映射到应用内置的实现上（不访问 Node / 原生文件系统）。
 */

/**
 * 插件是 esbuild 打包出的 CommonJS，常见写法是 `require('axios').default.get(...)`，
 * 也有直接 `require('cheerio')` 解构的。这里同时提供「命名导出」和「default 指向自身」，
 * 两种写法都能跑。
 */
function cjs<T extends object>(mod: T): T & { default: T; __esModule: true } {
  return { ...mod, default: mod, __esModule: true };
}
function cjsFn<T extends (...args: never[]) => unknown>(fn: T): T & { default: T; __esModule: true } {
  return Object.assign(fn, { default: fn, __esModule: true as const });
}

const REQUIRE_MAP: Record<string, unknown> = {
  axios: cjs(axiosShim),
  cheerio: cjs(cheerioShim),
  dayjs: cjsFn(dayjs),
  he: cjs(he as unknown as object),
  'crypto-js': cjs(CryptoJS as unknown as object),
  'node-fetch': null,
  qs: {
    stringify: (obj: Record<string, unknown>) => new URLSearchParams(
      Object.entries(obj).map(([k, v]) => [k, String(v)]),
    ).toString(),
  },
};

const SUPPORTED = Object.keys(REQUIRE_MAP).filter((k) => REQUIRE_MAP[k]);

export function evaluatePlugin(code: string): PluginApi {
  const moduleObj = { exports: {} as Record<string, unknown> };
  const requireFn = (name: string) => {
    const key = name.replace(/^node:/, '').replace(/\/$/, '');
    if (key in REQUIRE_MAP && REQUIRE_MAP[key]) return REQUIRE_MAP[key];
    throw new Error(`音源插件引用了不支持的模块：${name}（当前支持 ${SUPPORTED.join(', ')}）`);
  };
  const processShim = {
    env: { NODE_ENV: 'production' },
    platform: 'ios',
    version: '',
    nextTick: (fn: () => void) => setTimeout(fn, 0),
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'module',
    'exports',
    'require',
    'global',
    'globalThis',
    'process',
    code,
  );
  factory(moduleObj, moduleObj.exports, requireFn, globalThis, globalThis, processShim);

  const exported = (moduleObj.exports as Record<string, unknown>).default ?? moduleObj.exports;
  const api = exported as PluginApi;
  if (!api || typeof api !== 'object' || typeof api.platform !== 'string') {
    throw new Error('不是有效的音源插件：缺少 platform 字段');
  }
  if (typeof api.search !== 'function' && typeof api.getTopLists !== 'function') {
    throw new Error('不是有效的音源插件：缺少 search / getTopLists 方法');
  }
  return api;
}

const apiCache = new Map<string, PluginApi>();

export function getPluginApi(key: string, code: string): PluginApi {
  const cached = apiCache.get(key);
  if (cached) return cached;
  const api = evaluatePlugin(code);
  apiCache.set(key, api);
  return api;
}

export function clearPluginCache(key?: string) {
  if (key) apiCache.delete(key);
  else apiCache.clear();
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** B 站等接口返回 `//i0.hdslb.com/...`，补全协议头 */
export function normalizeImage(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  return url;
}

function normalizeTrack(item: MusicItem): MusicItem {
  return {
    ...item,
    artwork: normalizeImage(item.artwork),
    artist: item.artist ?? '',
    album: item.album ?? '',
  };
}

export async function pluginSearch(
  api: PluginApi,
  keyword: string,
  page: number,
  type: 'music' | 'album' | 'artist' = 'music',
): Promise<SearchResult> {
  if (!api.search) throw new Error('该音源不支持搜索');
  const res = await withTimeout(
    Promise.resolve(api.search(keyword, page, type)),
    30000,
    '搜索',
  );
  return {
    isEnd: res?.isEnd ?? true,
    data: (res?.data ?? []).map((it) => normalizeTrack(it)) as MusicItem[],
  };
}

export async function pluginTopLists(api: PluginApi) {
  if (!api.getTopLists) throw new Error('该音源不支持榜单');
  const res = await withTimeout(Promise.resolve(api.getTopLists()), 30000, '加载榜单');
  return res ?? [];
}

export async function pluginTopListDetail(api: PluginApi, item: unknown, page = 1) {
  if (!api.getTopListDetail) throw new Error('该音源不支持榜单详情');
  const res = await withTimeout(
    Promise.resolve(api.getTopListDetail(item as never, page)),
    30000,
    '加载榜单详情',
  );
  return {
    isEnd: res?.isEnd ?? true,
    data: (res?.data ?? []).map((it) => normalizeTrack(it)) as MusicItem[],
  };
}

export async function pluginMediaSource(
  api: PluginApi,
  item: MusicItem,
  quality: Quality,
): Promise<MediaSource> {
  if (!api.getMediaSource) throw new Error('该音源不支持播放');
  const res = await withTimeout(
    Promise.resolve(api.getMediaSource(item, quality)),
    30000,
    '解析播放地址',
  );
  if (!res) throw new Error('没有拿到播放地址（可能因版权/大会员/地区限制）');
  if (typeof res === 'string') return { url: res };
  if (!res.url) throw new Error('播放地址为空');
  return { url: res.url, headers: res.headers };
}

export async function pluginLyric(api: PluginApi, item: MusicItem): Promise<string | null> {
  if (!api.getLyric) return null;
  try {
    const res = await withTimeout(Promise.resolve(api.getLyric(item)), 15000, '获取歌词');
    if (!res) return null;
    if (typeof res === 'string') return res;
    return res.rawLrc ?? res.lrc ?? null;
  } catch {
    return null;
  }
}

export async function pluginMusicInfo(
  api: PluginApi,
  item: MusicItem,
): Promise<Partial<MusicItem> | null> {
  if (!api.getMusicInfo) return null;
  try {
    const res = await withTimeout(Promise.resolve(api.getMusicInfo(item)), 15000, '获取歌曲信息');
    return res ? normalizeTrack(res as MusicItem) : null;
  } catch {
    return null;
  }
}

export async function fetchPluginCodeFromUrl(url: string): Promise<{ code: string; finalUrl: string }> {
  const res = await axiosShim.get<string>(url, { responseType: 'text' });
  const code = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  if (!code || code.length < 20) throw new Error('下载到的插件内容为空');
  return { code, finalUrl: url };
}
