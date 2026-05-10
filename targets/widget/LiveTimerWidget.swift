import ActivityKit
import WidgetKit
import SwiftUI

// Fixed dark surface so the widget reads consistently regardless of the
// host phone's light/dark mode. Live Activities sit over the lock-screen
// blur, where dark + white type is the safe choice.
private let surface = Color(red: 0.08, green: 0.08, blue: 0.08)
private let surfaceMuted = Color.white.opacity(0.62)
private let surfaceFaint = Color.white.opacity(0.10)
private let surfaceFainter = Color.white.opacity(0.06)

// Computes which phase is active right now from the schedule. The widget
// re-derives this on every render, so a lock-screen peek shows the
// correct phase regardless of whether activity.update() landed on time.
private func activePhase(in phases: [LiveTimerAttributes.ScheduledPhase], at now: Date)
    -> (active: LiveTimerAttributes.ScheduledPhase?, next: LiveTimerAttributes.ScheduledPhase?)
{
    guard !phases.isEmpty else { return (nil, nil) }
    if let idx = phases.firstIndex(where: { now < $0.end }) {
        let next = idx + 1 < phases.count ? phases[idx + 1] : nil
        return (phases[idx], next)
    }
    return (phases.last, nil)
}

struct LiveTimerWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveTimerAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(surface)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let (active, _) = activePhase(in: context.state.phases, at: Date())
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(active?.label ?? "")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let active {
                        Text(timerInterval: active.start...active.end, countsDown: true)
                            .monospacedDigit()
                            .font(.title2.weight(.semibold))
                            .multilineTextAlignment(.trailing)
                            .id(active.id)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    let (_, next) = activePhase(in: context.state.phases, at: Date())
                    if let next {
                        Text("Next: \(next.label)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                if let active {
                    Text(timerInterval: active.start...active.end, countsDown: true)
                        .monospacedDigit()
                        .frame(maxWidth: 56)
                        .id(active.id)
                }
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}

private struct LockScreenView: View {
    let state: LiveTimerAttributes.ContentState

    var body: some View {
        let (active, next) = activePhase(in: state.phases, at: Date())

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(state.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(surfaceMuted)
                    .lineLimit(1)
                Spacer(minLength: 12)
                if let active {
                    Text(active.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(surfaceFaint))
                }
            }

            HStack(alignment: .firstTextBaseline) {
                if let active {
                    // .id(active.id) forces SwiftUI to recreate the view when
                    // the active phase changes. Without it, WidgetKit can keep
                    // showing the previous interval.
                    Text(timerInterval: active.start...active.end, countsDown: true)
                        .monospacedDigit()
                        .font(.system(size: 56, weight: .semibold))
                        .foregroundStyle(.white)
                        .id(active.id)
                }
                Spacer()
                if let next {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Next")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(surfaceMuted)
                        Text(next.label)
                            .font(.subheadline)
                            .foregroundStyle(.white)
                    }
                }
            }

            if !state.actions.isEmpty {
                HStack(spacing: 10) {
                    ForEach(state.actions, id: \.self) { action in
                        Link(destination: deepLink(for: action, sessionId: state.sessionId)) {
                            Text(label(for: action))
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(RoundedRectangle(cornerRadius: 10).fill(surfaceFainter))
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    private func label(for action: String) -> String {
        switch action {
        case "pause": return "Pause"
        case "resume": return "Resume"
        case "skip": return "Skip"
        case "stop": return "Stop"
        default: return action.capitalized
        }
    }

    private func deepLink(for action: String, sessionId: String) -> URL {
        let scheme = Bundle.main.object(forInfoDictionaryKey: "LiveTimerURLScheme") as? String ?? "livetimer"
        return URL(string: "\(scheme)://action?session=\(sessionId)&action=\(action)")!
    }
}
