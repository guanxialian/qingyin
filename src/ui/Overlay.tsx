import {
  closeOverlay,
  loadMoreOverlay,
  openDetail,
  playTrack,
  useStore,
} from '../core/store';
import { EmptyState, TrackRow } from './TrackRow';
import { IconBack } from './icons';
import { useEffect } from 'react';

export function OverlayPage() {
  const overlay = useStore((s) => s.overlay);
  const tracks = useStore((s) => s.overlayTracks);
  const loading = useStore((s) => s.overlayLoading);
  const error = useStore((s) => s.overlayError);
  const end = useStore((s) => s.overlayEnd);
  const current = useStore((s) => s.current);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!overlay) return null;

  return (
    <div className="overlay-page">
      <div className="overlay-header">
        <button className="icon-btn" onClick={closeOverlay} aria-label="返回">
          <IconBack size={22} />
        </button>
        <div className="overlay-title">{overlay.title}</div>
        <div style={{ width: 40 }} />
      </div>
      <div className="overlay-body">
        {error ? <div className="error-box">{error}</div> : null}
        {loading && tracks.length === 0 ? (
          <div className="skeleton-list">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : null}
        <div className="list">
          {tracks.map((t, i) => (
            <TrackRow
              key={`${t.platform}-${t.id}-${i}`}
              track={t}
              index={i}
              showIndex
              active={current?.id === t.id}
              onPlay={() => void playTrack(t, tracks, i)}
              onMore={() => openDetail(t)}
            />
          ))}
        </div>
        {!loading && tracks.length === 0 && !error ? (
          <EmptyState title="这个榜单没有内容" />
        ) : null}
        {tracks.length > 0 && !end ? (
          <button className="ghost-btn block" onClick={() => void loadMoreOverlay()}>
            {loading ? '加载中…' : '加载更多'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
