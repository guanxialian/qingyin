// 用 GitHub API 找到最近一次成功的 Build iOS IPA 运行，下载未签名 IPA 到 dist-ipa/
// 用法: GH_TOKEN=... node scripts/fetch-ipa.mjs [runId]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO ?? 'guanxialian/qingyin';
if (!token) {
  console.error('need GH_TOKEN');
  process.exit(1);
}
const api = 'https://api.github.com';
const headers = {
  authorization: `token ${token}`,
  'user-agent': 'qy-fetch-ipa',
  accept: 'application/vnd.github+json',
};

async function json(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

const runId = process.argv[2];
let run;
if (runId) {
  run = await json(`${api}/repos/${repo}/actions/runs/${runId}`);
} else {
  const list = await json(`${api}/repos/${repo}/actions/runs?per_page=20`);
  run = list.workflow_runs.find((r) => r.name === 'Build iOS IPA' && r.conclusion === 'success');
  if (!run) {
    console.error('no successful Build iOS IPA run yet');
    const latest = list.workflow_runs.find((r) => r.name === 'Build iOS IPA');
    if (latest) console.error('latest:', latest.id, latest.status, latest.conclusion);
    process.exit(2);
  }
}
console.log('run', run.id, run.status, run.conclusion);

const arts = await json(`${api}/repos/${repo}/actions/runs/${run.id}/artifacts`);
const art = arts.artifacts.find((a) => a.name.includes('ipa'));
if (!art) {
  console.error('no ipa artifact', arts.artifacts.map((a) => a.name));
  process.exit(3);
}
console.log('artifact', art.name, art.size_in_bytes, 'bytes');

const zipRes = await fetch(art.archive_download_url, { headers });
if (!zipRes.ok) throw new Error(`download -> ${zipRes.status}`);
const zipBuf = Buffer.from(await zipRes.arrayBuffer());

const outDir = path.resolve('dist-ipa');
fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, `${art.name}.zip`);
fs.writeFileSync(zipPath, zipBuf);
console.log('saved', zipPath, zipBuf.length, 'bytes');
