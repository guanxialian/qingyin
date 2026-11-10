import { useEffect } from 'react';
import {
  initStore,
  loadDiscover,
  setTab,
  setPlayerOpen,
  useStore,
  type TabId,
} from './core/store';
import { Discover } from './ui/Discover';
import { Search } from './ui/Search';
import { Library } from './ui/Library';
import { Settings } from './ui/Settings';
import { MiniPlayer } from './ui/MiniPlayer';
import { PlayerSheet } from './ui/PlayerSheet';
import { OverlayPage } from './ui/Overlay';
import { DetailSheet } from './ui/DetailSheet';
import {
  IconGear,
  IconHeart,
  IconRefresh,
  IconSearch,
  IconSparkle,
} from './ui/icons';

const TABS: { id: TabId; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'discover', label: '发现', icon: IconSparkle },
  { id: 'search', label: '搜索', icon: IconSearch },
  { id: 'library', label: '收藏', icon: IconHeart },
  { id: 'settings', label: '设置', icon: IconGear },
];

const TITLES: Record<TabId, { title: string; sub: string }> = {
  discover: { title: '轻音', sub: '精简音源播放器' },
  search: { title: '搜索', sub: '跨音源找歌' },
  library: { title: '我的音乐', sub: '收藏 · 记录 · 下载' },
  settings: { title: '设置', sub: '音源 · 音质 · 关于' },
};

export default function App() {
  const tab = useStore((s) => s.tab);
  const overlay = useStore((s) => s.overlay);
  const playerOpen = useStore((s) => s.playerOpen);
  const detailTrack = useStore((s) => s.detailTrack);
  const toastMessage = useStore((s) => s.toast);
  const plugins = useStore((s) => s.plugins);
  const discoverLoading = useStore((s) => s.discover.loading);

  useEffect(() => {
    initStore();
  }, []);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', playerOpen);
  }, [playerOpen]);

  const header = TITLES[tab];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-text">
          <div className="topbar-title">{header.title}</div>
          <div className="topbar-sub">{header.sub}</div>
        </div>
        {tab === 'discover' && plugins.some((p) => p.enabled) ? (
          <button
            className="icon-btn"
            onClick={() => void loadDiscover()}
            disabled={discoverLoading}
            aria-label="刷新"
          >
            <IconRefresh size={20} />
          </button>
        ) : null}
      </header>

      <main className={`content ${playerOpen ? 'content-dim' : ''}`}>
        {overlay ? (
          <OverlayPage />
        ) : tab === 'discover' ? (
          <Discover />
        ) : tab === 'search' ? (
          <Search />
        ) : tab === 'library' ? (
          <Library />
        ) : (
          <Settings />
        )}
      </main>

      <div className="bottom-dock">
        <MiniPlayer />
        <nav className="tabbar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`tab ${tab === id ? 'active' : ''}`}
              onClick={() => {
                setTab(id);
                setPlayerOpen(false);
              }}
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {playerOpen ? <PlayerSheet /> : null}
      {detailTrack ? <DetailSheet /> : null}
      {toastMessage ? <div className="toast">{toastMessage.text}</div> : null}
    </div>
  );
}
