package io.github.mastersaib.galley;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * The app's main window. Local plugins must be registered before
 * super.onCreate() so the bridge knows them when the page loads. Text shared
 * to Galley while it is open arrives through onNewIntent, which the bridge
 * forwards to IncomingTextPlugin.handleOnNewIntent.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingTextPlugin.class);
        registerPlugin(SecureKeyPlugin.class);
        Intent intent = getIntent();
        if (savedInstanceState != null || (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            // Recreated after a restart, or reopened from Recents with the
            // intent that first started it: its text was imported then.
            IncomingTextPlugin.markConsumed(intent);
        }
        super.onCreate(savedInstanceState);
    }
}
