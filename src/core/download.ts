import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { MediaSource, Quality, Track } from './types';
import { isNative } from './http';

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'track';
}

function guessExt(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(/\.(m4a|mp3|flac|aac|wav|ogg|m4s)$/i);
  if (!m) return '.m4a';
  const ext = m[1].toLowerCase();
  return ext === 'm4s' ? '.m4a' : `.${ext}`;
}

async function saveNative(
  source: MediaSource,
  fileName: string,
): Promise<{ path: string; uri?: string }> {
  const res = await CapacitorHttp.request({
    url: source.url,
    method: 'GET',
    headers: source.headers ?? {},
    responseType: 'blob',
    connectTimeout: 30000,
    readTimeout: 120000,
  });
  if (res.status >= 400) throw new Error(`下载失败：HTTP ${res.status}`);
  const base64 = String(res.data ?? '');
  if (!base64) throw new Error('下载到的文件为空');
  await Filesystem.mkdir({ path: '轻音', directory: Directory.Documents, recursive: true }).catch(
    () => undefined,
  );
  const saved = await Filesystem.writeFile({
    path: `轻音/${fileName}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  const uri = await Filesystem.getUri({
    path: `轻音/${fileName}`,
    directory: Directory.Documents,
  }).catch(() => null);
  return { path: saved.uri, uri: uri?.uri };
}

async function saveWeb(source: MediaSource, fileName: string): Promise<string> {
  const res = await fetch(source.url, { headers: source.headers });
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return fileName;
}

export interface DownloadResult {
  fileName: string;
  uri?: string;
  path?: string;
}

export async function downloadTrack(
  track: Track,
  source: MediaSource,
  quality: Quality,
): Promise<DownloadResult> {
  const title = sanitizeFileName(`${track.title} - ${track.artist ?? ''}`);
  const fileName = title + guessExt(source.url);
  if (isNative || Capacitor.isNativePlatform()) {
    const saved = await saveNative(source, fileName);
    return { fileName, uri: saved.uri, path: saved.path };
  }
  void quality;
  await saveWeb(source, fileName);
  return { fileName };
}

export async function shareFile(fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const uri = await Filesystem.getUri({
    path: `轻音/${fileName}`,
    directory: Directory.Documents,
  });
  await Share.share({ title: fileName, url: uri.uri });
}
