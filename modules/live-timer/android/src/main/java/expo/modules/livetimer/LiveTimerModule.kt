package expo.modules.livetimer

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiveTimerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("LiveTimerModule")
        Events("event")

        OnCreate { activeInstance = this@LiveTimerModule }
        OnDestroy {
            if (activeInstance === this@LiveTimerModule) activeInstance = null
            wakeHandler.removeCallbacksAndMessages(null)
        }

        // A clock that keeps counting while the phone sleeps and never jumps
        // when the OS adjusts the time of day. The workout timer runs on it, so
        // it can't drift. Milliseconds from boot: only differences mean anything.
        Function("nowMs") { SystemClock.elapsedRealtimeNanos() / 1_000_000.0 }

        // React Native drives JS timers from frame callbacks, which stop while
        // the app isn't in front (screen off, shade down, another app). The
        // workout arms each of its wakes here as well: a main-looper Handler
        // (kept running by the foreground service's wake lock) fires a "wake"
        // event back to JS, so cues and class commands land on time anyway.
        // One pending wake per id; arming an id again replaces it.
        Function("wakeAfter") { id: String, delayMs: Double ->
            wakeHandler.post {
                wakes.remove(id)?.let { wakeHandler.removeCallbacks(it) }
                val r = Runnable {
                    wakes.remove(id)
                    sendEvent("event", mapOf("type" to "wake", "id" to id))
                }
                wakes[id] = r
                wakeHandler.postDelayed(r, delayMs.toLong().coerceAtLeast(0L))
            }
        }

        Function("cancelWake") { id: String ->
            wakeHandler.post { wakes.remove(id)?.let { wakeHandler.removeCallbacks(it) } }
        }

        // What the phone will do with the workout's sound, for the diagnostic
        // log: the media volume (0–1) and where the sound goes. Reads only;
        // changes nothing. Whether another app is playing can't be told apart
        // from the workout's own keep-alive here, so it is left out.
        AsyncFunction("getAudioOutput") { ->
            val ctx = appContext.reactContext ?: return@AsyncFunction null
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val stream = AudioManager.STREAM_MUSIC
            val max = am.getStreamMaxVolume(stream).coerceAtLeast(1)
            val volume = if (am.isStreamMute(stream)) 0.0 else am.getStreamVolume(stream).toDouble() / max
            mapOf("volume" to volume, "output" to mediaOutput(am), "otherAudio" to null)
        }

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

    private val wakeHandler = Handler(Looper.getMainLooper())
    private val wakes = HashMap<String, Runnable>()

    fun emitAction(sessionId: String, action: String) {
        sendEvent("event", mapOf(
            "type" to "action",
            "sessionId" to sessionId,
            "action" to action,
        ))
    }

    // Where media sound goes right now. Android 13+ says which device media is
    // routed to; before that, the connected outputs are ranked the way Android
    // routes media (a headset or Bluetooth device wins over the speaker).
    private fun mediaOutput(am: AudioManager): String {
        val devices = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val media = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build()
            am.getAudioDevicesForAttributes(media)
        } else {
            am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        }
        if (devices.isEmpty()) return "none"
        val names = devices.map { outputName(it.type) }
        return OUTPUT_RANK.firstOrNull { it in names } ?: "other"
    }

    // One plain word per kind of output, the same words iOS reports.
    private fun outputName(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_BLE_SPEAKER,
        AudioDeviceInfo.TYPE_BLE_BROADCAST,
        AudioDeviceInfo.TYPE_HEARING_AID -> "bluetooth"
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "headphones"
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb"
        AudioDeviceInfo.TYPE_HDMI -> "hdmi"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "speaker"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
        else -> "other"
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
                countsUp = (p["countsUp"] as? Boolean) ?: false,
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
                    countsUp = (p["countsUp"] as? Boolean) ?: false,
                )
            }
        } ?: current.phases
        val phaseStartMs = (input["phaseStartMs"] as? Number)?.toLong() ?: current.phaseStartMs
        val actions = (input["actions"] as? List<*>)?.mapNotNull { it as? String } ?: current.actions
        return LiveTimerSession(current.sessionId, title, phases, phaseStartMs, actions)
    }

    companion object {
        @Volatile var activeInstance: LiveTimerModule? = null

        private val OUTPUT_RANK = listOf("bluetooth", "headphones", "usb", "hdmi", "speaker", "earpiece")
    }
}
