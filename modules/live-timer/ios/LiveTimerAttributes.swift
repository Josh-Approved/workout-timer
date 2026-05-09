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

        public init(
            sessionId: String,
            title: String,
            phaseId: String,
            phaseLabel: String,
            phaseStart: Date,
            phaseEnd: Date,
            nextPhaseLabel: String?,
            actions: [String]
        ) {
            self.sessionId = sessionId
            self.title = title
            self.phaseId = phaseId
            self.phaseLabel = phaseLabel
            self.phaseStart = phaseStart
            self.phaseEnd = phaseEnd
            self.nextPhaseLabel = nextPhaseLabel
            self.actions = actions
        }
    }

    public var appName: String

    public init(appName: String) {
        self.appName = appName
    }
}
