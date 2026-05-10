import ActivityKit
import ExpoModulesCore
import Foundation

// JS → native bridge. Manages a single Live Activity per session id and
// emits action events back to JS when the user taps a widget button.
//
// Architecture: schedule-in-state. The full workout schedule (absolute
// start/end Date for every phase) is encoded into the activity's
// ContentState at start. The widget body computes which phase is active
// from `Date()` on every render, so the on-screen content is always
// derivable from the schedule — no dependency on activity.update()
// landing at every phase boundary.
//
// A native DispatchSourceTimer still fires at each boundary to nudge
// activity.update() (re-pushes the same ContentState to encourage iOS
// to re-snapshot the widget). If the nudge gets throttled, the next
// lock-screen interaction or system render will recompute the active
// phase from the schedule and display correctly anyway.
public class LiveTimerModule: Module {
    private var sessions: [String: Any] = [:]   // sessionId -> LiveSession
    private let lock = NSLock()

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
                try await self.startActivity(input: input)
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

        OnDestroy {
            if #available(iOS 16.2, *) {
                self.cancelAllTimers()
            }
        }
    }

    @available(iOS 16.2, *)
    private func startActivity(input: [String: Any]) async throws {
        guard let sessionId = input["sessionId"] as? String,
              let title = input["title"] as? String,
              let phasesRaw = input["phases"] as? [[String: Any]],
              let phaseStartMs = input["phaseStartMs"] as? Double,
              let actions = input["actions"] as? [String]
        else {
            throw LiveTimerError.invalidInput
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw LiveTimerError.notAuthorized
        }

        let scheduled = buildSchedule(phasesRaw: phasesRaw, firstPhaseStart: Date(timeIntervalSince1970: phaseStartMs / 1000))
        guard !scheduled.isEmpty else {
            throw LiveTimerError.invalidInput
        }

        // If a session for this id already exists (e.g. resume-from-pause
        // path in the host app), tear it down before starting a new one.
        await endSession(sessionId: sessionId)

        let state = LiveTimerAttributes.ContentState(
            sessionId: sessionId,
            title: title,
            phases: scheduled,
            actions: actions
        )

        let attributes = LiveTimerAttributes(
            appName: Bundle.main.infoDictionary?["CFBundleName"] as? String ?? "App"
        )

        let staleDate = (scheduled.last?.end ?? Date()).addingTimeInterval(60)
        let activity = try Activity<LiveTimerAttributes>.request(
            attributes: attributes,
            content: .init(state: state, staleDate: staleDate),
            pushType: nil
        )

        let session = LiveSession(activity: activity)

        lock.lock()
        sessions[sessionId] = session
        lock.unlock()

        scheduleNextNudge(sessionId: sessionId)
    }

    @available(iOS 16.2, *)
    private func updateActivity(input: [String: Any]) async throws {
        guard let sessionId = input["sessionId"] as? String else { return }

        lock.lock()
        let stored = sessions[sessionId] as? LiveSession
        lock.unlock()
        guard let session = stored else { return }

        let current = session.activity.content.state

        // Title and actions are simple field updates.
        let title = (input["title"] as? String) ?? current.title
        let actions = (input["actions"] as? [String]) ?? current.actions

        // If the caller supplies a new schedule, rebuild from absolute
        // times. Used by skip / restart / resume — all foreground actions.
        let phases: [LiveTimerAttributes.ScheduledPhase]
        if let phasesRaw = input["phases"] as? [[String: Any]],
           let phaseStartMs = input["phaseStartMs"] as? Double {
            let rebuilt = buildSchedule(phasesRaw: phasesRaw, firstPhaseStart: Date(timeIntervalSince1970: phaseStartMs / 1000))
            phases = rebuilt.isEmpty ? current.phases : rebuilt
        } else {
            phases = current.phases
        }

        let next = LiveTimerAttributes.ContentState(
            sessionId: sessionId,
            title: title,
            phases: phases,
            actions: actions
        )

        // Cancel the in-flight nudge; we'll reschedule against the new schedule.
        session.timer?.cancel()
        session.timer = nil

        let staleDate = (phases.last?.end ?? Date()).addingTimeInterval(60)
        await session.activity.update(.init(state: next, staleDate: staleDate))
        scheduleNextNudge(sessionId: sessionId)
    }

    @available(iOS 16.2, *)
    private func endActivity(sessionId: String) async {
        await endSession(sessionId: sessionId)
    }

    @available(iOS 16.2, *)
    private func endSession(sessionId: String) async {
        lock.lock()
        let stored = sessions[sessionId] as? LiveSession
        sessions.removeValue(forKey: sessionId)
        lock.unlock()
        guard let session = stored else { return }
        session.timer?.cancel()
        await session.activity.end(session.activity.content, dismissalPolicy: .immediate)
    }

    @available(iOS 16.2, *)
    private func scheduleNextNudge(sessionId: String) {
        lock.lock()
        let stored = sessions[sessionId] as? LiveSession
        lock.unlock()
        guard let session = stored else { return }

        let now = Date()
        let phases = session.activity.content.state.phases
        // Next boundary is the first phase end strictly after now.
        guard let nextBoundary = phases.first(where: { $0.end > now })?.end else {
            session.timer = nil
            return
        }

        let interval = max(0.05, nextBoundary.timeIntervalSinceNow)
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .userInitiated))
        timer.schedule(deadline: .now() + interval)
        timer.setEventHandler { [weak self] in
            self?.fireNudge(sessionId: sessionId)
        }
        session.timer = timer
        timer.resume()
    }

    @available(iOS 16.2, *)
    private func fireNudge(sessionId: String) {
        lock.lock()
        let stored = sessions[sessionId] as? LiveSession
        lock.unlock()
        guard let session = stored else { return }

        // Re-push the existing ContentState. The schedule itself doesn't
        // change — this is just a hint to iOS to re-snapshot the widget,
        // which causes the widget body to recompute the active phase from
        // Date() and render the new countdown.
        let state = session.activity.content.state
        let staleDate = (state.phases.last?.end ?? Date()).addingTimeInterval(60)

        Task {
            await session.activity.update(.init(state: state, staleDate: staleDate))
        }

        scheduleNextNudge(sessionId: sessionId)
    }

    @available(iOS 16.2, *)
    private func cancelAllTimers() {
        lock.lock()
        let allSessions = sessions.values.compactMap { $0 as? LiveSession }
        lock.unlock()
        for session in allSessions {
            session.timer?.cancel()
            session.timer = nil
        }
    }

    @available(iOS 16.2, *)
    private func buildSchedule(phasesRaw: [[String: Any]], firstPhaseStart: Date) -> [LiveTimerAttributes.ScheduledPhase] {
        var out: [LiveTimerAttributes.ScheduledPhase] = []
        var cursor = firstPhaseStart
        for raw in phasesRaw {
            guard let id = raw["id"] as? String,
                  let label = raw["label"] as? String
            else { continue }
            let duration = (raw["durationSeconds"] as? Double)
                ?? Double((raw["durationSeconds"] as? Int) ?? 0)
            let end = cursor.addingTimeInterval(duration)
            out.append(LiveTimerAttributes.ScheduledPhase(
                id: id,
                label: label,
                start: cursor,
                end: end
            ))
            cursor = end
        }
        return out
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

@available(iOS 16.2, *)
private final class LiveSession {
    let activity: Activity<LiveTimerAttributes>
    var timer: DispatchSourceTimer?

    init(activity: Activity<LiveTimerAttributes>) {
        self.activity = activity
    }
}

enum LiveTimerError: Error {
    case unsupportedOS
    case notAuthorized
    case invalidInput
}
