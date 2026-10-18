package app.kakie

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.ViewModelProvider
import app.kakie.data.KakeiModel
import app.kakie.ui.KakeiRoot

class MainActivity : AppCompatActivity() {
    private val model by lazy { ViewModelProvider(this)[KakeiModel::class.java] }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(ComposeView(this).apply { setContent { KakeiRoot(model, routeOf(intent)) } })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        setContentView(ComposeView(this).apply { setContent { KakeiRoot(model, routeOf(intent)) } })
    }

    override fun onResume() {
        super.onResume()
        model.refreshSms()
    }

    private fun routeOf(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        return when (uri.host) {
            "add" -> "add"
            "review" -> "review"
            else -> null
        }
    }
}
