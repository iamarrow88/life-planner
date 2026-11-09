package by.kolaapp.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Идущий таймер в шторке: название, время с начала (тикает само, его считает система) и кнопка «Стоп».
 * Уведомление беззвучное и не смахивается. «Стоп» открывает приложение с пометкой — таймер останавливает JS (native.ts),
 * так же, как кнопки в напоминаниях о задачах.
 */
@CapacitorPlugin(name = "TimerNotification")
public class TimerNotificationPlugin extends Plugin {
    // обычная важность (иначе Android прячет уведомление в свёрнутую группу «Без звука» вместе с кнопкой),
    // но без звука и вибрации
    private static final String CHANNEL = "timer_running";
    private static final String OLD_CHANNEL = "timer";
    private static final int NOTIFICATION_ID = 7;
    private static final String EXTRA_ACTION = "kolaTimerAction";
    private static final String ACTION_STOP = "stop";

    @Override
    public void load() {
        // приложение было закрыто и запущено кнопкой «Стоп»
        handle(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        if (intent == null || !ACTION_STOP.equals(intent.getStringExtra(EXTRA_ACTION))) return;
        intent.removeExtra(EXTRA_ACTION);
        JSObject data = new JSObject();
        data.put("action", ACTION_STOP);
        // слушатель в JS может появиться позже (холодный запуск) — событие дождётся его
        notifyListeners("action", data, true);
    }

    private void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(OLD_CHANNEL) != null) nm.deleteNotificationChannel(OLD_CHANNEL);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Таймер", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Идущий таймер с кнопкой «Стоп»");
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }

    private PendingIntent openApp(Context ctx, int requestCode, String action) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (action != null) intent.putExtra(EXTRA_ACTION, action);
        return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @PluginMethod
    public void show(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.resolve(); // уведомления не разрешены — показывать нечего, это не ошибка
            return;
        }
        ensureChannel(ctx);
        String title = call.getString("title", "Таймер");
        String text = call.getString("text", "");
        // число из JS приходит как Integer, Long или Double — берём как есть
        long startedAt = call.getData().optLong("startedAt", 0);
        int icon = ctx.getResources().getIdentifier("ic_stat_kola", "drawable", ctx.getPackageName());

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(icon != 0 ? icon : ctx.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(ctx, 7001, null))
            .addAction(0, "Стоп", openApp(ctx, 7002, ACTION_STOP));
        if (startedAt > 0) {
            // секундомер: система сама показывает, сколько прошло с начала
            b.setWhen(startedAt).setShowWhen(true).setUsesChronometer(true);
        }
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            // разрешение отозвали между проверкой и показом
        }
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }
}
