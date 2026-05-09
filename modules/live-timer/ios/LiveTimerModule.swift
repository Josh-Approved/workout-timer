import ActivityKit
import ExpoModulesCore
import Foundation

// JS → native bridge. Manages a single Live Activity per session id and
// emits action events back to JS when the user taps a widget button.
//
// Phase advancement is driven by a native DispatchSourceTimer scheduled
// from the workout schedule passed in at start (and replaced on update).
// The JS bridge is throttled while the host app is backgrounded — even
// with the audio keep-alive holding the process alive — so relying on a
// JS-side setInterval to push phase boundary updates leaves the Live
// Activity stuck at 0:00 between phases. Native scheduling fires at the
// boundary regardless of JS state.
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
            self.cancelAllTimers()
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

        let phases = phasesRaw.compactMap(parsePhase)
        guard let firstPhase = phases.first else {
            throw LiveTimerError.invalidInput
        }

        // If a session for this id already exists (e.g. resume-from-pause
        // path in the host app), tear it down before starting a new one.
        await endSession(sessionId: sessionId)

        let phaseStart = Date(timeIntervalSince1970: phaseStartMs / 1000)
        let phaseEnd = phaseStart.addingTimeInterval(firstPhase.durationSeconds)
        let nextLabel = phases.count > 1 ? phases[1].label : nil

        let state = LiveTimerAttributes.ContentState(
            sessionId: sessionId,
            title: title,
            phaseId: firstPhase.id,
            phaseLabel: firstPhase.label,
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

        let session = LiveSession(
            activity: activity,
            title: title,
            phases: phases,
            actions: actions,
            currentIndex: 0,
            phaseStart: phaseStart
        )

        lock.lock()
        sessions[sessionId] = session
        lock.unlock()

        scheduleNextBoundary(sessionId: sessionId)
    }

    @available(iOS 16.2, *)
    private func updateActivity(input: [String: Any]) async throws {
        guard let sessionId = input["sessionId"] as? String else { return }

        lock.lock()
        let stored = sessions[sessionId] as? LiveSession
        lock.unlock()
        guard let session = stored else { return }

        // Cancel the in-flight boundary timer; we're resetting the schedule.
        session.timer?.cancel()
        session.timer = nil

        if let title = input["title"] as? String { session.title = title }
        if let actions = input["actions"] as? [String] { session.actions = actions }

        if let phasesRaw = input["phases"] as? [[String: Any]] {
            let parsed = phasesRaw.compactMap(parsePhase)
            if !parsed.isEmpty {
                // JS sends the schedule starting at the new active phase.
                session.phases = parsed
                session.currentIndex = 0
            }
        }

        if let ms = input["phaseStartMs"] as? Double {
            session.phaseStart = Date(timeIntervalSince1970: ms / 1000)
        }

        guard let active = session.phases[safe: session.currentIndex] else { return }
        let phaseEnd = session.phaseStart.addingTimeInterval(active.durationSeconds)
        let nextLabel = session.phases[safe: session.currentIndex + 1]?.label

        let next = LiveTimerAttributes.ContentState(
            sessionId: sessionId,
            title: session.title,
            phaseId: active.id,
            phaseLabel: active.label,
            phaseStart: session.phaseStart,
            phaseEnd: phaseEnd,
            nextPhaseLabel: nextLabel,
            actions: session.actions
        )

        await session.activity.update(.init(state: next, staleDate: phaseEnd.addingTimeInterval(60)))
        scheduleNextBoundary(sessionId: sessionId)
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
    private func scheduleNextBoundary(sessionId: String) {
        lock.lock()
        let stored = sessions[sessionId] as? LiveSession
        lock.unlock()
        guard let session = stored,
              let active = session.phases[safe: session.currentIndex]
        else { return }

        let phaseEnd = session.phaseStart.addingTimeInterval(active.durationSeconds)
        let interval = max(0.05, phaseEnd.timeIntervalSinceNow)

        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .userInitiated))
        timer.schedule(deadline: .now() + interval)
        timer.setEventHandler { [weak self] in
            self?.advancePhase(sessionId: sessionId)
        }
        session.timer = timer
        timer.resume()
    }

    @available(iOS 16.2, *)
    private func advancePhase(sessionId: String) {
        lock.lock()
        let stored = sessions[sessionId] as? LiveSession
        lock.unlock()
        guard let session = stored else { return }

        let nextIndex = session.currentIndex + 1
        guard let nextPhase = session.phases[safe: nextIndex],
              let prevPhase = session.phases[safe: session.currentIndex]
        else {
            // No more phases. Leave the activity displaying 0:00 on the
            // final phase; JS endLiveTimer will tear it down when the
            // workout completes.
            session.timer = nil
            return
        }

        // Anchor to the previous phase's scheduled end so small
        // native-timer drift doesn't accumulate across phases.
        let nextStart = session.phaseStart.addingTimeInterval(prevPhase.durationSeconds)
        let nextEnd = nextStart.addingTimeInterval(nextPhase.durationSeconds)
        let nextLabel = session.phases[safe: nextIndex + 1]?.label

        session.currentIndex = nextIndex
        session.phaseStart = nextStart

        let state = LiveTimerAttributes.ContentState(
            sessionId: sessionId,
            title: session.title,
            phaseId: nextPhase.id,
            phaseLabel: nextPhase.label,
            phaseStart: nextStart,
            phaseEnd: nextEnd,
            nextPhaseLabel: nextLabel,
            actions: session.actions
        )

        Task {
            await session.activity.update(.init(state: state, staleDate: nextEnd.addingTimeInterval(60)))
        }

        scheduleNextBoundary(sessionId: sessionId)
    }

    private func cancelAllTimers() {
        lock.lock()
        let allSessions = sessions.values.compactMap { $0 as? LiveSession }
        lock.unlock()
        for session in allSessions {
            session.timer?.cancel()
            session.timer = nil
        }
    }

    private func parsePhase(_ raw: [String: Any]) -> PhaseInfo? {
        guard let id = raw["id"] as? String,
              let label = raw["label"] as? String
        else { return nil }
        let duration = (raw["durationSeconds"] as? Double)
            ?? Double((raw["durationSeconds"] as? Int) ?? 0)
        return PhaseInfo(id: id, label: label, durationSeconds: duration)
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
    var title: String
    var phases: [PhaseInfo]
    var actions: [String]
    var currentIndex: Int
    var phaseStart: Date
    var timer: DispatchSourceTimer?

    init(
        activity: Activity<LiveTimerAttributes>,
        title: String,
        phases: [PhaseInfo],
        actions: [String],
        currentIndex: Int,
        phaseStart: Date
    ) {
        self.activity = activity
        self.title = title
        self.phases = phases
        self.actions = actions
        self.currentIndex = currentIndex
        self.phaseStart = phaseStart
    }
}

private struct PhaseInfo {
    let id: String
    let label: String
    let durationSeconds: TimeInterval
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}

enum LiveTimerError: Error {
    case unsupportedOS
    case notAuthorized
    case invalidInput
}
