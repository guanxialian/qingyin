import { useState } from 'react';
import {
  clearHistory,
  createPlaylist,
  deleteDownload,
  deletePlaylist,
  openDetail,
  playDownload,
  playPlaylist,
  playTrack,
  removeFromPlaylist,
  useStore,
} from '../core/store';
import { EmptyState, TrackRow, Cover } from './TrackRow';
import {
  IconBack,
  IconDownload,
  IconHeart,
  IconMusic,
  IconPlay,
  IconPlus,
  IconShuffle,
  IconTrash,
} from './icons';

function dateOf(ts: number) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

type Seg = 'favorite' | 'history' | 'playlist' | 'download';

export function Library() {
  const favorites = useStore((s) => s.favorites);
  const history = useStore((s) => s.history);
  const downloads = useStore((s) => s.downloads);
  const playlists = useStore((s) => s.playlists);
  const current = useStore((s) => s.current);
  const shuffle = useStore((s) => s.shuffle);
  const [seg, setSeg] = useState<Seg>('favorite');
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const opened = playlists.find((p) => p.id === openId) ?? null;

  if (seg === 'playlist' && opened) {
    return (
      <div className="page page-library">
        <div className="section-title compact row-between pl-head">
          <button className="icon-btn" aria-label="返回" onClick={() => setOpenId(null)}>
            <IconBack size={20} />
          </button>
          <span className="pl-name">{opened.name}</span>
          <button
            className="icon-btn"
            aria-label="删除歌单"
            onClick={() => {
              if (!window.confirm(`删除歌单「${opened.name}」？`)) return;
              deletePlaylist(opened.id);
              setOpenId(null);
            }}
          >
            <IconTrash size={18} />
          </button>
        </div>

        {opened.tracks.length === 0 ? (
          <EmptyState
            title="歌单还是空的"
            subtitle="在播放页点「歌单」按钮，把正在听的歌加进来"
          />
        ) : (
          <>
            <div className="pl-actions">
              <button className="pill-btn" onClick={() => void playPlaylist(opened.id, 0)}>
                <IconPlay size={16} /> 播放全部（{opened.tracks.length}）
              </button>
              <button
                className={shuffle ? 'pill-btn active' : 'pill-btn'}
                onClick={() => void playPlaylist(opened.id, 0)}
              >
                <IconShuffle size={16} /> {shuffle ? '随机中' : '随机播放'}
              </button>
            </div>
            <div className="list">
              {opened.tracks.map((t, i) => (
                <TrackRow
                  key={`${opened.id}-${t.platform}-${t.id}-${i}`}
                  track={t}
                  active={current?.id === t.id}
                  onPlay={() => void playTrack(t, opened.tracks, i)}
                  onMore={() => removeFromPlaylist(opened.id, t)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

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
          className={seg === 'playlist' ? 'seg active' : 'seg'}
          onClick={() => setSeg('playlist')}
        >
          <IconMusic size={16} /> 歌单 {playlists.length}
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

      {seg === 'playlist' ? (
        <>
          <div className="section-title compact row-between">
            <span>我的歌单</span>
            <button className="text-btn" onClick={() => setCreating((v) => !v)}>
              <IconPlus size={14} /> 新建
            </button>
          </div>
          {creating ? (
            <div className="pl-create">
              <input
                className="pl-input"
                placeholder="歌单名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const id = createPlaylist(newName || '新歌单');
                  setNewName('');
                  setCreating(false);
                  setOpenId(id);
                }}
                autoFocus
              />
              <button
                className="pill-btn"
                onClick={() => {
                  const id = createPlaylist(newName || '新歌单');
                  setNewName('');
                  setCreating(false);
                  setOpenId(id);
                }}
              >
                创建
              </button>
            </div>
          ) : null}
          {playlists.length === 0 ? (
            <EmptyState
              title="还没有歌单"
              subtitle="点右上「新建」，或在播放页点「歌单」把当前歌曲加进来"
            />
          ) : (
            <div className="list">
              {playlists.map((p) => {
                const cover = p.tracks[0]?.artwork;
                return (
                  <div className="row" key={p.id} onClick={() => setOpenId(p.id)} role="button">
                    <Cover size={46} src={cover} />
                    <div className="row-main">
                      <div className="row-title">{p.name}</div>
                      <div className="row-sub">{p.tracks.length} 首 · {dateOf(p.createdAt)}</div>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label="随机播放"
                      onClick={(e) => {
                        e.stopPropagation();
                        void playPlaylist(p.id, 0);
                      }}
                    >
                      <IconShuffle size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
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
