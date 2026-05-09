package expo.modules.livetimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Receives notification action button taps and forwards them to the
// active LiveTimerModule, which emits a JS event. Stays in the
// notification surface — does not bring the app to the foreground.

class LiveTimerActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_INVOKE) return
        val action = intent.getStringExtra(EXTRA_ACTION) ?: return
        val sessionId = intent.getStringExtra(EXTRA_SESSION) ?: return
        LiveTimerModule.activeInstance?.emitAction(sessionId, action)
    }

    companion object {
        const val ACTION_INVOKE = "expo.modules.livetimer.INVOKE_ACTION"
        const val EXTRA_ACTION = "action"
        const val EXTRA_SESSION = "session"
    }
}
