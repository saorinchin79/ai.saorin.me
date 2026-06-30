/* Default data + the granola-bar example, tokenised so the global
   Subjects/Style fields flow into every shot. */

const TOKENS = [
  { key: 'character', label: 'Character' },
  { key: 'object', label: 'Object' },
  { key: 'scene', label: 'Scene' },
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'ref', label: 'Image ref' },
  { key: 'grade', label: 'Color grade' },
  { key: 'fps', label: 'Frame rate' },
  { key: 'brand', label: 'Brand' },
  { key: 'verdict', label: 'Verdict' },
  { key: 'duration', label: 'Duration' },
];

function blankState() {
  return {
    meta: {
      category: 'Marketing and Advertising Prompt',
      kind: 'shots', // 'shots' (cinematic video) | 'sections' (design / image)
      brand: '',
      duration: '',
      verdict: '',
      refLabel: 'Image 1',
      concept: '',
    },
    subjects: {
      character: '',
      object: '',
      scene: '',
      background: '',
      surface: '',
    },
    style: {
      grade: '',
      fps: '24fps',
      lens: '50mm',
    },
    fields: [], // custom editable placeholder tokens: {key, label, value}
    shots: [newShot()],
  };
}

let _fid = 0;
function newField(overrides = {}) {
  _fid += 1;
  const f = Object.assign({ _id: 'f' + _fid, key: '', label: '', value: '' }, overrides);
  f._id = 'f' + _fid;
  return f;
}

let _sid = 0;
function newShot(overrides = {}) {
  _sid += 1;
  const shot = Object.assign(
    {
      _id: 's' + _sid,
      title: '',
      subtitle: '',
      seconds: '',
      camera: '',
      lighting: '',
      action: '',
      dialogueLead: 'He delivers:',
      dialogue: '',
      gradeTech: '',
    },
    overrides
  );
  shot._id = 's' + _sid; // always a fresh, unique id — ignore any _id from overrides
  return shot;
}

function exampleState() {
  return {
    meta: {
      category: 'Marketing and Advertising Prompt',
      kind: 'shots',
      brand: 'The Natural',
      duration: '25-second',
      verdict: 'Four stars',
      refLabel: 'Image 1',
      concept:
        'A film critic — tweed, reading glasses, the kind of man who has opinions about aspect ratios — sits at {{scene}}. ' +
        'On the desk: a {{object}}, still in its wrapper, on {{surface}}. He unwraps it slowly. Takes a bite. Chews. Thinks. ' +
        'What follows is a {{duration}} critical appraisal delivered with complete sincerity: structure, texture, the emotional ' +
        'register of the oats, the way the chocolate chips "refuse easy resolution." He gives it {{verdict}}. The bar appears. ' +
        'Cut. Reference {{ref}} for the {{object}} product image.',
    },
    subjects: {
      character: 'A man in his 60s in tweed',
      object: 'granola bar',
      scene: 'a small wooden desk',
      background: 'Out-of-focus bookshelves',
      surface: 'a small white plate',
    },
    style: {
      grade: 'Warm, desaturated color grade — aged paper tones',
      fps: '24fps',
      lens: '50mm',
    },
    shots: [
      newShot({
        title: 'THE CRITIC AND THE BAR',
        subtitle: 'SETUP',
        seconds: 4,
        camera: 'Cinematic medium shot, 50mm lens, eye level',
        lighting: 'Warm tungsten key light from left — editorial, like a literary portrait',
        action:
          '{{character}} sits at {{scene}}. {{background}} behind him. On the desk: a {{object}} {{ref}} on {{surface}}, ' +
          'still in its wrapper. He unwraps it slowly and deliberately, folds the wrapper to one side, studies the bar ' +
          'briefly. Takes one careful bite. Static camera.',
        gradeTech: '{{grade}}. {{fps}}, film grain.',
      }),
      newShot({
        title: 'THE PAUSE',
        subtitle: 'HE THINKS',
        seconds: 3,
        camera: 'Close-up, 85mm shallow depth of field, static',
        action:
          "The same man's face — warm, serious, unhurried. He chews once, twice, swallows. His eyes drift slightly " +
          'off-camera — genuinely processing, not performing thought. A full three-second pause. He looks back to camera. ' +
          'He sets the opened {{object}} back on {{surface}}. No dialogue.',
        gradeTech: 'Warm desaturated grade. {{fps}}, film grain. Match lighting from shot 01.',
      }),
      newShot({
        title: 'THE REVIEW',
        subtitle: 'TEXTURE, STRUCTURE, THIRD ACT',
        seconds: 8,
        camera: 'Medium shot, 50mm, static, unbroken take',
        action:
          'The man speaks directly to camera with complete authority and warmth. Unhurried pacing — two deliberate hand ' +
          'gestures maximum. The same opened {{object}} from shot 02 visible on plate in foreground, slightly out of focus. ' +
          'Warm desaturated grade, match previous shots.',
        dialogueLead: 'He delivers:',
        dialogue:
          'The texture is confident without being aggressive. There is structure here — a clear beginning, a development, ' +
          'and what I can only describe as a satisfying third act. The oats carry a quiet melancholy. The chocolate chips ' +
          '— and I weighed this carefully — refuse easy resolution. They arrive late. They linger.',
        gradeTech: '{{fps}}.',
      }),
      newShot({
        title: 'THE GREATEST ACHIEVEMENT',
        subtitle: 'CLOSE',
        seconds: 4,
        camera: '85mm, static with barely perceptible push-in — imperceptible until you look for it',
        action:
          'Slightly tighter on his face. His expression is open, sincere, warm — not satisfied with himself, genuinely ' +
          'satisfied with the bar. The warmest moment in the ad.',
        dialogueLead: 'He delivers:',
        dialogue:
          'It does not try to be more than it is. That restraint is, in my view, its greatest achievement.',
        gradeTech: 'Match warm desaturated grade. {{fps}}.',
      }),
      newShot({
        title: 'THE VERDICT',
        subtitle: 'FOUR STARS',
        seconds: 3,
        camera: '50mm medium shot, static',
        action:
          'The critic picks up the same opened {{object}} from shot 02. Looks at it one final moment — the look of a critic ' +
          'who has completed his work. Sets it back on the plate. Looks directly to camera.',
        dialogueLead: 'Delivers:',
        dialogue: '{{verdict}}.',
        gradeTech: 'Two words, the authority of closing a notebook. No smile. Warm desaturated grade match. {{fps}}.',
      }),
      newShot({
        title: 'PRODUCT CARD',
        subtitle: 'BAR ON WHITE',
        seconds: 3,
        camera: 'Macro lens, static, clean editorial product photography',
        action:
          'The {{object}} {{ref}} on a flat white surface, brand name clearly visible. Flat soft light — neutral, clean. Hard cut ' +
          "from the warm critic scenes to this cooler, cleaner white. No movement, no animation. Brand name and '{{brand}}. " +
          "{{verdict}}.' as minimal text below. 3 second hold. Cut to black.",
        dialogueLead: '',
        dialogue: '',
        gradeTech: '',
      }),
    ],
  };
}

/* ---- Sections-kind preset: Grocery Store Grand Opening poster ---- */
function groceryPosterState() {
  return {
    meta: {
      category: 'Poster Design Prompt',
      kind: 'sections',
      brand: '',
      duration: '',
      verdict: '',
      refLabel: '',
      concept:
        'Design a premium, modern, and highly professional promotional poster for the Grand Opening of a Grocery Store. ' +
        'The design should feel clean, luxurious, vibrant, and trustworthy — similar to a premium supermarket advertisement ' +
        'created by an award-winning senior graphic designer.',
    },
    subjects: { character: '', object: '', scene: '', background: '', surface: '' },
    style: { grade: '', fps: '', lens: '' },
    fields: [
      newField({ label: 'Headline', key: 'headline', value: 'GRAND OPENING' }),
      newField({ label: 'Subtitle', key: 'subtitle', value: 'OF OUR NEW GROCERY STORE' }),
      newField({ label: 'Badge line 1', key: 'badgeLine1', value: 'SPECIAL OPENING OFFERS' }),
      newField({ label: 'Badge line 2', key: 'badgeLine2', value: "DON'T MISS OUT!" }),
      newField({ label: 'Opening date', key: 'openingDate', value: '25th July 2026' }),
      newField({ label: 'Opening time', key: 'openingTime', value: '9:00 AM' }),
      newField({ label: 'Store name', key: 'storeName', value: 'ABC Grocery Store' }),
      newField({ label: 'Address', key: 'address', value: '123 Main Street' }),
      newField({ label: 'City', key: 'city', value: 'Your City' }),
      newField({ label: 'Slogan', key: 'slogan', value: 'Shop More. Save More. Live Better.' }),
    ],
    shots: [
      newShot({
        title: 'Layout & Composition',
        action:
          '- Vertical A4/A3 poster (4:5 aspect ratio).\n' +
          '- Clean editorial layout with excellent spacing and visual hierarchy.\n' +
          '- Large bold headline at the top: {{headline}}\n' +
          '- Smaller subtitle beneath it: {{subtitle}}\n' +
          '- Elegant decorative elements: subtle confetti, green leaves in the corners, and soft golden accents.',
      }),
      newShot({
        title: 'Main Visual',
        action:
          'Feature a realistic chrome shopping cart overflowing with fresh groceries: lettuce, broccoli, tomatoes, bell ' +
          'peppers, bananas, apples, oranges, grapes, bread, milk, juice, eggs, rice, cooking oil, and everyday grocery ' +
          'essentials. Everything appears fresh, colorful, and photorealistic with premium commercial advertising quality.',
      }),
      newShot({
        title: 'Background',
        action:
          'Soft warm white to cream gradient background. Minimal texture. Bright natural lighting. Clean and elegant, ' +
          'with fresh green accents throughout.',
      }),
      newShot({
        title: 'Promotional Badge',
        action:
          "Create a circular premium badge that reads: '{{badgeLine1}}' / '{{badgeLine2}}'. Use green, gold, and red colors.",
      }),
      newShot({
        title: 'Information Section',
        action:
          'Editable placeholders, cleanly laid out:\n' +
          'Opening Date — {{openingDate}}\n' +
          'Time — {{openingTime}}\n' +
          'Venue — {{storeName}}, {{address}}, {{city}}',
      }),
      newShot({
        title: 'Features Section',
        action:
          'Four modern circular icons with labels: Fresh Everyday · Best Prices · Wide Variety · Friendly Service.',
      }),
      newShot({
        title: 'Footer',
        action: "Green curved footer with a gold accent line. Include the slogan: '{{slogan}}'.",
      }),
      newShot({
        title: 'Color Palette',
        action: 'Emerald Green, Fresh Leaf Green, White, Cream, Gold, and Red accents.',
      }),
      newShot({
        title: 'Typography',
        action:
          'Bold modern sans-serif fonts. Large impactful heading. Professional spacing. Excellent readability.',
      }),
      newShot({
        title: 'Design Style',
        action:
          'Ultra-realistic, premium supermarket branding, luxury retail advertisement, high-end print quality, clean ' +
          'composition, modern editorial style, vibrant colors, commercial photography look, soft shadows, natural ' +
          'lighting, 8K resolution, crisp details, print-ready quality, eye-catching, minimal yet elegant — an ' +
          'award-winning graphic design aesthetic.',
      }),
    ],
  };
}

/* ---- Sections-kind preset: Winter jacket thermal-split poster ---- */
function winterJacketState() {
  return {
    meta: {
      category: 'Poster Design Prompt',
      kind: 'sections',
      brand: '',
      duration: '',
      verdict: '',
      refLabel: '',
      concept: 'A premium 9:16 winter jacket advertising poster.',
    },
    subjects: { character: '', object: '', scene: '', background: '', surface: '' },
    style: { grade: '', fps: '', lens: '' },
    fields: [
      newField({ label: 'Headline', key: 'headline', value: 'STAY WARM WHERE IT MATTERS' }),
      newField({ label: 'Brand', key: 'brand', value: 'SUMMIT GLIDE' }),
    ],
    shots: [
      newShot({
        title: 'Main Subject',
        action: 'A premium outdoor jacket displayed in the center.',
      }),
      newShot({
        title: 'Composition',
        action:
          'The composition is split naturally. One side appears as normal ultra-realistic photography. The other side ' +
          'appears through a professional thermal camera visualization. The jacket glows with warm heat signatures while ' +
          'the freezing environment remains icy blue.',
      }),
      newShot({
        title: 'Typography',
        action: '"{{headline}}"',
      }),
      newShot({
        title: 'Style',
        action:
          'Scientific visualization. Premium outdoor campaign. Minimal editorial advertising. Ultra detailed. 8K masterpiece.',
      }),
    ],
  };
}

/* Built-in preset library (the "✦ Presets" of starter prompts).
   `preview` is an optional thumbnail image shown in the dropdown. */
const PRESETS = [
  { id: 'film-critic', name: 'Film Critic — Granola Bar (video · 6 shots)', kind: 'shots', build: exampleState },
  { id: 'grocery-poster', name: 'Grocery Store Grand Opening (poster · image)', kind: 'sections', preview: 'presets/grocery.svg', build: groceryPosterState },
  { id: 'thermal-jacket', name: 'Winter Jacket — Thermal Split (poster · image)', kind: 'sections', preview: 'presets/summit-glide.svg', build: winterJacketState },
];
