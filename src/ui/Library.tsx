import { useState } from 'react';
import {
  clearHistory,
  deleteDownload,
  openDetail,
  playDownload,
  playTrack,
  useStore,
} from '../core/store';
import { EmptyState, TrackRow, Cover } from './TrackRow';
import { IconDownload, IconHeart, IconMusic, IconTrash } from './icons';

function dateOf(ts: number) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

type Seg = 'favorite' | 'history' | 'download';

export function Library() {
  const favorites = useStore((s) => s.favorites);
  const history = useStore((s) => s.history);
  const downloads = useStore((s) => s.downloads);
  const current = useStore((s) => s.current);
  const [seg, setSeg] = useState<Seg>('favorite');

  return (
    <div className="page page-library">
      <div className="segmented">
        <button
          className={seg === 'favorite' ? 'seg active' : 'seg'}
          onClick={() => setSeg('favorite')}
        >
          <IconHeart size={16} filled={seg === 'favorite'} /> 收藏 {favorites.length}
        </button>
        <button
          className={seg === 'history' ? 'seg active' : 'seg'}
          onClick={() => setSeg('history')}
        >
          <IconMusic size={16} /> 最近 {history.length}
        </button>
        <button
          className={seg === 'download' ? 'seg active' : 'seg'}
          onClick={() => setSeg('download')}
        >
          <IconDownload size={16} /> 下载 {downloads.length}
        </button>
      </div>

      {seg === 'favorite' ? (
        favorites.length === 0 ? (
          <EmptyState title="还没有收藏" subtitle="点播放页的心形图标即可收藏" />
        ) : (
          <>
            <div className="section-title compact">我的收藏</div>
            <div className="list">
              {favorites.map((t, i) => (
                <TrackRow
                  key={`${t.platform}-${t.id}-${i}`}
                  track={t}
                  active={current?.id === t.id}
                  onPlay={() => void playTrack(t, favorites, i)}
                  onMore={() => openDetail(t)}
                />
              ))}
            </div>
          </>
        )
      ) : null}

      {seg === 'history' ? (
        history.length === 0 ? (
          <EmptyState title="还没有播放记录" subtitle="听过的歌会自动记录在这里" />
        ) : (
          <>
            <div className="section-title compact row-between">
              <span>最近播放</span>
              <button className="text-btn" onClick={() => clearHistory()}>
                清空
              </button>
            </div>
            <div className="list">
              {history.map((t, i) => (
                <TrackRow
                  key={`${t.platform}-${t.id}-${i}`}
                  track={t}
                  active={current?.id === t.id}
                  onPlay={() => void playTrack(t, history, i)}
                  onMore={() => openDetail(t)}
                />
              ))}
            </div>
          </>
        )
      ) : null}

      {seg === 'download' ? (
        downloads.length === 0 ? (
          <EmptyState
            title="还没有下载"
            subtitle="播放页右下角的下载按钮会把歌曲存进 App 内，断网也能听"
          />
        ) : (
          <div className="list">
            {downloads.map((d) => (
              <div
                className="row"
                key={d.key}
                onClick={() => void playDownload(d)}
                role="button"
                tabIndex={0}
              >
                <Cover size={46} src={d.track?.artwork} />
                <div className="row-main">
                  <div className="row-title">{d.title}</div>
                  <div className="row-sub">
                    {d.artist || '未知歌手'} · {dateOf(d.at)}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label="删除下载"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteDownload(d);
                  }}
                >
                  <IconTrash size={18} />
                </button>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
