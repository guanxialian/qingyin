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

    var body: some View {
        Group {
            if let u = URL(string: url), !url.isEmpty {
                AsyncImage(url: u) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
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
