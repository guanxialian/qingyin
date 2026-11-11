import { useEffect, useState } from 'react';
import {
  addPluginFromCode,
  addPluginFromUrl,
  removePlugin,
  setQuality,
  setProxy,
  toast,
  togglePlugin,
  useStore,
} from '../core/store';
import { QUALITY_LABEL, type Quality } from '../core/types';
import { engine } from '../core/engine';
import { getLogLines, clearLog } from '../core/debug';
import { cacheUsage, clearCacheFiles } from '../core/download';
import { liveStats, liveStatus, liveSupported } from '../core/live';
import { IconLink, IconPlus, IconRefresh, IconTrash } from './icons';

const SAMPLE_PLUGIN =
  'https://gitee.com/maotoumao/MusicFreePlugins/raw/v0.1/dist/bilibili/index.js';

const QUALITIES: Quality[] = ['low', 'standard', 'high', 'super'];

function fmtSize(bytes: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return mb.toFixed(1) + ' MB';
}

export function Settings() {
  const plugins = useStore((s) => s.plugins);
  const quality = useStore((s) => s.quality);
  const proxy = useStore((s) => s.proxy);
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [cache, setCache] = useState({ bytes: 0, count: 0 });
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    void cacheUsage().then(setCache);
  }, []);

  const refreshCache = () => {
    void cacheUsage().then(setCache);
  };

  const clearCache = async () => {
    setClearing(true);
    const freed = await clearCacheFiles();
    setClearing(false);
    refreshCache();
    clearLog();
    toast(freed > 0 ? '已清理 ' + fmtSize(freed) + ' 缓存' : '缓存已经是空的');
  };
  const [err, setErr] = useState<string | null>(null);
  const [proxyDraft, setProxyDraft] = useState(proxy);
  const [liveText, setLiveText] = useState(liveSupported() ? '检查中…' : '无原生插件');
  const [liveDetail, setLiveDetail] = useState('');
  const [refresh, setRefresh] = useState(0);
  const logs = getLogLines();
  const envText = `${/iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : navigator.platform || 'Web'} · ${(navigator.userAgent.match(/OS (\d+[_\d]+)/)?.[1] ?? '').replace(/_/g, '.')}`;

  useEffect(() => {
    if (!liveSupported()) {
      setLiveText('无原生插件（网页版）');
      return;
    }
    let alive = true;
    void liveStatus().then((t) => alive && setLiveText(t));
    void liveStats().then((t) => alive && setLiveDetail(t));
    return () => {
      alive = false;
    };
  }, [refresh]);

  async function importFromUrl(target: string) {
    setBusy(true);
    setErr(null);
    try {
      await addPluginFromUrl(target);
      setUrl('');
    } catch (e) {
      setErr((e as Error).message || '导入失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-settings">
      <section className="section">
        <div className="section-title">音源</div>
        <div className="settings-card">
          {plugins.length === 0 ? (
            <div className="settings-hint">还没有音源。导入一个后即可搜索和播放。</div>
          ) : (
            plugins.map((p) => (
              <div className="plugin-row" key={p.key}>
                <div className="plugin-main">
                  <div className="plugin-name">
                    {p.name}
                    <span className="tag">v{p.version ?? '?'}</span>
                  </div>
                  <div className="plugin-sub">
                    {p.platform}
                    {p.author ? ` · ${p.author}` : ''}
                    {p.enabled ? '' : ' · 已停用'}
                  </div>
                </div>
                <button
                  className={`switch ${p.enabled ? 'on' : ''}`}
                  onClick={() => togglePlugin(p.key)}
                  aria-label="启用/停用"
                >
                  <span />
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => {
                    removePlugin(p.key);
                    toast('已删除音源');
                  }}
                  aria-label="删除"
                >
                  <IconTrash size={18} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="settings-card">
          <div className="field">
            <IconLink size={18} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴音源地址（.js 链接）"
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="url"
            />
          </div>
          <div className="settings-actions">
            <button
              className="primary-btn"
              disabled={busy || !url.trim()}
              onClick={() => void importFromUrl(url)}
            >
              {busy ? '导入中…' : '导入音源'}
            </button>
            <button
              className="ghost-btn"
              disabled={busy}
              onClick={() => void importFromUrl(SAMPLE_PLUGIN)}
            >
              一键导入 B 站音源
            </button>
          </div>
          {err ? <div className="error-box small">{err}</div> : null}
          <button className="text-btn" onClick={() => setShowPaste((v) => !v)}>
            {showPaste ? '收起手动粘贴' : '或手动粘贴插件代码'}
          </button>
          {showPaste ? (
            <>
              <textarea
                className="code-area"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="// 把音源插件的 JS 代码粘贴到这里"
                spellCheck={false}
              />
              <button
                className="ghost-btn block"
                disabled={busy || !code.trim()}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await addPluginFromCode(code);
                    setCode('');
                    setShowPaste(false);
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                导入粘贴的代码
              </button>
            </>
          ) : null}
        </div>
      </section>

      <section className="section">
        <div className="section-title">存储</div>
        <div className="settings-card">
          <div className="row-between">
            <div>
              <div className="row-title">临时缓存</div>
              <div className="row-sub">
                {cache.count} 个文件 · 约 {fmtSize(cache.bytes)}（在线放不了的歌会自动缓存到本地）
              </div>
            </div>
            <button className="ghost-btn" disabled={clearing} onClick={() => void clearCache()}>
              {clearing ? '清理中…' : '清理'}
            </button>
          </div>
          <button className="text-btn" onClick={refreshCache}>
            <IconRefresh size={14} /> 刷新用量
          </button>
        </div>
        <div className="settings-hint">
          清理不会删除你「下载」的歌，只清掉为了播放而临时缓存的文件。
        </div>
      </section>

      <section className="section">
        <div className="section-title">音质</div>
        <div className="chip-row">
          {QUALITIES.map((q) => (
            <button
              key={q}
              className={`chip chip-btn ${quality === q ? 'chip-on' : ''}`}
              onClick={() => setQuality(q)}
            >
              {QUALITY_LABEL[q]}
            </button>
          ))}
        </div>
        <div className="settings-hint">
          音质由音源插件决定，B 站音源的实际码率取决于视频本身。
        </div>
      </section>

      <section className="section">
        <div className="section-title">浏览器代理（可选）</div>
        <div className="settings-card">
          <div className="field">
            <IconPlus size={18} />
            <input
              value={proxyDraft}
              onChange={(e) => setProxyDraft(e.target.value)}
              placeholder="http://192.168.1.10:8787/?url="
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="url"
            />
          </div>
          <div className="settings-actions">
            <button
              className="ghost-btn"
              onClick={() => {
                setProxy(proxyDraft.trim());
                toast('已保存代理设置');
              }}
            >
              保存
            </button>
            <button
              className="ghost-btn"
              onClick={() => {
                setProxyDraft('');
                setProxy('');
                toast('已关闭代理');
              }}
            >
              清除
            </button>
          </div>
          <div className="settings-hint">
            仅在电脑/手机浏览器里预览时需要（绕过 CORS）。装成 iOS App 后走原生请求，不需要代理。
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">诊断</div>
        <div className="settings-card">
          <div className="about-row">
            <span>运行环境</span>
            <span className="muted">{envText}</span>
          </div>
          <div className="about-row">
            <span>播放器</span>
            <span className="muted">{engine.usesNativePlayer ? 'AVPlayer（原生）' : 'HTML5 Audio'}</span>
          </div>
          <div className="about-row">
            <span>灵动岛 / 实时活动</span>
            <span className="muted">{liveText}</span>
          </div>
          {liveDetail ? (
            <div className="about-row">
              <span>歌词同步</span>
              <span className="muted">{liveDetail}</span>
            </div>
          ) : null}
          {logs.length ? (
            <pre className="diag-log">{logs.join('\n')}</pre>
          ) : (
            <div className="settings-hint">还没有日志。播放一首歌后再回来看看。</div>
          )}
          <div className="settings-actions">
            <button
              className="ghost-btn"
              disabled={!logs.length}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText([`env: ${envText}`, `live: ${liveText}`, ...logs].join('\n'));
                  toast('诊断信息已复制');
                } catch {
                  toast('复制失败');
                }
              }}
            >
              复制诊断信息
            </button>
            <button className="ghost-btn" onClick={() => setRefresh((v) => v + 1)}>
              刷新
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">关于</div>
        <div className="settings-card">
          <div className="about-row">
            <span>版本</span>
            <span className="muted">0.1.0</span>
          </div>
          <div className="about-row">
            <span>播放引擎</span>
            <span className="muted">原生 AVPlayer（iOS）/ HTML5 Audio</span>
          </div>
          <div className="settings-hint">
            轻音只提供播放器本体，音乐内容与版权由你导入的音源负责。请勿用于商业用途。
          </div>
        </div>
      </section>
    </div>
  );
}
