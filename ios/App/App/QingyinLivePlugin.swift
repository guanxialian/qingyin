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
    ]

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
