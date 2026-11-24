// 验证「按作者搜索 → 看该作者全部作品」这条链路
// 运行：node scripts/probe-artist.mjs [关键词]
const PLUGIN_URL =
  'https://raw.giteeusercontent.com/maotoumao/MusicFreePlugins/raw/v0.1/dist/bilibili/index.js';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const code = await (await fetch(PLUGIN_URL, { headers: { 'user-agent': UA } })).text();
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
new Function('module', 'exports', 'require', 'global', 'globalThis', 'process', code)(
  module,
  module.exports,
  (n) => requireMap[n] ?? (() => { throw new Error('no ' + n); })(),
  globalThis,
  globalThis,
  process,
);
const api = module.exports.default ?? module.exports;

const kw = process.argv[2] ?? '洛天依';
const artists = await api.search(kw, 1, 'artist');
console.log(`作者搜索「${kw}」→ ${artists?.data?.length ?? 0} 位，isEnd=${artists?.isEnd}`);
for (const a of (artists?.data ?? []).slice(0, 3)) {
  console.log(`   - ${a.name} mid=${a.id} 粉丝=${a.fans} 作品=${a.worksNum}`);
}
const first = artists?.data?.[0];
if (first) {
  const works = await api.getArtistWorks(first, 1, 'music');
  console.log(`\n${first.name} 的作品 → ${works?.data?.length ?? 0} 首，isEnd=${works?.isEnd}`);
  for (const t of (works?.data ?? []).slice(0, 5)) {
    console.log(`   - ${t.title} / id=${t.id} / ${t.artist}`);
  }
}
