import {
  closeDetail,
  downloadCurrentOr,
  isFavorite,
  playTrack,
  toggleFavorite,
  useStore,
} from '../core/store';
import { formatTime } from '../core/lrc';
import { Cover } from './TrackRow';

export function DetailSheet() {
  const track = useStore((s) => s.detailTrack);
  const favorite = useStore((s) => (s.detailTrack ? isFavorite(s.detailTrack) : false));
  if (!track) return null;

  const extra = Object.entries(track).filter(
    ([k]) => !['title', 'artist', 'album', 'artwork', 'duration', 'platform'].includes(k),
  );

  return (
    <div className="sheet-mask" onClick={closeDetail}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="detail-head">
          <Cover src={track.artwork} size={92} radius={14} />
          <div className="detail-head-main">
            <div className="detail-title">{track.title}</div>
            <div className="detail-artist">{track.artist || '未知歌手'}</div>
            <div className="detail-sub">
              {track.album || '未知专辑'}
              {track.duration ? ` · ${formatTime(track.duration / 1000)}` : ''}
            </div>
          </div>
        </div>

        <div className="detail-actions">
          <button
            className="ghost-btn"
            onClick={() => {
              void playTrack(track);
              closeDetail();
            }}
          >
            播放
          </button>
          <button className="ghost-btn" onClick={() => toggleFavorite(track)}>
            {favorite ? '取消收藏' : '收藏'}
          </button>
          <button className="ghost-btn" onClick={() => void downloadCurrentOr(track)}>
            下载
          </button>
        </div>

        <div className="kv-list">
          <Kv k="音源平台" v={track.platform} />
          <Kv k="歌曲 ID" v={String(track.id)} />
          {extra.map(([k, v]) => (
            <Kv key={k} k={k} v={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
          ))}
        </div>
        <button className="primary-btn block" onClick={closeDetail}>
          关闭
        </button>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="kv">
      <div className="kv-k">{k}</div>
      <div className="kv-v">{v}</div>
    </div>
  );
}
