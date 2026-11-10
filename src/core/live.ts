import type { LrcLine } from './lrc';
import { findLyricIndex } from './lrc';
import type { Track } from './types';

/**
 * 灵动岛 / 锁屏 Live Activity 桥接。
 * 只有原生 App（且 iOS 16.1+）才有 QingyinLive 插件，网页端自动降级为无操作。
 */

interface LiveBridge {
  start(opts: Record<string, unknown>): Promise<unknown>;
  update(opts: Record<string, unknown>): Promise<unknown>;
  end(): Promise<unknown>;
  supported(): Promise<{ supported?: boolean }>;
}

function bridge(): LiveBridge | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const plugin = cap?.Plugins?.QingyinLive as LiveBridge | undefined;
  return plugin && typeof plugin.start === 'function' ? plugin : null;
}

export function liveSupported(): boolean {
  return bridge() !== null;
}

let currentTrackId: string | null = null;

function lyricAt(lines: LrcLine[], position: number): { now: string; next: string } {
  if (!lines.length) return { now: '', next: '' };
  const index = findLyricIndex(lines, position);
  return {
    now: index >= 0 ? lines[index]?.text ?? '' : '',
    next: index + 1 < lines.length ? lines[index + 1]?.text ?? '' : '',
  };
}

export function startLive(track: Track, lines: LrcLine[], position: number, duration: number, playing: boolean) {
  const plugin = bridge();
  if (!plugin) return;
  const id = `${track.platform}:${track.id}`;
  currentTrackId = id;
  const { now, next } = lyricAt(lines, position);
  void plugin
    .start({
      trackId: id,
      title: track.title,
      artist: track.artist ?? '',
      coverUrl: track.artwork ?? '',
      lyric: now,
      nextLyric: next,
      position,
      duration,
      playing,
    })
    .catch(() => {});
}

export function updateLive(
  track: Track,
  lines: LrcLine[],
  position: number,
  duration: number,
  playing: boolean,
  force = false,
) {
  const plugin = bridge();
  if (!plugin) return;
  const id = `${track.platform}:${track.id}`;
  if (currentTrackId !== id) {
    startLive(track, lines, position, duration, playing);
    return;
  }
  const { now, next } = lyricAt(lines, position);
  void plugin
    .update({ lyric: now, nextLyric: next, position, duration, playing, force })
    .catch(() => {});
}

export function endLive() {
  const plugin = bridge();
  if (!plugin) return;
  currentTrackId = null;
  void plugin.end().catch(() => {});
}
