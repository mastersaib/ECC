# Galley Proofreader privacy policy

Last updated: October 15, 2026

This policy covers the Galley Proofreader Android app
(`io.github.mastersaib.galley`). Before publishing, replace the bracketed
contact details and host this page at a public URL.

Developer: [developer name], [contact email]

## What stays on your phone

- **Your documents.** Text you write, paste, share to Galley or send from
  another app's selection menu is stored in the app's private storage on
  your phone. Galley has no server and no account, and does not upload
  documents anywhere unless you run the AI check (below).
- **Your proofreading history.** The dashboard's statistics are computed
  and stored on your phone.
- **Your Anthropic API key.** If you add one, it is encrypted with a key
  held by the Android Keystore that cannot leave your phone. It is excluded
  from Android backups and device transfers. It is only ever sent to
  Anthropic, to authenticate your requests.

## What leaves your phone

- **The AI check, only when you run it.** Galley sends the text being
  checked, your chosen dialect and style guide, and the automatic checker's
  findings directly from your phone to Anthropic's API
  (`api.anthropic.com`), using your own API key. Anthropic processes that
  text under your agreement with Anthropic and its privacy policy. Galley's
  developer never receives it. The rule-based checker works without this.
- **Exports, only when you share them.** Exported files go wherever you send
  them through Android's share sheet.

Galley contains no analytics, advertising or tracking code, and it makes no
other network requests. The app's fonts are bundled.

## Deleting your data

Delete a document under **Documents & history**. Remove your API key in
**AI settings**. Uninstalling Galley deletes all of its data from your
phone. To delete text you sent through the AI check, follow Anthropic's
data controls for your API account.

## Children

Galley is a writing tool for general audiences and does not knowingly
collect information from children.

## Changes

Changes to this policy will be posted at this address with a new date.
