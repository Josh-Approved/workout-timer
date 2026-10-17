import ActivityKit
import Foundation

// ContentState carries the full workout schedule (every phase with absolute
// start/end Dates), not just the active phase. The widget computes which
// phase is active from `Date()` at render time, so the on-screen content
// stays correct across phase boundaries even when an activity.update() call
// fails to land — any subsequent re-render (lock-screen interaction,
// dynamic-island peek) re-derives the active phase from the schedule.

public struct LiveTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var sessionId: String
        public var title: String
        public var phases: [ScheduledPhase]
        public var actions: [String]
    }

    public struct ScheduledPhase: Codable, Hashable {
        public var id: String
        public var label: String
        public var start: Date
        public var end: Date
        // A stopwatch phase: the widget counts up from `start` instead of
        // down to `end`. Optional in the payload so older states decode.
        public var countsUp: Bool?
    }

    public var appName: String

    public init(appName: String) {
        self.appName = appName
    }
}
