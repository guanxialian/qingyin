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
const kw=process.argv[2]??'我的悲伤是水做的';
const res=await p.search(kw,1,'music');
const items=res?.data??[];
console.log('hits',items.length);
const it=items[0];
console.log(JSON.stringify({title:it?.title,artist:it?.artist,id:it?.id,aid:it?.aid,bvid:it?.bvid,cid:it?.cid,duration:it?.duration,album:it?.album},null,1).slice(0,600));
try{
  const src=await p.getMediaSource(it,'super');
  const url=typeof src==='string'?src:src?.url;
  console.log('url',url?.slice(0,160));
  console.log('headers',Object.keys(src?.headers??{}));
  const r=await axios.get(url,{headers:{...(src?.headers??{}),'user-agent':UA,range:'bytes=0-2047'},responseType:'arraybuffer',validateStatus:()=>true});
  const b=Buffer.from(r.data);
  console.log('status',r.status,'ctype',r.headers['content-type'],'len',b.length,'header',b.subarray(0,24).toString('hex'),'ascii',b.subarray(4,12).toString('latin1'));
}catch(e){console.log('ERR',e?.message);}
