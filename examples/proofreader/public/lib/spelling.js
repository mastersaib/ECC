/**
 * Dialect spelling data for the Galley proofreader.
 *
 * English has many dialects but only a handful of spelling *systems*. Every
 * dialect in styles.js points at one of these systems:
 *
 *   us      American (color, center, organize, analyze, traveled, defense)
 *   uk      British -ise (colour, centre, organise, analyse, travelled, defence)
 *   oxford  British with Oxford -ize (colour, centre, organize, analyse)
 *   ca      Canadian (colour, centre, organize, analyze, travelled, defence)
 *   au      Australian (British base, but "program" in every sense)
 *
 * Works in the browser (window.GalleySpelling) and in Node (module.exports).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleySpelling = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Which side of each pair a spelling system prefers, per category.
  const UK_RULES = {
    our: 'uk', re: 'uk', ize: 'uk', yse: 'uk', ll: 'uk', ence: 'uk',
    ogue: 'uk', ae: 'uk', misc: 'uk', practise: 'uk'
  };
  const SYSTEM_RULES = {
    us: {
      our: 'us', re: 'us', ize: 'us', yse: 'us', ll: 'us', ence: 'us',
      ogue: 'us', ae: 'us', misc: 'us', practise: 'us'
    },
    uk: UK_RULES,
    oxford: Object.assign({}, UK_RULES, { ize: 'us' }),
    ca: Object.assign({}, UK_RULES, { ize: 'us', yse: 'us', ae: 'us', misc: 'ca' }),
    au: Object.assign({}, UK_RULES, { misc: 'au' })
  };

  const SYSTEM_NAMES = {
    us: 'American spelling',
    uk: 'British spelling (-ise)',
    oxford: 'Oxford spelling (-ize)',
    ca: 'Canadian spelling',
    au: 'Australian spelling'
  };

  // -or / -our. UK form is derived by turning the final "or" into "our".
  // Words that keep -or in British English (horror, error, tremor, pallor)
  // and derivatives that drop the u (humorous, vigorous, laborious,
  // honorary) are deliberately absent.
  const OUR_STEMS = [
    ['color', ['', 's', 'ed', 'ing', 'ful', 'fully', 'less', 'ist', 'ists']],
    ['discolor', ['', 's', 'ed', 'ing']],
    ['honor', ['', 's', 'ed', 'ing', 'able', 'ably']],
    ['dishonor', ['', 's', 'ed', 'ing', 'able']],
    ['favor', ['', 's', 'ed', 'ing', 'able', 'ably', 'ite', 'ites', 'itism']],
    ['disfavor', ['']],
    ['labor', ['', 's', 'ed', 'ing', 'er', 'ers']],
    ['neighbor', ['', 's', 'hood', 'hoods', 'ing', 'ly', 'liness']],
    ['behavior', ['', 's', 'al', 'ally']],
    ['misbehavior', ['']],
    ['humor', ['', 's', 'ed', 'ing', 'less']],
    ['flavor', ['', 's', 'ed', 'ing', 'ings', 'ful', 'less', 'some']],
    ['harbor', ['', 's', 'ed', 'ing']],
    ['rumor', ['', 's', 'ed']],
    ['vapor', ['', 's']],
    ['vigor', ['']],
    ['valor', ['']],
    ['savior', ['', 's']],
    ['armor', ['', 's', 'ed', 'y', 'er']],
    ['endeavor', ['', 's', 'ed', 'ing']],
    ['odor', ['', 's', 'less']],
    ['parlor', ['', 's']],
    ['rigor', ['', 's']],
    ['splendor', ['', 's']],
    ['tumor', ['', 's']],
    ['clamor', ['', 's', 'ed', 'ing']],
    ['candor', ['']],
    ['fervor', ['']],
    ['ardor', ['']],
    ['demeanor', ['', 's']],
    ['enamor', ['ed']],
    ['savor', ['', 's', 'ed', 'ing', 'y']],
    ['succor', ['']]
  ];

  // -er / -re, written out because the inflections are irregular (centred).
  const RE_PAIRS = [
    ['center', 'centre'], ['centers', 'centres'], ['centered', 'centred'],
    ['centering', 'centring'], ['centerpiece', 'centrepiece'],
    ['theater', 'theatre'], ['theaters', 'theatres'],
    ['fiber', 'fibre'], ['fibers', 'fibres'],
    ['liter', 'litre'], ['liters', 'litres'],
    ['kilometer', 'kilometre'], ['kilometers', 'kilometres'],
    ['centimeter', 'centimetre'], ['centimeters', 'centimetres'],
    ['millimeter', 'millimetre'], ['millimeters', 'millimetres'],
    ['caliber', 'calibre'], ['saber', 'sabre'], ['sabers', 'sabres'],
    ['somber', 'sombre'], ['specter', 'spectre'], ['specters', 'spectres'],
    ['luster', 'lustre'], ['meager', 'meagre'],
    ['maneuver', 'manoeuvre'], ['maneuvers', 'manoeuvres'],
    ['maneuvered', 'manoeuvred'], ['maneuvering', 'manoeuvring'],
    ['scepter', 'sceptre'], ['sepulcher', 'sepulchre'],
    ['ocher', 'ochre'], ['miter', 'mitre']
  ];

  // -ize / -ise. Only stems whose verb genuinely alternates; words that are
  // -ise everywhere (advertise, surprise, compromise) or -ize everywhere
  // (capsize, prize, seize) never appear here.
  const IZE_STEMS = [
    'organ', 'real', 'recogn', 'apolog', 'critic', 'emphas', 'priorit',
    'summar', 'memor', 'util', 'character', 'special', 'normal', 'stabil',
    'final', 'minim', 'maxim', 'optim', 'author', 'categor', 'civil',
    'colon', 'custom', 'democrat', 'dramat', 'econom', 'energ', 'equal',
    'familiar', 'fertil', 'formal', 'general', 'global', 'harmon',
    'hospital', 'hypothes', 'ideal', 'immun', 'industrial', 'item', 'legal',
    'legitim', 'liberal', 'local', 'magnet', 'marginal', 'mechan',
    'mesmer', 'mobil', 'modern', 'monopol', 'moral', 'neutral', 'ostrac',
    'patron', 'penal', 'personal', 'polar', 'popular', 'public', 'rational',
    'revital', 'revolution', 'sanit', 'scandal', 'scrutin', 'sensit',
    'steril', 'stigmat', 'subsid', 'symbol', 'sympath', 'synchron',
    'synthes', 'terror', 'theor', 'trivial', 'tyrann', 'urban', 'vandal',
    'vapor', 'verbal', 'victim', 'visual', 'vocal', 'western', 'agon',
    'antagon', 'central', 'commercial', 'computer', 'digit', 'epitom',
    'fantas', 'galvan', 'homogen', 'human', 'internal', 'ion', 'jeopard',
    'material', 'metabol', 'militar', 'national', 'natural', 'oxid',
    'pasteur', 'pulver', 'radical', 'regular', 'satir', 'social', 'solemn',
    'standard', 'tantal', 'vulcan', 'actual', 'capital', 'hypnot', 'idol',
    'immortal', 'baptiz'
  ];
  const IZE_SUFFIXES = ['e', 'es', 'ed', 'ing', 'ation', 'ations', 'er', 'ers'];

  const YSE_STEMS = ['anal', 'paral', 'catal', 'dial', 'electrol', 'hydrol', 'psychoanal'];
  const YSE_SUFFIXES = ['e', 'es', 'ed', 'ing', 'er', 'ers'];

  // Verbs that double the final l in British spelling (traveled/travelled).
  const LL_STEMS = [
    'travel', 'cancel', 'label', 'model', 'fuel', 'level', 'signal',
    'marvel', 'counsel', 'quarrel', 'tunnel', 'total', 'equal', 'duel',
    'channel', 'funnel', 'panel', 'pummel', 'rival', 'shovel', 'snorkel',
    'dial', 'yodel', 'jewel', 'libel', 'grovel', 'revel', 'spiral',
    'initial', 'unravel', 'bevel', 'chisel', 'swivel', 'towel', 'pedal',
    'stencil', 'enamel', 'cudgel', 'shrivel', 'snivel', 'drivel', 'kennel'
  ];
  const LL_EXTRA = [
    ['traveler', 'traveller'], ['travelers', 'travellers'],
    ['counselor', 'counsellor'], ['counselors', 'counsellors'],
    ['jeweler', 'jeweller'], ['jewelers', 'jewellers'],
    ['reveler', 'reveller'], ['revelers', 'revellers'],
    ['marvelous', 'marvellous'], ['marvelously', 'marvellously'],
    ['libelous', 'libellous'], ['woolen', 'woollen'], ['woolens', 'woollens'],
    // The reverse direction: American doubles, British does not.
    ['enroll', 'enrol'], ['enrolls', 'enrols'],
    ['enrollment', 'enrolment'], ['enrollments', 'enrolments'],
    ['fulfill', 'fulfil'], ['fulfills', 'fulfils'],
    ['fulfillment', 'fulfilment'], ['skillful', 'skilful'],
    ['skillfully', 'skilfully'], ['willful', 'wilful'],
    ['willfully', 'wilfully'], ['installment', 'instalment'],
    ['installments', 'instalments'], ['distill', 'distil'],
    ['distills', 'distils'], ['instill', 'instil'], ['instills', 'instils'],
    ['enthrall', 'enthral'], ['enthralls', 'enthrals'], ['appall', 'appal'],
    ['appalls', 'appals']
  ];

  const ENCE_PAIRS = [
    ['defense', 'defence'], ['defenses', 'defences'],
    ['defenseless', 'defenceless'], ['offense', 'offence'],
    ['offenses', 'offences'], ['pretense', 'pretence'],
    ['pretenses', 'pretences']
  ];

  const OGUE_PAIRS = [
    ['catalog', 'catalogue'], ['catalogs', 'catalogues'],
    ['cataloged', 'catalogued'], ['cataloging', 'cataloguing']
  ];

  const AE_PAIRS = [
    ['pediatric', 'paediatric'], ['pediatrician', 'paediatrician'],
    ['pediatricians', 'paediatricians'], ['anemia', 'anaemia'],
    ['anemic', 'anaemic'], ['anesthesia', 'anaesthesia'],
    ['anesthetic', 'anaesthetic'], ['anesthetics', 'anaesthetics'],
    ['anesthetist', 'anaesthetist'], ['estrogen', 'oestrogen'],
    ['diarrhea', 'diarrhoea'], ['fetus', 'foetus'], ['fetuses', 'foetuses'],
    ['hemorrhage', 'haemorrhage'], ['hemoglobin', 'haemoglobin'],
    ['leukemia', 'leukaemia'], ['orthopedic', 'orthopaedic'],
    ['esophagus', 'oesophagus'], ['gynecology', 'gynaecology'],
    ['gynecologist', 'gynaecologist'], ['edema', 'oedema'],
    ['hematology', 'haematology'], ['cesarean', 'caesarean'],
    ['feces', 'faeces'], ['ameba', 'amoeba']
  ];

  // Everything else. `ca` / `au` override the British form for those
  // systems; `oneWay: 'us'` means only American spelling objects (British
  // accepts both forms, e.g. judgment in legal writing).
  const MISC = [
    { us: 'gray', uk: 'grey' }, { us: 'grays', uk: 'greys' },
    { us: 'grayish', uk: 'greyish' }, { us: 'grayer', uk: 'greyer' },
    { us: 'program', uk: 'programme', ca: 'program', au: 'program', note: 'British English keeps "program" for computer programs.' },
    { us: 'programs', uk: 'programmes', ca: 'programs', au: 'programs', note: 'British English keeps "programs" for computer programs.' },
    { us: 'aluminum', uk: 'aluminium', ca: 'aluminum' },
    { us: 'mold', uk: 'mould' }, { us: 'molds', uk: 'moulds' },
    { us: 'molded', uk: 'moulded' }, { us: 'moldy', uk: 'mouldy' },
    { us: 'plow', uk: 'plough', ca: 'plow' }, { us: 'plows', uk: 'ploughs', ca: 'plows' },
    { us: 'plowed', uk: 'ploughed', ca: 'plowed' },
    { us: 'pajamas', uk: 'pyjamas' },
    { us: 'cozy', uk: 'cosy', ca: 'cozy' }, { us: 'cozier', uk: 'cosier', ca: 'cozier' },
    { us: 'coziest', uk: 'cosiest', ca: 'coziest' }, { us: 'coziness', uk: 'cosiness', ca: 'coziness' },
    { us: 'mustache', uk: 'moustache' }, { us: 'mustaches', uk: 'moustaches' },
    { us: 'jewelry', uk: 'jewellery' },
    { us: 'aging', uk: 'ageing', ca: 'aging' },
    { us: 'artifact', uk: 'artefact', ca: 'artifact' },
    { us: 'artifacts', uk: 'artefacts', ca: 'artifacts' },
    { us: 'skeptic', uk: 'sceptic', ca: 'skeptic' }, { us: 'skeptics', uk: 'sceptics', ca: 'skeptics' },
    { us: 'skeptical', uk: 'sceptical', ca: 'skeptical' },
    { us: 'skepticism', uk: 'scepticism', ca: 'skepticism' },
    { us: 'airplane', uk: 'aeroplane', ca: 'airplane' },
    { us: 'airplanes', uk: 'aeroplanes', ca: 'airplanes' },
    { us: 'judgment', uk: 'judgement', oneWay: 'us' },
    { us: 'judgments', uk: 'judgements', oneWay: 'us' },
    { us: 'acknowledgment', uk: 'acknowledgement', oneWay: 'us' },
    { us: 'acknowledgments', uk: 'acknowledgements', oneWay: 'us' }
  ];

  // practice (noun everywhere) vs practise (British verb). Only the
  // unambiguous verb forms are listed.
  const PRACTISE_PAIRS = [
    ['practiced', 'practised'], ['practicing', 'practising']
  ];

  function ourPairs() {
    const pairs = [];
    for (const [stem, suffixes] of OUR_STEMS) {
      const ukStem = stem.replace(/or$/, 'our');
      for (const suffix of suffixes) pairs.push([stem + suffix, ukStem + suffix]);
    }
    return pairs;
  }

  function stemPairs(stems, suffixes, usInfix, ukInfix) {
    const pairs = [];
    for (const stem of stems) {
      for (const suffix of suffixes) {
        pairs.push([stem + usInfix + suffix, stem + ukInfix + suffix]);
      }
    }
    return pairs;
  }

  function llPairs() {
    const pairs = [];
    for (const stem of LL_STEMS) {
      pairs.push([stem + 'ed', stem + 'led']);
      pairs.push([stem + 'ing', stem + 'ling']);
    }
    return pairs.concat(LL_EXTRA);
  }

  function allEntries() {
    const entries = [];
    const push = (cat, pairs) => {
      for (const [us, uk] of pairs) entries.push({ cat, us, uk });
    };
    push('our', ourPairs());
    push('re', RE_PAIRS);
    // baptiz is listed with its z so baptise/baptize pair cleanly.
    push('ize', stemPairs(IZE_STEMS.filter(s => s !== 'baptiz'), IZE_SUFFIXES, 'iz', 'is'));
    push('ize', stemPairs(['bapt'], IZE_SUFFIXES, 'iz', 'is'));
    push('yse', stemPairs(YSE_STEMS, YSE_SUFFIXES, 'yz', 'ys'));
    push('ll', llPairs());
    push('ence', ENCE_PAIRS);
    push('ogue', OGUE_PAIRS);
    push('ae', AE_PAIRS);
    push('practise', PRACTISE_PAIRS);
    for (const entry of MISC) entries.push(Object.assign({ cat: 'misc' }, entry));
    return entries;
  }

  const CATEGORY_LABELS = {
    our: '-or / -our', re: '-er / -re', ize: '-ize / -ise', yse: '-yze / -yse',
    ll: 'single / double l', ence: '-ense / -ence', ogue: '-og / -ogue',
    ae: 'medical ae / oe', misc: 'dialect spelling', practise: 'practice / practise'
  };

  function preferredForm(entry, rules) {
    const side = rules[entry.cat];
    if (side === 'us') return entry.us;
    if (side === 'ca') return entry.ca || entry.uk;
    if (side === 'au') return entry.au || entry.uk;
    return entry.uk;
  }

  const indexCache = {};

  /**
   * Build a map of lowercase non-preferred spelling -> details for a system.
   */
  function buildIndex(system) {
    if (indexCache[system]) return indexCache[system];
    const rules = SYSTEM_RULES[system];
    if (!rules) throw new Error(`Unknown spelling system: ${system}`);
    const index = new Map();
    for (const entry of allEntries()) {
      const preferred = preferredForm(entry, rules);
      if (entry.oneWay && preferred !== entry[entry.oneWay]) continue;
      for (const variant of [entry.us, entry.uk]) {
        if (variant === preferred || index.has(variant)) continue;
        index.set(variant, {
          preferred,
          category: entry.cat,
          label: CATEGORY_LABELS[entry.cat],
          note: entry.note || null
        });
      }
    }
    indexCache[system] = index;
    return index;
  }

  const PREFIXES = [
    'counter', 'under', 'super', 'ultra', 'over', 'anti', 'self-', 'well-',
    'non-', 'non', 'pre', 'dis', 'mis', 're-', 're', 'un', 'de', 'co-'
  ];

  function matchCase(source, target) {
    if (source.length > 1 && source === source.toUpperCase()) return target.toUpperCase();
    if (source[0] === source[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
    return target;
  }

  /**
   * Look up a word. Returns null when the word already matches the system,
   * otherwise { preferred, category, label, note } with case preserved.
   */
  function lookup(system, word) {
    const index = buildIndex(system);
    const lower = word.toLowerCase();
    let hit = index.get(lower);
    let prefix = '';
    if (!hit) {
      for (const candidate of PREFIXES) {
        if (lower.startsWith(candidate) && lower.length > candidate.length + 3) {
          const rest = index.get(lower.slice(candidate.length));
          if (rest) {
            hit = rest;
            prefix = candidate;
            break;
          }
        }
      }
    }
    if (!hit) return null;
    return Object.assign({}, hit, { preferred: matchCase(word, prefix + hit.preferred) });
  }

  return {
    SYSTEM_NAMES,
    SYSTEMS: Object.keys(SYSTEM_RULES),
    buildIndex,
    lookup,
    matchCase
  };
}));
