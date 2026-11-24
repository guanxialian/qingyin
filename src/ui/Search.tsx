import { useEffect, useRef, useState } from 'react';
import {
  loadMoreSearch,
  openArtist,
  openDetail,
  playTrack,
  runSearch,
  useStore,
} from '../core/store';
import { fmtCount } from '../core/search';
import { EmptyState, TrackRow } from './TrackRow';
import { IconMusic, IconSearch } from './icons';

export function Search() {
  const search = useStore((s) => s.search);
  const current = useStore((s) => s.current);
  const plugins = useStore((s) => s.plugins);
  const [keyword, setKeyword] = useState(search.keyword);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setKeyword(search.keyword);
  }, [search.keyword]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMoreSearch();
      },
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [search.results.length, search.isEnd, search.loading]);

  const noPlugin = plugins.filter((p) => p.enabled).length === 0;
  const showArtists = search.artists.length > 0 && !noPlugin;

  return (
    <div className="page page-search">
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(keyword);
        }}
      >
        <IconSearch size={18} />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索歌曲、作者"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
        />
        {keyword ? (
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              setKeyword('');
            }}
          >
            清空
          </button>
        ) : null}
      </form>

      {noPlugin ? (
        <EmptyState title="请先导入音源" subtitle="在「设置」里粘贴音源地址即可" />
      ) : null}

      {search.artists.length > 0 ? (
        <div className="artist-strip">
          <div className="artist-strip-label">作者</div>
          <div className="artist-cards">
            {search.artists.slice(0, 12).map((a) => (
              <button
                key={a.key}
                type="button"
                className="artist-card"
                onClick={() => void openArtist(a)}
              >
                <span className="artist-avatar">
                  {a.avatar ? (
                    <img src={a.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <IconMusic size={18} />
                  )}
                </span>
                <span className="artist-name">{a.name}</span>
                <span className="artist-meta">
                  {a.works ? `${fmtCount(a.works)} 个作品` : a.fans ? `${fmtCount(a.fans)} 粉丝` : '创作者'}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {search.fallbackNote ? <div className="search-note">{search.fallbackNote}</div> : null}
      {search.error ? <div className="error-box">{search.error}</div> : null}

      <div className="list">
        {search.results.map((track, i) => (
          <TrackRow
            key={`${track.platform}-${track.id}-${i}`}
            track={track}
            active={current?.id === track.id}
            onPlay={() => void playTrack(track, search.results, i)}
            onMore={() => openDetail(track)}
          />
        ))}
      </div>

      {search.loading ? (
        <div className="center-row">
          <span className="spinner" />
          <span>正在搜索…</span>
        </div>
      ) : null}

      {!search.loading &&
      search.searched &&
      search.results.length === 0 &&
      !search.error &&
      !showArtists ? (
        <EmptyState title="没有结果" subtitle="试试只打歌手名，或者去掉标题里的【】和副标题" />
      ) : null}

      <div ref={sentinel} style={{ height: 1 }} />

      {search.results.length > 0 && !search.isEnd ? (
        <button className="ghost-btn block" onClick={() => void loadMoreSearch()}>
          加载更多
        </button>
      ) : null}
      {search.results.length > 0 && search.isEnd ? (
        <div className="list-end">— 已经到底了 —</div>
      ) : null}
    </div>
  );
}
