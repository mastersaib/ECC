package io.github.mastersaib.galley;

import android.app.Activity;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Text sent to Galley by other apps.
 *
 *   process  "Proofread with Galley" in the text-selection menu
 *            (ACTION_PROCESS_TEXT). When the source field is editable, the
 *            page can hand corrected text back with finish().
 *   share    The share sheet (ACTION_SEND, text/plain).
 *
 * BridgeActivity replays the launching intent through onNewIntent while the
 * page is still loading, so launch text arrives as a retained "incomingText"
 * event that the page receives as soon as it adds its listener; text shared
 * while the app is open arrives the same way. getPending() is a fallback for
 * an intent that was not replayed.
 */
@CapacitorPlugin(name = "IncomingText")
public class IncomingTextPlugin extends Plugin {

    static final String EXTRA_CONSUMED = "io.github.mastersaib.galley.CONSUMED";
    private static final int MAX_CHARS = 500_000;

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject result = new JSObject();
        Activity activity = getActivity();
        JSObject item = activity == null ? null : read(activity.getIntent());
        result.put("item", item);
        call.resolve(result);
    }

    @PluginMethod
    public void finish(PluginCall call) {
        String text = call.getString("text");
        Activity activity = getActivity();
        if (!(activity instanceof ProcessTextActivity)) {
            call.reject("Galley was not opened from selected text.");
            return;
        }
        ProcessTextActivity host = (ProcessTextActivity) activity;
        if (text != null && host.isReadOnlySource()) {
            call.reject("The app that sent this text does not accept changes.");
            return;
        }
        call.resolve();
        activity.runOnUiThread(() -> host.finishWithText(text));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject item = read(intent);
        if (item != null) notifyListeners("incomingText", item, true);
    }

    /** Reads a supported intent once; later calls return null for it. */
    static JSObject read(Intent intent) {
        if (intent == null || intent.getBooleanExtra(EXTRA_CONSUMED, false)) return null;
        String action = intent.getAction();
        CharSequence text = null;
        JSObject item = new JSObject();
        if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
            text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
            item.put("source", "process");
            item.put("readOnly", intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false));
        } else if (Intent.ACTION_SEND.equals(action) && "text/plain".equals(intent.getType())) {
            text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            item.put("source", "share");
            item.put("readOnly", true);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (subject != null) item.put("title", subject);
        }
        if (text == null) return null;
        String value = text.toString();
        if (value.length() > MAX_CHARS) value = value.substring(0, MAX_CHARS);
        item.put("text", value);
        intent.putExtra(EXTRA_CONSUMED, true);
        return item;
    }
}
