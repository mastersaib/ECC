/**
 * Tests for the Galley proofreader rule engine
 * (examples/proofreader/public/lib).
 *
 * Run with: node tests/examples/proofreader-engine.test.js
 */

const assert = require('assert');
const path = require('path');

const LIB = path.join(__dirname, '..', '..', 'examples', 'proofreader', 'public', 'lib');
const Engine = require(path.join(LIB, 'engine'));
const Spelling = require(path.join(LIB, 'spelling'));
const Words = require(path.join(LIB, 'wordlists'));

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function check(text, options) {
  return Engine.check(text, Object.assign({ strict: true }, options)).issues;
}

function find(issues, ruleId, text) {
  return issues.find(i => i.ruleId === ruleId && (text === undefined || i.text === text));
}

function runTests() {
  console.log('\n=== Testing Galley proofreader engine ===\n');
  let passed = 0;
  let failed = 0;
  const t = (name, fn) => (test(name, fn) ? passed++ : failed++);

  console.log('Spelling systems:');

  t('American spelling flags British forms', () => {
    const issues = check('The colour of the theatre was grey.', { dialect: 'en-US', style: 'dialect' });
    assert.ok(find(issues, 'dialect-spelling', 'colour'));
    assert.strictEqual(find(issues, 'dialect-spelling', 'theatre').replacement, 'theater');
    assert.strictEqual(find(issues, 'dialect-spelling', 'grey').replacement, 'gray');
  });

  t('British -ise flags organize; Oxford spelling accepts it but keeps analyse', () => {
    const uk = check('They organized it and analyzed it.', { dialect: 'en-GB', style: 'dialect' });
    assert.strictEqual(find(uk, 'dialect-spelling', 'organized').replacement, 'organised');
    const ox = check('They organized it and analyzed it.', { dialect: 'en-GB-oxendict', style: 'dialect' });
    assert.ok(!find(ox, 'dialect-spelling', 'organized'));
    assert.strictEqual(find(ox, 'dialect-spelling', 'analyzed').replacement, 'analysed');
  });

  t('Canadian keeps colour and centre but organize and analyze', () => {
    const issues = check('The color centre will organize and analyse it.', { dialect: 'en-CA', style: 'dialect' });
    assert.strictEqual(find(issues, 'dialect-spelling', 'color').replacement, 'colour');
    assert.ok(!find(issues, 'dialect-spelling', 'centre'));
    assert.ok(!find(issues, 'dialect-spelling', 'organize'));
    assert.strictEqual(find(issues, 'dialect-spelling', 'analyse').replacement, 'analyze');
  });

  t('Australian accepts "program"; British prefers "programme"', () => {
    assert.ok(!find(check('The program ran.', { dialect: 'en-AU', style: 'dialect' }), 'dialect-spelling'));
    assert.ok(find(check('The program ran.', { dialect: 'en-GB', style: 'dialect' }), 'dialect-spelling', 'program'));
  });

  t('prefixes and case are preserved', () => {
    assert.strictEqual(Spelling.lookup('us', 'Unfavourable').preferred, 'Unfavorable');
    assert.strictEqual(Spelling.lookup('uk', 'REORGANIZE').preferred, 'REORGANISE');
    assert.strictEqual(Spelling.lookup('uk', 'colour'), null);
  });

  t('words that never alternate are not touched', () => {
    for (const word of ['humorous', 'horror', 'advertise', 'capsize', 'surprise', 'honorary']) {
      assert.strictEqual(Spelling.lookup('us', word), null, word);
      assert.strictEqual(Spelling.lookup('uk', word), null, word);
    }
  });

  t('capitalized dialect spellings mid-sentence are treated as names', () => {
    const issues = check('We flew from Pearl Harbor to see the Labor Party.', { dialect: 'en-GB', style: 'dialect' });
    const hit = find(issues, 'dialect-spelling', 'Harbor');
    assert.ok(hit);
    assert.strictEqual(hit.severity, 'info');
  });

  t('licence is the British noun, license the verb', () => {
    assert.ok(find(check('She lost her license.', { dialect: 'en-GB', style: 'dialect' }), 'dialect-spelling', 'license'));
    assert.ok(!find(check('They license the music.', { dialect: 'en-GB', style: 'dialect' }), 'dialect-spelling'));
    assert.ok(find(check('A driving licence.', { dialect: 'en-US', style: 'dialect' }), 'dialect-spelling', 'licence'));
  });

  console.log('\nGrammar and typos:');

  t('a/an follows sound, not spelling', () => {
    const issues = check('It was a honest mistake, an university, a hour and an apple.', { style: 'dialect' });
    assert.strictEqual(issues.filter(i => i.ruleId === 'a-an').length, 3);
    assert.ok(!find(check('a one-time event and an unidentified man', { style: 'dialect' }), 'a-an'));
  });

  t('"an herb" in American English, "a herb" in British', () => {
    assert.ok(!find(check('Add an herb.', { dialect: 'en-US', style: 'dialect' }), 'a-an'));
    assert.ok(find(check('Add an herb.', { dialect: 'en-GB', style: 'dialect' }), 'a-an'));
  });

  t('Plan A and vitamin A are not articles', () => {
    assert.ok(!find(check('Plan A is fine. Take vitamin A every day.', { style: 'dialect' }), 'a-an'));
  });

  t('its/it\'s, your/you\'re, there/their, than/then', () => {
    const issues = check('Its a trap. Your welcome. Their is time. More then ever. The dog wagged it\'s own tail.', { style: 'dialect' });
    const fixes = issues.filter(i => i.ruleId === 'confusion').map(i => i.replacement);
    assert.deepStrictEqual(fixes, ["It's", "You're", 'There', 'than', 'its']);
  });

  t('possessive "its" before a noun is left alone', () => {
    assert.ok(!find(check('The company and its late founder. Its very existence.', { style: 'dialect' }), 'confusion'));
  });

  t('repeated words are flagged, "had had" is not', () => {
    const issues = check('She saw the the house. He had had enough.', { style: 'dialect' });
    assert.strictEqual(issues.filter(i => i.ruleId === 'repeated-word').length, 1);
  });

  t('common typos and missing apostrophes', () => {
    const issues = check('I definately recieved it. Theyre late.', { style: 'dialect' });
    assert.deepStrictEqual(issues.filter(i => i.ruleId === 'typo').map(i => i.replacement), ['definitely', 'received', "They're"]);
  });

  t('should of becomes should have', () => {
    assert.strictEqual(find(check('You should of called.', { style: 'dialect' }), 'confusion', 'of').replacement, 'have');
  });

  t('lowercase i and lowercase sentence starts', () => {
    const issues = check('then i left. it rained.', { style: 'dialect' });
    assert.ok(find(issues, 'capitalization', 'i'));
    assert.ok(find(issues, 'capitalization', 'it') || issues.some(i => i.ruleId === 'capitalization' && i.replacement === 'I'));
  });

  t('abbreviations do not end sentences', () => {
    const issues = check('Ask Dr. smith or e.g. anyone.', { style: 'dialect' });
    assert.ok(!issues.some(i => i.ruleId === 'capitalization' && i.text === 's'));
  });

  console.log('\nVoice protection:');

  t('dialect grammar inside dialogue is never flagged in creative mode', () => {
    const issues = check('"He don\'t know nothing," she said. "We was there."', { mode: 'creative', style: 'dialect' });
    assert.ok(!find(issues, 'nonstandard-grammar'));
  });

  t('the same grammar in narration is only a note in creative mode', () => {
    const issues = check('He don\'t care about the rules.', { mode: 'creative', style: 'dialect' });
    assert.strictEqual(find(issues, 'nonstandard-grammar').severity, 'info');
  });

  t('formal mode flags it as a warning, plus contractions and slang', () => {
    const issues = check('He don\'t care. We\'re gonna go.', { mode: 'formal', style: 'dialect' });
    assert.strictEqual(find(issues, 'nonstandard-grammar').severity, 'warning');
    assert.ok(find(issues, 'formal-register', "We're"));
    assert.ok(find(issues, 'formal-register', 'gonna'));
  });

  t('a genuine error inside dialogue becomes a note, not silence', () => {
    const issues = check('"I should of known," she said.', { mode: 'creative', style: 'dialect' });
    assert.strictEqual(find(issues, 'confusion', 'of').severity, 'info');
  });

  t('URLs and inline code are never proofread', () => {
    const issues = check('Visit https://example.com/colour-theatre and run `teh --colour`.', { dialect: 'en-US', style: 'dialect' });
    assert.ok(!issues.some(i => /colour|theatre|teh/.test(i.text)));
  });

  console.log('\nStyle guides:');

  t('CMOS wants the serial comma, AP removes it', () => {
    const cmos = check('We bought apples, pears and plums.', { style: 'cmos' });
    assert.ok(find(cmos, 'serial-comma'));
    const ap = check('We bought apples, pears, and plums.', { style: 'ap' });
    assert.ok(find(ap, 'serial-comma'));
    assert.ok(!find(check('We bought apples, pears, and plums.', { style: 'cmos' }), 'serial-comma'));
  });

  t('an introductory phrase is not a list', () => {
    assert.ok(!find(check('After dinner, Tom and Jerry left.', { style: 'cmos' }), 'serial-comma'));
    assert.ok(!find(check('After we ate dinner, Tom and Jerry left.', { style: 'cmos' }), 'serial-comma'));
  });

  t('dashes follow the guide', () => {
    assert.strictEqual(find(check('It was late - very late.', { style: 'cmos' }), 'dashes').replacement, '—');
    assert.strictEqual(find(check('It was late—very late.', { dialect: 'en-GB', style: 'harts' }), 'dashes').replacement, ' – ');
    assert.strictEqual(find(check('It was late—very late.', { style: 'ap' }), 'dashes').replacement, ' — ');
  });

  t('numbers: CMOS spells out to one hundred, AP from ten uses numerals', () => {
    assert.strictEqual(find(check('She waited 45 minutes.', { style: 'cmos' }), 'numbers').replacement, 'forty-five');
    assert.ok(!find(check('She waited 45 minutes.', { style: 'ap' }), 'numbers'));
    assert.strictEqual(find(check('She waited fifteen minutes.', { style: 'ap' }), 'numbers').replacement, '15');
    assert.strictEqual(find(check('She bought 7 apples.', { style: 'ap' }), 'numbers').replacement, 'seven');
  });

  t('a number starting a sentence is spelled out', () => {
    assert.strictEqual(find(check('12 people came.', { style: 'ap' }), 'numbers').replacement, 'Twelve');
  });

  t('numbers next to units, pages and times are left alone', () => {
    const issues = check('Turn to page 4 at 5 p.m. and add 3 kg.', { style: 'cmos' });
    assert.ok(!find(issues, 'numbers'));
  });

  t('house style: 12-hour time and one-to-nine rule', () => {
    const issues = check('We met at 18:30 with 3 friends.', { style: 'house', dialect: 'en-US' });
    assert.strictEqual(find(issues, 'times').replacement, '6:30 p.m.');
    assert.strictEqual(find(issues, 'numbers').replacement, 'three');
  });

  t('dates follow the dialect order and drop ordinals', () => {
    assert.strictEqual(find(check('On 14 October 2026 we met.', { style: 'cmos' }), 'dates').replacement, 'October 14, 2026');
    assert.strictEqual(find(check('On October 14, 2026 we met.', { dialect: 'en-GB', style: 'harts' }), 'dates').replacement, '14 October 2026');
    assert.ok(check('It opened on October 14th.', { style: 'cmos' }).some(i => i.ruleId === 'dates' && i.text === 'th'));
  });

  t('percent: word per dialect, symbol for AP', () => {
    assert.strictEqual(find(check('Up 5 per cent.', { dialect: 'en-US', style: 'cmos' }), 'percentages').replacement, 'percent');
    assert.strictEqual(find(check('Up 5 percent.', { dialect: 'en-GB', style: 'harts' }), 'percentages').replacement, 'per cent');
    assert.ok(check('Up 5 percent.', { style: 'ap' }).some(i => i.ruleId === 'percentages' && i.replacement === '%'));
  });

  t('honorifics: Mr. in American guides, Mr in Hart\'s', () => {
    assert.strictEqual(find(check('Mr Smith arrived.', { style: 'cmos' }), 'abbreviations').replacement, 'Mr.');
    assert.ok(find(check('Mr. Smith arrived.', { dialect: 'en-GB', style: 'harts' }), 'abbreviations'));
  });

  t('U.S. for AP and the house style, US for CMOS', () => {
    assert.strictEqual(find(check('The US Army.', { style: 'ap' }), 'abbreviations').replacement, 'U.S.');
    assert.strictEqual(find(check('The U.S. Army.', { style: 'cmos' }), 'abbreviations').replacement, 'US');
    assert.strictEqual(find(check('We moved to the U.S.', { style: 'cmos' }), 'abbreviations').replacement, 'US.');
  });

  t('quotation marks: Hart\'s single, CMOS double', () => {
    const harts = check('"Hello there," she said.', { dialect: 'en-GB', style: 'harts' });
    assert.strictEqual(find(harts, 'quotation-marks').replacement, '‘Hello there,’');
    const cmos = check('‘Hello there,’ she said.', { style: 'cmos' });
    assert.ok(find(cmos, 'quotation-marks'));
  });

  t('American punctuation goes inside closing quotes', () => {
    const issues = check('He called it "art". Then he left.', { style: 'cmos' });
    assert.strictEqual(find(issues, 'punctuation-inside-quotes').replacement, '."');
  });

  t('dialogue tags: missing comma, period before tag, capitalized tag', () => {
    const issues = check('"Yes" he said. "No." she replied. "Maybe," He added.', { style: 'cmos' });
    const tags = issues.filter(i => i.ruleId === 'dialogue-tags').map(i => i.replacement);
    assert.deepStrictEqual(tags, [',', ',', 'He'.toLowerCase()]);
  });

  t('action beats keep their period', () => {
    assert.ok(!find(check('"Fine." She smiled.', { style: 'cmos' }), 'dialogue-tags'));
  });

  console.log('\nDialogue, poetry and consistency:');

  t('speech continued over paragraphs reopens each paragraph', () => {
    const ok = '"The first part of my speech.\n\n"And the second part."';
    assert.ok(!find(check(ok, { style: 'cmos' }), 'multi-paragraph-dialogue'));
    const bad = '"The first part of my speech.\n\nAnd then nothing."';
    assert.ok(find(check(bad, { style: 'cmos' }), 'multi-paragraph-dialogue'));
  });

  t('poetry: line-break commas before a continuation are questioned', () => {
    const poem = 'The river of my childhood,\nof stones and willow light,';
    assert.ok(find(check(poem, { poetry: true, style: 'dialect' }), 'poetry-line-breaks'));
    assert.ok(!find(check(poem, { poetry: false, style: 'dialect' }), 'poetry-line-breaks'));
  });

  t('house style: sound effects are noted for italics unless already marked', () => {
    assert.ok(find(check('Bang! The door flew open.', { style: 'house' }), 'sound-effects'));
    assert.ok(!find(check('*Bang!* The door flew open.', { style: 'house' }), 'sound-effects'));
  });

  t('spelling the same word two ways is a consistency note', () => {
    const issues = check('Send an e-mail. I read the email.', { style: 'dialect' });
    assert.ok(find(issues, 'consistency'));
  });

  t('anymore and any more follow the dialect', () => {
    assert.ok(find(check('I don\'t go there any more.', { dialect: 'en-US', style: 'dialect' }), 'dialect-usage', 'any more'));
    assert.ok(find(check('I don\'t go there anymore.', { dialect: 'en-GB', style: 'dialect' }), 'dialect-usage', 'anymore'));
    assert.ok(!find(check('I don\'t want any more tea.', { dialect: 'en-US', style: 'dialect' }), 'dialect-usage'));
  });

  t('collective nouns are singular in American English only', () => {
    assert.ok(find(check('The team are winning.', { dialect: 'en-US', style: 'dialect' }), 'dialect-usage'));
    assert.ok(!find(check('The team are winning.', { dialect: 'en-GB', style: 'dialect' }), 'dialect-usage'));
  });

  t('lakh grouping is native to Indian and Pakistani English', () => {
    assert.ok(find(check('It cost 1,00,000 rupees.', { dialect: 'en-US', style: 'dialect' }), 'dialect-usage'));
    assert.ok(!find(check('It cost 1,00,000 rupees.', { dialect: 'en-PK', style: 'dialect' }), 'dialect-usage'));
  });

  console.log('\nFixes and helpers:');

  t('applyFixes applies every non-overlapping fix', () => {
    const text = 'i saw teh the cat.';
    const { issues } = Engine.check(text, { style: 'dialect' });
    const { text: fixed } = Engine.applyFixes(text, issues);
    assert.strictEqual(fixed, 'I saw the the cat.'.replace('the the', 'the the'));
    const second = Engine.applyFixes(fixed, Engine.check(fixed, { style: 'dialect' }).issues);
    assert.strictEqual(second.text, 'I saw the cat.');
  });

  t('applyFix refuses a stale issue', () => {
    const issue = { start: 0, end: 3, text: 'teh', replacement: 'the' };
    assert.strictEqual(Engine.applyFix('xyz cat', issue), 'xyz cat');
  });

  t('smart quotes handle dialogue, apostrophes and elisions', () => {
    assert.strictEqual(Engine.smartQuotes('"Don\'t," she said. \'Tis the \'90s.'),
      '“Don’t,” she said. ’Tis the ’90s.');
  });

  t('every dialect and guide resolves and checks without throwing', () => {
    const sample = '"Hello," said Mr Smith on 14 October 2026 at 18:30. It cost 5 percent - roughly.';
    for (const d of Engine.DIALECTS) {
      for (const g of Engine.STYLE_GUIDES) {
        for (const mode of ['creative', 'formal']) {
          Engine.check(sample, { dialect: d.id, style: g.id, mode, strict: true });
        }
      }
    }
    assert.strictEqual(Engine.DIALECTS.length, 15);
    assert.strictEqual(Engine.STYLE_GUIDES.length, 7);
  });

  t('a mismatched guide and dialect explains itself', () => {
    const { profile } = Engine.check('', { dialect: 'en-GB', style: 'cmos' });
    assert.ok(/American guide/.test(profile.notice));
  });

  t('numberToWords and wordsToNumber agree from 0 to 100', () => {
    for (let n = 0; n <= 100; n++) assert.strictEqual(Words.wordsToNumber(Words.numberToWords(n)), n);
  });

  console.log('\nVoice guard (no fix may delete or rewrite the author\'s sentences):');

  const Guard = require(path.join(LIB, 'voice-guard'));
  const verdict = (text, quote, replacement, from) => {
    const at = text.indexOf(quote, from || 0);
    const v = Guard.review(text, at, at + quote.length, replacement);
    return v.ok ? 'ok' : v.reason;
  };

  t('minimal grammar, tense and punctuation fixes pass', () => {
    assert.strictEqual(verdict('They was home.', 'was', 'were'), 'ok');
    assert.strictEqual(verdict('I saw the the dog.', ' the', '', 9), 'ok');
    assert.strictEqual(verdict('Me and him went out.', 'Me and him', 'He and I'), 'ok');
    assert.strictEqual(verdict('She grabbed her coat and runs out.', 'runs', 'ran'), 'ok');
    assert.strictEqual(verdict('He left. And she stayed.', 'He left. And she stayed.', 'He left, and she stayed.'), 'ok');
    assert.strictEqual(verdict('We met at 18:30 sharp.', '18:30', '6:30 p.m.'), 'ok');
    assert.strictEqual(verdict('The U.S. Army.', 'U.S.', 'US'), 'ok');
  });

  t('deleting a sentence is refused, however short', () => {
    assert.strictEqual(verdict('Yes. She stayed.', 'Yes. ', ''), 'It would delete a whole sentence.');
    assert.strictEqual(verdict('He left at dawn. She stayed.', 'He left at dawn. ', ''), 'It would delete a whole sentence.');
    assert.strictEqual(verdict('Yes. No. Maybe.', 'Yes. No.', 'Yes.'), 'It would delete a whole sentence.');
    assert.strictEqual(verdict('"Go." He went.', '"Go." ', ''), 'It would delete a whole sentence.');
  });

  t('cutting or rewriting the author\'s wording is refused', () => {
    assert.strictEqual(verdict('The road was empty and the sky was grey.', ' and the sky was grey', ''), 'It would remove 5 of your words.');
    assert.match(verdict('She waited by the gate.', 'waited by the gate', 'lingered near the old iron gate, waiting'), /rewrite your wording/);
    assert.match(verdict('He walked slowly home.', 'walked slowly', 'strolled leisurely along'), /rewrite your wording/);
  });

  t('the engine keeps oversized rule fixes as suggestions and applyFix enforces the guard', () => {
    const text = 'Yes. She stayed.';
    const forced = { start: 0, end: 5, text: 'Yes. ', replacement: '' };
    assert.strictEqual(Engine.applyFix(text, forced), text);
    const kept = Engine.protect({ start: 0, end: 5, text: 'Yes. ', replacement: '' }, text);
    assert.strictEqual(kept.replacement, null);
    assert.strictEqual(kept.suggestion, '');
    assert.ok(kept.guard);
  });

  t('narrow trims an edit to the words that change', () => {
    assert.deepStrictEqual(Guard.narrow('They was home', 'They were home'), { trimStart: 5, trimEnd: 5, replacement: 'were' });
    assert.deepStrictEqual(Guard.narrow('Hello how are you', 'Hello, how are you'), { trimStart: 5, trimEnd: 12, replacement: ',' });
    assert.deepStrictEqual(Guard.narrow('color', 'colour'), { trimStart: 0, trimEnd: 0, replacement: 'colour' });
  });

  t('no rule fix in the sample manuscript is downgraded by the guard', () => {
    const sample = 'Their going too the store tomorow. Its a nice day, isnt it? We was late. I seen it. She had went home. She grabbed her coat and runs out. The the end.';
    for (const style of ['cmos', 'ap', 'harts', 'house']) {
      for (const issue of check(sample, { style })) assert.ok(!issue.guard, `${issue.ruleId}: ${issue.guard}`);
    }
  });

  t('the guard treats … as a sentence end and never removes a line break', () => {
    assert.strictEqual(verdict('She waited. Nothing… Then the door opened.', 'Nothing… ', ''), 'It would delete a whole sentence.');
    assert.strictEqual(verdict('"Well…" He shrugged and left.', '"Well…" ', ''), 'It would delete a whole sentence.');
    assert.strictEqual(verdict('line one\nline two', '\n', ' '), 'It would remove a line or paragraph break.');
    assert.strictEqual(verdict('Go. He went.', 'Go. He went.', 'Gohewent'), 'It would remove 2 of your words.');
    assert.strictEqual(verdict('Go. He went.', 'Go. He', 'Go, he'), 'ok');
  });

  t('one-word sentences, datelines, times and per cent can still be fixed', () => {
    assert.strictEqual(verdict('“Realy?” she asked.', 'Realy', 'Really'), 'ok');
    assert.strictEqual(verdict('He worked for the U.S. goverment.', 'goverment', 'government'), 'ok');
    assert.strictEqual(verdict('The meeting is at 3 p.m. tommorow.', 'tommorow', 'tomorrow'), 'ok');
    assert.strictEqual(verdict('14 October 2026\nDear Anna, I write.', '14 October 2026', 'October 14, 2026'), 'ok');
    assert.strictEqual(verdict('Dinner was at 19:00 sharp.', '19:00', '7 p.m.'), 'ok');
    assert.strictEqual(verdict('Inflation rose 5 per cent last year.', ' per cent', '%'), 'ok');
    for (const [text, options] of [['“Realy?” she asked.', {}], ['14 October 2026\nDear Anna, I am writing to you from Paris.', {}],
      ['Dinner was at 19:00 and the film began at 21:00.', { style: 'house' }], ['Inflation rose 5 per cent last year.', { dialect: 'en-GB', style: 'ap' }]]) {
      for (const issue of check(text, options)) assert.ok(!issue.guard, `${issue.ruleId} on ${JSON.stringify(text)}: ${issue.guard}`);
    }
  });

  t('repeated words: not across line breaks, not in deliberate runs', () => {
    for (const text of ['Chapter Seven\n\nSeven men rode into town at dawn.', 'Part Two\nTwo years later, she came home.',
      'He opened the door\n\nDoor after door, the hall went on.', 'Drip drip drip drip. The tap would not stop.']) {
      assert.ok(!find(check(text), 'repeated-word'), text);
    }
    assert.ok(find(check('I saw the the dog.'), 'repeated-word'));
  });

  t('Accept all removes at most one word from any sentence', () => {
    const text = 'He left. She stayed there alone. Fine.';
    const del = word => { const at = text.indexOf(word); return { start: at, end: at + word.length, text: word, replacement: '' }; };
    const out = Engine.applyFixes(text, [del('She '), del('stayed '), del('there '), del(' alone')]);
    assert.strictEqual(out.applied, 1);
    assert.strictEqual(out.text.split(' ').length, text.split(' ').length - 1);
  });

  console.log('\nVerb tense:');

  const tense = (text, options) => check(text, Object.assign({ mode: 'formal' }, options || {}))
    .filter(i => i.ruleId === 'tense-shift' || i.ruleId === 'verb-form')
    .map(i => `${i.text}->${i.replacement}`);

  t('a tense shift between two verbs of one subject is fixed in the second verb', () => {
    assert.deepStrictEqual(tense('She grabbed her coat and runs out the door.'), ['runs->ran']);
    assert.deepStrictEqual(tense('He went to the store and buys milk.'), ['buys->bought']);
    assert.deepStrictEqual(tense('She grabbed her keys, phone and wallet and runs to the car.'), ['runs->ran']);
    assert.deepStrictEqual(tense('She grabs her coat and ran out.'), ['ran->runs']);
    assert.deepStrictEqual(tense('I opened the door and see him there.'), ['see->saw']);
    assert.deepStrictEqual(tense('She took the call and heads out.'), ['heads->headed']);
  });

  t('tense-shift leaves legitimate time changes, nouns and dialogue alone', () => {
    for (const text of [
      '"I grabbed my coat and run," she said.',
      'She said that the river runs east and flows into the sea.',
      'She looks tired and worried.',
      'I think he left and came back.',
      'He decided to stay and helps nobody.',
      'They argued and fights broke out.',
      'She ordered pizza and drinks.',
      'She packed sandwiches and drinks for the trip.',
      'He left, and she walks home alone.',
      'She traded jokes and smiles with him.',
      'It ran in fits and starts.',
      'The children laughed and runs were scored.'
    ]) assert.deepStrictEqual(tense(text), [], text);
  });

  t('wrong participles are fixed; "Are you done?" is not', () => {
    assert.deepStrictEqual(tense('They had went home early.'), ['went->gone']);
    assert.deepStrictEqual(tense('I have drank too much coffee.'), ['drank->drunk']);
    assert.deepStrictEqual(tense('She hadn\'t came back yet.'), ['came->come']);
    assert.deepStrictEqual(tense('I seen it with my own eyes.'), ['seen->saw']);
    for (const text of ['Are you done?', 'Have you seen my keys?', 'I had a saw and a hammer.', 'She has got a new car.']) {
      assert.deepStrictEqual(tense(text), [], text);
    }
  });

  t('tense shifts are fixed one at a time, never by Accept all, and stop at time words', () => {
    const issue = check('She grabbed her coat and runs out the door.').find(i => i.ruleId === 'tense-shift');
    assert.strictEqual(issue.bulk, false);
    assert.strictEqual(issue.severity, 'suggestion');
    for (const text of ['She left the army in 2010 and runs a bakery now.', 'He moved to Leeds and still teaches there.']) {
      assert.deepStrictEqual(tense(text), [], text);
    }
  });

  t('in creative writing, dialect participles in narration are information only', () => {
    const issue = check('They had went home early.', { mode: 'creative' }).find(i => i.ruleId === 'verb-form');
    assert.strictEqual(issue.severity, 'info');
    assert.ok(!check('"We had went," he said.', { mode: 'creative' }).some(i => i.ruleId === 'verb-form'));
  });

  t('a 60,000-character chapter checks in under two seconds', () => {
    const para = 'She said, "I know the the colour of the theatre," and left at 18:30 with 3 friends, 2 dogs and a cat. ';
    const text = Array.from({ length: 600 }, () => para).join('\n');
    const start = Date.now();
    Engine.check(text, { style: 'house', dialect: 'en-US' });
    assert.ok(Date.now() - start < 2000, `took ${Date.now() - start} ms`);
  });

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
