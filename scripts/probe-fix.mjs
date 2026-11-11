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
const P2P=/(mcdn\.bilivideo\.cn|mountaintoys\.cn)/i;
const isP2P=u=>{try{return P2P.test(new URL(u).host)}catch{return false}};
const tail=async(u,h)=>{try{const r=await axios.get(u,{headers:{...h,range:'bytes=-1'},responseType:'arraybuffer',validateStatus:()=>true});return r.status===206}catch{return false}};
async function fix(item,src){
  if(!isP2P(src.url)) return src;
  const h={...src.headers}; delete h.host; h['user-agent']=UA; h.referer='https://www.bilibili.com/video/'+(item.bvid??item.aid);
  const view=await axios.get('https://api.bilibili.com/x/web-interface/view',{params:{bvid:item.bvid},headers:h}).then(r=>r.data);
  const cid=item.cid??view.data?.cid;
  const res=await axios.get('https://api.bilibili.com/x/player/playurl',{params:{bvid:item.bvid,cid,fnval:16},headers:h}).then(r=>r.data);
  const audios=res.data?.dash?.audio??[];
  const same=audios.find(a=>a.baseUrl===src.url);
  const ordered=same?[same,...audios.filter(a=>a!==same)]:audios;
  const urls=[];for(const a of ordered){urls.push(a.baseUrl,...(a.backupUrl??[]))}
  const cands=[...new Set(urls)].filter(u=>u&&u!==src.url&&!isP2P(u));
  for(const u of cands.slice(0,6)){ if(await tail(u,h)) return {url:u,headers:{...h,host:new URL(u).host},tried:cands.indexOf(u)+1}; }
  return src;
}
for(const kw of ['我的悲伤是水做的','洛天依']){
  const items=(await p.search(kw,1,'music'))?.data??[];
  console.log('\n##',kw);
  for(const it of items.slice(0,3)){
    const src=await p.getMediaSource(it,'super');
    const before=new URL(src.url).host;
    const fixed=await fix(it,src);
    const after=new URL(fixed.url).host;
    const ok=await tail(fixed.url,fixed.headers);
    console.log(` ${String(it.title).slice(0,18)} | ${before.slice(0,30)} -> ${after.slice(0,30)} | tail=${ok} | tried=${fixed.tried??0}`);
  }
}
