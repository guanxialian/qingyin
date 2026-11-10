import { useEffect, useRef, useState } from 'react';
import {
  loadMoreSearch,
  openDetail,
  playTrack,
  runSearch,
  useStore,
} from '../core/store';
import { EmptyState, TrackRow } from './TrackRow';
import { IconSearch } from './icons';

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
          placeholder="搜索歌曲、歌手"
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

      {!search.loading && search.searched && search.results.length === 0 && !search.error ? (
        <EmptyState title="没有结果" subtitle="换个关键词试试" />
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
