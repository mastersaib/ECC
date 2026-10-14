/**
 * Dialect profiles and style guides for the Galley proofreader.
 *
 * A dialect fixes spelling and the conventions readers of that variety
 * expect. A style guide (CMOS, AP, APA, MLA, New Hart's Rules, or the
 * manuscript house style) then overrides punctuation and number choices.
 * Spelling always follows the dialect, so "British English + CMOS" keeps
 * British spelling with Chicago punctuation.
 *
 * Setting values:
 *   'either'  - both conventions are accepted, nothing is flagged
 *   'dialect' - (style guides only) defer to the dialect profile
 *   { us, uk } - (style guides only) depends on the dialect family
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleyStyles = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const US_BASE = {
    family: 'us',
    quotes: 'double',
    punctInQuotes: 'inside',
    dash: 'em-closed',
    dateOrder: 'mdy',
    percentWord: 'percent',
    honorificPeriod: true,
    ampm: 'a.m.',
    collective: 'singular',
    anymore: 'us',
    lakh: false,
    herbAn: true
  };

  const COMMONWEALTH_BASE = {
    family: 'uk',
    quotes: 'either',
    punctInQuotes: 'logical',
    dash: 'either',
    dateOrder: 'dmy',
    percentWord: 'per cent',
    honorificPeriod: 'either',
    ampm: 'either',
    collective: 'either',
    anymore: 'either',
    lakh: false,
    herbAn: false
  };

  function dialect(id, name, spelling, base, extra) {
    return Object.assign({ id, name, spelling }, base, extra || {});
  }

  const DIALECTS = [
    dialect('en-US', 'American English', 'us', US_BASE),
    dialect('en-CA', 'Canadian English', 'ca', US_BASE, {
      percentWord: 'per cent', anymore: 'either', collective: 'either', herbAn: false
    }),
    dialect('en-PH', 'Philippine English', 'us', US_BASE, { collective: 'either' }),
    dialect('en-GB', 'British English (-ise)', 'uk', COMMONWEALTH_BASE, {
      dash: 'en-spaced', honorificPeriod: false, anymore: 'uk'
    }),
    dialect('en-GB-oxendict', 'British English, Oxford spelling (-ize)', 'oxford', COMMONWEALTH_BASE, {
      dash: 'en-spaced', honorificPeriod: false, anymore: 'uk'
    }),
    dialect('en-IE', 'Irish English', 'uk', COMMONWEALTH_BASE, { honorificPeriod: false }),
    dialect('en-AU', 'Australian English', 'au', COMMONWEALTH_BASE, {
      honorificPeriod: false, percentWord: 'either'
    }),
    dialect('en-NZ', 'New Zealand English', 'uk', COMMONWEALTH_BASE, { honorificPeriod: false }),
    dialect('en-ZA', 'South African English', 'uk', COMMONWEALTH_BASE),
    dialect('en-IN', 'Indian English', 'uk', COMMONWEALTH_BASE, { lakh: true }),
    dialect('en-PK', 'Pakistani English', 'uk', COMMONWEALTH_BASE, { lakh: true }),
    dialect('en-NG', 'Nigerian English', 'uk', COMMONWEALTH_BASE),
    dialect('en-KE', 'Kenyan and East African English', 'uk', COMMONWEALTH_BASE),
    dialect('en-SG', 'Singapore English', 'uk', COMMONWEALTH_BASE),
    dialect('en-JM', 'Caribbean English', 'uk', COMMONWEALTH_BASE)
  ];

  // Defaults every guide starts from; a guide only lists what it decides.
  const GUIDE_DEFAULTS = {
    serialComma: 'either',
    numbers: 'either',
    ellipsis: 'either',
    percentSymbol: 'either',
    usAbbrev: 'either',
    ordinalDates: 'either',
    rangeDash: 'either',
    egComma: 'either',
    twelveHour: 'either',
    italicSounds: false,
    register: 'any'
  };

  const STYLE_GUIDES = [
    {
      id: 'dialect',
      name: 'Dialect conventions only',
      short: 'Dialect',
      origin: null,
      summary: 'Checks spelling and the conventions of the chosen dialect without a publisher style guide.',
      settings: {}
    },
    {
      id: 'cmos',
      name: 'Chicago Manual of Style',
      short: 'CMOS',
      origin: 'us',
      summary: 'Book publishing standard in the US: serial comma, closed em dashes, numbers zero to one hundred spelled out.',
      settings: {
        serialComma: 'required', numbers: 'hundred', dash: 'em-closed',
        quotes: 'double', punctInQuotes: 'inside', ellipsis: 'spaced',
        percentWord: 'percent', percentSymbol: 'word', usAbbrev: 'US',
        dateOrder: 'mdy', ampm: 'a.m.', ordinalDates: 'avoid',
        rangeDash: 'en', egComma: 'required', honorificPeriod: true
      }
    },
    {
      id: 'ap',
      name: 'AP Stylebook',
      short: 'AP',
      origin: 'us',
      summary: 'News style: no serial comma, spaced em dashes, numerals from 10 up, the % sign.',
      settings: {
        serialComma: 'avoid', numbers: 'nine', dash: 'em-spaced',
        quotes: 'double', punctInQuotes: 'inside', ellipsis: 'closed',
        percentWord: 'percent', percentSymbol: 'symbol', usAbbrev: 'U.S.',
        dateOrder: 'mdy', ampm: 'a.m.', ordinalDates: 'avoid',
        rangeDash: 'hyphen', egComma: 'required', honorificPeriod: true
      }
    },
    {
      id: 'apa',
      name: 'APA Publication Manual (7th ed.)',
      short: 'APA',
      origin: 'us',
      summary: 'Academic social-science style: serial comma, numerals from 10 up, the % sign, formal register.',
      settings: {
        serialComma: 'required', numbers: 'nine', dash: 'em-closed',
        quotes: 'double', punctInQuotes: 'inside', ellipsis: 'spaced',
        percentWord: 'percent', percentSymbol: 'symbol', usAbbrev: 'U.S.',
        dateOrder: 'mdy', ampm: 'a.m.', ordinalDates: 'avoid',
        rangeDash: 'en', egComma: 'required', honorificPeriod: true,
        register: 'formal'
      }
    },
    {
      id: 'mla',
      name: 'MLA Handbook (9th ed.)',
      short: 'MLA',
      origin: 'us',
      summary: 'Humanities style: serial comma, "percent" in words, numbers written as words when they take one or two words.',
      settings: {
        serialComma: 'required', numbers: 'hundred', dash: 'em-closed',
        quotes: 'double', punctInQuotes: 'inside', ellipsis: 'spaced',
        percentWord: 'percent', percentSymbol: 'word', usAbbrev: 'US',
        ampm: 'a.m.', ordinalDates: 'avoid', egComma: 'required',
        honorificPeriod: true, register: 'formal'
      }
    },
    {
      id: 'harts',
      name: "New Hart's Rules (Oxford)",
      short: "Hart's",
      origin: 'uk',
      summary: 'British book style: single quotes, spaced en dashes, logical punctuation, day-month-year dates.',
      settings: {
        serialComma: 'required', numbers: 'hundred', dash: 'en-spaced',
        quotes: 'single', punctInQuotes: 'logical', ellipsis: 'closed',
        percentWord: 'per cent', percentSymbol: 'word', usAbbrev: 'US',
        dateOrder: 'dmy', ampm: 'a.m.', ordinalDates: 'avoid',
        rangeDash: 'en', egComma: 'either', honorificPeriod: false
      }
    },
    {
      id: 'house',
      name: 'Manuscript House Style',
      short: 'House',
      origin: null,
      summary: 'An editor\'s fiction checklist. American: double quotes, Oxford comma, Mr. and U.S. with periods, closed em dash, one to nine in words, Month Day, Year, 12-hour time. British: spaced en dash and "per cent".',
      settings: {
        serialComma: { us: 'required', uk: 'either' },
        numbers: 'nine',
        dash: 'dialect',
        quotes: { us: 'double', uk: 'dialect' },
        punctInQuotes: 'dialect',
        percentWord: 'dialect',
        percentSymbol: 'word',
        usAbbrev: { us: 'U.S.', uk: 'either' },
        honorificPeriod: { us: true, uk: 'dialect' },
        dateOrder: 'dialect',
        ampm: 'dialect',
        twelveHour: { us: 'required', uk: 'either' },
        collective: 'dialect',
        anymore: 'dialect',
        ordinalDates: 'avoid',
        rangeDash: 'en',
        italicSounds: true
      }
    }
  ];

  function findDialect(id) {
    return DIALECTS.find(d => d.id === id) || DIALECTS[0];
  }

  function findGuide(id) {
    return STYLE_GUIDES.find(g => g.id === id) || STYLE_GUIDES[0];
  }

  function resolveSetting(value, dialectProfile, key) {
    if (value === 'dialect') return dialectProfile[key];
    if (value && typeof value === 'object') {
      return resolveSetting(value[dialectProfile.family], dialectProfile, key);
    }
    return value;
  }

  /**
   * Merge a dialect and a guide into the flat profile the rules read.
   * options: { dialect, style, mode: 'creative' | 'formal', poetry: bool }
   */
  function resolveProfile(options) {
    const opts = options || {};
    const dialectProfile = findDialect(opts.dialect);
    const guide = findGuide(opts.style);
    const profile = Object.assign({}, GUIDE_DEFAULTS, dialectProfile);
    for (const [key, value] of Object.entries(guide.settings)) {
      const resolved = resolveSetting(value, dialectProfile, key);
      if (resolved !== undefined) profile[key] = resolved;
    }
    profile.dialectId = dialectProfile.id;
    profile.dialectName = dialectProfile.name;
    profile.guideId = guide.id;
    profile.guideName = guide.name;
    profile.guideShort = guide.short;
    if (opts.mode === 'formal' || opts.mode === 'creative') {
      profile.mode = opts.mode;
    } else {
      profile.mode = profile.register === 'formal' ? 'formal' : 'creative';
    }
    profile.poetry = Boolean(opts.poetry);
    profile.notice = guide.origin && guide.origin !== dialectProfile.family
      ? `${guide.short} is ${guide.origin === 'us' ? 'an American' : 'a British'} guide. Punctuation follows ${guide.short}; spelling follows ${dialectProfile.name}.`
      : null;
    return profile;
  }

  const DASH_LABELS = {
    'em-closed': 'Closed em dash: word—word',
    'em-spaced': 'Spaced em dash: word — word',
    'en-spaced': 'Spaced en dash: word – word',
    either: 'Any consistent dash style'
  };
  const NUMBER_LABELS = {
    nine: 'Words for one to nine, numerals from 10',
    hundred: 'Words for zero to one hundred, numerals above',
    either: 'Not enforced'
  };
  const ELLIPSIS_LABELS = {
    spaced: 'Three spaced periods: . . .',
    closed: 'Three periods: ...',
    either: 'Not enforced'
  };

  const QUOTE_LABELS = {
    double: '“Double”, ‘single’ inside',
    single: '‘Single’, “double” inside',
    either: 'Either, used consistently'
  };
  const PUNCT_LABELS = {
    inside: 'Commas and periods inside closing quotes',
    logical: 'Logical (inside only if part of the quotation)'
  };
  const SERIAL_LABELS = { required: 'Required: red, white, and blue', avoid: 'Omitted: red, white and blue' };
  const RANGE_LABELS = { en: 'En dash: 10–20', hyphen: 'Hyphen: 10-20' };
  const DATE_LABELS = { mdy: 'October 14, 2026', dmy: '14 October 2026', either: 'Either order' };
  const TITLE_LABELS = { true: 'Mr., Mrs., Dr.', false: 'Mr, Mrs, Dr', either: 'Either, used consistently' };
  const MODE_LABELS = { formal: 'Formal: contractions and slang flagged', creative: 'Creative: voice and dialogue protected' };

  function label(map, value) {
    return map[String(value)] || 'Not enforced';
  }

  function percentLabel(p) {
    if (p.percentSymbol === 'symbol') return '5% (symbol)';
    return p.percentWord === 'either' ? 'Not enforced' : `5 ${p.percentWord}`;
  }

  function timeLabel(p) {
    const clock = p.twelveHour === 'required' ? '12-hour, ' : '';
    return clock + (p.ampm === 'either' ? 'a.m./am, used consistently' : `6:30 ${p.ampm.replace('a.', 'p.')}`);
  }

  /**
   * Rows for the editorial style sheet panel.
   */
  function describeProfile(p) {
    return [
      ['Spelling', p.spellingName || p.spelling],
      ['Quotation marks', label(QUOTE_LABELS, p.quotes)],
      ['Punctuation and quotes', label(PUNCT_LABELS, p.punctInQuotes)],
      ['Serial comma', label(SERIAL_LABELS, p.serialComma)],
      ['Dashes', label(DASH_LABELS, p.dash)],
      ['Number ranges', label(RANGE_LABELS, p.rangeDash)],
      ['Numbers', label(NUMBER_LABELS, p.numbers)],
      ['Percentages', percentLabel(p)],
      ['Dates', label(DATE_LABELS, p.dateOrder)],
      ['Times', timeLabel(p)],
      ['Titles', label(TITLE_LABELS, p.honorificPeriod)],
      ['United States', p.usAbbrev === 'either' ? 'Not enforced' : p.usAbbrev],
      ['Ellipses', label(ELLIPSIS_LABELS, p.ellipsis)],
      ['Collective nouns', p.collective === 'singular' ? 'Singular: the team is' : 'Singular or plural'],
      ['Sound effects', p.italicSounds ? 'Italic: *Thud.*' : 'Not enforced'],
      ['Register', label(MODE_LABELS, p.mode)]
    ];
  }

  return {
    DIALECTS,
    STYLE_GUIDES,
    findDialect,
    findGuide,
    resolveProfile,
    describeProfile
  };
}));
