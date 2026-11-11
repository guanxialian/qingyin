import { logEvent } from './debug';
import { Capacitor } from '@capacitor/core';

export type EngineEvent =
  | { type: 'timeupdate'; position: number }
  | { type: 'durationchange'; duration: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'ended' }
  | { type: 'buffering'; buffering: boolean }
  | { type: 'remote'; action: string; position?: number }
  | { type: 'error'; message: string };

type Handler = (e: EngineEvent) => void;

export interface NowPlayingMeta {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  position?: number;
  rate?: number;
}

interface NativePlayerPlugin {
  load(opts: {
    url: string;
    headers?: Record<string, string>;
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    duration?: number;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(opts: { position: number }): Promise<void>;
  setVolume(opts: { volume: number }): Promise<void>;
  setNowPlaying(opts: NowPlayingMeta & { playing: boolean }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: string,
    cb: (data: {
      position?: number;
      duration?: number;
      state?: string;
      message?: string;
      action?: string;
    }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

function getNativePlugin(): NativePlayerPlugin | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return cap?.Plugins?.QingyinPlayer as NativePlayerPlugin | undefined;
}

class AudioEngine {
  private handlers = new Set<Handler>();
  private audio: HTMLAudioElement | null = null;
  private native = getNativePlugin();
  private nativeBound = false;
  private currentUrl: string | null = null;
  private duration = 0;
  private lastPosition = 0;

  readonly isNative = Capacitor.isNativePlatform();
  /** 是否由原生 AVPlayer 接管（决定能否带 Referer 播放 B 站音频、能否上锁屏） */
  get usesNativePlayer() {
    return !!this.native;
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(e: EngineEvent) {
    this.handlers.forEach((h) => h(e));
  }

  private async bindNative() {
    if (this.nativeBound || !this.native) return;
    this.nativeBound = true;
    const plugin = this.native;
    await plugin.addListener('timeupdate', (d) => {
      if (typeof d.position === 'number') {
        this.lastPosition = d.position;
        this.emit({ type: 'timeupdate', position: d.position });
      }
    });
    await plugin.addListener('state', (d) => {
      if (d.state === 'playing') this.emit({ type: 'play' });
      else if (d.state === 'paused') this.emit({ type: 'pause' });
      else if (d.state === 'buffering') this.emit({ type: 'buffering', buffering: true });
      else if (d.state === 'ready' && typeof d.duration === 'number') {
        this.duration = d.duration;
        this.emit({ type: 'durationchange', duration: d.duration });
      }
    });
    await plugin.addListener('ended', () => this.emit({ type: 'ended' }));
    await plugin.addListener('remote', (d) => {
      if (d.action) {
        this.emit({ type: 'remote', action: d.action, position: d.position });
      }
    });
    await plugin.addListener('error', (d) => {
      this.emit({ type: 'error', message: d.message ?? '播放失败' });
    });
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('timeupdate', () => {
        this.lastPosition = el.currentTime;
        this.emit({ type: 'timeupdate', position: el.currentTime });
      });
      el.addEventListener('durationchange', () => {
        if (Number.isFinite(el.duration) && el.duration > 0) {
          this.duration = el.duration;
          this.emit({ type: 'durationchange', duration: el.duration });
        }
      });
      el.addEventListener('playing', () => this.emit({ type: 'play' }));
      el.addEventListener('pause', () => this.emit({ type: 'pause' }));
      el.addEventListener('waiting', () => this.emit({ type: 'buffering', buffering: true }));
      el.addEventListener('canplay', () => this.emit({ type: 'buffering', buffering: false }));
      el.addEventListener('ended', () => this.emit({ type: 'ended' }));
      el.addEventListener('error', () => {
        const code = el.error?.code;
        const map: Record<number, string> = {
          1: '加载被中止',
          2: '网络错误',
          3: '解码失败（音频格式不支持）',
          4: '音频地址无法访问（可能需要 Referer，请用 iOS App 播放）',
        };
        this.emit({ type: 'error', message: (code && map[code]) || '播放失败' });
      });
      this.audio = el;
    }
    return this.audio;
  }

  async load(
    url: string,
    headers: Record<string, string> | undefined,
    meta: NowPlayingMeta,
  ): Promise<void> {
    this.currentUrl = url;
    this.duration = meta.duration ?? 0;
    if (this.native) {
      await this.bindNative();
      const safe = filterNativeHeaders(headers);
      void logEvent('play.src', `${hostOf(url)} | ${Object.keys(safe).join(',')}`);
      await this.native.load({
        url,
        headers: safe,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        artwork: meta.artwork,
        duration: meta.duration,
      });
      await this.native.play();
      return;
    }
    const el = this.ensureAudio();
    el.src = url;
    el.load();
    try {
      await el.play();
    } catch (e) {
      // 自动播放被浏览器拦截时向上抛，UI 显示手动播放按钮
      if ((e as DOMException)?.name === 'NotAllowedError') {
        this.emit({ type: 'pause' });
        return;
      }
      this.emit({ type: 'error', message: (e as Error).message || '播放失败' });
    }
  }

  async play() {
    if (this.native) return this.native.play();
    if (this.audio) await this.audio.play();
  }

  async pause() {
    if (this.native) return this.native.pause();
    this.audio?.pause();
  }

  async stop() {
    if (this.native) return this.native.stop();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
  }

  async seek(position: number) {
    this.lastPosition = position;
    if (this.native) return this.native.seek({ position });
    if (this.audio) this.audio.currentTime = position;
  }

  async setVolume(volume: number) {
    if (this.native) return this.native.setVolume({ volume });
    if (this.audio) this.audio.volume = volume;
  }

  get position() {
    return this.lastPosition;
  }

  get knownDuration() {
    return this.duration;
  }

  get currentSrc() {
    return this.currentUrl;
  }

  async updateNowPlaying(meta: NowPlayingMeta & { playing: boolean }) {
    if (this.native) {
      try {
        await this.native.setNowPlaying(meta);
      } catch {
        /* 忽略 */
      }
    }
    updateWebMediaSession(meta);
  }
}

/** 浏览器 / 非原生环境下的锁屏与通知中心信息（iOS 上由原生插件接管，这里做兜底） */
export function updateWebMediaSession(meta: NowPlayingMeta & { playing?: boolean }) {
  const ms = navigator.mediaSession;
  if (!ms || typeof MediaMetadata === 'undefined') return;
  try {
    ms.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist ?? '',
      album: meta.album ?? '',
      artwork: meta.artwork
        ? [
            { src: meta.artwork, sizes: '512x512', type: 'image/jpeg' },
            { src: meta.artwork, sizes: '256x256', type: 'image/jpeg' },
          ]
        : [],
    });
    if (typeof meta.duration === 'number' && meta.duration > 0) {
      ms.setPositionState({
        duration: meta.duration,
        position: Math.min(meta.position ?? 0, meta.duration),
        playbackRate: meta.rate ?? 1,
      });
    }
    ms.playbackState = meta.playing === false ? 'paused' : 'playing';
  } catch {
    /* 某些浏览器不支持 */
  }
}

/** AVFoundation 不接受 Host/Connection 这类逐跳头，传了会直接「无法打开」 */
const DROP_NATIVE_HEADERS = new Set(['host', 'connection', 'accept-encoding', 'content-length', 'transfer-encoding']);

function filterNativeHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!v) continue;
    if (DROP_NATIVE_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid';
  }
}

export const engine = new AudioEngine();

export function bindMediaSessionHandlers(handlers: {
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
}) {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const safe = (fn: () => void) => () => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  };
  try {
    ms.setActionHandler('play', safe(handlers.play));
    ms.setActionHandler('pause', safe(handlers.pause));
    ms.setActionHandler('nexttrack', safe(handlers.next));
    ms.setActionHandler('previoustrack', safe(handlers.prev));
    ms.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') handlers.seek(details.seekTime);
    });
  } catch {
    /* ignore */
  }
}
