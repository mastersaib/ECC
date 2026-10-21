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
see saw seen sees sbpx
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
draw drew drawn draws sbp
drive drove driven drives bp
ride rode ridden rides bp
rise rose risen rises sb
break broke broken breaks p
choose chose chosen chooses sbp
freeze froze frozen freezes sbp
steal stole stolen steals sbp
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
  const OTHER_PERSONS = new Set(['i', 'you', 'we', 'they']);
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

  function subjectOf(token) {
    const lower = token.toLowerCase().replace(/’/g, "'");
    if (THIRD_PERSON.has(lower)) return 'third';
    if (OTHER_PERSONS.has(lower)) return 'other';
    if (/^\p{Lu}\p{Ll}+$/u.test(token) && !NOT_NAMES.has(token)) return 'third';
    return null;
  }

  /** The verb right after a subject (one -ly adverb allowed): { index, verb, tense } or null. */
  function verbAfterSubject(tokens, i, person) {
    let j = i + 1;
    if (tokens[j] && /ly$/i.test(tokens[j].word) && !byPast.has(tokens[j].word.toLowerCase())) j++;
    const t = tokens[j];
    if (!t) return null;
    const w = t.word.toLowerCase();
    if (byPast.has(w) && byPast.get(w).past !== byPast.get(w).base) return { index: j, verb: byPast.get(w), tense: 'past' };
    if (person === 'third' && byThird.has(w)) return { index: j, verb: byThird.get(w), tense: 'present' };
    if (person === 'other' && byBase.has(w) && byBase.get(w).past !== w) return { index: j, verb: byBase.get(w), tense: 'present' };
    return null;
  }

  const verbForm = {
    id: 'verb-form',
    category: 'grammar',
    run(ctx) {
      const pasts = [...PARTICIPLE_ERRORS.keys()].join('|');
      const re = new RegExp(`\\b(had|has|have|['’]ve)(?:n['’]t)?(\\s+)((?:already|just|never|not|always|even|finally|also|recently|long)\\s+)?(${pasts})\\b`, 'gdiu');
      ctx.each(re, m => {
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
      ctx.each(/(?<!\b(?:am|are|is|was|were|be|been|being|get|gets|got|feel|felt|seem|seemed|have|has|had|having)\s+)\b(I|you|we|they|he|she)(\s+)(seen|done)\b(?!\s+(?:by|with|for)\b)/gdi, m => {
        const right = m[3] === 'seen' ? 'saw' : 'did';
        const [start, end] = m.indices[3];
        return {
          start, end, replacement: right,
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
          const person = subjectOf(tokens[i].word);
          if (!person) continue;
          const source = verbAfterSubject(tokens, i, person);
          // "She looks tired and worried", "I think he left": linking and mental verbs in the
          // present do not set the tense of what follows. In the past they do.
          if (!source || (source.tense === 'present' && source.verb.flags.includes('x'))) continue;
          const found = findSecondVerb(tokens, source, person);
          if (!found) continue;
          const { token, replacement, wrong } = found;
          if (ctx.inDialogue(tokens[source.index].at) || ctx.inDialogue(token.at)) continue;
          ctx.add({
            start: token.at, end: token.at + token.word.length,
            replacement: Spelling.matchCase(token.word, replacement),
            severity: 'warning', voice: 'dialogue',
            message: `Tense shift: "${tokens[source.index].word}" is ${source.tense} tense, "${token.word}" is ${wrong}.`,
            explanation: 'Two verbs that share a subject in one sentence normally keep the same tense. Keep it if the change in time is deliberate.'
          });
          i = source.index;
        }
      }
    }
  };

  function findSecondVerb(tokens, source, person) {
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
      // "They argued and fights broke out": a noun followed by its own verb starts a new clause.
      if (isVerbish(tokens[k + 1] && tokens[k + 1].word)) return null;
      const found = secondVerb(token, source, person, tokens[k + 1]);
      if (found) return found;
      // A list ("her keys, phone and wallet and runs"): keep looking for the verb.
    }
    return null;
  }

  function secondVerb(token, source, person, next) {
    const c = token.word.toLowerCase();
    const clearlyVerb = Boolean(next) && VERB_FOLLOWERS.has(next.word.toLowerCase());
    if (source.tense === 'past') {
      const asThird = byThird.get(c);
      if (asThird && (asThird.flags.includes('s') || clearlyVerb)) return { token, replacement: asThird.past, wrong: 'present' };
      const asBase = byBase.get(c);
      if (asBase && (asBase.flags.includes('b') || clearlyVerb) && asBase.past !== c) return { token, replacement: asBase.past, wrong: 'present' };
      return null;
    }
    const asPast = byPast.get(c);
    if (asPast && (asPast.flags.includes('p') || clearlyVerb) && asPast.past !== asPast.base) {
      return { token, replacement: person === 'third' ? asPast.third : asPast.base, wrong: 'past' };
    }
    return null;
  }

  return { RULES: [verbForm, tenseShift], VERBS };
}));
