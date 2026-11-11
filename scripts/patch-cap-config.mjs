// cap sync 之后把本地 App 内的原生插件补进 packageClassList，
// 否则 Capacitor 在运行时找不到 QingyinLivePlugin，JS 侧永远是 null。
// 用法（仓库根执行）：node scripts/patch-cap-config.mjs
import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('ios/App/App/capacitor.config.json');
const PLUGINS = ['QingyinPlayerPlugin', 'QingyinLivePlugin'];

if (!fs.existsSync(target)) {
  console.error('找不到', target, '（是不是还没跑 cap sync ios？）');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(target, 'utf8'));
config.packageClassList = Array.from(new Set([...(config.packageClassList ?? []), ...PLUGINS]));
fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
console.log('packageClassList =', config.packageClassList.join(', '));
