// 带 buvid 再试一次空间接口
import CryptoJS from 'crypto-js';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const H = {
  'user-agent': UA,
  referer: 'https://www.bilibili.com/',
  origin: 'https://www.bilibili.com',
  accept: 'application/json, text/plain, */*',
};
const spi = await (await fetch('https://api.bilibili.com/x/frontend/finger/spi', { headers: { 'user-agent': UA } })).json();
const ck = `buvid3=${spi?.data?.b_3}; buvid4=${spi?.data?.b_4}`;
console.log('spi code', spi?.code, 'b_3', Boolean(spi?.data?.b_3));

const TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: { ...H, cookie: ck } })).json();
const f = (u) => (u ?? '').split('/').pop().split('.')[0];
const key = (() => { let s=''; for (const i of TAB) s += (f(nav?.data?.wbi_img?.img_url)+f(nav?.data?.wbi_img?.sub_url)).charAt(i); return s.slice(0,32); })();
const params = { mid: '546195', ps: 10, tid: 0, pn: 1, keyword: '', order: 'pubdate', platform: 'web', web_location: 1550101, wts: Math.floor(Date.now()/1000) };
const q = Object.keys(params).sort().map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]).replace(/[!'()*]/g,''))}`).join('&');
const w_rid = CryptoJS.MD5(q + key).toString();
const r = await fetch(`https://api.bilibili.com/x/space/wbi/arc/search?${q}&w_rid=${w_rid}`, { headers: { ...H, cookie: ck, referer: 'https://space.bilibili.com/546195/video' } });
const j = await r.json().catch(()=>null);
console.log('status', r.status, 'code', j?.code, 'msg', j?.message, 'n', j?.data?.list?.vlist?.length);
for (const v of (j?.data?.list?.vlist ?? []).slice(0,3)) console.log(' -', v.title);
