import SwiftUI
import WidgetKit

// Widget 扩展的部署目标就是 iOS 16.1（Live Activity 的最低要求），
// 所以这里不需要 @available 包裹。
@main
struct QingyinWidgetBundle: WidgetBundle {
    var body: some Widget {
        QingyinLiveActivity()
    }
}
