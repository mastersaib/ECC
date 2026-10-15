package io.github.mastersaib.galley;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Stores the user's Anthropic API key on this device only.
 *
 * The value is encrypted with AES-256-GCM under a key that lives in the
 * Android Keystore and cannot be exported. Only the IV and ciphertext are
 * written to SharedPreferences, and that file is excluded from cloud backup
 * and device transfer (see res/xml/backup_rules.xml and
 * data_extraction_rules.xml), because a restored ciphertext could never be
 * decrypted on another device anyway. The key is never logged.
 */
@CapacitorPlugin(name = "SecureKey")
public class SecureKeyPlugin extends Plugin {

    static final String PREFS = "galley_secure";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "galley_api_key_v1";
    private static final String FIELD = "anthropic_api_key";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;
    private static final int MAX_LENGTH = 512;

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        String stored = prefs().getString(FIELD, null);
        if (stored == null) {
            result.put("value", null);
            call.resolve(result);
            return;
        }
        try {
            result.put("value", decrypt(stored));
        } catch (Exception e) {
            // The Keystore key is gone (app data restored elsewhere, or the
            // key was invalidated): the stored value is unreadable, so drop it.
            prefs().edit().remove(FIELD).apply();
            result.put("value", null);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.trim().isEmpty()) {
            call.reject("A key is required.");
            return;
        }
        if (value.length() > MAX_LENGTH) {
            call.reject("That key is too long.");
            return;
        }
        try {
            prefs().edit().putString(FIELD, encrypt(value.trim())).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("The key could not be stored securely on this device.");
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().remove(FIELD).apply();
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(ALIAS)) keyStore.deleteEntry(ALIAS);
        } catch (Exception ignored) {
            // Nothing left to decrypt once the preference is removed.
        }
        call.resolve();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(ALIAS)) {
            return (SecretKey) keyStore.getKey(ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP);
    }

    private String decrypt(String stored) throws Exception {
        int colon = stored.indexOf(':');
        if (colon < 0) throw new IllegalStateException("Malformed value");
        byte[] iv = Base64.decode(stored.substring(0, colon), Base64.NO_WRAP);
        byte[] sealed = Base64.decode(stored.substring(colon + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(TAG_BITS, iv));
        return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
    }
}
