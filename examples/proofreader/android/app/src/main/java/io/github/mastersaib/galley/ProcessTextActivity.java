package io.github.mastersaib.galley;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Opened from the text-selection menu ("Proofread with Galley").
 *
 * The calling app starts this activity for a result, so it runs in the
 * caller's task with the standard launch mode, separate from MainActivity
 * (whose singleTask mode would break result delivery). It hosts the same
 * web app; when the user accepts, the page calls IncomingText.finish() and
 * the corrected text replaces the selection in the source app.
 */
public class ProcessTextActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingTextPlugin.class);
        registerPlugin(SecureKeyPlugin.class);
        super.onCreate(savedInstanceState);
    }

    boolean isReadOnlySource() {
        Intent intent = getIntent();
        return intent == null || intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false);
    }

    /** Returns the text to the calling app; null closes without changes. */
    void finishWithText(String text) {
        if (text == null || isReadOnlySource()) {
            setResult(RESULT_CANCELED);
        } else {
            Intent result = new Intent();
            result.putExtra(Intent.EXTRA_PROCESS_TEXT, text);
            setResult(RESULT_OK, result);
        }
        finish();
    }
}
