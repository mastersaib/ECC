package io.github.mastersaib.galley;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;

import javax.crypto.AEADBadTagException;
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
 * decrypted on another device anyway. capacitor.config.json sets
 * loggingBehavior to "none", so Capacitor does not log plugin calls (and with
 * them the key) even in debug builds.
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
        String value = null;
        if (stored != null) {
            try {
                value = decrypt(stored);
            } catch (Unreadable e) {
                // The stored value can never be decrypted (app data restored on
                // another device, Keystore key deleted or invalidated): drop it.
                prefs().edit().remove(FIELD).apply();
            } catch (Exception e) {
                // A Keystore failure that may pass (busy, locked, provider
                // error): keep the stored key and let the page retry.
                call.reject("The key store is not available right now. Try again.");
                return;
            }
        }
        result.put("value", value);
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

    /** The Keystore key, or null when there is none. */
    private SecretKey existingKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        return keyStore.containsAlias(ALIAS) ? (SecretKey) keyStore.getKey(ALIAS, null) : null;
    }

    private SecretKey secretKey() throws Exception {
        SecretKey existing = existingKey();
        if (existing != null) return existing;
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

    /** Thrown when the stored value can never be decrypted on this device. */
    private static final class Unreadable extends Exception {
        private static final long serialVersionUID = 1L;

        Unreadable(Throwable cause) {
            super(cause);
        }
    }

    private String decrypt(String stored) throws Exception {
        byte[] iv;
        byte[] sealed;
        try {
            int colon = stored.indexOf(':');
            if (colon < 0) throw new IllegalArgumentException("Malformed value");
            iv = Base64.decode(stored.substring(0, colon), Base64.NO_WRAP);
            sealed = Base64.decode(stored.substring(colon + 1), Base64.NO_WRAP);
        } catch (IllegalArgumentException e) {
            throw new Unreadable(e);
        }
        SecretKey key;
        try {
            key = existingKey();
        } catch (UnrecoverableKeyException e) {
            throw new Unreadable(e);
        }
        if (key == null) throw new Unreadable(null);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
        } catch (AEADBadTagException | KeyPermanentlyInvalidatedException | IllegalArgumentException e) {
            throw new Unreadable(e);
        }
    }
}
