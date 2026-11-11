import { useSyncExternalStore } from 'react';
import { engine, bindMediaSessionHandlers } from './engine';
import {
  clearPluginCache,
  fetchPluginCodeFromUrl,
  getPluginApi,
  pluginLyric,
  pluginMediaSource,
  pluginMusicInfo,
  pluginSearch,
  pluginTopListDetail,
  pluginTopLists,
  evaluatePlugin,
} from './plugin';
import { parseLrc, mergeTranslation, type LrcLine } from './lrc';
import { fetchFallbackLyric } from './lyrics';
import { fixBilibiliSource } from './bili';
import { startLive, updateLive, endLive } from './live';
import { downloadTrack, removeDownloadFile, cacheSource } from './download';
import { loadJSON, saveJSON } from './storage';
import { setProxyBase } from './http';
import { logEvent } from './debug';
import type {
  InstalledPlugin,
  MusicItem,
  Playlist,
  Quality,
  TopListGroup,
  TopListItem,
  Track,
} from './types';

export type TabId = 'discover' | 'search' | 'library' | 'settings';

export type Overlay =
  | { kind: 'toplist'; title: string; item: TopListItem; platform: string }
  | { kind: 'album'; title: string; item: MusicItem; platform: string }
  | { kind: 'artist'; title: string; item: MusicItem; platform: string }
  | null;

export interface SearchState {
  keyword: string;
  type: 'music' | 'album' | 'artist';
  results: Track[];
  loading: boolean;
  page: number;
  isEnd: boolean;
  error: string | null;
  searched: boolean;
}

export interface DiscoverState {
  groups: TopListGroup[];
  platform: string | null;
  loading: boolean;
  error: string | null;
}

export interface DownloadRecord {
  key: string;
  title: string;
  artist: string;
  fileName: string;
  uri?: string;
  at: number;
  /** 整首歌的元信息，离线时靠它重建播放队列 */
  track?: Track;
  /** 下载时一并抓下来的歌词（离线歌词） */
  lrc?: string;
}

export interface AppState {
  ready: boolean;
  tab: TabId;
  overlay: Overlay;
  overlayTracks: Track[];
  overlayLoading: boolean;
  overlayError: string | null;
  overlayPage: number;
  overlayEnd: boolean;

  plugins: InstalledPlugin[];
  quality: Quality;
  proxy: string;

  search: SearchState;
  discover: DiscoverState;

  favorites: Track[];
  history: Track[];
  downloads: DownloadRecord[];
  playlists: Playlist[];
  shuffle: boolean;

  current: Track | null;
  queue: Track[];
  queueIndex: number;
  playing: boolean;
  preparing: boolean;
  position: number;
  duration: number;
  lyrics: LrcLine[];
  lyricOffset: number;
  lyricLoading: boolean;

  playerOpen: boolean;
  lyricMode: boolean;
  detailTrack: Track | null;
  toast: { id: number; text: string } | null;
}

const STORAGE_PLUGINS = 'plugins';
const STORAGE_FAVORITES = 'favorites';
const STORAGE_HISTORY = 'history';
const STORAGE_DOWNLOADS = 'downloads';
const STORAGE_SETTINGS = 'settings';
const STORAGE_PLAYLISTS = 'playlists';
const STORAGE_SHUFFLE = 'shuffle';

interface PersistedSettings {
  quality: Quality;
  proxy: string;
  lyricOffset: number;
}

const savedSettings = loadJSON<PersistedSettings>(STORAGE_SETTINGS, {
  quality: 'high',
  proxy: '',
  lyricOffset: 0,
});

let state: AppState = {
  ready: false,
  tab: 'discover',
  overlay: null,
  overlayTracks: [],
  overlayLoading: false,
  overlayError: null,
  overlayPage: 1,
  overlayEnd: true,

  plugins: loadJSON<InstalledPlugin[]>(STORAGE_PLUGINS, []),
  quality: savedSettings.quality ?? 'high',
  proxy: savedSettings.proxy ?? '',

  search: {
    keyword: '',
    type: 'music',
    results: [],
    loading: false,
    page: 1,
    isEnd: true,
    error: null,
    searched: false,
  },
  discover: { groups: [], platform: null, loading: false, error: null },

  favorites: loadJSON<Track[]>(STORAGE_FAVORITES, []),
  history: loadJSON<Track[]>(STORAGE_HISTORY, []),
  downloads: loadJSON<DownloadRecord[]>(STORAGE_DOWNLOADS, []),
  playlists: loadJSON<Playlist[]>(STORAGE_PLAYLISTS, []),
  shuffle: loadJSON<boolean>(STORAGE_SHUFFLE, false),

  current: null,
  queue: [],
  queueIndex: -1,
  playing: false,
  preparing: false,
  position: 0,
  duration: 0,
  lyrics: [],
  lyricOffset: savedSettings.lyricOffset ?? 0,
  lyricLoading: false,

  playerOpen: false,
  lyricMode: false,
  detailTrack: null,
  toast: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  emit();
}

export function getState(): AppState {
  return state;
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
    () => selector(state),
  );
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let toastSeq = 0;
export function toast(text: string) {
  const id = ++toastSeq;
  setState({ toast: { id, text } });
  setTimeout(() => {
    if (getState().toast?.id === id) setState({ toast: null });
  }, 2600);
}

function persistSettings() {
  saveJSON(STORAGE_SETTINGS, {
    quality: state.quality,
    proxy: state.proxy,
    lyricOffset: state.lyricOffset,
  } satisfies PersistedSettings);
}

/* ------------------------------ 音源管理 ------------------------------ */

function pluginKey(platform: string): string {
  return `${platform}@${Date.now().toString(36)}`;
}

export async function addPluginFromUrl(url: string, name?: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('请填写音源地址');
  const { code } = await fetchPluginCodeFromUrl(trimmed);
  await addPluginFromCode(code, name, 'url', trimmed);
}

export async function addPluginFromCode(
  code: string,
  name?: string,
  source: InstalledPlugin['source'] = 'paste',
  srcUrl?: string,
): Promise<void> {
  const api = evaluatePlugin(code);
  const platform = api.platform;
  const next: InstalledPlugin = {
    key: state.plugins.find((p) => p.platform === platform)?.key ?? pluginKey(platform),
    code,
    name: name?.trim() || platform,
    platform,
    version: api.version,
    author: api.author,
    srcUrl: srcUrl ?? api.srcUrl,
    source,
    addedAt: Date.now(),
    enabled: true,
  };
  clearPluginCache(next.key);
  const plugins = [next, ...state.plugins.filter((p) => p.platform !== platform)];
  saveJSON(STORAGE_PLUGINS, plugins);
  setState({ plugins });
  toast(`已导入音源：${next.name}`);
}

export function removePlugin(key: string): void {
  const plugins = state.plugins.filter((p) => p.key !== key);
  clearPluginCache(key);
  saveJSON(STORAGE_PLUGINS, plugins);
  setState({ plugins });
  const currentPlatform = state.current?.platform;
  if (currentPlatform && !plugins.some((p) => p.platform === currentPlatform)) {
    void engine.pause();
    setState({ playing: false });
  }
}

export function togglePlugin(key: string): void {
  const plugins = state.plugins.map((p) => (p.key === key ? { ...p, enabled: !p.enabled } : p));
  saveJSON(STORAGE_PLUGINS, plugins);
  setState({ plugins });
}

function findPlugin(platform: string): InstalledPlugin | undefined {
  return state.plugins.find((p) => p.platform === platform && p.enabled);
}

function apiFor(platform: string) {
  const plugin = findPlugin(platform);
  if (!plugin) throw new Error(`音源「${platform}」未启用`);
  return getPluginApi(plugin.key, plugin.code);
}

/* ------------------------------ 搜索 / 榜单 ------------------------------ */

export function setTab(tab: TabId) {
  setState({ tab, overlay: null });
}

export async function runSearch(keyword: string, type: SearchState['type'] = 'music') {
  const kw = keyword.trim();
  if (!kw) return;
  const plugin = state.plugins.find((p) => p.enabled);
  if (!plugin) {
    setState({
      tab: 'search',
      search: { ...state.search, keyword: kw, error: '还没有可用的音源，请先到「设置 - 音源」导入', searched: true },
    });
    return;
  }
  setState({
    tab: 'search',
    overlay: null,
    search: {
      keyword: kw,
      type,
      results: [],
      loading: true,
      page: 1,
      isEnd: false,
      error: null,
      searched: true,
    },
  });
  try {
    const api = apiFor(plugin.platform);
    const res = await pluginSearch(api, kw, 1, type);
    setState({
      search: {
        ...state.search,
        results: res.data.map((it) => ({ ...it, platform: plugin.platform })),
        loading: false,
        isEnd: res.isEnd ?? true,
        error: res.data.length === 0 ? '没有搜到结果' : null,
      },
    });
  } catch (e) {
    console.error("[qingyin]", e);
    setState({
      search: { ...state.search, loading: false, error: (e as Error).message || '搜索失败', isEnd: true },
    });
  }
}

export async function loadMoreSearch() {
  const s = state.search;
  if (s.loading || s.isEnd || !s.keyword) return;
  const plugin = state.plugins.find((p) => p.enabled);
  if (!plugin) return;
  const nextPage = s.page + 1;
  setState({ search: { ...s, loading: true } });
  try {
    const api = apiFor(plugin.platform);
    const res = await pluginSearch(api, s.keyword, nextPage, s.type);
    setState({
      search: {
        ...state.search,
        results: [
          ...state.search.results,
          ...res.data.map((it) => ({ ...it, platform: plugin.platform })),
        ],
        loading: false,
        page: nextPage,
        isEnd: res.isEnd ?? true,
      },
    });
  } catch (e) {
    console.error("[qingyin]", e);
    setState({ search: { ...state.search, loading: false, error: (e as Error).message } });
  }
}

export async function loadDiscover(platform?: string) {
  const plugin = platform
    ? findPlugin(platform)
    : state.plugins.find((p) => p.enabled);
  if (!plugin) {
    setState({ discover: { groups: [], platform: null, loading: false, error: null } });
    return;
  }
  setState({ discover: { ...state.discover, platform: plugin.platform, loading: true, error: null } });
  try {
    const api = apiFor(plugin.platform);
    const groups = await pluginTopLists(api);
    setState({ discover: { groups, platform: plugin.platform, loading: false, error: null } });
  } catch (e) {
    console.error("[qingyin]", e);
    setState({
      discover: { groups: [], platform: plugin.platform, loading: false, error: (e as Error).message },
    });
  }
}

export async function openTopList(title: string, item: TopListItem, platform: string) {
  setState({
    overlay: { kind: 'toplist', title, item, platform },
    overlayTracks: [],
    overlayLoading: true,
    overlayError: null,
    overlayPage: 1,
    overlayEnd: false,
  });
  try {
    const api = apiFor(platform);
    const res = await pluginTopListDetail(api, item, 1);
    setState({
      overlayTracks: res.data.map((it) => ({ ...it, platform })),
      overlayLoading: false,
      overlayEnd: res.isEnd ?? true,
      overlayError: res.data.length === 0 ? '这个榜单没有内容' : null,
    });
  } catch (e) {
    console.error("[qingyin]", e);
    setState({ overlayLoading: false, overlayError: (e as Error).message, overlayEnd: true });
  }
}

export async function loadMoreOverlay() {
  const o = state.overlay;
  if (!o || o.kind !== 'toplist' || state.overlayLoading || state.overlayEnd) return;
  const page = state.overlayPage + 1;
  setState({ overlayLoading: true });
  try {
    const api = apiFor(o.platform);
    const res = await pluginTopListDetail(api, o.item, page);
    setState({
      overlayTracks: [...state.overlayTracks, ...res.data.map((it) => ({ ...it, platform: o.platform }))],
      overlayPage: page,
      overlayLoading: false,
      overlayEnd: res.isEnd ?? true,
    });
  } catch (e) {
    console.error("[qingyin]", e);
    setState({ overlayLoading: false, overlayError: (e as Error).message });
  }
}

export function closeOverlay() {
  setState({ overlay: null, overlayTracks: [], overlayError: null });
}

/* ------------------------------ 播放 ------------------------------ */

function trackKey(t: MusicItem, platform: string) {
  return `${platform}:${String(t.id)}`;
}

function pushHistory(track: Track) {
  const key = trackKey(track, track.platform);
  const history = [track, ...state.history.filter((t) => trackKey(t, t.platform) !== key)].slice(0, 200);
  saveJSON(STORAGE_HISTORY, history);
  setState({ history });
}

/** 已下载的歌曲：本地文件优先，不依赖网络和音源插件 */
let autoPlay = false;

export function findDownload(track: Track): DownloadRecord | undefined {
  const key = trackKey(track, track.platform);
  return state.downloads.find((d) => (d.track ? trackKey(d.track, track.platform) : d.key.split(':').slice(0, 2).join(':')) === key && d.uri);
}

/** 把下载记录还原成可播放的 Track */
export function downloadToTrack(rec: DownloadRecord): Track {
  return (
    rec.track ?? {
      id: rec.fileName,
      title: rec.title,
      artist: rec.artist,
      platform: rec.key.split(':')[0] ?? 'local',
    }
  );
}

export async function playTrack(track: Track, list?: Track[], index?: number, auto = false) {
  autoPlay = auto;
  const queue = list ?? state.queue;
  const qIndex =
    typeof index === 'number'
      ? index
      : Math.max(0, queue.findIndex((t) => trackKey(t, t.platform) === trackKey(track, track.platform)));

  setState({
    current: track,
    queue: queue.length ? queue : [track],
    queueIndex: qIndex,
    preparing: true,
    playing: false,
    position: 0,
    duration: track.duration ?? 0,
    lyrics: [],
    lyricLoading: true,
    playerOpen: true,
  });

  const local = findDownload(track);
  if (local?.uri) {
    // 离线：直接读沙盒里的文件，不联网、不调插件
    const meta = {
      title: local.track?.title ?? local.title,
      artist: local.track?.artist ?? local.artist,
      album: local.track?.album,
      artwork: local.track?.artwork,
      duration: local.track?.duration,
    };
    try {
      await engine.load(local.uri, undefined, meta);
      setState({ preparing: false, playing: true, duration: meta.duration ?? state.duration });
      pushHistory(track);
      void engine.updateNowPlaying({ ...meta, playing: true, position: 0, duration: meta.duration ?? 0 });
      startLive(track, [], 0, meta.duration ?? 0, true);
      if (local.lrc) applyRawLyric(local.lrc);
      else setState({ lyrics: [], lyricLoading: false });
      return;
    } catch (e) {
      console.error('[qingyin] local playback failed, fallback to network', e);
    }
  }

  try {
    const api = apiFor(track.platform);
    const source = await fixBilibiliSource(track, await pluginMediaSource(api, track, state.quality));
    const meta = {
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork,
      duration: track.duration,
    };
    pendingSource = source;
    cacheFallbackTried = false;
    await engine.load(source.url, source.headers, meta);
    clearStallTimer();
    stallTimer = setTimeout(() => {
      if (state.preparing && state.current && pendingSource) void playFromCache('加载超时');
    }, 9000);
    setState({ preparing: false, playing: true });
    pushHistory(track);
    void engine.updateNowPlaying({ ...meta, playing: true, position: 0 });
    startLive(track, [], 0, track.duration ?? 0, true);
    void loadLyrics(api, track);
    void enrichTrack(api, track);
  } catch (e) {
    console.error("[qingyin]", e);
    const message = describePlayError(e);
    logEvent('play.fail', `${track.title} | ${(e as Error).message ?? e}`);
    setState({ preparing: false, playing: false, lyricLoading: false });
    if (autoPlay && state.queue.length > 1) {
      toast(`${message}，自动下一首`);
      setTimeout(() => void next(true), 900);
      return;
    }
    toast(message);
  }
}

/** 把底层报错翻译成用户能懂的提示 */
function describePlayError(e: unknown): string {
  const raw = String((e as Error)?.message ?? e ?? '');
  if (/\b403\b|forbidden|permission/i.test(raw)) return '这首歌有版权或会员限制';
  if (/\b404\b|-404|not found|已删除/i.test(raw)) return '视频已失效或被删除';
  if (/dash|音频流|no audio/i.test(raw)) return '这个视频没有可用的音频流';
  if (/timeout|network|fetch|NetworkError|Load failed/i.test(raw)) return '网络不给力，稍后再试';
  if (/not supported|MEDIA_ERR|decode/i.test(raw)) return '播放器不支持这个音频格式';
  return raw || '播放失败';
}

export async function playAt(index: number, auto = false) {
  const track = state.queue[index];
  if (!track) return;
  await playTrack(track, state.queue, index, auto);
}

export function toggleShuffle() {
  const shuffle = !state.shuffle;
  saveJSON(STORAGE_SHUFFLE, shuffle);
  setState({ shuffle });
  toast(shuffle ? '随机播放已开启' : '顺序播放');
}

function randomIndexExcept(current: number, total: number): number {
  if (total <= 1) return 0;
  let pick = current;
  while (pick === current) pick = Math.floor(Math.random() * total);
  return pick;
}

export async function next(auto = false) {
  const { queue, queueIndex } = state;
  if (!queue.length) return;
  if (state.shuffle) {
    await playAt(randomIndexExcept(queueIndex, queue.length), auto);
    return;
  }
  if (queueIndex + 1 >= queue.length) {
    if (auto) {
      setState({ playing: false, position: 0 });
      await engine.pause();
      return;
    }
    await playAt(0);
    return;
  }
  await playAt(queueIndex + 1, auto);
}

export async function prev() {
  const { queueIndex, position } = state;
  if (position > 3.5) {
    await engine.seek(0);
    setState({ position: 0 });
    return;
  }
  if (state.shuffle) {
    await playAt(randomIndexExcept(queueIndex, state.queue.length));
    return;
  }
  if (queueIndex <= 0) {
    await engine.seek(0);
    setState({ position: 0 });
    return;
  }
  await playAt(queueIndex - 1);
}

export async function togglePlay() {
  if (!state.current) {
    if (state.favorites.length) {
      await playTrack(state.favorites[0], state.favorites, 0);
    }
    return;
  }
  if (state.playing) {
    await engine.pause();
    setState({ playing: false });
    void engine.updateNowPlaying({ ...metaOf(state.current), playing: false, position: state.position, duration: state.duration });
  } else {
    await engine.play();
    setState({ playing: true });
    void engine.updateNowPlaying({ ...metaOf(state.current), playing: true, position: state.position, duration: state.duration });
  }
}

function metaOf(track: Track) {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
    duration: track.duration ?? state.duration,
  };
}

export async function seekTo(position: number) {
  await engine.seek(position);
  setState({ position });
}

export function setPlayerOpen(open: boolean) {
  setState({ playerOpen: open });
}

export function setLyricMode(on: boolean) {
  setState({ lyricMode: on });
}

export function openDetail(track: Track) {
  setState({ detailTrack: track });
}

export function closeDetail() {
  setState({ detailTrack: null });
}

export function setQuality(quality: Quality) {
  setState({ quality });
  persistSettings();
  if (state.current) void reloadSource(state.current);
}

export async function reloadSource(track: Track) {
  try {
    const api = apiFor(track.platform);
    const source = await fixBilibiliSource(track, await pluginMediaSource(api, track, state.quality));
    const position = state.position;
    await engine.load(source.url, source.headers, metaOf(track));
    if (position > 1) await engine.seek(position);
    toast(`已切换为 ${state.quality === 'super' ? '无损' : state.quality} 音质`);
  } catch (e) {
    console.error("[qingyin]", e);
    toast((e as Error).message);
  }
}

/* ------------------------------ 歌词 ------------------------------ */

function applyRawLyric(raw: string) {
  // 常见格式：一段带时间戳的原文，可选的第二段翻译
  const blocks = raw.split(/\n\s*\n/);
  let main = parseLrc(blocks[0]);
  if (blocks.length > 1) {
    const extra = parseLrc(blocks.slice(1).join('\n'));
    if (extra.length) main = mergeTranslation(main, extra);
  }
  setState({ lyrics: main, lyricLoading: false });
  return main;
}

async function loadLyrics(api: ReturnType<typeof apiFor>, track: Track) {
  let raw = await pluginLyric(api, track);
  if (!raw) {
    // 插件没有歌词（B 站就没有），走 LRCLIB 兜底
    raw = await fetchFallbackLyric(track.title, track.artist ?? '');
  }
  if (!raw) {
    setState({ lyrics: [], lyricLoading: false });
    return;
  }
  const parsed = applyRawLyric(raw);
  if (state.current) {
    updateLive(state.current, parsed, state.position, state.duration, state.playing, true);
    void engine.updateNowPlaying({
      ...metaOf(state.current),
      playing: state.playing,
      position: state.position,
      duration: state.duration,
    });
  }
}

export function setLyricOffset(offset: number) {
  setState({ lyricOffset: offset });
  persistSettings();
}

/* ------------------------------ 收藏 / 下载 ------------------------------ */

export function isFavorite(track: Track) {
  return state.favorites.some((t) => trackKey(t, t.platform) === trackKey(track, track.platform));
}

export function toggleFavorite(track: Track) {
  const exists = isFavorite(track);
  const favorites = exists
    ? state.favorites.filter((t) => trackKey(t, t.platform) !== trackKey(track, track.platform))
    : [{ ...track }, ...state.favorites];
  saveJSON(STORAGE_FAVORITES, favorites);
  setState({ favorites });
  toast(exists ? '已取消收藏' : '已收藏');
}

/* -------------------------------- 自建歌单 -------------------------------- */

function persistPlaylists(playlists: Playlist[]) {
  saveJSON(STORAGE_PLAYLISTS, playlists);
  setState({ playlists });
}

export function createPlaylist(name: string): string {
  const trimmed = name.trim().slice(0, 30) || '新歌单';
  const playlist: Playlist = {
    id: 'pl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: trimmed,
    tracks: [],
    createdAt: Date.now(),
  };
  persistPlaylists([...state.playlists, playlist]);
  toast('已创建歌单「' + trimmed + '」');
  return playlist.id;
}

export function renamePlaylist(id: string, name: string) {
  const trimmed = name.trim().slice(0, 30);
  if (!trimmed) return;
  persistPlaylists(state.playlists.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}

export function deletePlaylist(id: string) {
  persistPlaylists(state.playlists.filter((p) => p.id !== id));
  toast('已删除歌单');
}

export function addToPlaylist(id: string, track: Track) {
  const playlist = state.playlists.find((p) => p.id === id);
  if (!playlist) return;
  const exists = playlist.tracks.some(
    (t) => trackKey(t, t.platform) === trackKey(track, track.platform),
  );
  if (exists) {
    toast('这首歌已经在歌单里了');
    return;
  }
  persistPlaylists(
    state.playlists.map((p) => (p.id === id ? { ...p, tracks: [...p.tracks, { ...track }] } : p)),
  );
  toast('已加入「' + playlist.name + '」');
}

export function removeFromPlaylist(id: string, track: Track) {
  persistPlaylists(
    state.playlists.map((p) =>
      p.id === id
        ? {
            ...p,
            tracks: p.tracks.filter(
              (t) => trackKey(t, t.platform) !== trackKey(track, track.platform),
            ),
          }
        : p,
    ),
  );
  toast('已从歌单移除');
}

export async function playPlaylist(id: string, startIndex = 0) {
  const playlist = state.playlists.find((p) => p.id === id);
  if (!playlist?.tracks.length) {
    toast('歌单还是空的');
    return;
  }
  if (state.shuffle) {
    const shuffled = [...playlist.tracks];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    await playTrack(shuffled[0], shuffled, 0);
    return;
  }
  const track = playlist.tracks[Math.min(startIndex, playlist.tracks.length - 1)];
  await playTrack(track, playlist.tracks, playlist.tracks.indexOf(track));
}

export async function downloadCurrentOr(track: Track) {
  try {
    const api = apiFor(track.platform);
    const source = await pluginMediaSource(api, track, state.quality);
    toast('开始下载…');
    const res = await downloadTrack(track, source, state.quality);
    // 歌词一并存下来，断网也有词
    let lrc: string | undefined;
    try {
      lrc = (await pluginLyric(api, track)) || (await fetchFallbackLyric(track.title, track.artist ?? '')) || undefined;
    } catch {
      lrc = undefined;
    }
    const downloads: DownloadRecord[] = [
      {
        key: `${trackKey(track, track.platform)}:${Date.now()}`,
        title: track.title,
        artist: track.artist ?? '',
        fileName: res.fileName,
        uri: res.uri,
        at: Date.now(),
        track,
        lrc,
      },
      ...state.downloads,
    ].slice(0, 200);
    saveJSON(STORAGE_DOWNLOADS, downloads);
    setState({ downloads });
    toast(`已保存到 App 内：${res.fileName}`);
  } catch (e) {
    console.error("[qingyin]", e);
    toast((e as Error).message || '下载失败');
  }
}

/** 播放某条下载记录（收藏页「下载」列表里点一行） */
export async function playDownload(rec: DownloadRecord) {
  const list = state.downloads.map(downloadToTrack);
  const index = Math.max(0, state.downloads.findIndex((d) => d.key === rec.key));
  await playTrack(downloadToTrack(rec), list, index);
}

export async function deleteDownload(rec: DownloadRecord) {
  await removeDownloadFile(rec.fileName);
  const downloads = state.downloads.filter((d) => d.key !== rec.key);
  saveJSON(STORAGE_DOWNLOADS, downloads);
  setState({ downloads });
  toast('已删除');
}

export function clearHistory() {
  saveJSON(STORAGE_HISTORY, []);
  setState({ history: [] });
}

/* ------------------------------ 详情补充 ------------------------------ */

async function enrichTrack(api: ReturnType<typeof apiFor>, track: Track) {
  const info = await pluginMusicInfo(api, track);
  if (!info) return;
  const cur = state.current;
  if (!cur || cur.id !== track.id) return;
  const merged: Track = { ...cur, ...info, platform: cur.platform };
  setState({ current: merged });
  void engine.updateNowPlaying({
    ...metaOf(merged),
    playing: state.playing,
    position: state.position,
    duration: state.duration,
  });
}

/* ------------------------------ 设置 ------------------------------ */

export function setProxy(proxy: string) {
  setProxyBase(proxy || null);
  setState({ proxy });
  persistSettings();
}

/* ------------------------------ 引擎事件绑定 ------------------------------ */

let engineBound = false;

/* 在线放不了时的兜底：缓存到本地再播 */
let pendingSource: { url: string; headers?: Record<string, string> } | null = null;
let cacheFallbackTried = false;
let cacheFallbackBusy = false;
let stallTimer: ReturnType<typeof setTimeout> | null = null;

function clearStallTimer() {
  if (stallTimer) {
    clearTimeout(stallTimer);
    stallTimer = null;
  }
}

async function playFromCache(reason: string) {
  const track = state.current;
  const source = pendingSource;
  if (!track || !source || cacheFallbackTried || cacheFallbackBusy) return;
  cacheFallbackTried = true;
  cacheFallbackBusy = true;
  clearStallTimer();
  logEvent('play.cache', reason + ' | ' + track.title);
  setState({ preparing: true });
  toast('正在缓存这首，马上播放…');
  try {
    const uri = await cacheSource(source, track.platform + ':' + String(track.id));
    const meta = metaOf(track);
    await engine.load(uri, undefined, meta);
    setState({ preparing: false, playing: true, duration: track.duration ?? state.duration });
    void engine.updateNowPlaying({ ...meta, playing: true, position: 0, duration: track.duration ?? 0 });
  } catch (e) {
    console.error('[qingyin] cache fallback failed', e);
    logEvent('play.cache.err', String((e as Error).message ?? e));
    setState({ preparing: false, playing: false });
    toast(describePlayError(e));
  } finally {
    cacheFallbackBusy = false;
  }
}
export function initStore() {
  if (engineBound) return;
  engineBound = true;
  setProxyBase(state.proxy || null);

  engine.on((e) => {
    switch (e.type) {
      case 'timeupdate':
        setState({ position: e.position });
        if (state.current) {
          void engine.updateNowPlaying({
            ...metaOf(state.current),
            playing: state.playing,
            position: e.position,
            duration: state.duration,
          });
          updateLive(state.current, state.lyrics, e.position, state.duration, state.playing);
        }
        break;
      case 'durationchange':
        clearStallTimer();
        setState({ duration: e.duration });
        break;
      case 'play':
        setState({ playing: true });
        if (state.current) {
          updateLive(state.current, state.lyrics, state.position, state.duration, true, true);
        }
        break;
      case 'pause':
        setState({ playing: false });
        if (state.current) {
          updateLive(state.current, state.lyrics, state.position, state.duration, false, true);
        }
        break;
      case 'ended':
        clearStallTimer();
        endLive();
        void next(true);
        break;
      case 'buffering':
        break;
      case 'remote':
        if (e.action === 'play') {
          if (!state.playing) void togglePlay();
        } else if (e.action === 'pause') {
          if (state.playing) void togglePlay();
        } else if (e.action === 'toggle') {
          void togglePlay();
        } else if (e.action === 'next') {
          void next();
        } else if (e.action === 'prev') {
          void prev();
        } else if (e.action === 'seek' && typeof e.position === 'number') {
          void seekTo(e.position);
        }
        break;
      case 'error':
        if (engine.usesNativePlayer && pendingSource && !cacheFallbackTried) {
          void playFromCache('播放器报错：' + e.message);
          break;
        }
        clearStallTimer();
        setState({ playing: false, preparing: false });
        toast(e.message);
        break;
    }
  });

  bindMediaSessionHandlers({
    play: () => void togglePlay(),
    pause: () => void togglePlay(),
    next: () => void next(),
    prev: () => void prev(),
    seek: (t) => void seekTo(t),
  });

  setState({ ready: true });
  if (state.plugins.length) void loadDiscover();
}
