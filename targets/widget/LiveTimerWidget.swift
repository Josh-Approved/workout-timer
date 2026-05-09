import ActivityKit
import WidgetKit
import SwiftUI

struct LiveTimerWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveTimerAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(Color(.systemBackground))
                .activitySystemActionForegroundColor(.primary)
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
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}

private struct LockScreenView: View {
    let state: LiveTimerAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(state.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(state.phaseLabel)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.primary.opacity(0.08)))
            }

            HStack(alignment: .firstTextBaseline) {
                Text(timerInterval: state.phaseStart...state.phaseEnd, countsDown: true)
                    .monospacedDigit()
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer()
                if let next = state.nextPhaseLabel {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Next")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(next)
                            .font(.subheadline)
                    }
                }
            }

            if !state.actions.isEmpty {
                HStack(spacing: 10) {
                    ForEach(state.actions, id: \.self) { action in
                        Link(destination: deepLink(for: action, sessionId: state.sessionId)) {
                            Text(label(for: action))
                                .font(.footnote.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.06)))
                        }
                    }
                }
            }
        }
        .padding(16)
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
