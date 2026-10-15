package io.github.mastersaib.galley;

import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

/**
 * Opened from the text-selection menu ("Proofread").
 *
 * The calling app starts this activity for a result, so it runs in the
 * caller's task with the standard launch mode, separate from MainActivity
 * (whose singleTask mode would break result delivery). It hosts the same
 * web app; when the user accepts, the page calls IncomingText.finish() and
 * the corrected text replaces the selection in the source app.
 */
public class ProcessTextActivity extends BridgeActivity {

    private static final String STATE_DOC = "io.github.mastersaib.galley.RETURN_DOC";

    private volatile String returnDocId;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingTextPlugin.class);
        registerPlugin(SecureKeyPlugin.class);
        boolean fromGalley = getPackageName().equals(getCallingPackage());
        if (savedInstanceState != null || fromGalley) {
            // Recreated after a restart: the selection is already a document,
            // which the page reopens from getReturnDocId(). From Galley's own
            // editor: the text is already open.
            returnDocId = savedInstanceState == null ? null : savedInstanceState.getString(STATE_DOC);
            IncomingTextPlugin.markConsumed(getIntent());
        }
        super.onCreate(savedInstanceState);
        if (fromGalley) {
            Toast.makeText(this, R.string.process_text_in_galley, Toast.LENGTH_SHORT).show();
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    public void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_DOC, returnDocId);
    }

    String getReturnDocId() {
        return returnDocId;
    }

    void setReturnDocId(String docId) {
        returnDocId = docId;
    }

    /**
     * Whether a replacement can go back: the caller asked for a result, its
     * field is editable, and the selection was not cut short by the sender
     * (replacing a truncated selection would delete the rest of it).
     */
    boolean canReturn() {
        Intent intent = getIntent();
        if (intent == null || getCallingActivity() == null) return false;
        if (intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)) return false;
        CharSequence text = IncomingTextPlugin.charSequenceExtra(intent, Intent.EXTRA_PROCESS_TEXT);
        return text != null && text.length() < IncomingTextPlugin.PROCESS_TEXT_LIMIT;
    }

    /** Returns the text to the calling app; null closes without changes. */
    void finishWithText(String text) {
        if (text == null || !canReturn()) {
            setResult(RESULT_CANCELED);
        } else {
            Intent result = new Intent();
            result.putExtra(Intent.EXTRA_PROCESS_TEXT, text);
            setResult(RESULT_OK, result);
        }
        finish();
    }
}
