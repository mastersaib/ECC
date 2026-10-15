package io.github.mastersaib.galley;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Text sent to Galley by other apps.
 *
 *   process  "Proofread" in the text-selection menu (ACTION_PROCESS_TEXT),
 *            handled by ProcessTextActivity. When the source field is
 *            editable, the page can hand corrected text back with finish().
 *   share    The share sheet (ACTION_SEND, text/plain), handled by
 *            MainActivity: shared text, or a shared .txt file.
 *
 * BridgeActivity replays the launching intent through onNewIntent while the
 * page is still loading, so it arrives as a retained "incomingText" event that
 * the page receives as soon as it adds its listener; text shared while the app
 * is open arrives the same way. Each intent is read once: the activities mark
 * it consumed when they are recreated, so a restart never imports it again.
 */
@CapacitorPlugin(name = "IncomingText")
public class IncomingTextPlugin extends Plugin {

    static final String EXTRA_CONSUMED = "io.github.mastersaib.galley.CONSUMED";
    /** TextView and Chromium cap a PROCESS_TEXT selection at this many characters. */
    static final int PROCESS_TEXT_LIMIT = 100_000;
    private static final int MAX_SHARE_CHARS = 500_000;
    private static final int MAX_FILE_BYTES = 2_000_000;

    private final ExecutorService reader = Executors.newSingleThreadExecutor();

    /** Which window the page is in, so it can restore its state after a restart. */
    @PluginMethod
    public void getHost(PluginCall call) {
        JSObject result = new JSObject();
        Activity activity = getActivity();
        if (activity instanceof ProcessTextActivity) {
            ProcessTextActivity host = (ProcessTextActivity) activity;
            result.put("mode", "process");
            result.put("canReturn", host.canReturn());
            String docId = host.getReturnDocId();
            if (docId != null) result.put("docId", docId);
        } else {
            result.put("mode", "main");
        }
        call.resolve(result);
    }

    /** Remembers which document holds the selection, across restarts. */
    @PluginMethod
    public void setReturnDoc(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof ProcessTextActivity) {
            ((ProcessTextActivity) activity).setReturnDocId(call.getString("docId"));
        }
        call.resolve();
    }

    /** Closes the selection window, replacing the selection when text is given. */
    @PluginMethod
    public void finish(PluginCall call) {
        String text = call.getString("text");
        Activity activity = getActivity();
        if (!(activity instanceof ProcessTextActivity)) {
            call.reject("Galley was not opened from selected text.");
            return;
        }
        ProcessTextActivity host = (ProcessTextActivity) activity;
        if (text != null && !host.canReturn()) {
            call.reject("The app that sent this text does not accept changes.");
            return;
        }
        if (text != null && text.length() > PROCESS_TEXT_LIMIT) {
            call.reject("The corrected text is too long to send back. Copy it instead.");
            return;
        }
        call.resolve();
        activity.runOnUiThread(() -> host.finishWithText(text));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || intent.getBooleanExtra(EXTRA_CONSUMED, false)) return;
        Activity activity = getActivity();
        String action = intent.getAction();
        if (activity instanceof ProcessTextActivity && Intent.ACTION_PROCESS_TEXT.equals(action)) {
            markConsumed(intent);
            deliverSelection(intent, (ProcessTextActivity) activity);
        } else if (!(activity instanceof ProcessTextActivity) && Intent.ACTION_SEND.equals(action) && "text/plain".equals(intent.getType())) {
            markConsumed(intent);
            deliverShare(intent);
        }
    }

    @Override
    protected void handleOnDestroy() {
        reader.shutdownNow();
        super.handleOnDestroy();
    }

    static void markConsumed(Intent intent) {
        if (intent != null) intent.putExtra(EXTRA_CONSUMED, true);
    }

    private void deliverSelection(Intent intent, ProcessTextActivity host) {
        CharSequence text = charSequenceExtra(intent, Intent.EXTRA_PROCESS_TEXT);
        if (text == null) return;
        JSObject item = new JSObject();
        item.put("source", "process");
        item.put("text", text.toString());
        item.put("canReturn", host.canReturn());
        item.put("truncated", text.length() >= PROCESS_TEXT_LIMIT);
        notifyListeners("incomingText", item, true);
    }

    private void deliverShare(Intent intent) {
        CharSequence text = charSequenceExtra(intent, Intent.EXTRA_TEXT);
        String subject = stringExtra(intent, Intent.EXTRA_SUBJECT);
        if (text != null) {
            notifyListeners("incomingText", shareItem(text.toString(), subject), true);
            return;
        }
        Uri uri = streamExtra(intent);
        if (uri == null || !ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) return;
        // A shared file may live on a slow or remote provider: read it off the
        // main thread while the share grant is still held by this activity.
        ContentResolver resolver = getContext().getContentResolver();
        reader.execute(() -> {
            JSObject item;
            try {
                String name = displayName(resolver, uri);
                item = shareItem(readText(resolver, uri), subject != null ? subject : name);
            } catch (Exception e) {
                item = new JSObject();
                item.put("source", "share");
                item.put("error", e instanceof TooLarge ? e.getMessage() : "Galley could not read the shared file.");
            }
            notifyListeners("incomingText", item, true);
        });
    }

    private static JSObject shareItem(String text, String title) {
        JSObject item = new JSObject();
        item.put("source", "share");
        item.put("text", text.length() > MAX_SHARE_CHARS ? text.substring(0, MAX_SHARE_CHARS) : text);
        item.put("truncated", text.length() > MAX_SHARE_CHARS);
        if (title != null && !title.trim().isEmpty()) item.put("title", title.trim());
        return item;
    }

    private static final class TooLarge extends Exception {
        private static final long serialVersionUID = 1L;

        TooLarge() {
            super("The shared file is too large to open in Galley (2 MB at most).");
        }
    }

    private static String readText(ContentResolver resolver, Uri uri) throws Exception {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("No content");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > MAX_FILE_BYTES) throw new TooLarge();
            }
            String text = new String(out.toByteArray(), StandardCharsets.UTF_8);
            // Drop a UTF-8 byte-order mark (U+FEFF) at the start of the file
            return !text.isEmpty() && text.charAt(0) == 0xFEFF ? text.substring(1) : text;
        }
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (RuntimeException e) {
            // The title falls back to "Shared text"
        }
        return null;
    }

    // Extras come from another app's Parcel, which can fail to unpack.

    static CharSequence charSequenceExtra(Intent intent, String name) {
        try {
            return intent.getCharSequenceExtra(name);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String stringExtra(Intent intent, String name) {
        try {
            return intent.getStringExtra(name);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static Uri streamExtra(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= 34) return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            return legacyStreamExtra(intent);
        } catch (RuntimeException e) {
            return null;
        }
    }

    @SuppressWarnings("deprecation")
    private static Uri legacyStreamExtra(Intent intent) {
        Object value = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        return value instanceof Uri ? (Uri) value : null;
    }
}
