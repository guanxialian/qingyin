import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addToPlaylist,
  createPlaylist,
  downloadCurrentOr,
  isFavorite,
  next,
  openDetail,
  prev,
  seekTo,
  setLyricMode,
  setPlayerOpen,
  toggleFavorite,
  togglePlay,
  toggleShuffle,
  useStore,
  playAt,
} from '../core/store';
import { findLyricIndex, formatTime } from '../core/lrc';
import { QUALITY_LABEL, type Quality } from '../core/types';
import { Cover } from './TrackRow';
import {
  IconChevronDown,
  IconDownload,
  IconHeart,
  IconList,
  IconShuffle,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
} from './icons';

export function PlayerSheet() {
  const current = useStore((s) => s.current);
  const playing = useStore((s) => s.playing);
  const preparing = useStore((s) => s.preparing);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration);
  const lyrics = useStore((s) => s.lyrics);
  const lyricMode = useStore((s) => s.lyricMode);
  const lyricOffset = useStore((s) => s.lyricOffset);
  const quality = useStore((s) => s.quality);
  const queue = useStore((s) => s.queue);
  const playlists = useStore((s) => s.playlists);
  const shuffle = useStore((s) => s.shuffle);
  const queueIndex = useStore((s) => s.queueIndex);
  const favorite = useStore((s) => (s.current ? isFavorite(s.current) : false));

  const [showQueue, setShowQueue] = useState(false);
  const [picker, setPicker] = useState(false);
  const [newPl, setNewPl] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const lyricRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = useMemo(
    () => findLyricIndex(lyrics, position + lyricOffset),
    [lyrics, position, lyricOffset],
  );

  useEffect(() => {
    if (!lyricMode) return;
    const el = activeLineRef.current;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, lyricMode]);

  if (!current) return null;

  const total = duration || (current.duration ?? 0) / 1000;
  const shown = dragging ?? position;
  const progress = total > 0 ? Math.min(100, (shown / total) * 100) : 0;

  return (
    <div className="player">
      <div
        className="player-bg"
        style={current.artwork ? { backgroundImage: `url("${current.artwork}")` } : undefined}
      />
      <div className="player-dim" />

      <div className="player-header">
        <button className="icon-btn" onClick={() => setPlayerOpen(false)} aria-label="收起">
          <IconChevronDown size={24} />
        </button>
        <div className="player-header-center">
          <div className="player-header-title">正在播放</div>
          <div className="player-header-sub">{current.platform}</div>
        </div>
        <button
          className="icon-btn"
          onClick={() => setShowQueue((v) => !v)}
          aria-label="播放列表"
        >
          <IconList size={22} />
        </button>
      </div>

      <div className="player-stage" onClick={() => setLyricMode(!lyricMode)}>
        {lyricMode ? (
          <div className="lyrics" ref={lyricRef}>
            {lyrics.length === 0 ? (
              <div className="lyrics-empty">暂无歌词</div>
            ) : (
              lyrics.map((line, i) => (
                <div
                  key={`${line.time}-${i}`}
                  ref={i === activeIndex ? activeLineRef : undefined}
                  className={`lyric-line ${i === activeIndex ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void seekTo(Math.max(0, line.time - lyricOffset));
                  }}
                >
                  <div>{line.text}</div>
                  {line.translation ? (
                    <div className="lyric-trans">{line.translation}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="cover-wrap">
            <Cover src={current.artwork} size={272} radius={20} className="cover-big" />
          </div>
        )}
      </div>

      <div className="player-info">
        <div className="player-title">{current.title}</div>
        <div className="player-artist">
          {current.artist || '未知歌手'}
          {current.album ? ` — ${current.album}` : ''}
        </div>
      </div>

      <div className="progress-area">
        <input
          className="slider"
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={0.1}
          value={Math.min(shown, total || 0)}
          style={{ ['--p' as string]: `${progress}%` }}
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={async (e) => {
            const v = Number((e.target as HTMLInputElement).value);
            setDragging(null);
            await seekTo(v);
          }}
          onTouchEnd={async (e) => {
            const v = Number((e.target as HTMLInputElement).value);
            setDragging(null);
            await seekTo(v);
          }}
        />
        <div className="progress-times">
          <span>{formatTime(shown)}</span>
          <span>-{formatTime(Math.max(0, total - shown))}</span>
        </div>
      </div>

      <div className="player-controls">
        <button
          className={`icon-btn ${favorite ? 'active' : ''}`}
          onClick={() => toggleFavorite(current)}
          aria-label="收藏"
        >
          <IconHeart size={22} filled={favorite} />
        </button>
        <button className="icon-btn" onClick={() => void prev()} aria-label="上一首">
          <IconPrev size={28} />
        </button>
        <button
          className="play-btn"
          onClick={() => void togglePlay()}
          disabled={preparing}
          aria-label={playing ? '暂停' : '播放'}
        >
          {preparing ? <span className="spinner" /> : playing ? <IconPause size={30} /> : <IconPlay size={30} />}
        </button>
        <button className="icon-btn" onClick={() => void next()} aria-label="下一首">
          <IconNext size={28} />
        </button>
        <button
          className="icon-btn"
          onClick={() => void downloadCurrentOr(current)}
          aria-label="下载"
        >
          <IconDownload size={22} />
        </button>
      </div>

      <div className="player-footer">
        <button
          className={shuffle ? 'chip chip-btn active' : 'chip chip-btn'}
          onClick={() => toggleShuffle()}
        >
          <IconShuffle size={14} /> {shuffle ? '随机播放' : '顺序播放'}
        </button>
        <button className="chip chip-btn" onClick={() => setPicker(true)}>
          加入歌单
        </button>
        <span className="chip">{QUALITY_LABEL[quality as Quality]}</span>
        <button className="chip chip-btn" onClick={() => openDetail(current)}>
          歌曲详情
        </button>
        <span className="chip chip-ghost">歌词 {lyrics.length > 0 ? '已同步' : '未找到'}</span>
      </div>

      {picker ? (
        <div className="queue" onClick={() => setPicker(false)}>
          <div className="queue-inner" onClick={(e) => e.stopPropagation()}>
            <div className="queue-header">
              <div>加入歌单</div>
              <button className="text-btn" onClick={() => setPicker(false)}>
                收起
              </button>
            </div>
            <div className="queue-list">
              {playlists.map((pl) => (
                <div
                  className="row"
                  key={pl.id}
                  onClick={() => {
                    addToPlaylist(pl.id, current);
                    setPicker(false);
                  }}
                >
                  <div className="row-main">
                    <div className="row-title">{pl.name}</div>
                    <div className="row-sub">{pl.tracks.length} 首</div>
                  </div>
                </div>
              ))}
              <div className="pl-create">
                <input
                  className="pl-input"
                  placeholder="新建歌单名称"
                  value={newPl}
                  onChange={(e) => setNewPl(e.target.value)}
                />
                <button
                  className="pill-btn"
                  onClick={() => {
                    const id = createPlaylist(newPl || '新歌单');
                    addToPlaylist(id, current);
                    setNewPl('');
                    setPicker(false);
                  }}
                >
                  创建并加入
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showQueue ? (
        <div className="queue" onClick={() => setShowQueue(false)}>
          <div className="queue-inner" onClick={(e) => e.stopPropagation()}>
            <div className="queue-header">
              <div>
                播放列表
                <span className="queue-count"> {queue.length} 首</span>
              </div>
              <button className="text-btn" onClick={() => setShowQueue(false)}>
                收起
              </button>
            </div>
            <div className="queue-list">
              {queue.map((t, i) => (
                <div
                  key={`${t.platform}-${t.id}-${i}`}
                  className={`row ${i === queueIndex ? 'row-active' : ''}`}
                  onClick={() => {
                    void playAt(i);
                    setShowQueue(false);
                  }}
                >
                  <div className="row-index">{String(i + 1).padStart(2, '0')}</div>
                  <div className="row-main">
                    <div className="row-title">{t.title}</div>
                    <div className="row-sub">{t.artist || '未知歌手'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
