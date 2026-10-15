# Galley Proofreader

Galley proofreads English manuscripts in 15 dialects against a chosen style
guide. It marks errors in place without flattening the author's voice. A
local rule engine runs as you type, works offline and needs no account. An
optional Claude pass catches what patterns cannot: agreement, tense, wrong
words, comma splices, italics for thoughts and foreign words, and, if you
ask, minimal flow edits.

```
public/            the app (plain HTML, CSS and browser JavaScript, no build step)
  lib/             engine, dialects, style guides, AI prompts, export, merge, sync
  js/              editor, controller, panels, storage, offline, mobile bridge
android/           the Android app (Capacitor project with Galley's native plugins)
scripts/           mobile bundle build and signing-key helper
server.js          optional local server: static files + Claude proxy
build-artifact.js  single-file build for hosting on claude.ai
ARCHITECTURE.md    module map, data model, sync protocol, API reference
PRIVACY.md         privacy policy for the Android app
```

## Run it

| Way | What you get | How |
|---|---|---|
| Open the file | Rule engine, export, dashboard, history in this browser. Works offline. | Open `public/index.html` |
| Local server | All of the above, plus the AI check and offline caching | `npm install`, then `ANTHROPIC_API_KEY=... npm start`, then open <http://127.0.0.1:4317> |
| Hosted on claude.ai | All of the above, plus a shared workspace: sync across devices, teammates, roles, version history and activity log. The AI check runs on each viewer's own Claude account. | `npm run build:artifact`, then publish `dist/galley.html` with the capabilities in [ARCHITECTURE.md](ARCHITECTURE.md#hosted-capabilities) |
| Android app | The proofreader on your phone, offline. Proofread text selected in any app and send the correction back. AI check with your own Anthropic API key. | See [Android app](#android-app) |

The server binds to `127.0.0.1` by default. It reads `PORT`, `HOST` and
`GALLEY_MODEL` (default `claude-opus-5-5`) from the environment. The API key
stays on the server; the browser never sees it.

## What it checks

| Family | Examples |
|---|---|
| Spelling | Common typos (*definately*, *recieve*), missing apostrophes (*dont*, *theyre*), dialect spelling (*color/colour*, *organize/organise*, *traveled/travelled*, *defense/defence*, *program/programme*) |
| Grammar | *a/an* by sound (*an hour*, *a university*, *an herb* in American English only), *its/it's*, *your/you're*, *there/their*, *than/then*, *should of*, repeated words, misheard phrases (*for all intensive purposes*) |
| Punctuation | Spacing, doubled marks, dialogue tags (`"Yes" he said` / `"No." she replied`), unclosed quotations across paragraphs, serial comma, dash style, number ranges, hyphens after *-ly* adverbs |
| Capitalization | Pronoun *I*, sentence and paragraph starts, days and months |
| Style guide | Numbers in words or numerals, percent, dates, times, *Mr./Mr*, *U.S./US*, *e.g.,* |
| Dialect | *toward/towards*, *anymore/any more*, singular collective nouns in American English, lakh digit grouping outside South Asia |
| Typography and consistency | Straight quotes in a curly-quote manuscript, ellipsis forms, the same word spelled two ways, *OK/okay* |

## Dialects

English has many dialects but only a few spelling systems. Each dialect maps
to one system, plus its own conventions for quotation marks, dates and
percentages.

| Spelling system | Dialects |
|---|---|
| American (*color, organize, traveled*) | American, Philippine |
| Canadian (*colour, organize, travelled*) | Canadian |
| British -ise (*colour, organise, travelled*) | British, Irish, New Zealand, South African, Indian, Pakistani, Nigerian, Kenyan and East African, Singapore, Caribbean |
| Oxford -ize (*colour, organize, analyse*) | British, Oxford spelling |
| Australian (British, with *program*) | Australian |

Vocabulary is never "corrected" between dialects. *Lift* and *elevator*,
*wee*, *y'all* and *innit* belong to the writer.

## Style guides

| Guide | Highlights |
|---|---|
| Chicago Manual of Style | Serial comma, closed em dash, zero to one hundred in words, *percent*, *US*, *a.m.* |
| AP Stylebook | No serial comma, spaced em dash, numerals from 10, *%*, *U.S.* |
| APA (7th ed.) | Serial comma, numerals from 10, *%*, formal register |
| MLA Handbook (9th ed.) | Serial comma, *percent*, formal register |
| New Hart's Rules (Oxford) | Single quotes, spaced en dash, logical punctuation, day-month-year, *per cent*, *Mr* |
| Manuscript House Style | A fiction editor's checklist. American: double quotes, Oxford comma, *Mr.* and *U.S.*, closed em dash, one to nine in words, Month Day, Year, 12-hour time, singular collective nouns, italic sound effects. British: spaced en dash and *per cent*. |
| Dialect conventions only | The dialect's own conventions, no publisher rules |

Spelling always follows the dialect. "British English + CMOS" keeps British
spelling with Chicago punctuation, and the style sheet tab says so.

## Protecting the author's voice

**Creative** mode is for fiction, memoir and essays. Nonstandard grammar
inside dialogue is never flagged. In narration it appears only as a note
(*"He don't care"*). Genuine slips inside dialogue, such as *should of*,
appear as notes rather than errors. Myths are never enforced: starting a
sentence with *And*, split infinitives, final prepositions, the passive voice.

**Formal** mode is for academic and business writing. It also flags
contractions, slang and very long sentences outside quotations. APA and MLA
switch to Formal automatically.

**Flow suggestions** (AI check only) are opt-in. Claude is told to keep the
author's words and meaning, change as little as possible, and offer at most
one suggestion per paragraph.

## Using the app

- **Edit and see findings live.** Click marked text to open its finding.
  **Accept** applies the fix; **Stet** keeps the text as written and hides
  the same finding for the session; **Undo fix** reverts. Keyboard:
  Alt+Down and Alt+Up step through findings, Alt+Enter accepts,
  Alt+Backspace stets.
- **Filter** by type with the chips. **Accept all** applies every fix in the
  current filter, after a confirmation click.
- **Mark italics** with `*asterisks*`. Exports turn them into real italics.
- **Dashboard.** Errors and warnings per 1,000 words over time, findings by
  type, and recurring issues with examples. **Explain my patterns** asks
  Claude to summarize habits and what to focus on next.
- **Documents and history.** Several documents, automatic versions every 15
  minutes, named versions, restore (the replaced text is kept), and an
  activity log.
- **Export.** Manuscript as DOCX (standard manuscript format: Times 12,
  double-spaced, indented), PDF or TXT. The proofreading report as DOCX or
  TXT, ready to send to an author.
- **Dark mode** follows the system. The local page also has a theme button.

## Limits

- The rule engine uses patterns, not a parser. It is tuned for precision:
  it misses some errors rather than flag correct prose. Run the AI check for
  grammar that needs understanding.
- There is no full dictionary. For unknown misspellings, the browser's own
  spellchecker runs in the editor in the chosen dialect where the browser
  has that dictionary.
- Plain text cannot hold italics, so italic findings are notes.
- Collaboration merges at the paragraph level. Two people editing the same
  paragraph at the same moment keep their own wording, and the other version
  is saved in History; it is never lost.

## Android app

The Android app is the same proofreader in a Capacitor shell, with native
pieces where a phone needs them:

- **Proofread from any app.** Select text anywhere, choose **Proofread** in
  the selection menu, fix it in Galley, then tap **Replace selection** to send
  the corrected text back into the field you selected it from. Apps that
  only display text (a web page, a PDF) get **Copy text** and **Done**
  instead. Galley deletes its copy of the selection when you go back.
  **Share > Galley** opens shared text, or a shared `.txt` file, as a new
  document.
- **Export through the share sheet.** DOCX, PDF, text and the report go to
  Files, Drive, mail or Word.
- **AI check with your own Anthropic API key.** The key is encrypted with an
  Android Keystore key that never leaves the phone, and it is left out of
  backups. Checked text goes straight from the phone to Anthropic; there is
  no Galley server.
- **Offline.** Fonts and the app are on the phone; documents are saved on
  the phone. If Android backup is on, your documents are included in the
  phone's backup to your Google account, so they survive a new phone.
- **Phone layout.** A docked bar steps through findings with Accept, Stet
  and Next; settings fold into one line; the back button closes menus first.

The shared workspace (team sync, roles, activity log) comes from claude.ai
hosting and is not in the Android app. Use the hosted page for team work.

### Get the APK

1. If the repository's **Actions** tab says workflows are disabled (GitHub's
   default for forks), enable them.
2. Push a change under `examples/proofreader`, or run **Galley Android**
   from the Actions tab.
3. Open the run and download the APK under **Artifacts**
   (`galley-<run>-debug.apk`, or `galley-<run>.apk` when signed). It
   downloads as an APK, not a zip. Open it on your phone and allow your
   browser or file manager to install unknown apps when Android asks.

Without signing secrets the workflow makes a debug build with a throwaway
key. Each such build is a different app as far as Android is concerned, so
installing a newer one means uninstalling the old one first, which deletes
its documents. For builds that update in place, create one signing key and
store it in GitHub secrets:

```bash
./scripts/create-signing-key.sh   # needs a JDK; writes ~/galley-release.p12
```

It prints the four secrets to add, and a fingerprint for an optional
`GALLEY_CERT_SHA256` repository variable: with it set, CI fails any build
signed with a different key. The script refuses to write the key inside a
git repository. Keep the `.p12` file and its password safe and offline. If
they are lost, no later build can update the installed app.

### Build on your computer

Needs Node 22+, JDK 21 and the Android SDK (Android Studio installs it).

```bash
npm ci
npm run android:sync    # builds mobile/www (bundled fonts, SDK) and copies it into android/
npx cap open android    # or: npm run android:build (any OS)
```

### Publishing on Google Play

Play needs a developer account (one-time US$25), an app bundle
(`bundleRelease`, which the workflow builds when signing secrets exist),
target API 36 (already set), a privacy policy at a public URL
([PRIVACY.md](PRIVACY.md) is a starting point), and a Data safety form. On
that form, declare user-generated content as collected when the AI check
sends it to Anthropic. New personal accounts must also run a closed test
with 12 testers for 14 days before production. The app id
`io.github.mastersaib.galley` cannot change after the first upload.

### iOS next

Capacitor keeps the web layer and most plugins shared. iOS needs a Mac with
Xcode 26 (or a macOS CI runner) and an Apple Developer account (US$99 a
year). Two pieces are native and must be written for iOS: the key store,
which uses the Keychain, and the text-selection entry, which on iOS is an
Action Extension.

## Tests

```bash
node tests/examples/proofreader-engine.test.js
node tests/examples/proofreader-platform.test.js
node tests/examples/proofreader-mobile.test.js
```

They are part of `node tests/run-all.js`.
