package by.kolaapp.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // свои плагины регистрируются до запуска моста
        registerPlugin(TimerNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
