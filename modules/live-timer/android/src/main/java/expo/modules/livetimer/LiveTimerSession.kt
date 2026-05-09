package expo.modules.livetimer

// In-memory session state. Mirrors the iOS ContentState so the JS API
// behaves identically across platforms.

data class LiveTimerPhase(
    val id: String,
    val label: String,
    val durationSeconds: Long,
)

data class LiveTimerSession(
    val sessionId: String,
    val title: String,
    val phases: List<LiveTimerPhase>,
    val phaseStartMs: Long,
    val actions: List<String>,
) {
    val activePhase: LiveTimerPhase get() = phases.first()
    val nextPhaseLabel: String? get() = phases.getOrNull(1)?.label
    val phaseEndMs: Long get() = phaseStartMs + activePhase.durationSeconds * 1000L
}
