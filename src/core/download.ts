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

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** 把音频临时落到 Cache 目录，用于「在线放不了时先缓存再播」 */
export async function cacheSource(source: MediaSource, key: string): Promise<string> {
  if (!isNative) throw new Error('仅原生端支持缓存播放');
  const dir = 'qy-cache';
  const name = `c-${simpleHash(key)}${guessExt(source.url)}`;
  const res = await CapacitorHttp.request({
    url: source.url,
    method: 'GET',
    headers: source.headers ?? {},
    responseType: 'blob',
    connectTimeout: 30000,
    readTimeout: 120000,
  });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const base64 = String(res.data ?? '');
  if (!base64) throw new Error('没有拿到音频数据');
  await Filesystem.mkdir({ path: dir, directory: Directory.Cache, recursive: true }).catch(
    () => undefined,
  );
  await Filesystem.writeFile({
    path: `${dir}/${name}`,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  const uri = await Filesystem.getUri({ path: `${dir}/${name}`, directory: Directory.Cache });
  return uri.uri;
}

/** 临时缓存占用（原生端） */
export async function cacheUsage(): Promise<{ bytes: number; count: number }> {
  if (!Capacitor.isNativePlatform()) return { bytes: 0, count: 0 };
  try {
    const res = await Filesystem.readdir({ path: 'qy-cache', directory: Directory.Cache });
    let bytes = 0;
    for (const f of res.files) bytes += Number((f as { size?: number }).size ?? 0);
    return { bytes, count: res.files.length };
  } catch {
    return { bytes: 0, count: 0 };
  }
}

/** 清空临时缓存文件 */
export async function clearCacheFiles(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  const before = await cacheUsage();
  await Filesystem.rmdir({ path: 'qy-cache', directory: Directory.Cache, recursive: true }).catch(
    () => undefined,
  );
  return before.bytes;
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

/** 删除已下载的文件（只在原生端有实际文件） */
export async function removeDownloadFile(fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Filesystem.deleteFile({
    path: `轻音/${fileName}`,
    directory: Directory.Documents,
  }).catch(() => undefined);
}

export async function shareFile(fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const uri = await Filesystem.getUri({
    path: `轻音/${fileName}`,
    directory: Directory.Documents,
  });
  await Share.share({ title: fileName, url: uri.uri });
}
