// 抽样验证：B 站音源对多少首歌能成功取到播放地址，失败的具体原因是什么
// 运行：node scripts/probe-playable.mjs
import fs from 'node:fs';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const code = fs.readFileSync(new URL('./bilibili-plugin.js', import.meta.url), 'utf8');
const axios = (await import('axios')).default;
const cheerio = await import('cheerio');
const dayjs = (await import('dayjs')).default;
const he = await import('he');
const CryptoJS = (await import('crypto-js')).default;

const requireMap = {
  axios,
  cheerio: { load: cheerio.load },
  dayjs,
  he: he.default ?? he,
  'crypto-js': CryptoJS,
  qs: { stringify: (o) => new URLSearchParams(o).toString() },
};

const module = { exports: {} };
const fn = new Function('module', 'exports', 'require', 'global', 'globalThis', 'process', code);
fn(module, module.exports, (n) => requireMap[n], globalThis, globalThis, {
  env: {},
  platform: 'node',
});
const plugin = module.exports;

async function probe(keyword) {
  const res = await plugin.search(keyword, 1, 'music');
  const list = (res?.data ?? []).slice(0, 8);
  console.log(`\n=== 关键词「${keyword}」共 ${res?.data?.length ?? 0} 首，抽测 ${list.length} ===`);
  for (const item of list) {
    const tag = `${item.title?.slice(0, 26)} | ${item.artist} | ${item.id}`;
    try {
      const src = await plugin.getMediaSource(item, 'super');
      const url = typeof src === 'string' ? src : src?.url;
      if (!url) {
        console.log('  ✗ 无地址', tag);
        continue;
      }
      const head = await axios.get(url, {
        headers: { ...(src?.headers ?? {}), 'user-agent': UA, range: 'bytes=0-1023' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      console.log(`  ${head.status === 206 || head.status === 200 ? '✓' : '✗'} ${head.status}`, tag, `| ctype=${head.headers['content-type']}`);
    } catch (e) {
      console.log('  ✗ 异常', tag, '|', (e?.message ?? String(e)).slice(0, 80));
    }
  }
}

for (const kw of ['洛天依', '权御天下', '周杰伦', '热门音乐榜单']) {
  await probe(kw);
}
