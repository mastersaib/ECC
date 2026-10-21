/**
 * Verb tense rules.
 *
 *   verb-form    wrong past participles ("had went", "have drank") and a
 *                participle used as the past tense ("I seen", "she done")
 *   tense-shift  one subject, two verbs joined by "and", two tenses: "She
 *                grabbed her coat and runs out." Narration only.
 *
 * Both are deliberately conservative. A tense "fix" in the wrong place would
 * damage the author's voice, so tense-shift only looks at a subject followed
 * by its verb, then "and" and a second verb, within one stretch of narration.
 * It stops at anything that can legitimately change the time (a subordinate
 * clause, a modal, a new subject) and ignores verbs whose forms double as
 * common nouns ("drinks", "waves", "steps").
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./spelling'));
  } else {
    root.GalleyRulesTense = factory(root.GalleySpelling);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Spelling) {
  'use strict';

  // base past participle third-person [flags]
  //   s: the -s form may be flagged after "and"     b: so may the base form
  //   p: the past form may be flagged after "and"   x: not a tense signal in
  //      the present (linking or mental verbs: "looks tired", "I think he left")
  // Without the flag, a form that doubles as a common noun ("drinks", "waves")
  // is only flagged when an object pronoun or particle follows it, which a
  // plural noun almost never takes: "and waves him off", "and heads out".
  const VERB_TABLE = `
go went gone goes sbp
come came come comes sbp
see saw seen sees sbx
take took taken takes sbp
get got got gets sbpx
make made made makes sb
know knew known knows sbpx
think thought thought thinks sbx
find found found finds sb
give gave given gives sbp
tell told told tells sb
feel felt felt feels sbx
leave left left leaves -
run ran run runs sp
sit sat sat sits sb
stand stood stood stands -
hold held held holds s
bring brought brought brings sb
begin began begun begins sbp
keep kept kept keeps sb
write wrote written writes sbp
speak spoke spoken speaks sbp
eat ate eaten eats sbp
fall fell fallen falls p
fly flew flown flies p
grow grew grown grows sbpx
throw threw thrown throws sbp
draw drew drawn draws sb
drive drove driven drives bp
ride rode ridden rides bp
rise rose risen rises sb
break broke broken breaks -
choose chose chosen chooses sbp
freeze froze frozen freezes sbp
steal stole stolen steals sb
wear wore worn wears sbp
swim swam swum swims sbp
sing sang sung sings sbp
lose lost lost loses sb
pay paid paid pays sb
sell sold sold sells sb
send sent sent sends sb
spend spent spent spends sb
build built built builds sb
buy bought bought buys sb
teach taught taught teaches sb
catch caught caught catches sb
drink drank drunk drinks p
wake woke woken wakes sbp
shake shook shaken shakes sbp
hide hid hidden hides bp
forget forgot forgotten forgets sbpx
hear heard heard hears sbx
meet met met meets sb
understand understood understood understands sbx
say said said says sb
walk walked walked walks sp
turn turned turned turns x
open opened opened opens s
close closed closed closes s
grab grabbed grabbed grabs sbp
push pushed pushed pushes sb
pull pulled pulled pulls sb
listen listened listened listens sbp
ask asked asked asks sbp
answer answered answered answers p
hurry hurried hurried hurries sbp
carry carried carried carries sb
follow followed followed follows sb
enter entered entered enters sb
decide decided decided decides sb
realize realized realized realizes sbx
realise realised realised realises sbx
notice noticed noticed notices sx
wonder wondered wondered wonders sbx
remember remembered remembered remembers sbx
believe believed believed believes sbx
want wanted wanted wants sbx
arrive arrived arrived arrives sb
appear appeared appeared appears sbx
disappear disappeared disappeared disappears sbp
continue continued continued continues sb
finish finished finished finishes sb
explain explained explained explains sbp
admit admitted admitted admits sbp
agree agreed agreed agrees sbp
add added added adds sb
slam slammed slammed slams sb
stumble stumbled stumbled stumbles sbp
mutter muttered muttered mutters sbp
whisper whispered whispered whispers p
shout shouted shouted shouts p
smile smiled smiled smiles p
laugh laughed laughed laughs p
nod nodded nodded nods sp
shrug shrugged shrugged shrugs sp
sigh sighed sighed sighs p
glance glanced glanced glances p
step stepped stepped steps p
look looked looked looks x
seem seemed seemed seems x
start started started starts -
stop stopped stopped stops -
wait waited waited waits sb
watch watched watched watches -
call called called calls -
reply replied replied replies p
pick picked picked picks -
reach reached reached reaches sb
climb climbed climbed climbs sb
jump jumped jumped jumps s
kick kicked kicked kicks s
knock knocked knocked knocks s
move moved moved moves -
pause paused paused pauses -
point pointed pointed points -
wave waved waved waves -
touch touched touched touches -
kiss kissed kissed kisses -
hug hugged hugged hugs -
cry cried cried cries -
try tried tried tries s
stare stared stared stares s
drop dropped dropped drops -
slip slipped slipped slips -
lift lifted lifted lifts s
frown frowned frowned frowns s
return returned returned returns b
head headed headed heads -
`;

  const VERBS = VERB_TABLE.trim().split('\n').map(line => {
    const [base, past, participle, third, flags] = line.trim().split(/\s+/);
    return { base, past, participle, third, flags: flags === '-' ? '' : flags };
  });

  const byPast = new Map();
  const byThird = new Map();
  const byBase = new Map();
  for (const v of VERBS) {
    byPast.set(v.past, v);
    byThird.set(v.third, v);
    byBase.set(v.base, v);
  }

  // A past form that differs from its participle, for "had went" and friends.
  // "rose" (the flower) and "got" ("have got" is standard) are left out.
  const PARTICIPLE_ERRORS = new Map(VERBS
    .filter(v => v.past !== v.participle && v.past !== 'rose' && v.past !== 'got')
    .map(v => [v.past, v.participle]));
  for (const [past, participle] of [['did', 'done'], ['rang', 'rung'], ['sank', 'sunk'], ['tore', 'torn'], ['blew', 'blown'], ['sprang', 'sprung'], ['shrank', 'shrunk'], ['stank', 'stunk']]) {
    PARTICIPLE_ERRORS.set(past, participle);
  }

  const THIRD_PERSON = new Set(['he', 'she', 'it']);
  const NEW_SUBJECTS = new Set(['i', 'he', 'she', 'we', 'they']);
  const NOT_NAMES = new Set(('The A An This That These Those Then When While After Before As If But And So Or Now Later ' +
    'Suddenly Still Yet There Here His Her Their Our My Your Its One Some Every Each All No Not Once Soon At In On By For ' +
    'With From To Of Into Over Under Again Finally Meanwhile Instead Also Even Just Only Perhaps Maybe Mr Mrs Ms Dr Sir ' +
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday Today Tomorrow Yesterday Everyone Everybody Nobody Somebody ' +
    'Someone Nothing Something Everything What Why How Where Who Which Whose Whom').split(' '));
  // Words that can legitimately move the time between the two verbs.
  const BREAKS = new Set(('that which who whom whose because if when while where although though since until unless ' +
    'whether how what why as before after once so but or nor to would could should will can may might must shall ' +
    'did does do not never didn\'t doesn\'t don\'t won\'t wouldn\'t couldn\'t shouldn\'t can\'t cannot ' +
    'is are am was were be been being has have had').split(' '));
  const VERB_FOLLOWERS = new Set(['him', 'her', 'them', 'me', 'us', 'it', 'out', 'off', 'away', 'back', 'up', 'down',
    'around', 'aside', 'asleep', 'apart', 'home', 'outside', 'inside', 'forward']);
  // Words that put a verb in a different time on purpose: "She left the army in
  // 2010 and runs a bakery now."
  const TIME_MARKERS = new Set(['now', 'still', 'today', 'nowadays', 'currently', 'anymore', 'tonight', 'lately', 'since']);
  const CLAUSE_LINKS = new Set(('and but or so then when while because if as after before until since though ' +
    'although once now yet where whereas unless').split(' '));
  const VERBISH = new Set(['was', 'were', 'is', 'are', 'am', 'had', 'has', 'have', 'could', 'would', 'should',
    'might', 'will', 'can', 'did', 'do', 'does', 'must', 'shall', 'may']);

  function isVerbish(word) {
    if (!word) return false;
    const w = word.toLowerCase();
    return VERBISH.has(w) || byPast.has(w) || /ed$/.test(w);
  }

  const TOKEN = /[\p{L}]+(?:['’][\p{L}]+)*/gu;

  /** Narration segments: text between sentence punctuation, dashes, brackets and quotes. */
  function segments(text) {
    const out = [];
    const re = /[^.!?;:\n—–()[\]"“”]+/g;
    for (const m of text.matchAll(re)) out.push({ start: m.index, text: m[0] });
    return out;
  }

  const NOT_BEFORE_SUBJECT = new Set(('the a an his her their our my your its this that these those of through for ' +
    'with at in on to from by about during into').split(' '));

  /**
   * Whether tokens[i] starts a clause as a third-person subject: "he", "she", or
   * a name that is not a modifier ("the Christmas drinks", "the Lake District").
   * First and second person are left to the AI check: their base forms are too
   * often infinitives ("watched them come and go").
   */
  function isSubject(tokens, i) {
    const word = tokens[i].word;
    const prev = tokens[i - 1] && tokens[i - 1].word;
    if (prev && NOT_BEFORE_SUBJECT.has(prev.toLowerCase())) return false;
    if (THIRD_PERSON.has(word.toLowerCase()) && word.toLowerCase() !== 'it') return true;
    if (!/^\p{Lu}\p{Ll}+$/u.test(word) || NOT_NAMES.has(word)) return false;
    return !prev || /^\p{Ll}/u.test(prev) || NOT_NAMES.has(prev);
  }

  /** The verb right after a subject (one -ly adverb allowed): { index, verb, tense } or null. */
  function verbAfterSubject(tokens, i) {
    let j = i + 1;
    if (tokens[j] && /ly$/i.test(tokens[j].word) && !byPast.has(tokens[j].word.toLowerCase())) j++;
    const t = tokens[j];
    if (!t) return null;
    const w = t.word.toLowerCase();
    if (byPast.has(w) && byPast.get(w).past !== byPast.get(w).base) return { index: j, verb: byPast.get(w), tense: 'past' };
    if (byThird.has(w)) return { index: j, verb: byThird.get(w), tense: 'present' };
    return null;
  }

  const verbForm = {
    id: 'verb-form',
    category: 'grammar',
    run(ctx) {
      const pasts = [...PARTICIPLE_ERRORS.keys()].join('|');
      const re = new RegExp(`\\b(had|has|have|['’]ve)(?:n['’]t)?(\\s+)((?:already|just|never|not|always|even|finally|also|recently|long)\\s+)?(${pasts})\\b`, 'gdiu');
      ctx.each(re, m => {
        // "Has Drew finished?", "She has Fell ponies": a capitalised form mid-sentence is a name.
        if (/^\p{Lu}\p{Ll}+$/u.test(m[4])) return null;
        // "Everything she had went to her sister": "had" ends a relative clause, and the past
        // form is the main verb. Skip when the pronoun follows a noun or quantifier.
        const lead = /(\p{L}+)[ \t]+(?:I|you|he|she|we|they)[ \t]*$/iu.exec(ctx.text.slice(Math.max(0, m.index - 40), m.index));
        if (lead && !CLAUSE_LINKS.has(lead[1].toLowerCase()) && !isVerbish(lead[1]) && !byThird.has(lead[1].toLowerCase())) return null;
        const right = PARTICIPLE_ERRORS.get(m[4].toLowerCase());
        const [start, end] = m.indices[4];
        return {
          start, end, replacement: Spelling.matchCase(m[4], right),
          severity: 'warning', voice: 'soft',
          message: `After "${m[1].replace(/^['’]/, '')}", use the past participle: "${right}".`,
          explanation: `"${m[4]}" is the simple past. Perfect tenses take the participle ("had ${right}").`
        };
      });
      // Not "Are you done?" or "Have you seen it?": there "done" and "seen" are standard.
      // Nor "Haven't I seen you?", "What's he done?", "Has he or she seen it?".
      ctx.each(/(?<!\b(?:am|are|is|was|were|be|been|being|get|gets|got|feel|felt|seem|seemed|have|has|had|having)(?:n['’]t)?(?:\s+not)?\s+)(?<!['’](?:s|ve|d)\s+)(?<!\b(?:I|you|we|they|he|she|it)\s+(?:and|or)\s+)\b(I|you|we|they|he|she)(\s+)(seen|done)\b(?!\s+(?:by|with|for)\b)/gdi, m => {
        const right = m[3].toLowerCase() === 'seen' ? 'saw' : 'did';
        const [start, end] = m.indices[3];
        return {
          start, end, replacement: Spelling.matchCase(m[3], right),
          severity: 'warning', voice: 'soft',
          message: `"${m[3]}" needs "have" or "had"; the simple past is "${right}".`,
          explanation: `"${m[1]} ${m[3]}" is common in speech and some dialects. Standard written English uses "${m[1]} ${right}" or "${m[1]} had ${m[3]}".`
        };
      });
    }
  };

  const tenseShift = {
    id: 'tense-shift',
    category: 'grammar',
    run(ctx) {
      for (const seg of segments(ctx.text)) {
        const tokens = [...seg.text.matchAll(TOKEN)].map(m => ({ word: m[0], at: seg.start + m.index }));
        for (let i = 0; i < tokens.length - 3; i++) {
          if (!isSubject(tokens, i)) continue;
          const source = verbAfterSubject(tokens, i);
          // "She looks tired and worried", "I think he left": linking and mental verbs in the
          // present do not set the tense of what follows. In the past they do.
          if (!source || (source.tense === 'present' && source.verb.flags.includes('x'))) continue;
          const found = findSecondVerb(tokens, source, ctx.text);
          if (!found) continue;
          const { token, replacement, wrong } = found;
          if (ctx.inDialogue(tokens[source.index].at) || ctx.inDialogue(token.at)) continue;
          if (tokens.slice(i).some(t => TIME_MARKERS.has(t.word.toLowerCase()))) continue;
          ctx.add({
            start: token.at, end: token.at + token.word.length,
            replacement: Spelling.matchCase(token.word, replacement),
            // A past event beside a present state can be right ("grew up in Lagos and speaks
            // four languages"), so this is the author's call: one at a time, never in Accept all.
            severity: 'suggestion', voice: 'dialogue', bulk: false,
            message: `Tense shift: "${tokens[source.index].word}" is ${source.tense} tense, "${token.word}" is ${wrong}.`,
            explanation: 'Two verbs that share a subject in one sentence normally keep the same tense. Keep it if the change in time is deliberate.'
          });
          i = source.index;
        }
      }
    }
  };

  function findSecondVerb(tokens, source, text) {
    for (let j = source.index + 1; j < Math.min(tokens.length, source.index + 14); j++) {
      const w = tokens[j].word.toLowerCase().replace(/’/g, "'");
      // "to" before a verb is an infinitive ("decided to stay and helps"); before anything else
      // it is a preposition ("went to the store and buys").
      if (w === 'to' && tokens[j + 1] && byBase.has(tokens[j + 1].word.toLowerCase())) return null;
      if ((w !== 'to' && BREAKS.has(w)) || NEW_SUBJECTS.has(w)) return null;
      if (w !== 'and') continue;
      let k = j + 1;
      if (tokens[k] && /^(then|quickly|slowly|suddenly|finally|quietly|carefully)$/i.test(tokens[k].word)) k++;
      const token = tokens[k];
      if (!token) return null;
      // "a wait-and-see approach": part of a hyphenated compound, not a verb.
      if (text[tokens[j].at - 1] === '-' || text[tokens[j].at + 3] === '-') continue;
      // "They argued and fights broke out": a noun followed by its own verb starts a new clause.
      if (isVerbish(tokens[k + 1] && tokens[k + 1].word)) return null;
      const found = secondVerb(token, source, tokens[k + 1], tokens[j - 1], tokens[j - 2]);
      if (found) return found;
      // A list ("her keys, phone and wallet and runs"): keep looking for the verb.
    }
    return null;
  }

  /**
   * The verb after "and" if it slips tense: an -s form after a past verb, or a
   * past form after an -s verb. `before` is the word before "and".
   */
  function secondVerb(token, source, next, before, beforeThat) {
    // "She meets Sam and Drew": after "and" a capital marks a name.
    if (/^\p{Lu}/u.test(token.word)) return null;
    const c = token.word.toLowerCase();
    const b = before ? before.word.toLowerCase() : '';
    const clearlyVerb = Boolean(next) && VERB_FOLLOWERS.has(next.word.toLowerCase());
    if (source.tense === 'past') {
      // "burgers and shakes", "walks and runs": a list of plural nouns.
      const listOfNouns = b.length > 3 && /s$/.test(b) && !['his', 'its', 'was', 'has', 'this', 'thus', 'does', 'goes'].includes(b);
      const asThird = byThird.get(c);
      if (asThird && !listOfNouns && (asThird.flags.includes('s') || clearlyVerb)) return { token, replacement: asThird.past, wrong: 'present' };
      return null;
    }
    // "a short and whispered answer": coordinated adjectives in a noun phrase.
    if (beforeThat && /^(a|an|the)$/i.test(beforeThat.word)) return null;
    const asPast = byPast.get(c);
    if (asPast && (asPast.flags.includes('p') || clearlyVerb) && asPast.past !== asPast.base) {
      return { token, replacement: asPast.third, wrong: 'past' };
    }
    return null;
  }

  return { RULES: [verbForm, tenseShift], VERBS };
}));
