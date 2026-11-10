import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * 统一网络层：
 * - iOS/Android 原生环境：走 CapacitorHttp（原生请求，不受 CORS 限制，可透传 Referer/UA）
 * - 浏览器：走 fetch；如果配置了代理地址，则先经过代理服务（见 scripts/proxy.mjs）
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';

export interface HttpRequestOptions {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, unknown> | string;
  data?: unknown;
  /** text：原样返回字符串；json：尝试解析；blob：二进制 */
  responseType?: 'text' | 'json' | 'blob';
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  url: string;
}

export const isNative = Capacitor.isNativePlatform();

let proxyBase: string | null = null;
/** 浏览器模式下使用的代理地址，例如 http://192.168.1.10:8787/?url= */
export function setProxyBase(base: string | null) {
  proxyBase = base && base.trim() ? base.trim() : null;
}
export function getProxyBase() {
  return proxyBase;
}

function buildUrl(url: string, params?: Record<string, unknown> | string): string {
  if (!params) return url;
  if (typeof params === 'string') {
    if (!params) return url;
    const clean = params.startsWith('?') ? params.slice(1) : params;
    return url + (url.includes('?') ? '&' : '?') + clean;
  }
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v.forEach((item) => usp.append(k, String(item)));
    } else {
      usp.append(k, String(v));
    }
  }
  const qs = usp.toString();
  if (!qs) return url;
  return url + (url.includes('?') ? '&' : '?') + qs;
}

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const c = trimmed[0];
  if (c !== '{' && c !== '[' && c !== '"') return text;
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

/** 浏览器里 fetch 不允许设置的请求头，经代理时用 x-qy-hdr 转发给代理服务 */
const FORBIDDEN_HEADERS = new Set([
  'cookie',
  'user-agent',
  'referer',
  'origin',
  'host',
  'accept-encoding',
  'connection',
]);

function packProxyHeaders(headers: Record<string, string> | undefined) {
  const pass: Record<string, string> = {};
  const packed: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (FORBIDDEN_HEADERS.has(k.toLowerCase())) packed[k] = v;
    else pass[k] = v;
  }
  if (Object.keys(packed).length) {
    // 用 encodeURIComponent 而非 btoa，避免中文/二进制头触发异常
    pass['x-qy-hdr'] = encodeURIComponent(JSON.stringify(packed));
  }
  return pass;
}

async function webRequest<T>(opts: HttpRequestOptions): Promise<HttpResponse<T>> {
  const target = buildUrl(opts.url, opts.params);
  const finalUrl = proxyBase ? proxyBase + encodeURIComponent(target) : target;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25000);
  try {
    const res = await fetch(finalUrl, {
      method: opts.method ?? 'GET',
      headers: proxyBase ? packProxyHeaders(opts.headers) : opts.headers,
      body:
        opts.data === undefined
          ? undefined
          : typeof opts.data === 'string'
            ? opts.data
            : JSON.stringify(opts.data),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'follow',
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    if (opts.responseType === 'blob') {
      const blob = await res.blob();
      return { status: res.status, data: blob as T, headers, url: res.url || finalUrl };
    }
    const text = await res.text();
    const data =
      opts.responseType === 'json' || /json|javascript|text\/plain/i.test(headers['content-type'] ?? '')
        ? (parseMaybeJson(text) as T)
        : (text as T);
    return { status: res.status, data, headers, url: res.url || finalUrl };
  } finally {
    clearTimeout(timer);
  }
}

async function nativeRequest<T>(opts: HttpRequestOptions): Promise<HttpResponse<T>> {
  const url = buildUrl(opts.url, opts.params);
  const res = await CapacitorHttp.request({
    url,
    method: opts.method ?? 'GET',
    headers: opts.headers ?? {},
    data: opts.data,
    responseType: opts.responseType === 'blob' ? 'blob' : 'text',
    connectTimeout: opts.timeoutMs ?? 25000,
    readTimeout: opts.timeoutMs ?? 25000,
    shouldEncodeUrlParams: false,
  });
  const headers: Record<string, string> = {};
  Object.entries(res.headers ?? {}).forEach(([k, v]) => {
    headers[k.toLowerCase()] = String(v);
  });
  let data = res.data as unknown;
  if (opts.responseType !== 'blob' && typeof data === 'string') {
    data = parseMaybeJson(data);
  }
  return { status: res.status, data: data as T, headers, url: res.url || url };
}

export async function httpRequest<T = unknown>(
  opts: HttpRequestOptions,
): Promise<HttpResponse<T>> {
  const res = isNative ? await nativeRequest<T>(opts) : await webRequest<T>(opts);
  if (res.status >= 400) {
    const err = new Error(`HTTP ${res.status} ${opts.url}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res;
}

/** 把响应统一成字符串（部分接口返回 Buffer/对象） */
export function asText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data == null) return '';
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function toBase64Bytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new Error('无法识别的二进制响应');
}
