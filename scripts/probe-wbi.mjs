// 自己签名调 UP 主投稿列表（不依赖插件的 cookie 流程）
import CryptoJS from 'crypto-js';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const H = {
  'user-agent': UA,
  referer: 'https://space.bilibili.com/',
  origin: 'https://space.bilibili.com',
  accept: 'application/json, text/plain, */*',
};

const TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function mixinKey(orig) {
  let s = '';
  for (const i of TAB) s += orig.charAt(i);
  return s.slice(0, 32);
}

async function signed(params) {
  const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: H })).json();
  const img = nav?.data?.wbi_img?.img_url ?? '';
  const sub = nav?.data?.wbi_img?.sub_url ?? '';
  const orig = img.split('/').pop().split('.')[0] + sub.split('/').pop().split('.')[0];
  const key = mixinKey(orig);
  const all = { ...params, wts: Math.floor(Date.now() / 1000) };
  const q = Object.keys(all)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(all[k]).replace(/[!'()*]/g, ''))}`)
    .join('&');
  return { q, w_rid: CryptoJS.MD5(q + key).toString() };
}

const mid = process.argv[2] ?? '36081646';
const { q, w_rid } = await signed({
  mid,
  ps: 30,
  tid: 0,
  pn: 1,
  keyword: '',
  order: 'pubdate',
  platform: 'web',
  web_location: 1550101,
});
const url = `https://api.bilibili.com/x/space/wbi/arc/search?${q}&w_rid=${w_rid}`;
const r = await fetch(url, { headers: { ...H, referer: `https://space.bilibili.com/${mid}/video` } });
const j = await r.json();
console.log('status', r.status, 'code', j.code, 'msg', j.message);
console.log('count', j?.data?.page?.count, 'n', j?.data?.list?.vlist?.length);
for (const v of (j?.data?.list?.vlist ?? []).slice(0, 3)) console.log(' -', v.title, v.bvid);
