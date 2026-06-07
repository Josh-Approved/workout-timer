package expo.modules.livetimer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat

// Foreground service that hosts the persistent on-screen timer notification.
// One service for all sessions (Android only ever shows one). Updates the
// same notification id in place — no notification stream.
//
// Phase advancement runs from this service via a main-looper Handler
// scheduled from the workout schedule passed in at start. Relying on the
// JS bridge to push boundary updates leaves the chronometer stuck at
// 0:00 when the bridge gets throttled in deep idle; the service's
// wakelock keeps the Handler firing reliably.

class LiveTimerService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var boundaryRunnable: Runnable? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel(this)
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LiveTimer:Workout").apply {
            setReferenceCounted(false)
            acquire(MAX_WAKE_LOCK_MS)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START, ACTION_UPDATE -> {
                val session = LiveTimerStore.current ?: return START_STICKY
                val notification = buildNotification(session)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
                scheduleNextBoundary()
            }
            ACTION_STOP -> {
                cancelBoundary()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        cancelBoundary()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    private fun scheduleNextBoundary() {
        cancelBoundary()
        val session = LiveTimerStore.current ?: return
        val delayMs = session.phaseEndMs - System.currentTimeMillis()
        val safeDelay = if (delayMs < 50L) 50L else delayMs
        val r = Runnable { onBoundary() }
        boundaryRunnable = r
        handler.postDelayed(r, safeDelay)
    }

    private fun cancelBoundary() {
        boundaryRunnable?.let { handler.removeCallbacks(it) }
        boundaryRunnable = null
    }

    private fun onBoundary() {
        val current = LiveTimerStore.current ?: return
        if (current.phases.size <= 1) {
            // Final phase finished. Leave the notification displaying
            // 0:00; JS endLiveTimer tears the service down when the
            // workout completes.
            return
        }
        // Anchor the new phase to the previous phase's scheduled end so
        // small handler drift doesn't accumulate across phases.
        val prevPhase = current.phases.first()
        val nextStartMs = current.phaseStartMs + prevPhase.durationSeconds * 1000L
        val advanced = current.copy(
            phases = current.phases.drop(1),
            phaseStartMs = nextStartMs,
        )
        LiveTimerStore.current = advanced
        val notification = buildNotification(advanced)
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
        scheduleNextBoundary()
    }

    private fun buildNotification(session: LiveTimerSession): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle("${session.title} - ${session.activePhase.label}")
            .setContentText(session.nextPhaseLabel?.let { "Next: $it" } ?: "")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            // Chronometer base must be a wall-clock timestamp: the framework
            // converts `when` (System.currentTimeMillis timebase) into the
            // Chronometer's elapsedRealtime base itself. phaseEndMs is already
            // wall-clock, so pass it directly — feeding an elapsedRealtime value
            // here double-applies the offset and shows a garbage countdown.
            .setWhen(session.phaseEndMs)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setContentIntent(contentIntent)

        for (action in session.actions) {
            builder.addAction(buildAction(action, session.sessionId))
        }
        return builder.build()
    }

    private fun buildAction(action: String, sessionId: String): NotificationCompat.Action {
        val intent = Intent(this, LiveTimerActionReceiver::class.java).apply {
            this.action = LiveTimerActionReceiver.ACTION_INVOKE
            putExtra(LiveTimerActionReceiver.EXTRA_ACTION, action)
            putExtra(LiveTimerActionReceiver.EXTRA_SESSION, sessionId)
        }
        val pi = PendingIntent.getBroadcast(
            this,
            action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val label = when (action) {
            "pause" -> "Pause"
            "resume" -> "Resume"
            "skip" -> "Skip"
            "stop" -> "Stop"
            else -> action.replaceFirstChar { it.titlecase() }
        }
        return NotificationCompat.Action.Builder(0, label, pi).build()
    }

    companion object {
        const val CHANNEL_ID = "live-timer"
        const val CHANNEL_NAME = "Live Timer"
        const val NOTIFICATION_ID = 7421
        const val ACTION_START = "expo.modules.livetimer.START"
        const val ACTION_UPDATE = "expo.modules.livetimer.UPDATE"
        const val ACTION_STOP = "expo.modules.livetimer.STOP"
        private const val MAX_WAKE_LOCK_MS = 2L * 60L * 60L * 1000L

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
                description = "Persistent timer for an active workout"
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
            nm.createNotificationChannel(channel)
        }
    }
}

object LiveTimerStore {
    @Volatile var current: LiveTimerSession? = null
}
