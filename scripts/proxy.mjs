// 浏览器调试用的本地代理：解决 B 站 CDN 需要 Referer/UA、以及跨域读取的问题
// 用法：node scripts/proxy.mjs  ->  在 App 设置页把「浏览器代理地址」设为 http://127.0.0.1:8787/
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/** 透传浏览器带来的 Range 等头，必要时补 Referer */
function buildHeaders(req, target) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (['host', 'origin', 'referer', 'accept-encoding', 'connection'].includes(k)) continue;
    if (typeof v === 'string') headers[k] = v;
  }
  headers['user-agent'] = req.headers['user-agent'] || UA;
  const host = target.hostname;
  if (/bilibili|hdslb|bilivideo|b23\.tv/.test(host)) {
    headers['referer'] = 'https://www.bilibili.com/';
    headers['origin'] = 'https://www.bilibili.com';
    if (!headers['accept']) headers['accept'] = '*/*';
  }
  return headers;
}

const server = http.createServer(async (req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges,content-type',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const raw = url.searchParams.get('url');
  if (!raw) {
    res.writeHead(400, { ...cors, 'content-type': 'text/plain; charset=utf-8' });
    res.end('用法：/ ?url=<编码后的地址>');
    return;
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    res.writeHead(400, { ...cors, 'content-type': 'text/plain; charset=utf-8' });
    res.end('URL 无效');
    return;
  }

  try {
    const upstream = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: buildHeaders(req, target),
      redirect: 'follow',
    });
    const out = { ...cors };
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
      const value = upstream.headers.get(key);
      if (value) out[key] = value;
    }
    res.writeHead(upstream.status, out);
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
  } catch (e) {
    res.writeHead(502, { ...cors, 'content-type': 'text/plain; charset=utf-8' });
    res.end('代理失败：' + (e?.message ?? e));
  }
});

server.listen(PORT, () => {
  console.log(`轻音代理已启动: http://127.0.0.1:${PORT}/?url=<地址>`);
});
