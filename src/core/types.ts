/** MusicFree 插件体系的最小类型定义（与 MusicFree 插件接口保持兼容） */

export interface MusicItem {
  id: string | number;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface MediaSource {
  url: string;
  headers?: Record<string, string>;
}

export interface LrcSource {
  rawLrc?: string;
  lrc?: string;
  translation?: string;
}

export interface SearchResult {
  isEnd?: boolean;
  data: MusicItem[];
}

export interface TopListGroup {
  title: string;
  data: TopListItem[];
}

export interface TopListItem {
  id: string | number;
  title: string;
  coverImg?: string;
  description?: string;
  [key: string]: unknown;
}

export interface PluginApi {
  platform: string;
  version?: string;
  author?: string;
  description?: string;
  srcUrl?: string;
  cacheControl?: string;
  primaryKey?: string[];
  supportedSearchType?: string[];
  hints?: Record<string, string[]>;
  search?: (keyword: string, page: number, type: string) => Promise<SearchResult>;
  getMediaSource?: (
    musicItem: MusicItem,
    quality: string,
  ) => Promise<MediaSource | string> | MediaSource | string;
  getLyric?: (musicItem: MusicItem) => Promise<LrcSource | string> | LrcSource | string;
  getAlbumInfo?: (albumItem: MusicItem, page: number) => Promise<SearchResult>;
  getArtistWorks?: (
    artistItem: MusicItem,
    page: number,
    type: string,
  ) => Promise<SearchResult>;
  getTopLists?: () => Promise<TopListGroup[]>;
  getTopListDetail?: (
    topListItem: TopListItem,
    page: number,
  ) => Promise<SearchResult & { topListItem?: TopListItem }>;
  importMusicSheet?: (url: string) => Promise<MusicItem[]>;
  getMusicInfo?: (musicItem: MusicItem) => Promise<Partial<MusicItem>>;
  getRecommendSheetTags?: () => Promise<unknown>;
  getRecommendSheetsByTag?: (tag: unknown, page: number) => Promise<SearchResult>;
  getMusicComments?: (musicItem: MusicItem, page: number) => Promise<unknown>;
}

/** 已安装的音源 */
export interface InstalledPlugin {
  /** 本地唯一 id */
  key: string;
  /** 插件源码 */
  code: string;
  /** 展示名，默认取 platform */
  name: string;
  platform: string;
  version?: string;
  author?: string;
  srcUrl?: string;
  source: 'builtin' | 'url' | 'paste';
  addedAt: number;
  enabled: boolean;
}

export interface Track extends MusicItem {
  platform: string;
}

export type Quality = 'low' | 'standard' | 'high' | 'super';

export const QUALITY_LABEL: Record<Quality, string> = {
  low: '流畅 128K',
  standard: '标准 192K',
  high: '较高 320K',
  super: '无损',
};
