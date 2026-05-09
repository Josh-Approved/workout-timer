import ActivityKit
import Foundation

public struct LiveTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var sessionId: String
        public var title: String
        public var phaseId: String
        public var phaseLabel: String
        public var phaseStart: Date
        public var phaseEnd: Date
        public var nextPhaseLabel: String?
        public var actions: [String]
    }

    public var appName: String
}
