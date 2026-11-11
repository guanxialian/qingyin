import fs from 'node:fs';
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const code=fs.readFileSync(new URL('./bilibili-plugin.js',import.meta.url),'utf8');
const axios=(await import('axios')).default;
const cheerio=await import('cheerio');
const dayjs=(await import('dayjs')).default;
const he=await import('he');
const CryptoJS=(await import('crypto-js')).default;
const requireMap={axios,cheerio:{load:cheerio.load},dayjs,he:he.default??he,'crypto-js':CryptoJS,qs:{stringify:o=>new URLSearchParams(o).toString()}};
const module={exports:{}};
new Function('module','exports','require','global','globalThis','process',code)(module,module.exports,n=>requireMap[n],globalThis,globalThis,{env:{},platform:'node'});
const p=module.exports;

async function check(kw){
  const items=(await p.search(kw,1,'music'))?.data??[];
  console.log('\n##',kw,'first:',items[0]?.title);
  for(const it of items.slice(0,4)){
    try{
      const src=await p.getMediaSource(it,'super');
      const url=typeof src==='string'?src:src?.url;
      const host=new URL(url).host;
      const h={...(src?.headers??{}),'user-agent':UA};
      const r=await axios.get(url,{headers:{...h,range:'bytes=0-1023'},responseType:'arraybuffer',validateStatus:()=>true});
      const hdr=r.headers['content-range'];
      const total=hdr?Number(String(hdr).split('/')[1]):0;
      // 模拟 AVPlayer：请求末尾一段（moov 在尾部时必需）
      const tail=await axios.get(url,{headers:{...h,range:`bytes=${Math.max(0,total-2048)}-`},responseType:'arraybuffer',validateStatus:()=>true});
      const suf=await axios.get(url,{headers:{...h,range:'bytes=-1024'},responseType:'arraybuffer',validateStatus:()=>true});
      console.log(` ${String(it.title).slice(0,20)} | ${host.slice(0,34)} | head=${r.status} tail=${tail.status}/${tail.data.byteLength} suffix=${suf.status}/${suf.data?.byteLength} total=${total}`);
    }catch(e){ console.log(' ERR', String(e?.message).slice(0,60)); }
  }
}
await check('我的悲伤是水做的');
await check('洛天依');
