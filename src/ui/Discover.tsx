import { openTopList, setTab, useStore } from '../core/store';
import { Cover, EmptyState } from './TrackRow';
import { IconSparkle } from './icons';

export function Discover() {
  const plugins = useStore((s) => s.plugins);
  const discover = useStore((s) => s.discover);

  const enabled = plugins.filter((p) => p.enabled);

  if (enabled.length === 0) {
    return (
      <div className="page">
        <EmptyState
          title="还没有音源"
          subtitle="导入一个音源插件后，这里会出现排行榜和推荐歌单"
          action={
            <button className="primary-btn" onClick={() => setTab('settings')}>
              去导入音源
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-icon">
          <IconSparkle size={22} />
        </div>
        <div>
          <div className="hero-title">发现</div>
          <div className="hero-sub">
            {discover.platform ? `音源：${discover.platform}` : '轻音 · 精简音乐播放器'}
          </div>
        </div>
      </div>

      {discover.loading && discover.groups.length === 0 ? (
        <div className="skeleton-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-block" />
          ))}
        </div>
      ) : null}

      {discover.error ? <div className="error-box">{discover.error}</div> : null}

      {discover.groups.map((group, gi) => (
        <section className="section" key={`${group.title}-${gi}`}>
          <div className="section-title">{group.title}</div>
          <div className="hscroll">
            {group.data.map((item, i) => (
              <button
                className="card"
                key={`${item.id}-${i}`}
                onClick={() =>
                  void openTopList(group.title, item, discover.platform ?? enabled[0].platform)
                }
              >
                <Cover src={item.coverImg} size={116} radius={14} />
                <div className="card-title">{item.title}</div>
                {item.description ? <div className="card-sub">{item.description}</div> : null}
              </button>
            ))}
          </div>
        </section>
      ))}

      {!discover.loading && discover.groups.length === 0 && !discover.error ? (
        <EmptyState title="这个音源没有提供排行榜" subtitle="可以直接去搜索歌曲" />
      ) : null}
    </div>
  );
}
