// 用 Playwright 驱动本机 Edge，做真实布局/交互验证（不起后台服务：静态站点与代理都在本进程内）
// 用法：node scripts/e2e.mjs
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 5273;
const PLUGIN_URL =
  'https://raw.giteeusercontent.com/maotoumao/MusicFreePlugins/raw/v0.1/dist/bilibili/index.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function proxyUpstreamOnce(urlStr, extra = {}) {
  const u = new URL(urlStr);
  const headers = {
    'user-agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    accept: '*/*',
    // 不让上游压缩：插件会带 accept-encoding: gzip，代理不透传、也不解压会导致 JSON 解析失败
    'accept-encoding': 'identity',
  };
  // 插件自己的头优先（含它自己换来的 cookie / 专用 UA）
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'string' && v) headers[k.toLowerCase()] = v;
  }
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let body = Buffer.concat(chunks);
          const enc = String(res.headers['content-encoding'] ?? '');
          try {
            if (enc.includes('gzip')) body = zlib.gunzipSync(body);
            else if (enc.includes('br')) body = zlib.brotliDecompressSync(body);
            else if (enc.includes('deflate')) body = zlib.inflateSync(body);
          } catch {
            /* 解压失败就原样返回 */
          }
          const outHeaders = { ...res.headers };
          delete outHeaders['content-encoding'];
          outHeaders['content-length'] = String(body.byteLength);
          resolve({ status: res.statusCode ?? 502, headers: outHeaders, body });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('upstream timeout')));
    req.end();
  });
}

/** 跟随最多 5 次 3xx（B 站 api 有时会 307 到别的节点） */
async function proxyUpstream(urlStr, extra = {}) {
  let url = urlStr;
  for (let i = 0; i < 5; i++) {
    const up = await proxyUpstreamOnce(url, extra);
    if (up.status >= 300 && up.status < 400 && up.headers.location) {
      url = new URL(up.headers.location, url).toString();
      continue;
    }
    return up;
  }
  return proxyUpstreamOnce(url, extra);
}

function decodeQyHdr(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(String(raw)));
  } catch {
    return {};
  }
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const now = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    if (now.pathname.startsWith('/__p/')) {
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,HEAD,OPTIONS',
        'access-control-expose-headers': 'content-length,content-range,accept-ranges',
      };
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors).end();
        return;
      }
      const target = now.searchParams.get('url');
      if (!target) {
        res.writeHead(400).end('missing url');
        return;
      }
      const extra = decodeQyHdr(req.headers['x-qy-hdr']);
      try {
        const up = await proxyUpstream(target, extra);
        const out = {};
        for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
          const v = up.headers[k];
          if (v) out[k] = Array.isArray(v) ? v.join(',') : v;
        }
        out['access-control-allow-origin'] = '*';
        out['access-control-expose-headers'] = 'content-length,content-range,accept-ranges';
        res.writeHead(up.status, out).end(up.body);
      } catch (e) {
        res.writeHead(502, { 'access-control-allow-origin': '*' }).end(String(e?.message ?? e));
      }
      return;
    }
    let file = path.join(DIST, decodeURIComponent(now.pathname));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (now.pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function collectOverflow() {
  const vw = window.innerWidth;
  const out = [];
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.width > vw + 1) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === 'string' ? el.className : '',
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
  }
  return {
    innerWidth: vw,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflow: out.slice(0, 15),
  };
}

async function main() {
  const server = await startServer();
  const proxyBase = `http://127.0.0.1:${PORT}/__p/?url=`;

  console.log('1) 下载插件代码 …');
  const code = await (await fetch(PLUGIN_URL)).text();
  console.log(`   ${(code.length / 1024).toFixed(1)} KB`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   [pageerror]', e.stack ?? e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('   [console.error]', m.text().slice(0, 200));
  });

  await ctx.addInitScript(
    ({ code, proxyBase }) => {
      if (!localStorage.getItem('qingyin.seeded')) {
        localStorage.setItem('qingyin.seeded', '1');
        localStorage.setItem(
          'qingyin.settings',
          JSON.stringify({ quality: 'super', proxy: proxyBase, lyricOffset: 0 }),
        );
        localStorage.setItem(
          'qingyin.plugins',
          JSON.stringify([
            {
              key: 'bilibili@seed',
              code,
              name: '哔哩哔哩',
              platform: 'bilibili',
              version: '0.3.0',
              author: '猫头猫',
              srcUrl: 'https://gitee.com/maotoumao/MusicFreePlugins',
              source: 'url',
              addedAt: Date.now(),
              enabled: true,
            },
          ]),
        );
      }
    },
    { code, proxyBase },
  );

  const base = `http://127.0.0.1:${PORT}/`;
  console.log('2) 打开首页 …');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  console.log('   布局:', JSON.stringify(await page.evaluate(collectOverflow)));
  await page.screenshot({ path: path.join(ROOT, 'shot-e2e-home.png') });

  console.log('3) 等发现页加载 …');
  await page.waitForTimeout(6000);
  const discover = await page.evaluate(() => ({
    text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 400),
    rows: document.querySelectorAll('.row, .card, .tile').length,
  }));
  console.log('   发现页:', JSON.stringify(discover));
  await page.screenshot({ path: path.join(ROOT, 'shot-e2e-discover.png') });

  console.log('4) 搜索 …');
  await page.getByRole('button', { name: '搜索', exact: false }).last().click();
  await page.waitForTimeout(400);
  const input = page.locator('input').first();
  await input.fill('权御天下');
  await input.press('Enter');
  await page.waitForTimeout(7000);
  const searchInfo = await page.evaluate(() => ({
    rows: document.querySelectorAll('.row').length,
    text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 500),
  }));
  console.log('   搜索页:', JSON.stringify(searchInfo));
  await page.screenshot({ path: path.join(ROOT, 'shot-e2e-search.png') });

  console.log('4.5) 直接验证代理链路 …');
  const probe = await page.evaluate(async (pb) => {
    const target = 'https://api.bilibili.com/x/web-interface/view?bvid=BV14k4q6HErD';
    const r = await fetch(pb + encodeURIComponent(target), {
      headers: { 'user-agent': 'Mozilla/5.0', accept: '*/*', 'accept-encoding': 'gzip, deflate, br' },
    });
    const t = await r.text();
    return { status: r.status, head: t.slice(0, 200) };
  }, proxyBase);
  console.log('   代理返回:', JSON.stringify(probe));

  console.log('4.6) 验证网易云歌词链路 …');
  const ly = await page.evaluate(async (pb) => {
    const t = 'https://music.163.com/api/search/get?type=1&offset=0&limit=3&s=' + encodeURIComponent('权御天下');
    const packed = encodeURIComponent(JSON.stringify({ 'user-agent': 'Mozilla/5.0', referer: 'https://music.163.com/', cookie: 'appver=8.0.0; os=pc' }));
    const r = await fetch(pb + encodeURIComponent(t), { headers: { 'x-qy-hdr': packed } });
    return { status: r.status, head: (await r.text()).slice(0, 200) };
  }, proxyBase);
  console.log('   网易云:', JSON.stringify(ly));

  console.log('4.7) 直接调用歌词兜底 …');
  const lore = await page.evaluate(async () => {
    const raw = await window.__qy.fetchFallbackLyric('【洛天依古风原创曲】权御天下【原创PV付】', '没有龟壳的乌龟');
    const lines = raw ? window.__qy.parseLrc(raw.split(/\n\s*\n/)[0]) : [];
    return { rawLen: raw.length, head: raw.slice(0, 80), lines: lines.length, sample: lines[0] };
  });
  console.log('   歌词:', JSON.stringify(lore));

  console.log('5) 点第一首播放 …');
  const row = page.locator('.row').first();
  if (!(await row.count())) {
    console.log('   没有可点的行');
    await ctx.close();
    await browser.close();
    server.close();
    return;
  }
  await row.click();
  await page.waitForTimeout(7000);
  const player = await page.evaluate(() => {
    const q = window.__qy;
    const st = q ? q.getState() : null;
    return {
      current: st?.current?.title ?? null,
      artist: st?.current?.artist ?? null,
      playing: st?.playing ?? null,
      preparing: st?.preparing ?? null,
      position: st?.position ?? null,
      duration: st?.duration ?? null,
      quality: st?.quality ?? null,
      lyricLines: Array.isArray(st?.lyrics) ? st.lyrics.length : (st?.lyrics?.lines?.length ?? 0),
      text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 240),
    };
  });
  console.log('   播放状态:', JSON.stringify(player));
  await page.screenshot({ path: path.join(ROOT, 'shot-e2e-player.png') });

  console.log('6) 打开播放页 …');
  await page.locator('.mini').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ROOT, 'shot-e2e-sheet.png') });
  const st2 = await page.evaluate(() => {
    const st = window.__qy?.getState();
    return { position: st?.position, playing: st?.playing, lyricLines: Array.isArray(st?.lyrics) ? st.lyrics.length : 0 };
  });
  console.log('   播放页状态:', JSON.stringify(st2));

  console.log('7) 切到歌词视图 …');
  await page.locator('.cover-big').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ROOT, 'shot-e2e-lyric.png') });

  await ctx.close();
  await browser.close();
  server.close();
  console.log('\n✅ e2e 完成');
}

main().catch(async (e) => {
  console.error('\n❌ e2e 失败：', e?.message ?? e);
  process.exit(1);
});
