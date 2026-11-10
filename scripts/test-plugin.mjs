// 用真实 B 站接口验证音源插件链路：search -> getMediaSource -> 实际取流
// 运行：node scripts/test-plugin.mjs
const PLUGIN_URL =
  'https://raw.giteeusercontent.com/maotoumao/MusicFreePlugins/raw/v0.1/dist/bilibili/index.js';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function main() {
  console.log('1) 拉取插件代码 …');
  const res = await fetch(PLUGIN_URL, { headers: { 'user-agent': UA } });
  const code = await res.text();
  console.log(`   状态 ${res.status}，大小 ${(code.length / 1024).toFixed(1)} KB`);
  if (!res.ok || code.length < 1000) throw new Error('插件代码下载失败');

  console.log('2) 准备 require 依赖 …');
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
  fn(
    module,
    module.exports,
    (name) => {
      if (name in requireMap) return requireMap[name];
      throw new Error('未实现的模块: ' + name);
    },
    globalThis,
    globalThis,
    process,
  );
  const api = module.exports.default ?? module.exports;
  console.log(`   平台=${api.platform} 版本=${api.version} 作者=${api.author}`);
  console.log(`   支持方法: ${Object.keys(api).join(', ')}`);

  console.log('3) 搜索 …');
  const kw = '洛天依';
  const search = await api.search(kw, 1, 'music');
  const list = search?.data ?? [];
  console.log(`   命中 ${list.length} 首，isEnd=${search?.isEnd}`);
  if (!list.length) throw new Error('搜索无结果');
  for (const it of list.slice(0, 3)) {
    console.log(`   - ${it.title} / ${it.artist} / ${it.album ?? '-'} / id=${it.id}`);
  }

  const track = list[0];
  console.log('4) 取播放地址 …');
  for (const q of ['super', 'high', 'standard']) {
    try {
      const src = await api.getMediaSource(track, q);
      if (!src?.url) {
        console.log(`   ${q}: 无地址`);
        continue;
      }
      console.log(`   ${q}: ${src.url.slice(0, 90)}…`);
      console.log(`   headers: ${JSON.stringify(Object.keys(src.headers ?? {}))}`);

      console.log('5) 实际取流（Range: bytes=0-1023）…');
      const head = await fetch(src.url, {
        headers: { ...(src.headers ?? {}), Range: 'bytes=0-1023' },
      });
      const buf = await head.arrayBuffer();
      console.log(
        `   HTTP ${head.status} content-type=${head.headers.get('content-type')} 收到 ${buf.byteLength} 字节`,
      );
      if (head.ok && buf.byteLength > 0) {
        console.log('\n✅ 链路打通：搜索 + 音源 + 实际音频流');
        return;
      }
    } catch (e) {
      console.log(`   ${q}: 失败 ${e.message}`);
    }
  }
  throw new Error('所有音质都取流失败');
}

main().catch((e) => {
  console.error('\n❌ 失败：', e?.message ?? e);
  process.exit(1);
});
