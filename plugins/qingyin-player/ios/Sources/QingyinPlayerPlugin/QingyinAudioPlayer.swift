import Foundation
import AVFoundation
import MediaPlayer
import UIKit

struct NowPlayingMetadata {
    var title: String = ""
    var artist: String = ""
    var album: String = ""
    var artwork: String = ""
    var duration: Double = 0
    var position: Double = 0
    var rate: Double = 1
}

/// AVPlayer 封装：支持自定义请求头（B 站 CDN 必需）、锁屏 Now Playing、后台播放
final class QingyinAudioPlayer {
    private var player: AVPlayer?
    private var item: AVPlayerItem?
    private var timeObserver: Any?
    private var statusObservation: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?
    private var stallObserver: NSObjectProtocol?
    private var meta = NowPlayingMetadata()
    private var artworkCache: [String: MPMediaItemArtwork] = [:]
    private var artworkTask: URLSessionDataTask?
    private var pendingSeek: Double = 0
    private var loaded = false

    var onTime: ((Double) -> Void)?
    /// state: ready / playing / paused / buffering / stalled / ended
    var onState: ((String, Double?) -> Void)?
    var onEnded: (() -> Void)?
    var onError: ((String) -> Void)?

    var volume: Float = 1 {
        didSet { player?.volume = volume }
    }

    // MARK: - 音频会话

    static func activateSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.allowAirPlay, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            NSLog("[QingyinPlayer] 音频会话配置失败: \(error)")
        }
    }

    // MARK: - 加载

    func load(urlString: String, headers: [String: String], metadata: NowPlayingMetadata, autoplay: Bool, startAt: Double) {
        guard let url = URL(string: urlString) else {
            onError?("播放地址无效")
            return
        }
        teardown()
        QingyinAudioPlayer.activateSession()

        meta = metadata
        pendingSeek = max(0, startAt)
        loaded = false

        // AVURLAssetHTTPHeaderFieldsKey 是 AVFoundation 的可用扩展：用于带 Referer/UA 播放第三方 CDN
        var options: [String: Any] = [:]
        if !headers.isEmpty {
            options["AVURLAssetHTTPHeaderFieldsKey"] = headers
        }
        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 5
        self.item = item

        let player = AVPlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = true
        player.volume = volume
        self.player = player

        statusObservation = item.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
            guard let self else { return }
            DispatchQueue.main.async {
                switch item.status {
                case .readyToPlay:
                    let duration = CMTimeGetSeconds(item.duration)
                    self.meta.duration = duration.isFinite ? duration : self.meta.duration
                    self.loaded = true
                    self.updateNowPlaying(playing: player.rate > 0)
                    self.onState?("ready", self.meta.duration)
                    if self.pendingSeek > 0.5 {
                        player.seek(to: CMTime(seconds: self.pendingSeek, preferredTimescale: 1000))
                    }
                case .failed:
                    self.onError?(item.error?.localizedDescription ?? "音频加载失败")
                    self.onState?("paused", nil)
                default:
                    break
                }
            }
        }

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 1000),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            let seconds = CMTimeGetSeconds(time)
            if seconds.isFinite {
                self.meta.position = seconds
                self.onTime?(seconds)
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.onState?("ended", nil)
            self.onEnded?()
        }

        stallObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemPlaybackStalled, object: item, queue: .main
        ) { [weak self] _ in
            self?.onState?("buffering", nil)
        }

        loadArtwork(metadata.artwork)
        updateNowPlaying(playing: false)
        if autoplay { player.play() }
    }

    // MARK: - 控制

    func play() {
        QingyinAudioPlayer.activateSession()
        player?.play()
        updateNowPlaying(playing: true)
        onState?("playing", nil)
    }

    func pause() {
        player?.pause()
        updateNowPlaying(playing: false)
        onState?("paused", nil)
    }

    func seek(_ seconds: Double) {
        let target = CMTime(seconds: max(0, seconds), preferredTimescale: 1000)
        player?.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
        meta.position = seconds
        updateNowPlaying(playing: (player?.rate ?? 0) > 0)
    }

    func stop() {
        teardown()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        onState?("paused", nil)
    }

    func updateNowPlayingMetadata(_ metadata: NowPlayingMetadata, playing: Bool) {
        meta = metadata
        if !metadata.artwork.isEmpty {
            loadArtwork(metadata.artwork)
        }
        updateNowPlaying(playing: playing)
    }

    private func teardown() {
        if let observer = timeObserver, let player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil
        statusObservation = nil
        if let end = endObserver {
            NotificationCenter.default.removeObserver(end)
            endObserver = nil
        }
        if let stall = stallObserver {
            NotificationCenter.default.removeObserver(stall)
            stallObserver = nil
        }
        artworkTask?.cancel()
        artworkTask = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        item = nil
        loaded = false
    }

    // MARK: - 锁屏 / 控制中心

    private func updateNowPlaying(playing: Bool) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: meta.title,
            MPMediaItemPropertyArtist: meta.artist,
            MPMediaItemPropertyAlbumTitle: meta.album,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: meta.position,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        if meta.duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = meta.duration
        }
        if let artwork = artworkCache[meta.artwork] {
            info[MPMediaItemPropertyArtwork] = artwork
        } else if let existing = MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyArtwork] {
            info[MPMediaItemPropertyArtwork] = existing
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func loadArtwork(_ urlString: String) {
        guard !urlString.isEmpty, artworkCache[urlString] == nil else { return }
        guard let url = URL(string: urlString) else { return }
        artworkTask?.cancel()
        artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let image = UIImage(data: data) else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
                self.artworkCache[urlString] = artwork
                if self.meta.artwork == urlString {
                    self.updateNowPlaying(playing: (self.player?.rate ?? 0) > 0)
                }
            }
        }
        artworkTask?.resume()
    }

    deinit {
        teardown()
    }
}
