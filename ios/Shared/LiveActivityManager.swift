import Foundation
import ActivityKit

/// 管理「轻音」的实时活动（灵动岛 + 锁屏卡片）。
/// 只在 App target 里编译；Widget 扩展只读同一份 Attributes。
@available(iOS 16.2, *)
final class LiveActivityManager {
    static let shared = LiveActivityManager()

    private var activity: Activity<QingyinActivityAttributes>?
    private var lastUpdate: Date = .distantPast
    private var lines: [QyLyricLine] = []
    private var lastIndex = -2
    private var duration: Double = 0
    private var playing = true

    var isSupported: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    /// 冷启动后系统里可能还留着一块旧的实时活动，先接管它，避免出现两块卡片
    func adoptExisting() {
        let running = Activity<QingyinActivityAttributes>.activities
        NSLog("[QingyinLive] 现存活动数量 \(running.count)")
        guard let first = running.first else { return }
        activity = first
        for extra in running.dropFirst() {
            Task { await extra.end(nil, dismissalPolicy: .immediate) }
        }
    }

    private init() {}

    /// 开始或复用：同一首歌就更新，不同歌就结束旧的再开新的
    /// JS 加载完歌词后把整份时间轴交给原生，之后由原生自己对齐
    func setLyrics(lines: [QyLyricLine]) {
        self.lines = lines.sorted { $0.time < $1.time }
        lastIndex = -2
        NSLog("[QingyinLive] 收到歌词 \(lines.count) 行")
    }

    /// 播放器每 0.5 秒回调一次，由原生推进实时活动（JS 在锁屏时会被挂起）
    func sync(position: Double) {
        guard let activity else { return }
        let idx = lyricIndex(at: position)
        let now = Date()
        if idx == lastIndex, now.timeIntervalSince(lastUpdate) < 1.0 { return }
        lastIndex = idx
        lastUpdate = now
        var state = activity.content.state
        if idx >= 0, idx < lines.count { state.lyric = lines[idx].text }
        state.nextLyric = idx + 1 < lines.count ? lines[idx + 1].text : ""
        state.position = position
        if duration > 0 { state.duration = duration }
        state.playing = playing
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
    }

    private func lyricIndex(at position: Double) -> Int {
        guard !lines.isEmpty else { return -1 }
        var low = 0
        var high = lines.count - 1
        var best = -1
        while low <= high {
            let mid = (low + high) / 2
            if lines[mid].time <= position + 0.25 {
                best = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }
        return best
    }

    func start(
        trackId: String,
        title: String,
        artist: String,
        coverUrl: String,
        lyric: String,
        nextLyric: String,
        position: Double,
        duration: Double,
        playing: Bool
    ) {
        guard isSupported else {
            NSLog("[QingyinLive] 实时活动被系统关闭")
            return
        }
        if activity == nil { adoptExisting() }
        self.duration = duration
        self.playing = playing
        let state = QingyinActivityAttributes.ContentState(
            title: title,
            artist: artist,
            coverUrl: coverUrl,
            lyric: lyric,
            nextLyric: nextLyric,
            position: position,
            duration: duration,
            playing: playing
        )
        if let current = activity, current.attributes.trackId == trackId {
            Task { await current.update(ActivityContent(state: state, staleDate: nil)) }
            return
        }
        end()
        let attributes = QingyinActivityAttributes(trackId: trackId)
        do {
            activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            NSLog("[QingyinLive] 已开新活动 \(trackId)")
        } catch {
            NSLog("[QingyinLive] 启动实时活动失败: \(error.localizedDescription)")
        }
    }

    /// 更新歌词/进度。歌词每行都会调一次，做个节流避免太频繁。
    func update(
        lyric: String,
        nextLyric: String,
        position: Double,
        duration: Double,
        playing: Bool,
        force: Bool = false
    ) {
        guard activity != nil else { return }
        let now = Date()
        if !force, now.timeIntervalSince(lastUpdate) < 0.8 { return }
        lastUpdate = now
        guard let activity else { return }
        self.duration = duration
        self.playing = playing
        var state = activity.content.state
        state.lyric = lyric
        state.nextLyric = nextLyric
        state.position = position
        state.duration = duration
        state.playing = playing
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
    }

    func end() {
        guard let activity else { return }
        self.activity = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}
