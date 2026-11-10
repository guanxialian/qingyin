// 通过 GitHub API 更新仓库文件（当 github.com:443 被墙、无法 git push 时使用）
// 用法: node scripts/gh-put.mjs <repoPath> [commitMessage]
// 环境变量 GH_TOKEN 必填；GH_REPO 形如 guanxialian/qingyin
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO;
if (!token || !repo) {
  console.error('need GH_TOKEN and GH_REPO');
  process.exit(1);
}
const api = 'https://api.github.com';
const headers = {
  authorization: `token ${token}`,
  'user-agent': 'qy-gh-put',
  accept: 'application/vnd.github+json',
};

async function getFile(repoPath) {
  const r = await fetch(`${api}/repos/${repo}/contents/${encodeURI(repoPath)}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${repoPath} -> ${r.status} ${await r.text()}`);
  return r.json();
}

export async function putFile(repoPath, message, contentBuffer, branch = 'main') {
  const existing = await getFile(repoPath);
  const body = {
    message,
    branch,
    content: contentBuffer.toString('base64'),
    ...(existing?.sha ? { sha: existing.sha } : {}),
  };
  const r = await fetch(`${api}/repos/${repo}/contents/${encodeURI(repoPath)}`, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`PUT ${repoPath} -> ${r.status} ${text}`);
  const j = JSON.parse(text);
  return j.commit?.sha;
}

export async function putDir(dir, message, branch = 'main') {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const abs = path.join(entry.parentPath ?? entry.path, entry.name);
    const rel = path.relative(dir, abs).split(path.sep).join('/');
    if (rel.startsWith('node_modules/') || rel.startsWith('dist/')) continue;
    const sha = await putFile(rel, message, fs.readFileSync(abs), branch);
    results.push([rel, sha]);
    console.log('put', rel, sha?.slice(0, 7));
  }
  return results;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node scripts/gh-put.mjs <repoPath> [message]');
    process.exit(1);
  }
  const content = fs.readFileSync(target);
  const sha = await putFile(
    target.split(path.sep).join('/'),
    process.argv[3] ?? `chore: update ${target}`,
    content,
  );
  console.log('commit', sha);
}
