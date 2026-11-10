import { formatTime } from '../core/lrc';
import type { Track } from '../core/types';
import { IconMore, IconMusic } from './icons';

export function Cover({
  src,
  size = 48,
  radius = 10,
  className = '',
}: {
  src?: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <div
      className={`cover ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <IconMusic size={Math.max(16, size * 0.45)} />
      )}
    </div>
  );
}

export function TrackRow({
  track,
  index,
  active,
  onPlay,
  onMore,
  showIndex = false,
}: {
  track: Track;
  index?: number;
  active?: boolean;
  onPlay: () => void;
  onMore?: () => void;
  showIndex?: boolean;
}) {
  return (
    <div className={`row ${active ? 'row-active' : ''}`} onClick={onPlay}>
      {showIndex && typeof index === 'number' ? (
        <div className="row-index">{String(index + 1).padStart(2, '0')}</div>
      ) : null}
      <Cover src={track.artwork} size={46} />
      <div className="row-main">
        <div className="row-title">{track.title}</div>
        <div className="row-sub">
          {track.artist || '未知歌手'}
          {track.album ? ` · ${track.album}` : ''}
        </div>
      </div>
      {track.duration ? <div className="row-dur">{formatTime(track.duration / 1000)}</div> : null}
      {onMore ? (
        <button
          className="icon-btn row-more"
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
          aria-label="更多"
        >
          <IconMore size={18} />
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <IconMusic size={30} />
      </div>
      <div className="empty-title">{title}</div>
      {subtitle ? <div className="empty-sub">{subtitle}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
