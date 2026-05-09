import ActivityKit
import ExpoModulesCore
import Foundation

// JS → native bridge. Manages a single Live Activity per session id and
// emits action events back to JS when the user taps a widget button.
public class LiveTimerModule: Module {
    private var activities: [String: Any] = [:]

    public func definition() -> ModuleDefinition {
        Name("LiveTimerModule")

        Events("event")

        AsyncFunction("getAvailability") { () -> [String: Any?] in
            if #available(iOS 16.2, *) {
                let info = ActivityAuthorizationInfo()
                return [
                    "supported": true,
                    "enabled": info.areActivitiesEnabled,
                    "reason": info.areActivitiesEnabled ? nil : "live_activities_disabled"
                ]
            }
            return [
                "supported": false,
                "enabled": false,
                "reason": "ios_version_below_16_2"
            ]
        }

        AsyncFunction("start") { (input: [String: Any]) -> Void in
            if #available(iOS 16.2, *) {
                try self.startActivity(input: input)
            } else {
                throw LiveTimerError.unsupportedOS
            }
        }

        AsyncFunction("update") { (input: [String: Any]) -> Void in
            if #available(iOS 16.2, *) {
                try await self.updateActivity(input: input)
            }
        }

        AsyncFunction("end") { (sessionId: String) -> Void in
            if #available(iOS 16.2, *) {
                await self.endActivity(sessionId: sessionId)
            }
        }
    }

    @available(iOS 16.2, *)
    private func startActivity(input: [String: Any]) throws {
        guard let sessionId = input["sessionId"] as? String,
              let title = input["title"] as? String,
              let phases = input["phases"] as? [[String: Any]],
              let phaseStartMs = input["phaseStartMs"] as? Double,
              let actions = input["actions"] as? [String],
              let firstPhase = phases.first
        else {
            throw LiveTimerError.invalidInput
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw LiveTimerError.notAuthorized
        }

        let phaseStart = Date(timeIntervalSince1970: phaseStartMs / 1000)
        let duration = (firstPhase["durationSeconds"] as? Double) ?? 0
        let phaseEnd = phaseStart.addingTimeInterval(duration)
        let nextLabel = phases.count > 1 ? (phases[1]["label"] as? String) : nil

        let state = LiveTimerAttributes.ContentState(
            sessionId: sessionId,
            title: title,
            phaseId: (firstPhase["id"] as? String) ?? "",
            phaseLabel: (firstPhase["label"] as? String) ?? "",
            phaseStart: phaseStart,
            phaseEnd: phaseEnd,
            nextPhaseLabel: nextLabel,
            actions: actions
        )

        let attributes = LiveTimerAttributes(
            appName: Bundle.main.infoDictionary?["CFBundleName"] as? String ?? "App"
        )

        let activity = try Activity<LiveTimerAttributes>.request(
            attributes: attributes,
            content: .init(state: state, staleDate: phaseEnd.addingTimeInterval(60)),
            pushType: nil
        )

        activities[sessionId] = activity
    }

    @available(iOS 16.2, *)
    private func updateActivity(input: [String: Any]) async throws {
        guard let sessionId = input["sessionId"] as? String,
              let activity = activities[sessionId] as? Activity<LiveTimerAttributes>
        else {
            return
        }

        let current = activity.content.state
        let phases = input["phases"] as? [[String: Any]]
        let firstPhase = phases?.first

        let phaseStart: Date = {
            if let ms = input["phaseStartMs"] as? Double {
                return Date(timeIntervalSince1970: ms / 1000)
            }
            return current.phaseStart
        }()

        let duration = (firstPhase?["durationSeconds"] as? Double)
            ?? current.phaseEnd.timeIntervalSince(current.phaseStart)
        let phaseEnd = phaseStart.addingTimeInterval(duration)

        let nextLabel: String? = {
            if let phases, phases.count > 1 {
                return phases[1]["label"] as? String
            }
            return current.nextPhaseLabel
        }()

        let next = LiveTimerAttributes.ContentState(
            sessionId: sessionId,
            title: (input["title"] as? String) ?? current.title,
            phaseId: (firstPhase?["id"] as? String) ?? current.phaseId,
            phaseLabel: (firstPhase?["label"] as? String) ?? current.phaseLabel,
            phaseStart: phaseStart,
            phaseEnd: phaseEnd,
            nextPhaseLabel: nextLabel,
            actions: (input["actions"] as? [String]) ?? current.actions
        )

        await activity.update(.init(state: next, staleDate: phaseEnd.addingTimeInterval(60)))
    }

    @available(iOS 16.2, *)
    private func endActivity(sessionId: String) async {
        guard let activity = activities[sessionId] as? Activity<LiveTimerAttributes> else { return }
        await activity.end(activity.content, dismissalPolicy: .immediate)
        activities.removeValue(forKey: sessionId)
    }

    // Called by the AppIntent in the widget extension when the user taps a
    // button on the Live Activity. The intent writes the action into a
    // shared App Group UserDefaults; the host app reads and forwards here.
    public func emitAction(sessionId: String, action: String) {
        sendEvent("event", [
            "type": "action",
            "sessionId": sessionId,
            "action": action
        ])
    }
}

enum LiveTimerError: Error {
    case unsupportedOS
    case notAuthorized
    case invalidInput
}
