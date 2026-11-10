import { httpRequest, toBase64Bytes, type HttpMethod } from '../http';

/**
 * 极简 axios 兼容层。MusicFree 插件大量使用 axios，这里只实现插件里出现的用法：
 * axios(config) / axios(url, config) / axios.get / axios.post / axios.request / axios.create
 * 返回对象形状：{ data, status, statusText, headers, config }
 */

export interface AxiosRequestConfig {
  url?: string;
  baseURL?: string;
  method?: string;
  headers?: Record<string, unknown>;
  params?: Record<string, unknown> | string;
  data?: unknown;
  timeout?: number;
  responseType?: string;
  [key: string]: unknown;
}

export interface AxiosResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: AxiosRequestConfig;
}

type AxiosInstance = {
  (urlOrConfig: string | AxiosRequestConfig, maybeConfig?: AxiosRequestConfig): Promise<
    AxiosResponse
  >;
  request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  head<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  create(config?: AxiosRequestConfig): AxiosInstance;
  defaults: Record<string, unknown>;
  isAxiosError: (e: unknown) => boolean;
};

function normalizeHeaders(headers?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
}

function joinUrl(base?: string, url?: string): string {
  if (!base) return url ?? '';
  if (!url) return base;
  if (/^https?:\/\//i.test(url)) return url;
  return base.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

async function dispatch<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const url = joinUrl(config.baseURL, config.url);
  const method = (config.method ?? 'GET').toUpperCase() as HttpMethod;
  const wantBinary = config.responseType === 'arraybuffer' || config.responseType === 'blob';
  const res = await httpRequest<unknown>({
    url,
    method,
    headers: normalizeHeaders(config.headers),
    params: config.params,
    data: config.data,
    responseType: wantBinary ? 'blob' : 'text',
    timeoutMs: typeof config.timeout === 'number' && config.timeout > 0 ? config.timeout : undefined,
  });

  let data: unknown = res.data;
  if (wantBinary) {
    if (typeof data === 'string') {
      // 原生 blob 返回 base64 字符串
      data = toBase64Bytes(data).buffer;
    } else if (data instanceof Blob) {
      data = await data.arrayBuffer();
    }
  }
  return {
    data: data as T,
    status: res.status,
    statusText: String(res.status),
    headers: res.headers,
    config,
  };
}

function createAxios(defaults: AxiosRequestConfig = {}): AxiosInstance {
  const instance = (async (urlOrConfig: string | AxiosRequestConfig, maybeConfig?: AxiosRequestConfig) => {
    const config: AxiosRequestConfig =
      typeof urlOrConfig === 'string'
        ? { ...defaults, ...maybeConfig, url: urlOrConfig }
        : { ...defaults, ...urlOrConfig };
    return dispatch(config);
  }) as AxiosInstance;

  instance.request = <T = unknown>(config: AxiosRequestConfig) =>
    dispatch<T>({ ...defaults, ...config });
  instance.get = <T = unknown>(url: string, config: AxiosRequestConfig = {}) =>
    dispatch<T>({ ...defaults, ...config, url, method: (config.method as string) ?? 'GET' });
  instance.delete = <T = unknown>(url: string, config: AxiosRequestConfig = {}) =>
    dispatch<T>({ ...defaults, ...config, url, method: 'DELETE' });
  instance.head = <T = unknown>(url: string, config: AxiosRequestConfig = {}) =>
    dispatch<T>({ ...defaults, ...config, url, method: 'HEAD' });
  instance.post = <T = unknown>(url: string, data?: unknown, config: AxiosRequestConfig = {}) =>
    dispatch<T>({ ...defaults, ...config, url, method: 'POST', data });
  instance.create = (config: AxiosRequestConfig = {}) => createAxios({ ...defaults, ...config });
  instance.defaults = { ...defaults };
  instance.isAxiosError = () => false;
  return instance;
}

// axios.post(url, data) 的 data 常常是 application/x-www-form-urlencoded 字符串，
// 此时若没有显式 content-type，补一个，避免部分接口拒绝。
const builtin = createAxios({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
});

export default builtin;
