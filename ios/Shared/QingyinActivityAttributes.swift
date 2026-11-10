import Foundation
import ActivityKit

/// 灵动岛 / 锁屏实时活动的数据契约。
/// ⚠️ 这个文件必须同时被「主 App」和「Widget 扩展」两个 target 编译，
/// ActivityKit 靠类型名匹配主 App 与扩展里的结构体。
@available(iOS 16.2, *)
struct QingyinActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// 当前歌曲标题
        var title: String
        /// 歌手 / UP 主
        var artist: String
        /// 封面地址
        var coverUrl: String
        /// 当前正在唱的这一行
        var lyric: String
        /// 下一行（未到时间时给下方留个预告）
        var nextLyric: String
        /// 已播放秒数
        var position: Double
        /// 总时长
        var duration: Double
        /// 是否正在播放
        var playing: Bool
    }

    /// 用曲目 id 区分不同的实时活动
    var trackId: String
}
