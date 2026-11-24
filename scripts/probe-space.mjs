// 试几种「取 UP 投稿」的端点，看哪个能过风控
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_DESK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(label, url, headers) {
  try {
    const r = await fetch(url, { headers });
    const t = await r.text();
    let code = null;
    try { code = JSON.parse(t)?.code; } catch {}
    const n =
      JSON.parse(t || '{}')?.data?.list?.vlist?.length ??
      JSON.parse(t || '{}')?.data?.archives?.length ??
      JSON.parse(t || '{}')?.data?.item?.length ??
      null;
    console.log(`${label}: status=${r.status} code=${code} n=${n} head=${t.slice(0, 90).replace(/\s+/g, ' ')}`);
  } catch (e) {
    console.log(`${label}: ERR ${e.message}`);
  }
}

await probe('old space (mid 546195)', 'https://api.bilibili.com/x/space/arc/search?mid=546195&pn=1&ps=10&order=pubdate', {
  'user-agent': UA_DESK,
  referer: 'https://space.bilibili.com/546195/video',
  origin: 'https://space.bilibili.com',
  accept: 'application/json, text/plain, */*',
});
await sleep(3000);
await probe('search video 洛天依', 'https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=%E6%B4%9B%E5%A4%A9%E4%BE%9D&page=1', {
  'user-agent': UA,
  referer: 'https://search.bilibili.com/',
  accept: 'application/json',
});
