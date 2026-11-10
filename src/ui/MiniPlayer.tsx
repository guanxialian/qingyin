import { setPlayerOpen, togglePlay, useStore } from '../core/store';
import { Cover } from './TrackRow';
import { IconPause, IconPlay } from './icons';

export function MiniPlayer() {
  const current = useStore((s) => s.current);
  const playing = useStore((s) => s.playing);
  const preparing = useStore((s) => s.preparing);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration);

  if (!current) return null;
  const total = duration || (current.duration ?? 0) / 1000;
  const p = total > 0 ? Math.min(100, (position / total) * 100) : 0;

  return (
    <div className="mini" onClick={() => setPlayerOpen(true)}>
      <div className="mini-progress" style={{ width: `${p}%` }} />
      <Cover src={current.artwork} size={40} radius={8} />
      <div className="mini-main">
        <div className="mini-title">{current.title}</div>
        <div className="mini-artist">{current.artist || '未知歌手'}</div>
      </div>
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          void togglePlay();
        }}
        aria-label={playing ? '暂停' : '播放'}
      >
        {preparing ? <span className="spinner" /> : playing ? <IconPause size={24} /> : <IconPlay size={24} />}
      </button>
    </div>
  );
}
