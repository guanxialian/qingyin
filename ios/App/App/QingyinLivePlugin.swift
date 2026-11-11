import Foundation
import Capacitor

/// JS 侧接口：window.Capacitor.Plugins.QingyinLive
/// start / update / end
@objc(QingyinLivePlugin)
public class QingyinLivePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "QingyinLivePlugin"
    public let jsName = "QingyinLive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "supported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLyrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stats", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            forName: Notification.Name("QyPlayerTick"),
            object: nil,
            queue: .main
        ) { note in
            guard #available(iOS 16.2, *) else { return }
            let position = (note.userInfo?["position"] as? Double) ?? 0
            LiveActivityManager.shared.sync(position: position)
        }
    }

    @objc func supported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["supported": LiveActivityManager.shared.isSupported])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": false])
            return
        }
        let m = call.getString("trackId") ?? ""
        LiveActivityManager.shared.start(
            trackId: m,
            title: call.getString("title") ?? "",
            artist: call.getString("artist") ?? "",
            coverUrl: call.getString("coverUrl") ?? "",
            lyric: call.getString("lyric") ?? "",
            nextLyric: call.getString("nextLyric") ?? "",
            position: call.getDouble("position") ?? 0,
            duration: call.getDouble("duration") ?? 0,
            playing: call.getBool("playing") ?? true
        )
        call.resolve(["ok": true])
    }

    @objc func setLyrics(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": false])
            return
        }
        let raw = (call.options["lines"] as? [[String: Any]]) ?? []
        var lines: [QyLyricLine] = []
        lines.reserveCapacity(raw.count)
        for item in raw {
            let time = (item["time"] as? Double) ?? Double((item["time"] as? Int) ?? 0)
            let text = (item["text"] as? String) ?? ""
            if text.isEmpty { continue }
            lines.append(QyLyricLine(time: time, text: text))
        }
        LiveActivityManager.shared.setLyrics(lines: lines)
        call.resolve(["ok": true, "count": lines.count])
    }

    @objc func stats(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        call.resolve(LiveActivityManager.shared.stats())
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": false])
            return
        }
        LiveActivityManager.shared.update(
            lyric: call.getString("lyric") ?? "",
            nextLyric: call.getString("nextLyric") ?? "",
            position: call.getDouble("position") ?? 0,
            duration: call.getDouble("duration") ?? 0,
            playing: call.getBool("playing") ?? true,
            force: call.getBool("force") ?? false
        )
        call.resolve(["ok": true])
    }

    @objc func end(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            LiveActivityManager.shared.end()
        }
        call.resolve()
    }
}
