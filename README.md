# 轻音 · 精简音源播放器

一个能装到 iPhone 上的极简音乐播放器：**导入音源插件 → 搜索 → 播放 → 歌词 → 下载 → 锁屏信息**。

- 音源基于 [MusicFree 插件规范](https://github.com/maotoumao/MusicFreePlugins)，默认内置 B 站音源（`platform: bilibili`）。
- 界面自研（React + TypeScript），无 GPL 代码。
- iOS 端用 Capacitor 套壳 + 自写 Swift 播放器插件（AVPlayer 带自定义请求头、锁屏 Now Playing、后台播放）。
- 歌词在插件不提供时自动兜底：网易云音乐 API → LRCLIB。

## 目录结构

```
src/core     插件沙箱、HTTP（原生走 CapacitorHttp）、播放引擎、歌词解析、store
src/ui       发现 / 搜索 / 收藏 / 设置 / 播放页 / 歌曲详情
plugins/qingyin-player   iOS 原生播放器插件（Swift）
ios/         Capacitor 生成的 Xcode 工程
scripts/     e2e（真实 B 站链路验证）、本地代理、图标生成
.github/workflows/build-ipa.yml   GitHub Actions 出未签名 IPA
```

## 本地开发

```bash
pnpm install
pnpm dev            # http://localhost:5273
pnpm build          # 产物在 dist/
node scripts/e2e.mjs    # 无头 Edge 跑通「发现 → 搜索 → 播放 → 歌词」
```

浏览器里 B 站接口有 CORS 与 Referer 限制，需要在「设置 → 浏览器代理」填一个带 Referer 的转发地址
（`scripts/proxy.mjs` 是样例，端口 8787）。原生 App 里不需要代理，CapacitorHttp 会带自定义头直连。

## 出 IPA（Windows 上无法编译，用 GitHub 的 macOS 机器）

1. 把本仓库推到 GitHub；
2. Actions → **Build iOS IPA** → Run workflow；
3. 跑完在 Artifacts 里下载 `Qingyin-unsigned-ipa`；
4. 用 iLoader 打开这个 `.ipa`，用你的 Apple ID 签名安装到手机（7 天续签一次）。

产物是**未签名**的，签名由 iLoader / SideStore 完成。

## 已知限制

- 只支持竖屏、iOS 15+。
- 音源插件是第三方运行时脚本，仅用于个人学习；抓取第三方内容请自行确认合规。
- B 站音源的音频是 DASH 分片（`.m4s`），必须带 `Referer`，所以浏览器端只能走代理，原生端由 AVPlayer 直接带头发请求。
