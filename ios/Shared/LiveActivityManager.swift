import Foundation
import ActivityKit
import UIKit

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
    private var lastPlaying = true
    private var updates = 0
    private var lastError = ""
    private var covers: [String: String] = [:]
    private var timer: Timer?

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
        if idx == lastIndex, playing == lastPlaying { return }
        lastIndex = idx
        lastPlaying = playing
        updates += 1
        var state = activity.content.state
        if idx >= 0, idx < lines.count { state.lyric = lines[idx].text }
        state.nextLyric = idx + 1 < lines.count ? lines[idx + 1].text : ""
        state.position = position
        if duration > 0 { state.duration = duration }
        state.playing = playing
        let content = ActivityContent(state: state, staleDate: nil)
        Task {
            do {
                try await activity.update(content)
            } catch {
                lastError = error.localizedDescription
                NSLog("[QingyinLive] 更新失败 \(error.localizedDescription)")
            }
        }
    }

    /// 播放器把进度写进 UserDefaults，这里定时读，锁屏后 JS 挂起也能继续推进
    private func startTimer() {
        timer?.invalidate()
        let t = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self else { return }
            let pos = UserDefaults.standard.double(forKey: "qy.position")
            self.sync(position: pos)
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func prepareCover(_ urlString: String) {
        guard !urlString.isEmpty else { return }
        if let cached = covers[urlString] {
            applyCover(cached)
            return
        }
        Task { [weak self] in
            guard let self else { return }
            guard let b64 = await LiveActivityManager.fetchCover(urlString) else { return }
            self.covers[urlString] = b64
            self.applyCover(b64)
        }
    }

    private func applyCover(_ b64: String) {
        guard let activity else { return }
        var state = activity.content.state
        state.coverB64 = b64
        Task { try? await activity.update(ActivityContent(state: state, staleDate: nil)) }
    }

    /// 拉封面并压到 96x96 JPEG，base64 后塞进活动状态（ActivityKit 内容上限 4KB）
    static func fetchCover(_ urlString: String) async -> String? {
        guard let url = URL(string: urlString) else { return nil }
        var req = URLRequest(url: url)
        req.timeoutInterval = 10
        req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", forHTTPHeaderField: "User-Agent")
        if let host = url.host, host.contains("hdslb.com") || host.contains("bilibili") {
            req.setValue("https://www.bilibili.com/", forHTTPHeaderField: "Referer")
        }
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let image = UIImage(data: data) else { return nil }
        let side: CGFloat = 96
        let size = CGSize(width: side, height: side)
        let renderer = UIGraphicsImageRenderer(size: size)
        let small = renderer.image { _ in
            let scale = max(size.width / image.size.width, size.height / image.size.height)
            let w = image.size.width * scale
            let h = image.size.height * scale
            image.draw(in: CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h))
        }
        guard let jpeg = small.jpegData(compressionQuality: 0.35) else { return nil }
        return jpeg.base64EncodedString()
    }

    func stats() -> [String: Any] {
        [
            "lines": lines.count,
            "updates": updates,
            "position": lastIndex >= 0 && lastIndex < lines.count ? lastIndex : -1,
            "activity": activity != nil,
            "error": lastError,
            "cover": covers.values.first?.count ?? 0,
        ]
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
            coverB64: covers[coverUrl] ?? "",
            lyric: lyric,
            nextLyric: nextLyric,
            position: position,
            duration: duration,
            playing: playing
        )
        if let current = activity, current.attributes.trackId == trackId {
            startTimer()
            prepareCover(coverUrl)
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
            startTimer()
            prepareCover(coverUrl)
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
        timer?.invalidate()
        timer = nil
        guard let activity else { return }
        self.activity = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}
