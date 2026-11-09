package app.kakie

import android.app.Application
import app.kakie.lib.Device
import app.kakie.lib.Store

class KakieApp : Application() {
    lateinit var device: Device
    lateinit var store: Store

    override fun onCreate() {
        super.onCreate()
        instance = this
        device = Device(this)
        store = Store(filesDir, device)
    }

    companion object {
        lateinit var instance: KakieApp
            private set
    }
}
