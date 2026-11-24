// 探测：B 站搜索接口在无 cookie 下的可用性 / 作者搜索 / 作者作品列表
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const HEADERS = {
  'user-agent': UA,
  referer: 'https://search.bilibili.com/',
  origin: 'https://search.bilibili.com',
  accept: 'application/json, text/plain, */*',
};

async function rawSearch(keyword, searchType, page = 1) {
  const u = new URL('https://api.bilibili.com/x/web-interface/search/type');
  const params = {
    search_type: searchType,
    keyword,
    page: String(page),
    page_size: '20',
    platform: 'pc',
    highlight: '1',
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: HEADERS });
  const json = await res.json().catch(() => null);
  return { status: res.status, code: json?.code, num: json?.data?.numResults, result: json?.data?.result };
}

const kw = process.argv[2] ?? '我的悲伤是水做的';
for (const t of ['video', 'bili_user']) {
  const r = await rawSearch(kw, t);
  console.log(`[${t}] status=${r.status} code=${r.code} num=${r.num} n=${r.result?.length ?? 0}`);
  for (const it of (r.result ?? []).slice(0, 3)) {
    console.log('   ', it.title ?? it.uname, '|', it.author ?? it.mid, '|', it.bvid ?? it.videos);
  }
}
