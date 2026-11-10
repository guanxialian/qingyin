import Foundation
import ActivityKit

/// 管理「轻音」的实时活动（灵动岛 + 锁屏卡片）。
/// 只在 App target 里编译；Widget 扩展只读同一份 Attributes。
@available(iOS 16.2, *)
final class LiveActivityManager {
    static let shared = LiveActivityManager()

    private var activity: Activity<QingyinActivityAttributes>?
    private var lastUpdate: Date = .distantPast

    var isSupported: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    private init() {}

    /// 开始或复用：同一首歌就更新，不同歌就结束旧的再开新的
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
        guard isSupported else { return }
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
