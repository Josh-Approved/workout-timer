import ActivityKit
import WidgetKit
import SwiftUI

// Josh Approved design tokens (dark-mode values). Live Activities sit over
// the lock-screen blur regardless of the host phone's appearance, so the
// surface is pinned to the system's dark elevated background with white type.
private let surface = Color(red: 19 / 255, green: 19 / 255, blue: 21 / 255)        // bg-elevated (dark) #131315
private let textPrimary = Color(red: 245 / 255, green: 245 / 255, blue: 242 / 255) // fg (dark) #F5F5F2
private let textMuted = Color(red: 160 / 255, green: 160 / 255, blue: 166 / 255)   // fg-muted (dark) #A0A0A6
private let fillFaint = Color(red: 38 / 255, green: 38 / 255, blue: 42 / 255)      // hairline (dark) #26262A

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
        // Suppress WidgetKit's implicit content margins so the padding
        // below is the single source of truth for the card's insets.
        .contentMarginsDisabled()
    }
}

private struct LockScreenView: View {
    let state: LiveTimerAttributes.ContentState

    var body: some View {
        let (active, next) = activePhase(in: state.phases, at: Date())

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(state.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(textMuted)
                    .lineLimit(1)
                Spacer(minLength: 12)
                if let active {
                    Text(active.label)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(textPrimary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(fillFaint))
                }
            }

            HStack(alignment: .firstTextBaseline) {
                if let active {
                    // .id(active.id) forces SwiftUI to recreate the view when
                    // the active phase changes. Without it, WidgetKit can keep
                    // showing the previous interval.
                    Text(timerInterval: active.start...active.end, countsDown: true)
                        .monospacedDigit()
                        .font(.system(size: 40, weight: .semibold))
                        .foregroundStyle(textPrimary)
                        .id(active.id)
                }
                Spacer()
                if let next {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Next")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(textMuted)
                        Text(next.label)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(textPrimary)
                    }
                }
            }

            if !state.actions.isEmpty {
                HStack(spacing: 8) {
                    ForEach(state.actions, id: \.self) { action in
                        Link(destination: deepLink(for: action, sessionId: state.sessionId)) {
                            Text(label(for: action))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(textPrimary)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(RoundedRectangle(cornerRadius: 10).fill(fillFaint))
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
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
