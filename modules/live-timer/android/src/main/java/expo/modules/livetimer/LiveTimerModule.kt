package expo.modules.livetimer

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiveTimerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("LiveTimerModule")
        Events("event")

        OnCreate { activeInstance = this@LiveTimerModule }
        OnDestroy { if (activeInstance === this@LiveTimerModule) activeInstance = null }

        AsyncFunction("getAvailability") { ->
            val ctx = appContext.reactContext ?: return@AsyncFunction availability(false, false, "no_context")
            val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            if (!supported) return@AsyncFunction availability(false, false, "android_below_8")

            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val notificationsOn = nm.areNotificationsEnabled()
            val postOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
                    PackageManager.PERMISSION_GRANTED
            } else true
            val enabled = notificationsOn && postOk
            availability(true, enabled, if (enabled) null else "notifications_disabled")
        }

        AsyncFunction("start") { input: Map<String, Any?> ->
            val session = parseSession(input) ?: throw IllegalArgumentException("invalid_input")
            LiveTimerStore.current = session
            val ctx = requireContext()
            LiveTimerService.ensureChannel(ctx)
            val intent = Intent(ctx, LiveTimerService::class.java).setAction(LiveTimerService.ACTION_START)
            ContextCompat.startForegroundService(ctx, intent)
        }

        AsyncFunction("update") { input: Map<String, Any?> ->
            val current = LiveTimerStore.current ?: return@AsyncFunction
            val sessionId = input["sessionId"] as? String ?: return@AsyncFunction
            if (sessionId != current.sessionId) return@AsyncFunction
            val merged = mergeSession(current, input)
            LiveTimerStore.current = merged
            val ctx = requireContext()
            val intent = Intent(ctx, LiveTimerService::class.java).setAction(LiveTimerService.ACTION_UPDATE)
            ContextCompat.startForegroundService(ctx, intent)
        }

        AsyncFunction("end") { sessionId: String ->
            val current = LiveTimerStore.current
            if (current?.sessionId != sessionId) return@AsyncFunction
            LiveTimerStore.current = null
            val ctx = requireContext()
            val intent = Intent(ctx, LiveTimerService::class.java).setAction(LiveTimerService.ACTION_STOP)
            ctx.startService(intent)
        }
    }

    fun emitAction(sessionId: String, action: String) {
        sendEvent("event", mapOf(
            "type" to "action",
            "sessionId" to sessionId,
            "action" to action,
        ))
    }

    private fun requireContext(): Context =
        appContext.reactContext ?: error("React context unavailable")

    private fun availability(supported: Boolean, enabled: Boolean, reason: String?) =
        mapOf("supported" to supported, "enabled" to enabled, "reason" to reason)

    private fun parseSession(input: Map<String, Any?>): LiveTimerSession? {
        val sessionId = input["sessionId"] as? String ?: return null
        val title = input["title"] as? String ?: return null
        val rawPhases = input["phases"] as? List<*> ?: return null
        val phases = rawPhases.mapNotNull { it as? Map<*, *> }.map { p ->
            LiveTimerPhase(
                id = p["id"] as? String ?: "",
                label = p["label"] as? String ?: "",
                durationSeconds = (p["durationSeconds"] as? Number)?.toLong() ?: 0L,
            )
        }
        if (phases.isEmpty()) return null
        val phaseStartMs = (input["phaseStartMs"] as? Number)?.toLong() ?: System.currentTimeMillis()
        val actions = (input["actions"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
        return LiveTimerSession(sessionId, title, phases, phaseStartMs, actions)
    }

    private fun mergeSession(current: LiveTimerSession, input: Map<String, Any?>): LiveTimerSession {
        val title = input["title"] as? String ?: current.title
        val phases = (input["phases"] as? List<*>)?.let { raw ->
            raw.mapNotNull { it as? Map<*, *> }.map { p ->
                LiveTimerPhase(
                    id = p["id"] as? String ?: "",
                    label = p["label"] as? String ?: "",
                    durationSeconds = (p["durationSeconds"] as? Number)?.toLong() ?: 0L,
                )
            }
        } ?: current.phases
        val phaseStartMs = (input["phaseStartMs"] as? Number)?.toLong() ?: current.phaseStartMs
        val actions = (input["actions"] as? List<*>)?.mapNotNull { it as? String } ?: current.actions
        return LiveTimerSession(current.sessionId, title, phases, phaseStartMs, actions)
    }

    companion object {
        @Volatile var activeInstance: LiveTimerModule? = null
    }
}
