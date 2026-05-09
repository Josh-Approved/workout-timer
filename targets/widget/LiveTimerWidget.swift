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

struct LiveTimerWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveTimerAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(surface)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.phaseLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.state.phaseStart...context.state.phaseEnd, countsDown: true)
                        .monospacedDigit()
                        .font(.title2.weight(.semibold))
                        .multilineTextAlignment(.trailing)
                        .id(context.state.phaseStart)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let next = context.state.nextPhaseLabel {
                        Text("Next: \(next)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                Text(timerInterval: context.state.phaseStart...context.state.phaseEnd, countsDown: true)
                    .monospacedDigit()
                    .frame(maxWidth: 56)
                    .id(context.state.phaseStart)
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}

private struct LockScreenView: View {
    let state: LiveTimerAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(state.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(surfaceMuted)
                    .lineLimit(1)
                Spacer(minLength: 12)
                Text(state.phaseLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(surfaceFaint))
            }

            HStack(alignment: .firstTextBaseline) {
                // .id(phaseStart) forces SwiftUI to recreate the view when the
                // phase changes. Without it, WidgetKit can keep showing the
                // previous interval (the parameters change but the view
                // identity is unchanged) — the timer freezes at 0:00.
                Text(timerInterval: state.phaseStart...state.phaseEnd, countsDown: true)
                    .monospacedDigit()
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundStyle(.white)
                    .id(state.phaseStart)
                Spacer()
                if let next = state.nextPhaseLabel {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Next")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(surfaceMuted)
                        Text(next)
                            .font(.subheadline)
                            .foregroundStyle(.white)
                    }
                }
            }

            if !state.actions.isEmpty {
                HStack(spacing: 12) {
                    ForEach(state.actions, id: \.self) { action in
                        Link(destination: deepLink(for: action, sessionId: state.sessionId)) {
                            Text(label(for: action))
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(RoundedRectangle(cornerRadius: 10).fill(surfaceFainter))
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 22)
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
