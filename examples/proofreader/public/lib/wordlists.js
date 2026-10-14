/**
 * Word lists shared by the Galley rule sets.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleyWords = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Frequent typos with a single unambiguous correction. Real words that
  // happen to look like typos (wont, cant, lets, wether) are excluded.
  const MISSPELLINGS = {
    accomodate: 'accommodate', accomodation: 'accommodation', acheive: 'achieve',
    acheived: 'achieved', acknowlege: 'acknowledge', adress: 'address',
    alot: 'a lot', atleast: 'at least', aswell: 'as well', infact: 'in fact',
    eachother: 'each other', incase: 'in case',
    arguement: 'argument', basicly: 'basically', beautifull: 'beautiful',
    becuase: 'because', becasue: 'because', beggining: 'beginning',
    begining: 'beginning', beleive: 'believe', beleived: 'believed',
    calender: 'calendar', comming: 'coming', commited: 'committed',
    concious: 'conscious', definately: 'definitely', definatly: 'definitely',
    definitly: 'definitely', dissapear: 'disappear', dissapeared: 'disappeared',
    dissapoint: 'disappoint', dissapointed: 'disappointed', embarass: 'embarrass',
    embarassed: 'embarrassed', enviroment: 'environment', existance: 'existence',
    familar: 'familiar', finaly: 'finally', foriegn: 'foreign', fourty: 'forty',
    freind: 'friend', freinds: 'friends', goverment: 'government',
    grammer: 'grammar', harrass: 'harass', immediatly: 'immediately',
    independant: 'independent', knowlege: 'knowledge', lenght: 'length',
    liason: 'liaison', millenium: 'millennium', mischievious: 'mischievous',
    neccessary: 'necessary', necessery: 'necessary', noticable: 'noticeable',
    occassion: 'occasion', occured: 'occurred', occurence: 'occurrence',
    occurance: 'occurrence', persistant: 'persistent', pharoah: 'pharaoh',
    playwrite: 'playwright', posession: 'possession', privelege: 'privilege',
    publically: 'publicly', questionaire: 'questionnaire', realy: 'really',
    recieve: 'receive', recieved: 'received', reccomend: 'recommend',
    recomend: 'recommend', refered: 'referred', relevent: 'relevant',
    rythm: 'rhythm', seperate: 'separate', seperated: 'separated',
    sieze: 'seize', strenght: 'strength', succesful: 'successful',
    supercede: 'supersede', supposably: 'supposedly', threshhold: 'threshold',
    tommorow: 'tomorrow', tomorow: 'tomorrow', tounge: 'tongue', truely: 'truly',
    untill: 'until', vaccuum: 'vacuum', wierd: 'weird', wich: 'which',
    writting: 'writing', thier: 'their', teh: 'the', expresso: 'espresso',
    // Missing apostrophes in contractions.
    dont: "don't", didnt: "didn't", doesnt: "doesn't", isnt: "isn't",
    wasnt: "wasn't", werent: "weren't", couldnt: "couldn't",
    shouldnt: "shouldn't", wouldnt: "wouldn't", hasnt: "hasn't",
    havent: "haven't", hadnt: "hadn't", arent: "aren't", youre: "you're",
    theyre: "they're", youve: "you've", theyve: "they've",
    wouldve: "would've", couldve: "could've", shouldve: "should've"
  };

  // Wrong word in a fixed phrase. [pattern, replacement, note]
  const WRONG_PHRASES = [
    ['for all intensive purposes', 'for all intents and purposes'],
    ['one in the same', 'one and the same'],
    ['nip it in the butt', 'nip it in the bud'],
    ['sneak peak', 'sneak peek'],
    ['take a peak', 'take a peek'],
    ['peaked my interest', 'piqued my interest'],
    ['peaked my curiosity', 'piqued my curiosity'],
    ['peaked his interest', 'piqued his interest'],
    ['peaked her interest', 'piqued her interest'],
    ['free reign', 'free rein'],
    ['reign in', 'rein in'],
    ['baited breath', 'bated breath'],
    ['case and point', 'case in point'],
    ['deep-seeded', 'deep-seated'],
    ['deep seeded', 'deep-seated'],
    ['per say', 'per se'],
    ['tow the line', 'toe the line'],
    ['wreck havoc', 'wreak havoc'],
    ['make due', 'make do'],
    ['first-come, first-serve', 'first-come, first-served'],
    ['mute point', 'moot point'],
    ['escape goat', 'scapegoat'],
    ['doggy-dog world', 'dog-eat-dog world'],
    ['hunger pains', 'hunger pangs'],
    ['slight of hand', 'sleight of hand'],
    ['statue of limitations', 'statute of limitations'],
    ['tongue and cheek', 'tongue in cheek'],
    ['all of the sudden', 'all of a sudden'],
    ['beckon call', 'beck and call'],
    ['damp squid', 'damp squib'],
    ['piece of mind', 'peace of mind'],
    ['wet your appetite', 'whet your appetite'],
    ['shoe-in', 'shoo-in'],
    ['vocal chords', 'vocal cords'],
    ['bare with me', 'bear with me'],
    ['between you and I', 'between you and me'],
    ['irregardless', 'regardless']
  ];

  const SPEECH_VERBS = [
    'said', 'says', 'asked', 'asks', 'replied', 'replies', 'whispered',
    'shouted', 'yelled', 'muttered', 'murmured', 'cried', 'called',
    'answered', 'added', 'continued', 'exclaimed', 'screamed', 'snapped',
    'growled', 'hissed', 'mumbled', 'stammered', 'stuttered', 'demanded',
    'insisted', 'explained', 'admitted', 'agreed', 'protested', 'begged',
    'pleaded', 'warned', 'suggested', 'repeated', 'interrupted', 'offered',
    'wondered', 'breathed', 'gasped', 'sobbed', 'groaned', 'roared',
    'barked', 'whimpered', 'conceded', 'announced', 'declared', 'remarked'
  ];

  const ONOMATOPOEIA = [
    'achoo', 'bam', 'bang', 'beep', 'boing', 'bonk', 'boom', 'brr', 'buzz',
    'clang', 'clank', 'clatter', 'click', 'clink', 'crack', 'crash',
    'creak', 'crunch', 'ding', 'ding-dong', 'drip', 'fizz', 'honk', 'hmph',
    'kaboom', 'ka-ching', 'kerplunk', 'knock', 'meow', 'moo', 'oink',
    'plop', 'pow', 'psst', 'screech', 'shh', 'sizzle', 'slam', 'smack',
    'snap', 'splash', 'splat', 'squeak', 'swish', 'swoosh', 'thud',
    'thump', 'thunk', 'thwack', 'tick', 'tick-tock', 'tsk', 'vroom',
    'wham', 'whack', 'whir', 'whomp', 'whoosh', 'woof', 'zap', 'zing',
    'zip', 'zoom'
  ];

  // Abbreviations whose period does not end a sentence.
  const ABBREVIATIONS = [
    'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'rev', 'gen',
    'col', 'capt', 'lt', 'sgt', 'mt', 'ft', 'vs', 'etc', 'cf', 'approx',
    'no', 'nos', 'vol', 'vols', 'ch', 'chap', 'fig', 'figs', 'p', 'pp',
    'ed', 'eds', 'inc', 'ltd', 'co', 'corp', 'dept', 'est', 'al', 'viz',
    'ca', 'c', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k', 'jan', 'feb',
    'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
  ];

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'
  ];

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const COLLECTIVE_NOUNS = [
    'team', 'family', 'committee', 'government', 'staff', 'audience', 'band',
    'class', 'crowd', 'jury', 'company', 'board', 'council', 'group',
    'army', 'crew', 'faculty', 'panel', 'public', 'orchestra', 'choir',
    'firm', 'club', 'party', 'community', 'management', 'department',
    'navy', 'congregation', 'herd', 'flock', 'cast', 'squad'
  ];

  const CONTRACTIONS = {
    "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
    "can't": 'cannot', "won't": 'will not', "isn't": 'is not',
    "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
    "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
    "wouldn't": 'would not', "couldn't": 'could not', "shouldn't": 'should not',
    "it's": 'it is', "that's": 'that is', "there's": 'there is',
    "let's": 'let us', "i'm": 'I am', "you're": 'you are', "we're": 'we are',
    "they're": 'they are', "i've": 'I have', "we've": 'we have',
    "they've": 'they have', "you've": 'you have', "i'll": 'I will',
    "we'll": 'we will', "they'll": 'they will', "you'll": 'you will',
    "he's": 'he is', "she's": 'she is', "what's": 'what is'
  };

  const INFORMAL_WORDS = {
    gonna: 'going to', wanna: 'want to', gotta: 'have to', kinda: 'kind of',
    sorta: 'sort of', "ain't": null, lotsa: 'lots of', outta: 'out of',
    alright: 'all right'
  };

  const ONES = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function numberToWords(n) {
    if (!Number.isInteger(n) || n < 0 || n > 100) return null;
    if (n === 100) return 'one hundred';
    if (n < 20) return ONES[n];
    const tens = TENS[Math.floor(n / 10)];
    return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`;
  }

  const WORD_VALUES = {};
  for (let n = 0; n <= 100; n++) WORD_VALUES[numberToWords(n)] = n;

  function wordsToNumber(words) {
    const key = words.toLowerCase().replace(/\s+/g, ' ');
    return Object.prototype.hasOwnProperty.call(WORD_VALUES, key) ? WORD_VALUES[key] : null;
  }

  return {
    MISSPELLINGS,
    WRONG_PHRASES,
    SPEECH_VERBS,
    ONOMATOPOEIA,
    ABBREVIATIONS,
    MONTHS,
    DAYS,
    COLLECTIVE_NOUNS,
    CONTRACTIONS,
    INFORMAL_WORDS,
    TENS: TENS.filter(Boolean),
    ONES,
    numberToWords,
    wordsToNumber
  };
}));
