import Foundation
import Capacitor
import AVFoundation
import MediaPlayer

@objc(QingyinPlayerPlugin)
public class QingyinPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "QingyinPlayerPlugin"
    public let jsName = "QingyinPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNowPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let audio = QingyinAudioPlayer()
    private var remoteConfigured = false

    override public func load() {
        QingyinAudioPlayer.activateSession()

        audio.onTime = { [weak self] position in
            self?.notifyListeners("timeupdate", data: ["position": position])
            NotificationCenter.default.post(name: Notification.Name("QyPlayerTick"), object: nil, userInfo: ["position": position])
        }
        audio.onState = { [weak self] state, duration in
            var payload: [String: Any] = ["state": state]
            if let duration, duration.isFinite, duration > 0 {
                payload["duration"] = duration
            }
            self?.notifyListeners("state", data: payload)
        }
        audio.onEnded = { [weak self] in
            self?.notifyListeners("ended", data: [:])
        }
        audio.onError = { [weak self] message in
            self?.notifyListeners("error", data: ["message": message])
        }

        configureRemoteCommands()
    }

    // MARK: - 方法

    @objc func load(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), !url.isEmpty else {
            call.reject("缺少播放地址")
            return
        }
        let headers = (call.getObject("headers") ?? [:]).reduce(into: [String: String]()) { result, pair in
            if let value = pair.value as? String { result[pair.key] = value }
        }
        var meta = NowPlayingMetadata()
        meta.title = call.getString("title") ?? ""
        meta.artist = call.getString("artist") ?? ""
        meta.album = call.getString("album") ?? ""
        meta.artwork = call.getString("artwork") ?? ""
        meta.duration = call.getDouble("duration") ?? 0
        let startAt = call.getDouble("startAt") ?? 0

        DispatchQueue.main.async {
            self.audio.load(urlString: url, headers: headers, metadata: meta, autoplay: true, startAt: startAt)
            call.resolve(["duration": meta.duration])
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.audio.play() }
        call.resolve()
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.audio.pause() }
        call.resolve()
    }

    @objc func seek(_ call: CAPPluginCall) {
        let position = call.getDouble("position") ?? 0
        DispatchQueue.main.async { self.audio.seek(position) }
        call.resolve()
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let volume = Float(call.getDouble("volume") ?? 1)
        DispatchQueue.main.async { self.audio.volume = volume }
        call.resolve()
    }

    @objc func setNowPlaying(_ call: CAPPluginCall) {
        var meta = NowPlayingMetadata()
        meta.title = call.getString("title") ?? ""
        meta.artist = call.getString("artist") ?? ""
        meta.album = call.getString("album") ?? ""
        meta.artwork = call.getString("artwork") ?? ""
        meta.duration = call.getDouble("duration") ?? 0
        meta.position = call.getDouble("position") ?? 0
        let playing = call.getBool("playing") ?? false
        DispatchQueue.main.async {
            self.audio.updateNowPlayingMetadata(meta, playing: playing)
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.audio.stop() }
        call.resolve()
    }

    // MARK: - 锁屏按钮

    private func configureRemoteCommands() {
        guard !remoteConfigured else { return }
        remoteConfigured = true
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remote", data: ["action": "play"])
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remote", data: ["action": "pause"])
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remote", data: ["action": "toggle"])
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remote", data: ["action": "next"])
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remote", data: ["action": "prev"])
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.notifyListeners("remote", data: ["action": "seek", "position": event.positionTime])
            return .success
        }
    }
}
