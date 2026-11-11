import SwiftUI
import WidgetKit
import ActivityKit

private let accent = Color(red: 1.0, green: 0.36, blue: 0.56)
private let bgTop = Color(red: 0.12, green: 0.07, blue: 0.20)

struct QingyinLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: QingyinActivityAttributes.self) { context in
            LockScreenCard(state: context.state)
                .activityBackgroundTint(Color(red: 0.06, green: 0.05, blue: 0.10))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                // 展开态
                DynamicIslandExpandedRegion(.leading) {
                    Cover(url: s.coverUrl, size: 46)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(s.artist)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Text(remaining(s))
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(s.title)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                        Text(s.playing ? s.lyric.isEmpty ? "♪ 轻音" : s.lyric : "已暂停")
                            .font(.system(size: 12))
                            .foregroundStyle(accent)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        ProgressBar(state: s)
                        if !s.nextLyric.isEmpty && s.playing {
                            Text(s.nextLyric)
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                    .padding(.horizontal, 6)
                }
            } compactLeading: {
                Image(systemName: s.playing ? "music.note" : "pause.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(accent)
            } compactTrailing: {
                // 窄条上显示一个极短的歌词切片，太长了会挤爆
                Text(shortLyric(s))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .frame(maxWidth: 54)
            } minimal: {
                Image(systemName: s.playing ? "music.note" : "pause.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(accent)
            }
            .keylineTint(accent)
        }
    }

    private func shortLyric(_ s: QingyinActivityAttributes.ContentState) -> String {
        let text = s.lyric.isEmpty ? s.title : s.lyric
        return String(text.prefix(6))
    }

    private func remaining(_ s: QingyinActivityAttributes.ContentState) -> String {
        let left = max(0, s.duration - s.position)
        let m = Int(left) / 60
        let sec = Int(left) % 60
        return String(format: "-%d:%02d", m, sec)
    }
}

/* ------------------------------ 组件 ------------------------------ */

private struct Cover: View {
    let url: String
    let size: CGFloat
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
        .task(id: url) {
            image = await CoverLoader.shared.load(url)
        }
    }

    private var placeholder: some View {
        ZStack {
            LinearGradient(colors: [bgTop, .black], startPoint: .top, endPoint: .bottom)
            Image(systemName: "music.note")
                .font(.system(size: size * 0.4))
                .foregroundStyle(.white.opacity(0.75))
        }
    }
}

private struct ProgressBar: View {
    let state: QingyinActivityAttributes.ContentState

    var body: some View {
        if state.duration > 0 {
            ProgressView(timerInterval: Date()...(Date().addingTimeInterval(max(1, state.duration - state.position))), countsDown: false)
                .progressViewStyle(.linear)
                .tint(accent)
                .scaleEffect(x: 1, y: 0.7, anchor: .center)
        }
    }
}

private struct LockScreenCard: View {
    let state: QingyinActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Cover(url: state.coverUrl, size: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(state.artist)
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: state.playing ? "waveform" : "pause.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(accent)
            }

            VStack(spacing: 2) {
                Text(state.lyric.isEmpty ? (state.playing ? "♪ 轻音" : "已暂停") : state.lyric)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if !state.nextLyric.isEmpty {
                    Text(state.nextLyric)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity)

            if state.duration > 0 {
                ProgressView(value: min(1, max(0, state.position / state.duration)))
                    .progressViewStyle(.linear)
                    .tint(accent)
                    .scaleEffect(x: 1, y: 0.6, anchor: .center)
            }
        }
        .padding(14)
    }
}

/// Widget 扩展里自己拉封面：B 站图床要带 Referer，AsyncImage 加不了头，
/// 所以用 URLSession 拉一次并缓存到扩展自己的 Caches 目录。
final class CoverLoader {
    static let shared = CoverLoader()
    private let memory = NSCache<NSString, UIImage>()
    private lazy var dir: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let d = base.appendingPathComponent("qy-cover", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    private func key(_ s: String) -> String {
        var h: UInt64 = 5381
        for b in s.utf8 { h = (h &* 33) &+ UInt64(b) }
        return String(h, radix: 16)
    }

    func load(_ urlString: String) async -> UIImage? {
        guard !urlString.isEmpty, let u = URL(string: urlString) else { return nil }
        let k = key(urlString) as NSString
        if let hit = memory.object(forKey: k) { return hit }
        let file = dir.appendingPathComponent("\(k).img")
        if let data = try? Data(contentsOf: file), let img = UIImage(data: data) {
            memory.setObject(img, forKey: k)
            return img
        }
        var req = URLRequest(url: u)
        req.timeoutInterval = 8
        req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", forHTTPHeaderField: "User-Agent")
        if let host = u.host, host.contains("hdslb.com") || host.contains("bilibili") {
            req.setValue("https://www.bilibili.com/", forHTTPHeaderField: "Referer")
        }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse, http.statusCode < 400,
              let img = UIImage(data: data) else { return nil }
        memory.setObject(img, forKey: k)
        try? data.write(to: file)
        return img
    }
}
