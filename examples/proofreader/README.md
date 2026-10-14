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
  js/              editor, controller, panels, storage, offline support
server.js          optional local server: static files + Claude proxy
build-artifact.js  single-file build for hosting on claude.ai
ARCHITECTURE.md    module map, data model, sync protocol, API reference
```

## Run it

| Way | What you get | How |
|---|---|---|
| Open the file | Rule engine, export, dashboard, history in this browser. Works offline. | Open `public/index.html` |
| Local server | All of the above, plus the AI check and offline caching | `npm install`, then `ANTHROPIC_API_KEY=... npm start`, then open <http://127.0.0.1:4317> |
| Hosted on claude.ai | All of the above, plus a shared workspace: sync across devices, teammates, roles, version history and activity log. The AI check runs on each viewer's own Claude account. | `npm run build:artifact`, then publish `dist/galley.html` with the capabilities in [ARCHITECTURE.md](ARCHITECTURE.md#hosted-capabilities) |

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

## Tests

```bash
node tests/examples/proofreader-engine.test.js
node tests/examples/proofreader-platform.test.js
```

They are part of `node tests/run-all.js`.
