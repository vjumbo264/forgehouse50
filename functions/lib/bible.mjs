// Bible content service abstraction.
//
// A licensed Bible API drops in later by adding a provider with the same
// interface and registering it in PROVIDERS — zero architectural change.
// Until then, the `mock` provider serves a handful of public-domain /
// placeholder passages so the full reading flow works end-to-end.
//
// Provider interface:
//   id            string  — stable translation id
//   name          string  — display name
//   attribution   string  — shown under the text
//   getPassage(book, chapterStart, chapterEnd) -> { reference, verses: [{verse, text}], attribution }

// Public-domain sample passages (World English Bible / KJV-flavoured PD text)
// keyed "Book:chapter". Anything not present renders a clearly-labelled
// placeholder so the UI is fully testable without a licensed key.
const SAMPLE = {
  'John:1': [
    'In the beginning was the Word, and the Word was with God, and the Word was God.',
    'The same was in the beginning with God.',
    'All things were made through him. Without him, nothing was made that has been made.',
    'In him was life, and the life was the light of men.',
    'The light shines in the darkness, and the darkness hasn\u2019t overcome it.',
    'There came a man sent from God, whose name was John.',
    'The same came as a witness, that he might testify about the light, that all might believe through him.',
    'He was not the light, but was sent that he might testify about the light.',
    'The true light that enlightens everyone was coming into the world.',
    'He was in the world, and the world was made through him, and the world didn\u2019t recognize him.',
    'He came to his own, and those who were his own didn\u2019t receive him.',
    'But as many as received him, to them he gave the right to become God\u2019s children, to those who believe in his name:',
    'who were born not of blood, nor of the will of the flesh, nor of the will of man, but of God.',
    'The Word became flesh and lived among us. We saw his glory, such glory as of the one and only Son of the Father, full of grace and truth.',
  ],
  'John:3': [
    'Now there was a man of the Pharisees named Nicodemus, a ruler of the Jews.',
    'He came to Jesus by night and said to him, \u201cRabbi, we know that you are a teacher come from God, for no one can do these signs that you do unless God is with him.\u201d',
    'Jesus answered him, \u201cMost certainly I tell you, unless one is born anew he can\u2019t see God\u2019s Kingdom.\u201d',
  ],
  'Matthew:5': [
    'Seeing the multitudes, he went up onto the mountain. When he had sat down, his disciples came to him.',
    'He opened his mouth and taught them, saying,',
    '\u201cBlessed are the poor in spirit, for theirs is the Kingdom of Heaven.',
    'Blessed are those who mourn, for they shall be comforted.',
    'Blessed are the gentle, for they shall inherit the earth.',
    'Blessed are those who hunger and thirst for righteousness, for they shall be filled.',
    'Blessed are the merciful, for they shall obtain mercy.',
    'Blessed are the pure in heart, for they shall see God.',
    'Blessed are the peacemakers, for they shall be called children of God.',
    'Blessed are those who have been persecuted for righteousness\u2019 sake, for theirs is the Kingdom of Heaven.',
  ],
  'Romans:8': [
    'There is therefore now no condemnation to those who are in Christ Jesus.',
    'For the law of the Spirit of life in Christ Jesus made me free from the law of sin and of death.',
  ],
  'Revelation:22': [
    'He showed me a river of water of life, clear as crystal, proceeding out of the throne of God and of the Lamb.',
    'in the middle of its street. On this side of the river and on that was the tree of life, bearing twelve kinds of fruits, yielding its fruit every month. The leaves of the tree were for the healing of the nations.',
  ],
};

const PLACEHOLDER_PARAGRAPHS = [
  'This is placeholder Scripture text from the ForgeHouse 50 mock content layer.',
  'The full licensed Bible text will appear here once a Bible API key is added as a Worker secret (see README).',
  'Every part of the reading flow — progress, notes, bookmarks, highlights, points — already works against this passage.',
];

const mockProvider = {
  id: 'mock-web',
  name: 'Mock — Public Domain Sample',
  attribution: 'Sample passages: World English Bible (public domain). Remaining text is placeholder pending a licensed Bible API.',
  async getPassage(book, chapterStart, chapterEnd) {
    const verses = [];
    for (let ch = chapterStart; ch <= chapterEnd; ch++) {
      const sample = SAMPLE[`${book}:${ch}`];
      if (sample) {
        sample.forEach((text, i) => verses.push({ chapter: ch, verse: i + 1, text }));
      } else {
        // Deterministic placeholder so each chapter looks stable.
        for (let v = 1; v <= 8; v++) {
          verses.push({
            chapter: ch,
            verse: v,
            text: `[${book} ${ch}:${v}] ${PLACEHOLDER_PARAGRAPHS[v % PLACEHOLDER_PARAGRAPHS.length]}`,
          });
        }
      }
    }
    const reference = chapterStart === chapterEnd
      ? `${book} ${chapterStart}`
      : `${book} ${chapterStart}\u2013${chapterEnd}`;
    return { reference, verses, attribution: this.attribution, translation: this.id };
  },
};

// Registry: a licensed provider registers here later with the same shape.
export const PROVIDERS = {
  [mockProvider.id]: mockProvider,
};

export function listTranslations() {
  return Object.values(PROVIDERS).map(p => ({ id: p.id, name: p.name, attribution: p.attribution }));
}

export function getProvider(id) {
  return PROVIDERS[id] || mockProvider;
}
