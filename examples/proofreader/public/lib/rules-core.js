/**
 * Core proofreading rules: spacing, capitalization, spelling, grammar and
 * dialect usage. Each rule is { id, category, run(ctx) } and reports through
 * ctx.add(); the engine supplies ctx (see engine.js).
 *
 * Voice handling: a rule marks an issue with
 *   voice: 'soft'     - informal or dialect usage. In creative mode it is
 *                       dropped inside dialogue and downgraded to info in
 *                       narration.
 *   voice: 'dialogue' - a real error that a character might still say on
 *                       purpose. In creative mode it is downgraded to info
 *                       inside dialogue.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./spelling'), require('./wordlists'));
  } else {
    root.GalleyRulesCore = factory(root.GalleySpelling, root.GalleyWords);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Spelling, Words) {
  'use strict';

  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  // ---------------------------------------------------------------- spacing

  const spacing = {
    id: 'spacing',
    category: 'typography',
    run(ctx) {
      if (!ctx.profile.poetry) {
        ctx.each(/(\S)( {2,})(?=\S)/gd, m => ({
          start: m.indices[2][0], end: m.indices[2][1], replacement: ' ',
          message: 'Extra space between words.',
          explanation: 'Use one space between words and after sentences.'
        }));
      }
      ctx.each(/(\S)( +)([,;:!?]|\.(?![ .]?\.))(?=[\s"”’)]|$)/gd, m => {
        if (m[1] === '.') return null;
        return {
          start: m.indices[2][0], end: m.indices[3][1], replacement: m[3],
          severity: 'error', category: 'punctuation',
          message: `Space before "${m[3]}".`,
          explanation: 'Punctuation sits directly after the word it follows.'
        };
      });
      ctx.each(/(\p{Ll})([,;])(\p{L})/gdu, m => ({
        start: m.indices[2][0], end: m.indices[2][1], replacement: m[2] + ' ',
        severity: 'error', category: 'punctuation',
        message: `Missing space after "${m[2]}".`
      }));
      ctx.each(/(\p{Ll}{2})([.!?])(\p{Lu}\p{Ll})/gdu, m => ({
        start: m.indices[2][0], end: m.indices[2][1], replacement: m[2] + ' ',
        severity: 'error', category: 'punctuation',
        message: 'Missing space between sentences.'
      }));
    }
  };

  // ---------------------------------------------------------- punctuation

  const repeatedPunctuation = {
    id: 'repeated-punctuation',
    category: 'punctuation',
    run(ctx) {
      ctx.each(/,{2,}|;{2,}|:{2,}/g, m => ({
        start: m.index, end: m.index + m[0].length, replacement: m[0][0],
        severity: 'error', message: `Doubled "${m[0][0]}".`
      }));
      ctx.each(/(^|[^.])(\.\.)(?!\.)/gd, m => ({
        start: m.indices[2][0], end: m.indices[2][1], replacement: '.',
        severity: 'error',
        message: 'Two periods. Use one period, or three for an ellipsis.'
      }));
      ctx.each(/[!?]{2,}/g, m => ({
        start: m.index, end: m.index + m[0].length,
        replacement: ctx.profile.mode === 'formal' ? m[0][0] : null,
        severity: 'warning', voice: 'soft',
        message: 'Stacked exclamation or question marks.',
        explanation: 'Formal and most published prose use a single mark.'
      }));
    }
  };

  // -------------------------------------------------------- capitalization

  const capitalization = {
    id: 'capitalization',
    category: 'capitalization',
    run(ctx) {
      const { text } = ctx;
      ctx.each(/(^|[^\p{L}\p{N}_.\-'’])(i)(?=$|[^\p{L}\p{N}_.-])/gdmu, m => {
        const start = m.indices[2][0];
        if (text[start - 1] === '(' && text[start + 1] === ')') return null;
        return {
          start, end: start + 1, replacement: 'I', severity: 'error',
          message: 'The pronoun "I" is always capitalized.'
        };
      });
      ctx.each(/(^|[^\p{L}])(im)(?= \p{Ll})/gdu, m => ({
        start: m.indices[2][0], end: m.indices[2][1], replacement: "I'm",
        severity: 'error', category: 'spelling', message: 'Did you mean "I\'m"?'
      }));
      ctx.each(/([.!?])(\s+)(\p{Ll})/gdu, m => {
        const pos = m.indices[3][0];
        if (!ctx.isSentenceStart(pos)) return null;
        return {
          start: pos, end: pos + 1, replacement: m[3].toUpperCase(),
          severity: 'warning', message: 'Sentence starts with a lowercase letter.'
        };
      });
      if (!ctx.profile.poetry) {
        ctx.each(/^(\p{Ll})(\p{L}*)/gmu, m => {
          if (/\p{Lu}/u.test(m[2])) return null; // iPhone, eBay
          return {
            start: m.index, end: m.index + 1, replacement: m[1].toUpperCase(),
            severity: 'warning', message: 'Paragraph starts with a lowercase letter.'
          };
        });
      }
      const names = Words.DAYS.concat(Words.MONTHS.filter(n => !['May', 'March', 'August'].includes(n)));
      const re = new RegExp(`\\b(${names.map(n => n.toLowerCase()).join('|')})\\b`, 'g');
      ctx.each(re, m => ({
        start: m.index, end: m.index + m[0].length, replacement: capitalize(m[0]),
        severity: 'error', message: 'Days and months are capitalized.'
      }));
    }
  };

  // --------------------------------------------------------------- spelling

  const commonTypos = {
    id: 'typo',
    category: 'spelling',
    run(ctx) {
      ctx.each(/\p{L}+(?:['’]\p{L}+)*/gu, m => {
        const key = m[0].toLowerCase().replace(/’/g, "'");
        const fix = Object.prototype.hasOwnProperty.call(Words.MISSPELLINGS, key) ? Words.MISSPELLINGS[key] : null;
        if (!fix) return null;
        const curly = ctx.usesCurlyApostrophes ? fix.replace(/'/g, '’') : fix;
        return {
          start: m.index, end: m.index + m[0].length,
          replacement: Spelling.matchCase(m[0], curly),
          severity: 'error', message: `Misspelled: "${m[0]}".`
        };
      });
    }
  };

  const dialectSpelling = {
    id: 'dialect-spelling',
    category: 'dialect',
    run(ctx) {
      const system = ctx.profile.spelling;
      const systemName = Spelling.SYSTEM_NAMES[system];
      ctx.each(/\p{L}+/gu, m => {
        const hit = Spelling.lookup(system, m[0]);
        if (!hit) return null;
        const properNoun = /^\p{Lu}/u.test(m[0]) && !ctx.isSentenceStart(m.index);
        const notes = [`${systemName} (${hit.label}).`];
        if (hit.category === 'ize' && system === 'uk') {
          notes.push('British English also accepts -ize. Choose "British English, Oxford spelling" if the manuscript uses -ize on purpose.');
        }
        if (hit.note) notes.push(hit.note);
        if (properNoun) notes.push('Names keep their own spelling (Pearl Harbor, the Labor Party, Lincoln Center).');
        return {
          start: m.index, end: m.index + m[0].length, replacement: hit.preferred,
          severity: properNoun ? 'info' : 'warning',
          message: `${ctx.profile.dialectName} spells this "${hit.preferred}".`,
          explanation: notes.join(' ')
        };
      });
      const usSpelling = system === 'us';
      if (usSpelling) {
        ctx.each(/\blicence(s?)\b/gi, m => ({
          start: m.index, end: m.index + m[0].length,
          replacement: Spelling.matchCase(m[0], `license${m[1]}`), severity: 'warning',
          message: `${ctx.profile.dialectName} spells this "license".`
        }));
      } else {
        ctx.each(/\b(a|the|his|her|their|my|your|our|its|driving|driver's|liquor|marriage|fishing|pilot's)(\s+)(license)(s?)\b/gdi, m => ({
          start: m.indices[3][0], end: m.indices[4][1],
          replacement: Spelling.matchCase(m[3], `licence${m[4]}`), severity: 'warning',
          message: 'The noun is "licence" here; "license" is the verb.'
        }));
      }
    }
  };

  // ---------------------------------------------------------------- grammar

  const LEGIT_REPEATS = new Set(['had', 'that', 'is', 'do']);
  const EMPHATIC_REPEATS = new Set([
    'very', 'no', 'so', 'now', 'there', 'well', 'bye', 'ha', 'yes', 'oh', 'go',
    'really', 'tut', 'chop', 'knock', 'blah', 'never', 'far', 'round', 'on',
    'over', 'more', 'away', 'again', 'yeah', 'hush', 'please', 'faster', 'run'
  ]);

  const repeatedWord = {
    id: 'repeated-word',
    category: 'grammar',
    run(ctx) {
      // Spaces only: "Chapter Seven\n\nSeven men rode in" is a heading and a sentence.
      ctx.each(/(^|[^\p{L}\p{N}'’])(\p{L}+)([ \t]+)(\2)(?![\p{L}\p{N}'’])/gdiu, m => {
        const word = m[2].toLowerCase();
        if (LEGIT_REPEATS.has(word)) return null;
        // Three or more in a row is deliberate ("Drip drip drip drip").
        const before = ctx.text.slice(0, m.indices[2][0]).match(/(\p{L}+)[ \t,]*$/u);
        const after = ctx.text.slice(m.indices[4][1]).match(/^[ \t,]*(\p{L}+)/u);
        if ((before && before[1].toLowerCase() === word) || (after && after[1].toLowerCase() === word)) return null;
        const emphatic = EMPHATIC_REPEATS.has(word);
        return {
          start: m.indices[3][0], end: m.indices[4][1], replacement: '',
          severity: emphatic ? 'info' : 'error',
          voice: emphatic ? 'soft' : 'dialogue',
          message: `Repeated word: "${m[2]} ${m[4]}".`
        };
      });
    }
  };

  const A_SOUND = /^(?:uni(?:corn|cycl|form|f|on|q|son|t|vers|lateral|cell|direction|sex)|use|usu|usur|uten|uter|util|utop|uran|urin|ureth|eu|ewe|one(?![a-z])|once|ouija|ufo|ukul|ubiq|unanim|ukrain|uganda|urugu|utah)/i;
  const AN_SOUND = /^(?:hour|honest|honor|honour|heir)/i;

  function expectedArticle(word, profile) {
    if (/^\d/.test(word)) {
      const digits = word.match(/^\d+/)[0];
      return /^8/.test(digits) || digits === '11' || digits === '18' ? 'an' : 'a';
    }
    if (word.length < 2 || /^\p{Lu}{2,}/u.test(word)) return null; // letters, acronyms
    if (A_SOUND.test(word)) return 'a';
    if (AN_SOUND.test(word)) return 'an';
    if (profile.herbAn && /^herb/i.test(word)) return 'an';
    if (/^herb/i.test(word)) return 'a';
    return /^[aeiou]/i.test(word) ? 'an' : 'a';
  }

  const articles = {
    id: 'a-an',
    category: 'grammar',
    run(ctx) {
      ctx.each(/(^|[^\p{L}\p{N}'’])(a|an|A|An)(\s+)([\p{L}\p{N}][\p{L}\p{N}'’-]*)/gdu, m => {
        const start = m.indices[2][0];
        if (m[2] === 'A' && !ctx.isSentenceStart(start)) return null; // Plan A, vitamin A
        const want = expectedArticle(m[4], ctx.profile);
        if (!want || want === m[2].toLowerCase()) return null;
        return {
          start, end: m.indices[2][1], replacement: Spelling.matchCase(m[2], want),
          severity: 'error',
          message: `Use "${want}" before "${m[4]}".`,
          explanation: 'The article follows the sound of the next word, not its first letter (an hour, a university).'
        };
      });
    }
  };

  // [regex, group to replace, replacement builder, message, extra]
  const CONFUSIONS = [
    [/\b(its)(\s+)(a|an|the|been|not|going|gonna|got|just|never|always|really|too|my|your|his|her|our|their|about|like|okay|ok|alright|over|all|because|what|that|this|getting|raining|snowing|done|gone)\b(?![-\p{L}])/gdiu,
      1, () => "it's", '"its" is possessive; "it\'s" means "it is" or "it has".'],
    [/\b(it['’]s)(\s+)(own)\b/gdi, 1, () => 'its', '"Its own" takes the possessive "its".'],
    [/\b(your)(\s+)(welcome(?=\s*[.!?,;]|\s+to\b)|late(?=\s*[.!?,;])|not|gonna|the|a|an|my|our|their|his|her|its|kidding|joking)\b(?![-\p{L}])/gdiu,
      1, () => "you're", '"Your" is possessive; "you\'re" means "you are".'],
    [/\b(their)(\s+)(is|are|was|were|isn't|aren't|wasn't|weren't)\b/gdi, 1, () => 'there', 'Use "there" to say something exists.'],
    [/\b(there|they['’]re)(\s+)(own)\b/gdi, 1, () => 'their', '"Their own" is possessive.'],
    [/\b(they['’]re)(\s+)(is|are|was|were)\b/gdi, 1, () => 'there', 'Did you mean "there"?'],
    [/\b(more|less|fewer|better|worse|rather|other|greater|smaller|larger|bigger|faster|slower|higher|lower|older|younger|easier|harder|sooner|longer|shorter|stronger|weaker|richer|poorer|smarter)(\s+)(then)\b/gdi,
      3, () => 'than', 'Comparisons take "than"; "then" is about time.'],
    [/\b(and|but)(\s+)(than)\b/gdi, 3, () => 'then', '"Then" marks what happens next.'],
    [/\b(whose)(\s+)(going|coming|been|there|not|gonna|that)\b/gdi, 1, () => "who's", '"Who\'s" means "who is" or "who has".'],
    [/\b(to|will|would|could|might|may|can|cannot|can't|don't|didn't|won't|not)(\s+)(loose)\b/gdi, 3, () => 'lose', '"Lose" is the verb (lose a game); "loose" means not tight.'],
    [/\b(everyday)(?=\s*[.!?,;:])/gdi, 1, () => 'every day', '"Everyday" is an adjective (everyday clothes); as an adverb it is two words.']
  ];

  const confusions = {
    id: 'confusion',
    category: 'grammar',
    run(ctx) {
      for (const [re, group, build, explanation] of CONFUSIONS) {
        ctx.each(re, m => {
          const [start, end] = m.indices[group];
          const fix = build(m);
          return {
            start, end, replacement: Spelling.matchCase(m[group], ctx.usesCurlyApostrophes ? fix.replace(/'/g, '’') : fix),
            severity: 'error', message: `Did you mean "${fix}"?`, explanation
          };
        });
      }
      ctx.each(/\b(should|could|would|must|might|may|shouldn't|couldn't|wouldn't|mustn't|ought to)(\s+)(of)\b(?!\s+course)/gdi, m => ({
        start: m.indices[3][0], end: m.indices[3][1], replacement: 'have',
        severity: 'error', voice: 'dialogue',
        message: `"${m[1]} of" should be "${m[1]} have" (or "${m[1]}'ve").`
      }));
      ctx.each(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)( )(one|two|three|four|five|six|seven|eight|nine)\b/gdi, m => ({
        start: m.indices[2][0], end: m.indices[2][1], replacement: '-',
        severity: 'error', category: 'punctuation',
        message: 'Compound numbers from twenty-one to ninety-nine are hyphenated.'
      }));
    }
  };

  const wrongPhrases = {
    id: 'wrong-phrase',
    category: 'grammar',
    run(ctx) {
      for (const [wrong, right] of Words.WRONG_PHRASES) {
        const re = new RegExp(`\\b${escapeRe(wrong).replace(/ /g, '\\s+')}\\b`, 'gi');
        const soft = wrong === 'irregardless' || wrong === 'between you and I';
        ctx.each(re, m => ({
          start: m.index, end: m.index + m[0].length,
          replacement: Spelling.matchCase(m[0], right),
          severity: 'warning', voice: soft ? 'soft' : 'dialogue',
          message: `The standard form is "${right}".`,
          explanation: soft
            ? 'Common in speech; standard written English prefers the corrected form.'
            : 'A sound-alike word in a fixed phrase. Keep it only as a deliberate malapropism.'
        }));
      }
    }
  };

  const nonstandardGrammar = {
    id: 'nonstandard-grammar',
    category: 'grammar',
    run(ctx) {
      ctx.each(/\b(he|she|it)(\s+)(don['’]t)\b/gdi, m => ({
        start: m.indices[3][0], end: m.indices[3][1],
        replacement: Spelling.matchCase(m[3], m[3].includes('’') ? 'doesn’t' : "doesn't"),
        severity: 'warning', voice: 'soft', message: `Standard English: "${m[1]} doesn't".`
      }));
      ctx.each(/\b(we|they|you)(\s+)(was)\b/gdi, m => ({
        start: m.indices[3][0], end: m.indices[3][1], replacement: 'were',
        severity: 'warning', voice: 'soft', message: `Standard English: "${m[1]} were".`
      }));
      ctx.each(/\b(less)(\s+)(people|items|words|cars|books|mistakes|errors|students|children|options|problems|questions|members|employees|friends|times|cases|things)\b/gdi, m => ({
        start: m.indices[1][0], end: m.indices[1][1], replacement: Spelling.matchCase(m[1], 'fewer'),
        severity: 'suggestion', voice: 'soft', category: 'style',
        message: `Use "fewer" with countable nouns ("fewer ${m[3]}").`
      }));
    }
  };

  // ---------------------------------------------------------------- dialect

  const US_FAMILY_VARIANTS = {
    towards: 'toward', afterwards: 'afterward', amongst: 'among',
    whilst: 'while', amidst: 'amid', learnt: 'learned', spelt: 'spelled',
    spoilt: 'spoiled'
  };
  const UK_FAMILY_VARIANTS = { toward: 'towards', afterward: 'afterwards' };

  const dialectUsage = {
    id: 'dialect-usage',
    category: 'dialect',
    run(ctx) {
      const p = ctx.profile;
      const variants = p.family === 'us' ? US_FAMILY_VARIANTS : UK_FAMILY_VARIANTS;
      const re = new RegExp(`\\b(${Object.keys(variants).join('|')})\\b`, 'gi');
      ctx.each(re, m => ({
        start: m.index, end: m.index + m[0].length,
        replacement: Spelling.matchCase(m[0], variants[m[0].toLowerCase()]),
        severity: 'info', voice: 'soft',
        message: `${p.dialectName} usually writes "${variants[m[0].toLowerCase()]}".`,
        explanation: 'Both are correct English; this only matters if you want one dialect throughout.'
      }));
      if (p.anymore === 'us') {
        ctx.each(/\b(any more)(?=\s*(?:[.,;:!?)"”’]|$))/gmi, m => ({
          start: m.index, end: m.index + m[0].length, replacement: Spelling.matchCase(m[0], 'anymore'),
          severity: 'suggestion', message: 'American English writes "anymore" for "any longer".',
          explanation: 'Keep "any more" for quantity: "I don\'t want any more tea."'
        }));
      } else if (p.anymore === 'uk') {
        ctx.each(/\banymore\b/gi, m => ({
          start: m.index, end: m.index + m[0].length, replacement: Spelling.matchCase(m[0], 'any more'),
          severity: 'suggestion', message: 'British English traditionally writes "any more".'
        }));
      }
      if (p.collective === 'singular') {
        const nouns = Words.COLLECTIVE_NOUNS.join('|');
        const re2 = new RegExp(`\\b(the|this|that|our|their|his|her|my|your|a|an|every|each)(\\s+)(${nouns})(\\s+)(are|were|have)\\b`, 'gdi');
        const fix = { are: 'is', were: 'was', have: 'has' };
        ctx.each(re2, m => ({
          start: m.indices[5][0], end: m.indices[5][1], replacement: fix[m[5].toLowerCase()],
          severity: 'suggestion', voice: 'soft', category: 'grammar',
          message: `American English treats "${m[3]}" as singular.`,
          explanation: 'Use a plural verb only when the members act separately ("the jury were arguing among themselves").'
        }));
      }
      if (!p.lakh) {
        ctx.each(/\b\d{1,2}(?:,\d{2})+,\d{3}\b/g, m => ({
          start: m.index, end: m.index + m[0].length,
          replacement: Number(m[0].replace(/,/g, '')).toLocaleString('en-US'),
          severity: 'info', message: 'South Asian (lakh and crore) digit grouping.',
          explanation: 'Readers outside South Asia expect groups of three: 1,00,000 is 100,000.'
        }));
      }
    }
  };

  // ----------------------------------------------------------------- formal

  const formalRegister = {
    id: 'formal-register',
    category: 'style',
    run(ctx) {
      if (ctx.profile.mode !== 'formal') return;
      const contractions = Object.keys(Words.CONTRACTIONS).map(c => escapeRe(c).replace("'", "['’]"));
      const re = new RegExp(`(^|[^\\p{L}])(${contractions.join('|')})(?![\\p{L}])`, 'gdiu');
      ctx.each(re, m => {
        if (ctx.inDialogue(m.indices[2][0])) return null;
        const key = m[2].toLowerCase().replace(/’/g, "'");
        return {
          start: m.indices[2][0], end: m.indices[2][1],
          replacement: Spelling.matchCase(m[2], Words.CONTRACTIONS[key]),
          severity: 'info', message: 'Formal writing usually avoids contractions.'
        };
      });
      const informal = Object.keys(Words.INFORMAL_WORDS).map(w => escapeRe(w).replace("'", "['’]"));
      const re2 = new RegExp(`(^|[^\\p{L}])(${informal.join('|')})(?![\\p{L}])`, 'gdiu');
      ctx.each(re2, m => {
        if (ctx.inDialogue(m.indices[2][0])) return null;
        const fix = Words.INFORMAL_WORDS[m[2].toLowerCase().replace(/’/g, "'")];
        return {
          start: m.indices[2][0], end: m.indices[2][1],
          replacement: fix ? Spelling.matchCase(m[2], fix) : null,
          severity: 'warning', message: `"${m[2]}" is informal.`
        };
      });
      ctx.each(/[^.!?\n]+[.!?]/g, m => {
        const words = m[0].trim().split(/\s+/).length;
        if (words <= 45) return null;
        const lead = m[0].length - m[0].trimStart().length;
        return {
          start: m.index + lead, end: m.index + m[0].length,
          severity: 'info', message: `Long sentence (${words} words). Consider splitting it.`
        };
      });
    }
  };

  return {
    capitalize,
    expectedArticle,
    RULES: [
      spacing, repeatedPunctuation, capitalization, commonTypos,
      dialectSpelling, repeatedWord, articles, confusions, wrongPhrases,
      nonstandardGrammar, dialectUsage, formalRegister
    ]
  };
}));
