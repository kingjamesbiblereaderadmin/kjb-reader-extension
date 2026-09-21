const BOOK_NAMES = {
  "GENESIS": "Genesis",
  "EXODUS": "Exodus",
  "LEVITICUS": "Leviticus",
  "NUMBERS": "Numbers",
  "DEUTERONOMY": "Deuteronomy",
  "JOSHUA": "Joshua",
  "JUDGES": "Judges",
  "RUTH": "Ruth",
  "1 SAMUEL": "1 Samuel",
  "2 SAMUEL": "2 Samuel",
  "1 KINGS": "1 Kings",
  "2 KINGS": "2 Kings",
  "1 CHRONICLES": "1 Chronicles",
  "2 CHRONICLES": "2 Chronicles",
  "EZRA": "Ezra",
  "NEHEMIAH": "Nehemiah",
  "ESTHER": "Esther",
  "JOB": "Job",
  "PSALMS": "Psalms",
  "PROVERBS": "Proverbs",
  "ECCLESIASTES": "Ecclesiastes",
  "SONG OF SOLOMON": "Song of Solomon",
  "ISAIAH": "Isaiah",
  "JEREMIAH": "Jeremiah",
  "LAMENTATIONS": "Lamentations",
  "EZEKIEL": "Ezekiel",
  "DANIEL": "Daniel",
  "HOSEA": "Hosea",
  "JOEL": "Joel",
  "AMOS": "Amos",
  "OBADIAH": "Obadiah",
  "JONAH": "Jonah",
  "MICAH": "Micah",
  "NAHUM": "Nahum",
  "HABAKKUK": "Habakkuk",
  "ZEPHANIAH": "Zephaniah",
  "HAGGAI": "Haggai",
  "ZECHARIAH": "Zechariah",
  "MALACHI": "Malachi",
  "MATTHEW": "Matthew",
  "MARK": "Mark",
  "LUKE": "Luke",
  "JOHN": "John",
  "ACTS": "Acts",
  "ROMANS": "Romans",
  "1 CORINTHIANS": "1 Corinthians",
  "2 CORINTHIANS": "2 Corinthians",
  "GALATIANS": "Galatians",
  "EPHESIANS": "Ephesians",
  "PHILIPPIANS": "Philippians",
  "COLOSSIANS": "Colossians",
  "1 THESSALONIANS": "1 Thessalonians",
  "2 THESSALONIANS": "2 Thessalonians",
  "1 TIMOTHY": "1 Timothy",
  "2 TIMOTHY": "2 Timothy",
  "TITUS": "Titus",
  "PHILEMON": "Philemon",
  "HEBREWS": "Hebrews",
  "JAMES": "James",
  "1 PETER": "1 Peter",
  "2 PETER": "2 Peter",
  "1 JOHN": "1 John",
  "2 JOHN": "2 John",
  "3 JOHN": "3 John",
  "JUDE": "Jude",
  "REVELATION": "Revelation"
};
const BOOK_ORDER = Object.values(BOOK_NAMES);
const OT_BOOKS = new Set(BOOK_ORDER.slice(0, 39));
const NT_BOOKS = new Set(BOOK_ORDER.slice(39));
const BOOK_ALIASES = {
  "Gen": "Genesis",
  "Ex": "Exodus",
  "Lev": "Leviticus",
  "Num": "Numbers",
  "Deut": "Deuteronomy",
  "Josh": "Joshua",
  "Judg": "Judges",
  "Ruth": "Ruth",
  "1Sam": "1 Samuel",
  "2Sam": "2 Samuel",
  "1Kgs": "1 Kings",
  "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles",
  "2Chr": "2 Chronicles",
  "Ezra": "Ezra",
  "Neh": "Nehemiah",
  "Esth": "Esther",
  "Job": "Job",
  "Ps": "Psalms",
  "Pss": "Psalms",
  "Psalm": "Psalms",
  "Prov": "Proverbs",
  "Eccl": "Ecclesiastes",
  "Song": "Song of Solomon",
  "Isa": "Isaiah",
  "Jer": "Jeremiah",
  "Lam": "Lamentations",
  "Ezek": "Ezekiel",
  "Dan": "Daniel",
  "Hos": "Hosea",
  "Joel": "Joel",
  "Amos": "Amos",
  "Obad": "Obadiah",
  "Jonah": "Jonah",
  "Mic": "Micah",
  "Nah": "Nahum",
  "Hab": "Habakkuk",
  "Zeph": "Zephaniah",
  "Hag": "Haggai",
  "Zech": "Zechariah",
  "Mal": "Malachi",
  "Mt": "Matthew",
  "Matt": "Matthew",
  "Mk": "Mark",
  "Lk": "Luke",
  "Jn": "John",
  "Joh": "John",
  "Ac": "Acts",
  "Ro": "Romans",
  "Rom": "Romans",
  "1Co": "1 Corinthians",
  "2Co": "2 Corinthians",
  "Ga": "Galatians",
  "Eph": "Ephesians",
  "Phil": "Philippians",
  "Col": "Colossians",
  "1Th": "1 Thessalonians",
  "2Th": "2 Thessalonians",
  "1Ti": "1 Timothy",
  "2Ti": "2 Timothy",
  "Tit": "Titus",
  "Phlm": "Philemon",
  "Heb": "Hebrews",
  "Jas": "James",
  "1Pe": "1 Peter",
  "2Pe": "2 Peter",
  "1Jn": "1 John",
  "2Jn": "2 John",
  "3Jn": "3 John",
  "Jud": "Jude",
  "Jd": "Jude",
  "Rev": "Revelation",
  "1Sa": "1 Samuel",
  "2Sa": "2 Samuel",
  "1Ki": "1 Kings",
  "2Ki": "2 Kings",
  "1Ch": "1 Chronicles",
  "2Ch": "2 Chronicles",
  "Ne": "Nehemiah",
  "Es": "Esther",
  "Pr": "Proverbs",
  "Ec": "Ecclesiastes",
  "SoS": "Song of Solomon",
  "So": "Song of Solomon",
  "Sng": "Song of Solomon",
  "Is": "Isaiah",
  "Je": "Jeremiah",
  "La": "Lamentations",
  "Eze": "Ezekiel",
  "Da": "Daniel",
  "Ho": "Hosea",
  "Joe": "Joel",
  "Ob": "Obadiah",
  "Jon": "Jonah",
  "Mi": "Micah",
  "Na": "Nahum",
  "Ha": "Habakkuk",
  "Ze": "Zechariah",
  "Ma": "Malachi",
  "Revelations": "Revelation",
  "Apocalypse": "Revelation",
  "Cori": "1 Corinthians",
  "1Cori": "1 Corinthians",
  "2Cori": "2 Corinthians"
};
const PSALM_SUPERSCRIPTIONS = {
  3: "A Psalm of David, when he fled from Absalom his son.",
  4: "To the chief Musician on Neginoth, A Psalm of David.",
  5: "To the chief Musician upon Nehiloth, A Psalm of David.",
  6: "To the chief Musician on Neginoth upon Sheminith, A Psalm of David.",
  7: "Shiggaion of David, which he sang unto the LORD, concerning the words of Cush the Benjamite.",
  8: "To the chief Musician upon Gittith, A Psalm of David.",
  9: "To the chief Musician upon Muth-labben, A Psalm of David.",
  11: "To the chief Musician, [A] [Psalm] of David.",
  12: "To the chief Musician upon Sheminith, A Psalm of David.",
  13: "To the chief Musician, A Psalm of David.",
  14: "To the chief Musician, [A] [Psalm] of David.",
  15: "A Psalm of David.",
  16: "Michtam of David.",
  17: "A Prayer of David.",
  18: "To the chief Musician, [A] [Psalm] of David, the servant of the LORD, who spake unto the LORD the words of this song in the day [that] the LORD delivered him from the hand of all his enemies, and from the hand of Saul: And he said,",
  19: "To the chief Musician, A Psalm of David.",
  20: "To the chief Musician, A Psalm of David.",
  21: "To the chief Musician, A Psalm of David.",
  22: "To the chief Musician upon Aijeleth Shahar, A Psalm of David.",
  23: "A Psalm of David.",
  24: "A Psalm of David.",
  25: "[A] [Psalm] of David.",
  26: "[A] [Psalm] of David.",
  27: "[A] [Psalm] of David.",
  28: "[A] [Psalm] of David.",
  29: "A Psalm of David.",
  30: "A Psalm [and] Song [at] the dedication of the house of David.",
  31: "To the chief Musician, A Psalm of David.",
  32: "[A] [Psalm] of David, Maschil.",
  34: "[A] [Psalm] of David, when he changed his behaviour before Abimelech; who drove him away, and he departed.",
  35: "[A] [Psalm] of David.",
  36: "To the chief Musician, [A] [Psalm] of David the servant of the LORD.",
  37: "[A] [Psalm] of David.",
  38: "A Psalm of David, to bring to remembrance.",
  39: "To the chief Musician, [even] to Jeduthun, A Psalm of David.",
  40: "To the chief Musician, A Psalm of David.",
  41: "To the chief Musician, A Psalm of David.",
  42: "To the chief Musician, Maschil, for the sons of Korah.",
  44: "To the chief Musician for the sons of Korah, Maschil.",
  45: "To the chief Musician upon Shoshannim, for the sons of Korah, Maschil, A Song of loves.",
  46: "To the chief Musician for the sons of Korah, A Song upon Alamoth.",
  47: "To the chief Musician, A Psalm for the sons of Korah.",
  48: "A Song [and] Psalm for the sons of Korah.",
  49: "To the chief Musician, A Psalm for the sons of Korah.",
  50: "A Psalm of Asaph.",
  51: "To the chief Musician, A Psalm of David, when Nathan the prophet came unto him, after he had gone in to Bath-sheba.",
  52: "To the chief Musician, Maschil, [A] [Psalm] of David, when Doeg the Edomite came and told Saul, and said unto him, David is come to the house of Ahimelech.",
  53: "To the chief Musician upon Mahalath, Maschil, [A] [Psalm] of David.",
  54: "To the chief Musician on Neginoth, Maschil, [A] [Psalm] of David, when the Ziphims came and said to Saul, Doth not David hide himself with us?",
  55: "To the chief Musician on Neginoth, Maschil, [A] [Psalm] of David.",
  56: "To the chief Musician upon Jonath-elem-rechokim, Michtam of David, when the Philistines took him in Gath.",
  57: "To the chief Musician, Al-taschith, Michtam of David, when he fled from Saul in the cave.",
  58: "To the chief Musician, Al-taschith, Michtam of David.",
  59: "To the chief Musician, Al-taschith, Michtam of David; when Saul sent, and they watched the house to kill him.",
  60: "To the chief Musician upon Shushan-eduth, Michtam of David, to teach; when he strove with Aram-naharaim and with Aram-zobah, when Joab returned, and smote of Edom in the valley of salt twelve thousand.",
  61: "To the chief Musician upon Neginah, [A] [Psalm] of David.",
  62: "To the chief Musician, to Jeduthun, A Psalm of David.",
  63: "A Psalm of David, when he was in the wilderness of Judah.",
  64: "To the chief Musician, A Psalm of David.",
  65: "To the chief Musician, A Psalm [and] Song of David.",
  66: "To the chief Musician, A Song [or] Psalm.",
  67: "To the chief Musician on Neginoth, A Psalm [or] Song.",
  68: "To the chief Musician, A Psalm [or] Song of David.",
  69: "To the chief Musician upon Shoshannim, [A] [Psalm] of David.",
  70: "To the chief Musician, [A] [Psalm] of David, to bring to remembrance.",
  72: "[A] [Psalm] for Solomon.",
  73: "A Psalm of Asaph.",
  74: "Maschil of Asaph.",
  75: "To the chief Musician, Al-taschith, A Psalm [or] Song of Asaph.",
  76: "To the chief Musician on Neginoth, A Psalm [or] Song of Asaph.",
  77: "To the chief Musician, to Jeduthun, A Psalm of Asaph.",
  78: "Maschil of Asaph.",
  79: "A Psalm of Asaph.",
  80: "To the chief Musician upon Shoshannim-Eduth, A Psalm of Asaph.",
  81: "To the chief Musician upon Gittith, [A] [Psalm] of Asaph.",
  82: "A Psalm of Asaph.",
  83: "A Song [or] Psalm of Asaph.",
  84: "To the chief Musician upon Gittith, A Psalm for the sons of Korah.",
  85: "To the chief Musician, A Psalm for the sons of Korah.",
  86: "A Prayer of David.",
  87: "A Psalm [or] Song for the sons of Korah.",
  88: "A Song [or] Psalm for the sons of Korah, to the chief Musician upon Mahalath Leannoth, Maschil of Heman the Ezrahite.",
  89: "Maschil of Ethan the Ezrahite.",
  90: "A Prayer of Moses the man of God.",
  92: "A Psalm [or] Song for the sabbath day.",
  98: "A Psalm.",
  100: "A Psalm of praise.",
  101: "A Psalm of David.",
  102: "A Prayer of the afflicted, when he is overwhelmed, and poureth out his complaint before the LORD.",
  103: "[A] [Psalm] of David.",
  108: "A Song [or] Psalm of David.",
  109: "To the chief Musician, A Psalm of David.",
  110: "A Psalm of David.",
  120: "A Song of degrees.",
  121: "A Song of degrees.",
  122: "A Song of degrees of David.",
  123: "A Song of degrees.",
  124: "A Song of degrees of David.",
  125: "A Song of degrees.",
  126: "A Song of degrees.",
  127: "A Song of degrees for Solomon.",
  128: "A Song of degrees.",
  129: "A Song of degrees.",
  130: "A Song of degrees.",
  131: "A Song of degrees of David.",
  132: "A Song of degrees.",
  133: "A Song of degrees of David.",
  134: "A Song of degrees.",
  138: "[A] [Psalm] of David.",
  139: "To the chief Musician, A Psalm of David.",
  140: "To the chief Musician, A Psalm of David.",
  141: "A Psalm of David.",
  142: "Maschil of David; A Prayer when he was in the cave.",
  143: "A Psalm of David.",
  144: "[A] [Psalm] of David.",
  145: "David's [Psalm] of praise."
};
const EPISTLE_SUBSCRIPTIONS = {
  "Romans:16":        "Written to the Romans from Corinthus, [and sent] by Phebe servant of the church at Cenchrea.",
  "1 Corinthians:16": "The first [epistle] to the Corinthians was written from Philippi by Stephanas, and Fortunatus, and Achaicus, and Timotheus.",
  "2 Corinthians:13": "The second [epistle] to the Corinthians was written from Philippi, [a city] of Macedonia, by Titus and Lucas.",
  "Galatians:6":      "Unto the Galatians written from Rome.",
  "Ephesians:6":      "Written from Rome unto the Ephesians by Tychicus.",
  "Philippians:4":    "It was written to the Philippians from Rome by Epaphroditus.",
  "Colossians:4":     "Written from Rome to the Colossians by Tychicus and Onesimus.",
  "1 Thessalonians:5":"The first [epistle] unto the Thessalonians was written from Athens.",
  "2 Thessalonians:3":"The second [epistle] to the Thessalonians was written from Athens.",
  "1 Timothy:6":      "The first to Timothy was written from Laodicea, which is the chiefest city of Phrygia Pacatiana.",
  "2 Timothy:4":      "The second [epistle] unto Timotheus, ordained the first bishop of the church of the Ephesians, was written from Rome, when Paul was brought before Nero the second time.",
  "Titus:3":          "It was written to Titus, ordained the first bishop of the church of the Cretians, from Nicopolis of Macedonia.",
  "Philemon:1":       "Written from Rome to Philemon, by Onesimus a servant.",
  "Hebrews:13":       "Written to the Hebrews from Italy by Timothy.",
  "James:5":          "The epistle of James was written from Jerusalem.",
  "1 Peter:5":        "The first epistle of Peter was written from Rome.",
  "2 Peter:3":        "The second epistle of Peter was written from Rome.",
  "1 John:5":         "The first epistle of John was written from Ephesus.",
  "2 John:1":         "The second epistle of John was written from Ephesus.",
  "3 John:1":         "The third epistle of John was written from Ephesus.",
  "Jude:1":           "The epistle of Jude was written from Jerusalem.",
  "Revelation:22":    "The Revelation of John was written from Patmos.",
};

const COLOPHONS = {
  "Psalms:150": "\xB6 The End of the Psalms.",
  "Proverbs:31": "\xB6 The End of the Proverbs.",
  "Ecclesiastes:12": "\xB6 The End of the Preacher's Sermon.",
  "Song of Solomon:8": "\xB6 The End of the Song of Solomon.",
  "Isaiah:66": "\xB6 The End of the Prophecy of Isaiah.",
  "Jeremiah:52": "\xB6 The End of the Prophecies of Jeremiah.",
  "Lamentations:5": "\xB6 The End of the Lamentations of Jeremiah.",
  "Ezekiel:48": "\xB6 The End of the Prophecy of Ezekiel.",
  "Daniel:12": "\xB6 The End of the Prophecy of Daniel.",
  "Hosea:14": "\xB6 The End of the Prophecy of Hosea.",
  "Joel:3": "\xB6 The End of the Prophecy of Joel.",
  "Amos:9": "\xB6 The End of the Prophecy of Amos.",
  "Obadiah:1": "\xB6 The End of the Prophecy of Obadiah.",
  "Jonah:4": "\xB6 The End of the Prophecy of Jonah.",
  "Micah:7": "\xB6 The End of the Prophecy of Micah.",
  "Nahum:3": "\xB6 The End of the Prophecy of Nahum.",
  "Habakkuk:3": "\xB6 The End of the Prophecy of Habakkuk.",
  "Zephaniah:3": "\xB6 The End of the Prophecy of Zephaniah.",
  "Haggai:2": "\xB6 The End of the Prophecy of Haggai.",
  "Zechariah:14": "\xB6 The End of the Prophecy of Zechariah.",
  "Malachi:4": "\xB6 The End of the Prophets.",
  "Matthew:28": "\xB6 The End of the Gospel According to Matthew.",
  "Mark:16": "\xB6 The End of the Gospel According to Mark.",
  "Luke:24": "\xB6 The End of the Gospel According to Luke.",
  "John:21": "\xB6 The End of the Gospel According to John.",
  "Acts:28": "\xB6 The End of the Acts of the Apostles.",
  "Romans:16": "\xB6 The End of the Epistle of Paul the Apostle to the Romans.",
  "1 Corinthians:16": "\xB6 The End of the First Epistle of Paul the Apostle to the Corinthians.",
  "2 Corinthians:13": "\xB6 The End of the Second Epistle of Paul the Apostle to the Corinthians.",
  "Galatians:6": "\xB6 The End of the Epistle of Paul the Apostle to the Galatians.",
  "Ephesians:6": "\xB6 The End of the Epistle of Paul the Apostle to the Ephesians.",
  "Philippians:4": "\xB6 The End of the Epistle of Paul the Apostle to the Philippians.",
  "Colossians:4": "\xB6 The End of the Epistle of Paul the Apostle to the Colossians.",
  "1 Thessalonians:5": "\xB6 The End of the First Epistle of Paul the Apostle to the Thessalonians.",
  "2 Thessalonians:3": "\xB6 The End of the Second Epistle of Paul the Apostle to the Thessalonians.",
  "1 Timothy:6": "\xB6 The End of the First Epistle of Paul the Apostle to Timothy.",
  "2 Timothy:4": "\xB6 The End of the Second Epistle of Paul the Apostle to Timothy.",
  "Titus:3": "\xB6 The End of the Epistle of Paul the Apostle to Titus.",
  "Philemon:1": "\xB6 The End of the Epistle of Paul the Apostle to Philemon.",
  "Hebrews:13": "\xB6 The End of the Epistle of Paul the Apostle to the Hebrews.",
  "James:5": "\xB6 The End of the Epistle of James.",
  "1 Peter:5": "\xB6 The End of the First Epistle of Peter.",
  "2 Peter:3": "\xB6 The End of the Second Epistle of Peter.",
  "1 John:5": "\xB6 The End of the First Epistle of John.",
  "2 John:1": "\xB6 The End of the Second Epistle of John.",
  "3 John:1": "\xB6 The End of the Third Epistle of John.",
  "Jude:1": "\xB6 The End of the General Epistle of Jude.",
  "Revelation:22": "\xB6 The End."
};
const VERSE_REPAIRS = {
  "Genesis|1|8": {
    damaged: /^(\u00b6\s*)?And God called the firmament Heaven\.?$/,
    full: "And God called the firmament Heaven. And the evening and the morning were the second day."
  }
};
const CP1252_HIGH = [
  8364,
  129,
  8218,
  402,
  8222,
  8230,
  8224,
  8225,
  710,
  8240,
  352,
  8249,
  338,
  141,
  381,
  143,
  144,
  8216,
  8217,
  8220,
  8221,
  8226,
  8211,
  8212,
  732,
  8482,
  353,
  8250,
  339,
  157,
  382,
  376
];
function decodeCp1252(buffer) {
  const bytes = new Uint8Array(buffer);
  const out = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = String.fromCharCode(b >= 128 && b <= 159 ? CP1252_HIGH[b - 128] : b);
  }
  return out.join("");
}
let cachedBible = null;
function normLine(s) {
  return s.replace(/['\u2018\u2019\u0092]/g, "").replace(/[[\](),.;:!?"\u2014\u2013-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function cleanBookTitle(raw) {
  return titleCaseHeading(raw).replace(/\s+/g, " ").trim().replace(/[.,]+$/, "").trim();
}
function titleCaseHeading(s) {
  const small = /* @__PURE__ */ new Set(["of", "the", "and", "to", "a", "an", "in", "by", "or", "called", "upon"]);
  const words = s.replace(/\s+/g, " ").trim().split(" ");
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && small.has(lower.replace(/[^a-z]+$/, ""))) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(" ");
}
async function fetchAndParsePCE() {
  if (cachedBible) return cachedBible;
  const resp = await fetch(chrome.runtime.getURL("kjb-pce.txt"), { cache: "force-cache" });
  if (!resp.ok) throw new Error(`Failed to fetch PCE text: HTTP ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const text = decodeCp1252(buffer);
  const data = {};
  let titleBook = null;
  let titleParts = [];
  let currentBook = null;
  let currentChapter = null;
  let pendingLines = [];
  let expectingFirstVerse = false;
  let heading = null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const isChapterHeader = (line) => /^(CHAPTER|PSALM)\s+\d+$/i.test(line.trim());
  const isVerseLine = (line) => /^\d+\s/.test(line);
  const detectBook = (ls) => {
    const joined = ls.map((l) => l.trim()).filter(Boolean).join(" ").toUpperCase();
    const j = joined.trim();
    for (const [key, name] of Object.entries(BOOK_NAMES)) {
      if (j === key) return name;
    }
    if (j.includes("FIRST BOOK OF SAMUEL")) return "1 Samuel";
    if (j.includes("SECOND BOOK OF SAMUEL")) return "2 Samuel";
    if (j.includes("THIRD BOOK OF THE KINGS")) return "1 Kings";
    if (j.includes("FOURTH BOOK OF THE KINGS")) return "2 Kings";
    if (j.includes("FIRST BOOK OF THE CHRONICLES")) return "1 Chronicles";
    if (j.includes("SECOND BOOK OF THE CHRONICLES")) return "2 Chronicles";
    if (j.includes("LAMENTATIONS")) return "Lamentations";
    if (j === "1 JOHN" || j === "1 JOHN.") return "1 John";
    if (j === "2 JOHN" || j === "2 JOHN.") return "2 John";
    if (j === "3 JOHN" || j === "3 JOHN.") return "3 John";
    if (j === "THE FIRST BOOK OF MOSES, CALLED GENESIS." || j.startsWith("THE FIRST BOOK OF MOSES")) return "Genesis";
    if (j.startsWith("THE SECOND BOOK OF MOSES")) return "Exodus";
    if (j.startsWith("THE THIRD BOOK OF MOSES")) return "Leviticus";
    if (j.startsWith("THE FOURTH BOOK OF MOSES")) return "Numbers";
    if (j.startsWith("THE FIFTH BOOK OF MOSES")) return "Deuteronomy";
    if (j.startsWith("THE BOOK OF NEHEMIAH")) return "Nehemiah";
    if (j.includes("THE GOSPEL ACCORDING TO")) {
      if (j.includes("MATTHEW")) return "Matthew";
      if (j.includes("MARK")) return "Mark";
      if (j.includes("LUKE")) return "Luke";
      if (j.includes("JOHN")) return "John";
    }
    if (j.includes("THE ACTS OF THE APOSTLES")) return "Acts";
    if (j.includes("THE REVELATION")) return "Revelation";
    if (j.includes("THE EPISTLE OF PAUL") || j.includes("THE FIRST EPISTLE") || j.includes("THE SECOND EPISTLE")) {
      if (j.includes("ROMANS")) return "Romans";
      if (j.includes("CORINTHIANS")) return j.includes("FIRST") ? "1 Corinthians" : "2 Corinthians";
      if (j.includes("GALATIANS")) return "Galatians";
      if (j.includes("EPHESIANS")) return "Ephesians";
      if (j.includes("PHILIPPIANS")) return "Philippians";
      if (j.includes("COLOSSIANS")) return "Colossians";
      if (j.includes("THESSALONIANS")) return j.includes("FIRST") ? "1 Thessalonians" : "2 Thessalonians";
      if (j.includes("TIMOTHY")) return j.includes("FIRST") ? "1 Timothy" : "2 Timothy";
      if (j.includes("TITUS")) return "Titus";
      if (j.includes("PHILEMON")) return "Philemon";
      if (j.includes("HEBREWS")) return "Hebrews";
    }
    if (j.includes("THE GENERAL EPISTLE")) {
      if (j.includes("JAMES")) return "James";
      if (j.includes("PETER")) return j.includes("FIRST") ? "1 Peter" : "2 Peter";
      if (j.includes("JUDE")) return "Jude";
    }
    if (j.includes("FIRST EPISTLE GENERAL OF PETER")) return "1 Peter";
    if (j.includes("SECOND EPISTLE GENERAL OF PETER")) return "2 Peter";
    if (j.includes("FIRST EPISTLE GENERAL OF JOHN")) return "1 John";
    if (j.includes("SECOND EPISTLE OF JOHN")) return "2 John";
    if (j.includes("THIRD EPISTLE OF JOHN")) return "3 John";
    if (j.startsWith("THE PROPHECY OF") || j.startsWith("THE PROPHESY OF")) {
      if (j.includes("ISAIAH")) return "Isaiah";
      if (j.includes("JEREMIAH")) return "Jeremiah";
      if (j.includes("EZEKIEL")) return "Ezekiel";
      if (j.includes("DANIEL")) return "Daniel";
      if (j.includes("HOSEA")) return "Hosea";
      if (j.includes("JOEL")) return "Joel";
      if (j.includes("AMOS")) return "Amos";
      if (j.includes("OBADIAH")) return "Obadiah";
      if (j.includes("JONAH")) return "Jonah";
      if (j.includes("MICAH")) return "Micah";
      if (j.includes("NAHUM")) return "Nahum";
      if (j.includes("HABAKKUK")) return "Habakkuk";
      if (j.includes("ZEPHANIAH")) return "Zephaniah";
      if (j.includes("HAGGAI")) return "Haggai";
      if (j.includes("ZECHARIAH")) return "Zechariah";
    }
    for (const [key, name] of Object.entries(BOOK_NAMES)) {
      if (j.startsWith(key + " ") || j.includes(key)) {
        if (ls.length <= 4 && !ls.some((l) => /^\d+\s/.test(l))) {
          return name;
        }
      }
    }
    return null;
  };
  const addVerse = (verseNum, verseText, hasPilcrow) => {
    if (!currentBook || currentChapter === null) return;
    let text2 = verseText.replace(/\\\[/g, "[").replace(/\\\]/g, "]").replace(/\s*<<[^>]*>>\s*$/, "").trim();
    if (/^[¶\u000F\u00B6]\s+/.test(text2)) {
      text2 = "\xB6 " + text2.replace(/^[¶\u000F\u00B6]\s+/, "");
    } else if (hasPilcrow) {
      text2 = "\xB6 " + text2;
    }
    if (currentBook === "1 John" && currentChapter === 2 && verseNum === 23) {
      text2 = text2.replace("[(but)", "[but").replace("[[but]]", "[but]");
    }
    const repair = VERSE_REPAIRS[`${currentBook}|${currentChapter}|${verseNum}`];
    if (repair && repair.damaged.test(text2)) {
      const pilcrow = /^\u00b6\s*/.test(text2) ? "\xB6 " : "";
      text2 = pilcrow + repair.full;
    }
    if (!data[currentBook]) data[currentBook] = {};
    if (!data[currentBook][currentChapter]) data[currentBook][currentChapter] = [];
    const verse = { verse: verseNum, text: text2 };
    if (heading) {
      verse.heading = heading;
      heading = null;
    }
    data[currentBook][currentChapter].push(verse);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (isChapterHeader(trimmed)) {
      currentChapter = parseInt(trimmed.replace(/^(CHAPTER|PSALM)\s+/i, ""), 10);
      if (!currentBook) currentBook = "Psalms";
      if (!data[currentBook]) data[currentBook] = {};
      expectingFirstVerse = true;
      pendingLines = [];
      titleBook = null;
      continue;
    }
    if (!trimmed) {
      pendingLines = [];
      titleBook = null;
      continue;
    }
        // Trailing structural line from the SOURCE text: the epistle
    // subscription ("¶ Written to the Romans from Corinthus, [and] [sent]
    // by Phebe servant of the church at Cenchrea."). Keyed to the chapter that
    // just ended, so lookups and keyword search attach the real text —
    // never an editorial approximation. Book-end lines ("THE END OF THE
    // PROPHETS.", "THE END.") are website-only and intentionally NOT captured
    // here. Guarded by "the chapter already has verses" so a pilcrow-led FIRST
    // verse can never be mistaken for a subscription.
    if (currentBook && currentChapter !== null && (data[currentBook][currentChapter] || []).length > 0) {
      const subMatch = /^¶\s+(.+)$/.exec(trimmed);
      if (subMatch) {
        if (!data.__subscriptions) data.__subscriptions = {};
        data.__subscriptions[`${currentBook}:${currentChapter}`] = subMatch[1].trim();
        pendingLines = [];
        titleBook = null;
        continue;
      }
    }
    if (currentBook === "Psalms" && currentChapter === 119) {
      const letters = /* @__PURE__ */ new Set(["ALEPH", "BETH", "GIMEL", "DALETH", "HE", "VAU", "ZAIN", "CHETH", "TETH", "JOD", "CAPH", "LAMED", "MEM", "NUN", "SAMECH", "AIN", "PE", "TZADDI", "KOPH", "RESH", "SCHIN", "TAU"]);
      if (letters.has(trimmed.replace(/\.$/, "").toUpperCase())) {
        heading = trimmed.replace(/\.$/, "").toUpperCase();
        continue;
      }
    }
    if (currentBook === "Psalms" && expectingFirstVerse && currentChapter !== null) {
      const knownTitle = PSALM_SUPERSCRIPTIONS[currentChapter];
      if (knownTitle && normLine(trimmed) === normLine(knownTitle)) {
        if (!data.__superscriptions) data.__superscriptions = {};
        data.__superscriptions[`Psalms:${currentChapter}`] = trimmed;
        continue;
      }
    }
    if (isVerseLine(trimmed) && currentChapter !== null) {
      const match = trimmed.match(/^(\d+)(\s+)(.*)$/);
      if (match) {
        const verseNum = parseInt(match[1], 10);
        const spacing = match[2].length >= 2 || /^[¶\u000F\u00B6]/.test(match[3]);
        addVerse(verseNum, match[3], spacing);
        expectingFirstVerse = false;
        continue;
      }
    }
    if (expectingFirstVerse && currentChapter !== null) {
      const hasPilcrow = /^\s{2,}\S/.test(line) || /^[¶\u000F\u00B6]/.test(trimmed);
      addVerse(1, trimmed, hasPilcrow);
      expectingFirstVerse = false;
      continue;
    }
    if (/^[\u00B6\u000F\u00B6]/.test(trimmed)) continue;
    if (currentBook && currentChapter === null) {
      if (titleBook && data.__bookTitles) {
        titleParts.push(trimmed);
        data.__bookTitles[titleBook] = cleanBookTitle(titleParts.join(" "));
      }
      continue;
    }
    pendingLines.push(trimmed);
    const detected = detectBook(pendingLines);
    if (detected) {
      const titleRaw = pendingLines.map((l) => l.trim()).filter(Boolean).join(" ");
      if (!data.__bookTitles) data.__bookTitles = {};
      if (!data.__bookTitles[detected]) {
        titleBook = detected;
        titleParts = [titleRaw];
        data.__bookTitles[detected] = cleanBookTitle(titleRaw);
      }
      currentBook = detected;
      currentChapter = null;
      if (!data[currentBook]) data[currentBook] = {};
      pendingLines = [];
    } else if (pendingLines.length > 4) {
      pendingLines.shift();
    }
  }
  // Trailing structural text is SOURCE-PARSED ONLY (see the subscription
  // and book-end branches in the loop above). The old editorial COLOPHONS
  // map invented lines the PCE never printed ("The End of the Epistle of
  // Paul the Apostle to the Romans.") — for Romans 16 the real trailing line
  // is the subscription "Written to the Romans from Corinthus, [and] [sent]
  // by Phebe servant of the church at Cenchrea." The consts above remain only
  // as a historical reference; nothing consumes them.
  if (!data.__subscriptions) data.__subscriptions = {};
  cachedBible = data;
  return data;
}
function resolveBookName(book) {
  const normalized = String(book).trim().toLowerCase().replace(/\s+/g, " ");
  for (const [alias, name] of Object.entries(BOOK_ALIASES)) {
    if (normalized === alias.toLowerCase()) return name;
  }
  for (const [alias, name] of Object.entries(BOOK_NAMES)) {
    if (normalized === alias.toLowerCase()) return name;
  }
  for (const [alias, name] of Object.entries(BOOK_NAMES)) {
    if (normalized === name.toLowerCase()) return name;
  }
  const withSpace = normalized.replace(/^([123])\s*/, "$1 ");
  for (const [alias, name] of Object.entries(BOOK_NAMES)) {
    if (withSpace === name.toLowerCase()) return name;
  }
  return null;
}
function bookAbbr(bookName) {
  const entry = Object.entries(BOOK_NAMES).find(([_, n]) => n === bookName);
  return entry ? entry[0] : bookName;
}
function chapterResponse(bible, bookName, chapter, verses) {
  const fullChapter = bible[bookName]?.[chapter] ?? [];
  const chapterData = verses ?? fullChapter;
  const supKey = `${bookName}:${chapter}`;
  const superscription = bible.__superscriptions?.[supKey] || null;
  const out = {
    verses: chapterData.map((v) => {
      const o = { verse: v.verse, text: v.text };
      if (v.heading) o.heading = v.heading;
      return o;
    }),
    book: bookName,
    bookFullName: bible.__bookTitles?.[bookName] || bookName,
    abbr: bookAbbr(bookName),
    chapter
  };
  const coversStart = chapterData.length > 0 && chapterData[0].verse === 1;
  if (superscription && coversStart) {
    out.superscription = superscription;
    if (out.verses.length > 0) out.verses[0].superscription = superscription;
  }
  const coversEnd = chapterData.length > 0 && fullChapter.length > 0 && chapterData[chapterData.length - 1].verse >= fullChapter[fullChapter.length - 1].verse;
  const colophon = bible.__subscriptions?.[supKey] || null;
  if (colophon && coversEnd) out.colophon = colophon;
  return out;
}
async function bibleApi(body) {
  const action = body?.action || "getVerse";
  const bible = await fetchAndParsePCE();
  if (action === "getVerse") {
    const { book, chapter, verse, endVerse } = body;
    const bookName = resolveBookName(book);
    if (!bookName) return { error: `Unknown book: ${book}` };
    const chapterData = bible[bookName]?.[chapter];
    if (!chapterData || chapterData.length === 0) {
      return { error: `Chapter ${chapter} not found in ${bookName}`, book: bookName, chapter };
    }
    if (verse == null) return chapterResponse(bible, bookName, chapter);
    const end = endVerse != null && endVerse >= verse ? endVerse : verse;
    const found = chapterData.filter((v) => v.verse >= verse && v.verse <= end);
    if (found.length === 0) {
      return { error: `Verse ${verse}${end !== verse ? `-${end}` : ""} not found in ${bookName} ${chapter}`, book: bookName, chapter, verse };
    }
    if (end === verse) {
      const v = found[0];
      const out = {
        text: v.text,
        book: bookName,
        bookFullName: bible.__bookTitles?.[bookName] || bookName,
        abbr: bookAbbr(bookName),
        chapter,
        verse: v.verse,
        ref: `${bookName} ${chapter}:${v.verse}`
      };
      if (v.heading) out.heading = v.heading;
      if (v.verse === 1) {
        const sup = bible.__superscriptions?.[`${bookName}:${chapter}`];
        if (sup) out.superscription = sup;
      }
      if (chapterData.length > 0 && v.verse === chapterData[chapterData.length - 1].verse) {
        const col = bible.__subscriptions?.[`${bookName}:${chapter}`] || null;
        if (col) out.colophon = col;
      }
      return out;
    }
    const resp = chapterResponse(bible, bookName, chapter, found);
    resp.ref = `${bookName} ${chapter}:${verse}-${end}`;
    resp.verse = verse;
    resp.text = found.map((v) => v.text).join(" ");
    return resp;
  }
  if (action === "getChapter") {
    const { book, chapter } = body;
    const bookName = resolveBookName(book);
    if (!bookName) return { error: `Unknown book: ${book}` };
    const chapterData = bible[bookName]?.[chapter];
    if (!chapterData || chapterData.length === 0) {
      return { error: `Chapter ${chapter} not found in ${bookName}` };
    }
    return chapterResponse(bible, bookName, chapter);
  }
  if (action === "getVerseCount") {
    const { book, chapter } = body;
    const bookName = resolveBookName(book);
    if (!bookName) return { count: 0 };
    const chapterData = bible[bookName]?.[chapter];
    return { count: chapterData?.length || 0 };
  }
  if (action === "search") {
    const {
      query,
      book: filterBook,
      wholeWord = false,
      caseSensitive = false,
      wildcard = false,
      testament = "all",
      limit: rawLimit,
      offset: rawOffset
    } = body;
    if (!query || !String(query).trim()) return { results: [], total: 0, count: 0 };
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 1e3);
    const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = caseSensitive ? "g" : "gi";
    // Modern spellings of source \u00C6-ligature words. Searched as query
    // variants so "Judea" finds "Jud\u00e6a" and "Enon" finds "\u00C6non".
    const LIGATURE_SPELLINGS = {
      judea: "jud\u00e6a",
      enon: "\u00e6non",
      galilean: "galil\u00e6an",
      galileans: "galil\u00e6ans",
      thaddeus: "thadd\u00e6us",
      chaldeans: "chald\u00e6ans"
    };
    // Same word-boundary class the sidebar highlight uses, extended to both
    // apostrophe forms and the \u00C6/\u00e6 ligature so "God" whole-word never
    // matches inside "God’s" and "non" whole-word never matches inside
    // "\u00C6non".
    const wrapWholeWord = (p) => wholeWord ? `(?<![A-Za-z'\u2019\u00C6\u00e6-])${p}(?![A-Za-z'\u2019\u00C6\u00e6-])` : p;
    const useWildcard = Boolean(wildcard) && /[?*]/.test(query);
    const termsOf = (q) => q.split(/[\s,]+/).filter((t) => t.length > 0);
    const terms = termsOf(String(query));
        const queryVariants = (() => {
      // Expand the query to its variant forms to a fixpoint so the transforms
      // CROSS-APPLY: typed "Caesar's" needs BOTH the ligature swap (Caesar ->
      // Cæsar) AND the apostrophe swap (' -> ’) to reach the printed
      // "Cæsar’s". Each newly added variant is fed back through every
      // transform until no new forms appear, so hyphen, apostrophe and
      // ligature variants combine in every meaningful way. Additive only.
      const seen = new Set();
      const out = [];
      const push = (x) => {
        const t = x.trim();
        if (t && !seen.has(t)) { seen.add(t); out.push(t); }
      };
      push(String(query));
      for (let i = 0; i < out.length; i++) {
        const q = out[i];
        if (q.includes("-")) {
          push(q.replace(/-/g, ""));
          push(q.replace(/-/g, " "));
        }
        // Apostrophe style must not decide a hit: typed queries use the ASCII
        // apostrophe while the source prints the typographic right quote (U+2019),
        // so "God's" never matched the printed "God’s". Additive, like hyphens.
        if (q.includes("'")) push(q.replace(/'/g, "\u2019"));
        if (q.includes("\u2019")) push(q.replace(/\u2019/g, "'"));
        // Ligature variants. The PCE prints the Æ ligature ("Ænon",
        // "Judæa", "Cæsar", "Galilæan") while readers type the
        // letters out: "AEnon", "Judaea", "Caesar". The swap covers every
        // ae-æ pair; the word map covers the modern e-style spellings
        // ("Judea", "Enon", "Galileans") that no character swap can reach.
        if (/ae/i.test(q)) {
          const swapped = q.replace(/[Aa][Ee]/g, (m) =>
            m === m.toLowerCase() ? "\u00e6" : m === m.toUpperCase() ? "\u00C6" : (m[0] === m[0].toUpperCase() ? "\u00C6" : "\u00e6"));
          if (swapped !== q) push(swapped);
        }
        for (const [modern, source] of Object.entries(LIGATURE_SPELLINGS)) {
          const re = new RegExp(`\\b${modern}\\b`, "gi");
          if (re.test(q)) push(q.replace(new RegExp(`\\b${modern}\\b`, "gi"), source));
        }
      }
      return out;
    })();
    const buildWildcard = (q) => {
      let pattern = escape(q).replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
      if (wholeWord) pattern = `(?<![A-Za-z'\u2019\u00C6\u00e6-])${pattern}(?![A-Za-z'\u2019\u00C6\u00e6-])`;
      return new RegExp(pattern, flags);
    };
    const buildPhrase = (q) => {
      const flat = q.replace(/[\s,]+/g, " ").trim();
      return new RegExp(wrapWholeWord(escape(flat).replace(/\\?\s+/g, "\\s+")), flags);
    };
    const wildcardRegexes = useWildcard ? queryVariants.map(buildWildcard) : [];
    const phraseRegexes = useWildcard ? [] : queryVariants.map(buildPhrase);
    const termRegexSets = useWildcard ? [] : queryVariants.map((v) => termsOf(v)).filter((ts) => ts.length > 1).map((ts) => ts.map((t) => new RegExp(wrapWholeWord(escape(t)), flags)));
    const formsOf = (t) => t.includes("-") ? [t, t.replace(/-/g, "")] : [t];
    const hitAny = (res, forms) => {
      for (const re of res) for (const f of forms) {
        re.lastIndex = 0;
        if (re.test(f)) return true;
      }
      return false;
    };
    const hitAll = (res, forms) => res.every((re) => {
      for (const f of forms) {
        re.lastIndex = 0;
        if (re.test(f)) return true;
      }
      return false;
    });
    const keepRaw = /[[\]¶]/.test(query);
    const plain = (t) => {
      let s = t;
      if (!keepRaw) s = s.replace(/\[([^\]]+)\]/g, "$1");
      return s.replace(/¶\s*/g, "");
    };
    let bookFilter = null;
    if (filterBook && String(filterBook).trim()) {
      bookFilter = resolveBookName(String(filterBook));
    }
    const testFilter = testament === "old" || testament === "new" ? testament : "all";
    const books = BOOK_ORDER.filter((b) => {
      if (bookFilter && b !== bookFilter) return false;
      if (testFilter === "old" && !OT_BOOKS.has(b)) return false;
      if (testFilter === "new" && !NT_BOOKS.has(b)) return false;
      return true;
    });
    const matches = [];
    const andMatches = [];
    let anyPhraseHit = false;
    // Structural text (Psalm superscriptions, book-end colophons, epistle
    // subscriptions) is real scripture text, so keyword search must test it
    // too. A hit surfaces that structural line in the results AND guarantees
    // its anchor verse is included (verse 1 for a superscription, the last
    // verse for a colophon/subscription) so the structural text always
    // renders attached to a verse card of its own chapter.
    const hitPhraseLevel = (forms) => useWildcard
      ? hitAny(wildcardRegexes, forms)
      : hitAny(phraseRegexes, forms);
    const hitAndLevel = (forms) => !useWildcard && termRegexSets.some((set) => hitAll(set, forms));
    for (const bookName of books) {
      const chapters = bible[bookName];
      if (!chapters) continue;
      const chapterNums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
      for (const chapter of chapterNums) {
        const chapterVerses = chapters[chapter];
        const supText = bible.__superscriptions?.[`${bookName}:${chapter}`] || null;
        // Trailing structural lines: the printed book-end colophon ("The End
        // of the Epistle...") and the epistle subscription ("Written to the
        // Romans from Corinthus..."). Either can carry the searched words.
        // Only the source subscription — book-end lines are website-only.
        const trailingTexts = [
          bible.__subscriptions?.[`${bookName}:${chapter}`] || null
        ].filter(Boolean);
        const supForms = supText ? formsOf(plain(supText)) : null;
        const supVia = supForms ? (hitPhraseLevel(supForms) ? "phrase" : hitAndLevel(supForms) ? "and" : null) : null;
        const trailing = trailingTexts.map((t) => {
          const forms = formsOf(plain(t));
          return { text: t, via: hitPhraseLevel(forms) ? "phrase" : hitAndLevel(forms) ? "and" : null };
        });
        const verseHitsP = [];
        const verseHitsA = [];
        for (const v of chapterVerses) {
          const text = plain(v.text);
          const forms = formsOf(text);
          let matchedP = false, matchedA = false;
          if (useWildcard) {
            matchedP = hitAny(wildcardRegexes, forms);
          } else {
            matchedP = hitAny(phraseRegexes, forms);
            if (!matchedP && termRegexSets.some((set) => hitAll(set, forms))) matchedA = true;
          }
          // Hebrew section heading (Psalm 119 letter names) is real scripture
          // text: test it too, so a query like "ALEPH" surfaces the section's
          // anchor verse with its heading attached.
          if (!matchedP && !matchedA && v.heading) {
            const hForms = formsOf(plain(v.heading));
            if (hitPhraseLevel(hForms)) matchedP = true;
            else if (!useWildcard && hitAndLevel(hForms)) matchedA = true;
          }
          if (matchedP) verseHitsP.push(v);
          else if (matchedA) verseHitsA.push(v);
        }
        if (verseHitsP.length > 0 || supVia === "phrase" || trailing.some((t) => t.via === "phrase")) anyPhraseHit = true;
        const firstVerse = chapterVerses[0];
        const lastVerse = chapterVerses[chapterVerses.length - 1];
        const pushLevel = (arr, level, hits) => {
          const reachedStart = hits.some((v) => v.verse === firstVerse.verse);
          const reachedEnd = hits.some((v) => v.verse === lastVerse.verse);
          // Result units: one verse entry carrying its structural lines
          // (superscription/Hebrew heading ride above, subscription below).
          // Structural lines used to be separate entries in the result list,
          // which let them consume paging slots — with limit/offset paging a
          // long keyword search silently lost verses at the end of the list
          // ("right" missed Revelation 22:14). Attaching them to their anchor
          // verse keeps every verse reachable on some page.
          const byVerse = new Map();
          const unit = (v) => {
            const key = v.verse;
            if (!byVerse.has(key)) byVerse.set(key, { bookName, chapter, v, before: [], after: [] });
            return byVerse.get(key);
          };
          const units = [];
          const addUnit = (v, before) => {
            const e = unit(v);
            if (units[units.length - 1] !== e) units.push(e);
            return e;
          };
          // Superscription: attach when its text matched the query OR the hits
          // reach the chapter's first verse — the same rule a reference lookup
          // follows (chapterResponse attaches it when the fetch covers verse 1),
          // so a keyword hit on verse 1 shows the chapter's superscription too.
          if (supText && (supVia === level || reachedStart)) {
            addUnit(firstVerse).before.push({ kind: "superscription", text: supText });
          }
          hits.forEach((v) => {
            const e = addUnit(v);
            // Hebrew section heading (Psalm 119 letters): attach before its
            // verse whenever that verse appears in the results, exactly as a
            // reference lookup shows the section letter above the verse.
            if (v.heading) e.before.push({ kind: "hebrewHeading", text: v.heading });
          });
          // Trailing structural lines (book-end colophon / epistle
          // subscription): attach when their text matched the query OR the
          // hits reach the chapter's final verse — the same rule a reference
          // lookup follows (chapterResponse coversEnd), so a keyword that
          // lands on the last verse carries the colophon, like "Romans 16".
          const trailHits = trailing.filter((t) => t.via === level);
          if (trailHits.length > 0 || reachedEnd) {
            addUnit(lastVerse).after.push(...(reachedEnd ? trailing : trailHits).map((t) => ({ kind: "colophon", text: t.text })));
          }
          arr.push(...units);
        };
        pushLevel(matches, "phrase", verseHitsP);
        pushLevel(andMatches, "and", verseHitsA);
      }
    }
    let finalMatches = matches;
    if (!useWildcard && matches.length === 0 && termRegexSets.length > 0 && !anyPhraseHit) {
      finalMatches = andMatches;
    }
    // Structural lines ride attached to their anchor verse (they never
    // consume a paging slot), so the occurrence count is simply the number
    // of verse units (including anchor verses pulled in by a structural hit).
    const total = finalMatches.length;
    const page = finalMatches.slice(offset, offset + limit);
    const results = page.flatMap((entry) => {
      const structRecord = (s) => ({
        abbr: bookAbbr(entry.bookName),
        book: entry.bookName,
        bookFullName: bible.__bookTitles?.[entry.bookName] || entry.bookName,
        chapter: entry.chapter,
        // Carry the structural text as `text` so client-side filters
        // (wildcard, case-sensitive, book) keep working on these entries.
        text: s.text,
        [s.kind]: s.text
      });
      const { bookName, chapter, v } = entry;
      const ref = `${bookName} ${chapter}:${v.verse}`;
      const verseRecord = {
        abbr: bookAbbr(bookName),
        book: bookName,
        bookFullName: bible.__bookTitles?.[bookName] || bookName,
        chapter,
        verse: v.verse,
        ref,
        text: v.text,
        description: `"${plain(v.text)}" \u2014 ${ref}`
      };
      return [...entry.before.map(structRecord), verseRecord, ...entry.after.map(structRecord)];
    });
    return {
      query,
      results,
      total,
      count: results.length,
      offset,
      wholeWord: Boolean(wholeWord),
      caseSensitive: Boolean(caseSensitive),
      wildcard: Boolean(wildcard),
      testament: testFilter,
      book: bookFilter
    };
  }
  return { error: "Unknown action" };
}

// Local-first API wrapper. api.js falls back to the remote bibleApi only if
// the packaged text cannot be loaded or parsed.
const KJB_LOCAL = (() => {
  let failed = false;
  return {
    isAvailable: () => !failed,
    apiCall: async (body) => {
      if (failed) throw new Error("local PCE engine unavailable");
      try {
        return await bibleApi(body);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
})();
