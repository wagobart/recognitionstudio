import { bytesToB64 } from './util.js';
// Design planning: turns the user's idea into a layout, an artwork prompt, lettering
// suggestions and starter wording. Uses an OpenAI text model when available and falls
// back to a deterministic local planner so a planning failure never blocks the user.

export const LAYOUTS = {
  framed: {
    label: 'Framed',
    art: 'a rich decorative border running around all four edges of the page; the themed objects and motifs are woven INTO the border and corners. The entire central area (about 64% of the width and 66% of the height, centered) is a plain, smooth, completely empty background with nothing in it',
  },
  crest: {
    label: 'Crest on top',
    art: 'a thin elegant border around the edges, plus one featured emblem/illustration centered along the top edge occupying roughly the top quarter of the page. Everything below the emblem (the lower 70% of the page, inside the border) is a plain, smooth, completely empty background',
  },
  'art-left': {
    label: 'Art on the left',
    art: 'a tall featured illustration filling the left third of the page, plus a thin border around the edges. The right two-thirds of the page (inside the border) is a plain, smooth, completely empty background',
  },
  'art-right': {
    label: 'Art on the right',
    art: 'a tall featured illustration filling the right third of the page, plus a thin border around the edges. The left two-thirds of the page (inside the border) is a plain, smooth, completely empty background',
  },
  scene: {
    label: 'Scene along the bottom',
    art: 'a panoramic themed scene along the bottom third of the page that fades softly upward, plus a thin border around the edges. The upper 62% of the page (inside the border) is a plain, smooth, completely empty background like open sky or blank paper',
  },
};

export const LETTERING = ['classic', 'engraved', 'elegant', 'diploma', 'modern', 'workshop', 'frontier', 'personal'];

const NO_TEXT =
  'Absolutely no text of any kind: no letters, words, numbers, monograms, banners with writing, signatures, seals with writing, or placeholder lines. Leave the empty area truly empty so lettering can be added later.';

// Extra instruction when a reference photo is supplied ("Paint it into the artwork").
export function photoInstruction(layout, subject) {
  const what = subject ? `the ${subject} shown in the reference photo` : 'the main subject of the reference photo';
  const where = {
    crest: 'as the featured emblem centered along the top edge, like a portrait medallion',
    'art-left': 'as the tall featured illustration in the left third',
    'art-right': 'as the tall featured illustration in the right third',
    scene: 'as the centerpiece of the scene along the bottom',
    framed: 'woven prominently into the decorative border',
  }[layout] || 'prominently in the artwork';
  return `Feature ${what} ${where}, faithfully matching its real appearance, likeness, markings, colors and proportions. Only the subject comes from the photo: do not copy its background, and do not let the subject enter the empty lettering area.`;
}

export function buildImagePrompt({ artPrompt, layout, output, photo }) {
  const L = LAYOUTS[layout] || LAYOUTS.framed;
  if (photo) artPrompt = `${artPrompt}. ${photoInstruction(layout, photo.subject)}`;
  if (output === 'pyrography') {
    return [
      'Photorealistic graphite pencil drawing to be used as a pyrography (wood burning) reference, horizontal 3:2 landscape page, clean white paper background.',
      `Subject and motifs: ${artPrompt}.`,
      `Composition: ${L.art}.`,
      'Style: highly detailed, lifelike graphite rendering with smooth tonal shading from soft light grays to deep charcoal blacks, realistic textures (fur, wood grain, metal, foliage), strong form and lighting, and crisp edges on the main subjects. Grayscale only: no color, no colored tints, no paint or ink washes. Keep the empty lettering area pure white paper with no smudges, shading or texture.',
      NO_TEXT,
      'Front-on flat drawing filling the frame edge to edge, not a photo of paper, a sketchbook or a board.',
    ].join(' ');
  }
  return [
    'Printable award certificate background artwork, horizontal 3:2 landscape page, premium and professional.',
    `Theme and motifs: ${artPrompt}.`,
    `Composition: ${L.art}.`,
    'Rich, crisp, print-quality illustration with tasteful, harmonious colors; the empty area must be light and even in tone so dark lettering is easy to read on it.',
    NO_TEXT,
    'Front-on flat artwork filling the frame edge to edge, not a photo or mockup of paper.',
  ].join(' ');
}

// ---------------- AI planner ----------------

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectTitle', 'layout', 'artPrompt', 'lettering', 'headColor', 'textColor', 'designNotes', 'photoSubject', 'wording'],
  properties: {
    projectTitle: { type: 'string' },
    layout: { type: 'string', enum: Object.keys(LAYOUTS) },
    artPrompt: { type: 'string' },
    lettering: { type: 'string', enum: LETTERING },
    headColor: { type: 'string' },
    textColor: { type: 'string' },
    designNotes: { type: 'string' },
    photoSubject: { type: 'string' },
    wording: {
      type: 'object',
      additionalProperties: false,
      required: ['kicker', 'title', 'presented', 'name', 'body', 'details', 'date', 'sig1Name', 'sig1Role', 'sig2Name', 'sig2Role'],
      properties: Object.fromEntries(
        ['kicker', 'title', 'presented', 'name', 'body', 'details', 'date', 'sig1Name', 'sig1Role', 'sig2Name', 'sig2Role'].map((k) => [k, { type: 'string' }])
      ),
    },
  },
};

const PLANNER_SYSTEM = `You are the art director for Recognition Studio, which makes personalized awards, certificates and wood-burning (pyrography) recognition pieces.
Given the user's idea, plan ONE design:
- artPrompt: a vivid, specific description (60-110 words) of the decorative artwork ONLY. Work the recipient's real profession, interests, achievement and occasion into concrete objects and motifs (e.g. a union carpenter's retirement: a leather tool belt with hammer, tape measure, framing square and pencil, oak leaves and wood grain). Never ask for text, names, numbers or lettering in the art.
- layout: choose the composition that suits the subject: framed (motifs woven into a border, most formal), crest (one hero emblem on top), art-left / art-right (a tall featured illustration), scene (a landscape or workplace scene along the bottom).
- lettering: classic (Garamond book serif), engraved (Roman capitals), elegant (flowing script name), diploma (Old English blackletter), modern (clean sans), workshop (sturdy slab serif), frontier (western woodtype), personal (handwritten).
- headColor/textColor: hex colors that read well on the art's light empty area. For pyrography use near-black browns only.
- wording: warm, specific, sincere recognition text. kicker is a short line above the title (e.g. "In Recognition Of"), title is the award name, presented is a short lead-in like "Proudly presented to", name is the recipient's name ONLY if the user gave it (otherwise empty string), body is 1-3 sentences, details holds dates/years/organization if known, date only if given. Signature lines (sig1/sig2) only if the user mentioned who is presenting; otherwise leave name empty and give a sensible role like "Presented by". Never invent people's names, dates or organizations.
- designNotes: one friendly sentence telling the user what you designed and why.
- projectTitle: a short title for the user's project list.
- If a photo is attached: the exact photo is placed in the design separately (beside or above the lettering), so do NOT put its subject into artPrompt as a portrait. Design decorative artwork that suits who or what is in the photo, using what you can see (a uniform, a profession's tools, a breed of dog, a vehicle, a place) plus anything the user wrote. photoSubject: the subject in a few plain words (e.g. "golden retriever", "man in a firefighter's uniform", "red pickup truck"). If there is no description, infer a fitting, warm occasion from the photo, but never guess names, ages, dates, or that someone has died: if a tribute vs. a celebration is unclear, use neutral appreciation wording. With no photo, photoSubject is "".`;

// The model sometimes invents years/dates; keep only what the user actually wrote.
function dropInventedFacts(plan, idea) {
  const w = plan.wording || {};
  const nums = new Set(String(idea).match(/\d+/g) || []);
  const invented = (s) => (String(s).match(/\d+/g) || []).some((n) => !nums.has(n));
  if (w.date && invented(w.date)) w.date = '';
  // remove placeholder fragments such as "Years of Service: [Years]"
  for (const k of Object.keys(w)) {
    if (!/\[[^\]]*\]/.test(w[k] || '')) continue;
    w[k] = String(w[k]).split(/\s*[|·•]\s*/).filter((part) => !/\[[^\]]*\]/.test(part)).join(' · ').replace(/\[[^\]]*\]/g, '').trim();
  }
  for (const k of ['details', 'body', 'title'])
    if (w[k] && invented(w[k])) w[k] = String(w[k]).replace(/\b(?:19|20)\d{2}\b/g, (y) => (nums.has(y) ? y : '')).replace(/\s{2,}/g, ' ').replace(/[\s,·–-]+$/, '').trim();
  return plan;
}

export async function planWithAI(env, { idea, output, photo }) {
  const text = `Output type: ${output === 'pyrography' ? 'wood-burning pattern (photorealistic graphite drawing, grayscale)' : 'printable color certificate'}\nIdea: ${idea || '(no description — design it from the attached photo)'}`;
  const userContent = photo
    ? [
        { type: 'text', text: text + '\nA photo is attached.' },
        { type: 'image_url', image_url: { url: `data:${photo.contentType || 'image/jpeg'};base64,${bytesToB64(photo.bytes)}`, detail: 'low' } },
      ]
    : text;
  const model = env.PLANNER_MODEL || 'gpt-4.1-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: PLANNER_SYSTEM },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'design_plan', strict: true, schema: PLAN_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`planner ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const plan = JSON.parse(data.choices[0].message.content);
  return { plan: dropInventedFacts(sanitizePlan(plan, output), idea), model };
}

const HEX = /^#[0-9a-f]{6}$/i;
function sanitizePlan(p, output) {
  const fallback = localPlan({ idea: '', output });
  const out = { ...fallback, ...p };
  if (!LAYOUTS[out.layout]) out.layout = 'framed';
  if (!LETTERING.includes(out.lettering)) out.lettering = 'classic';
  if (!HEX.test(out.headColor)) out.headColor = fallback.headColor;
  if (!HEX.test(out.textColor)) out.textColor = fallback.textColor;
  if (output === 'pyrography') {
    out.headColor = '#1f1610';
    out.textColor = '#1f1610';
  }
  out.wording = { ...fallback.wording, ...(p.wording || {}) };
  return out;
}

// ---------------- Local planner (fallback + test mode) ----------------

const OCCASIONS = [
  { re: /retir/i, title: 'Certificate of Retirement', kicker: 'With Gratitude & Congratulations', body: 'In honor of a career built with skill, dedication and pride. Your work will stand long after the last day on the job.' },
  { re: /(\d+)\s*(years?|yrs?)\b|anniversar|service award|years of service/i, title: 'Years of Service Award', kicker: 'In Recognition Of', body: 'For years of loyal service, steady leadership and the countless ways you have made this place better.' },
  { re: /graduat|commencement|diploma/i, title: 'Certificate of Graduation', kicker: 'Congratulations, Graduate', body: 'For the hard work, persistence and heart it took to reach this milestone. The best is yet to come.' },
  { re: /certification|certified|licens|journeyman|apprentic|completion|course|training/i, title: 'Certificate of Completion', kicker: 'This Certifies That', body: 'Has successfully completed all requirements and demonstrated the knowledge and skill this achievement demands.' },
  { re: /veteran|military|army|navy|marine|air force|coast guard|national guard/i, title: 'Certificate of Appreciation', kicker: 'With Honor & Gratitude', body: 'For faithful service to our country and the sacrifices made on behalf of others. Thank you for your service.' },
  { re: /volunteer/i, title: 'Volunteer of the Year', kicker: 'With Heartfelt Thanks', body: 'For generously giving your time and talent, and for showing what it means to serve others.' },
  { re: /coach|team|season|champion|tournament|league/i, title: 'Award of Excellence', kicker: 'In Recognition Of', body: 'For dedication, sportsmanship and the leadership that brought out the best in everyone around you.' },
  { re: /teacher|educator|professor|school/i, title: 'Educator Appreciation Award', kicker: 'With Gratitude', body: 'For inspiring curiosity, believing in every student and making a difference that lasts a lifetime.' },
  { re: /birthday|turning \d+/i, title: 'A Milestone Celebration', kicker: 'Celebrating', body: 'Here is to the stories, the laughter and the many good years still ahead.' },
  { re: /memor|in loving|tribute|honor of the late/i, title: 'In Loving Memory', kicker: 'A Tribute To', body: 'Remembered with love and gratitude for a life that touched so many.' },
  { re: /employee of the|outstanding|excellen|top performer|mvp/i, title: 'Award of Excellence', kicker: 'In Recognition Of', body: 'For outstanding performance, a positive attitude and results that set the standard for all of us.' },
  { re: /thank|appreciat/i, title: 'Certificate of Appreciation', kicker: 'With Sincere Thanks', body: 'For your generosity, your effort and the difference you make every day.' },
];

const STYLE_HINTS = [
  { re: /carpent|woodwork|construct|union|electric|plumb|weld|mechanic|iron ?work|mason|machin|trade|lineman|pipefit|millwright/i, lettering: 'workshop', layout: 'framed', head: '#3b2a1a', text: '#2b2118' },
  { re: /cowboy|ranch|rodeo|western|farm|horse|cattle/i, lettering: 'frontier', layout: 'scene', head: '#4a2c17', text: '#33231a' },
  { re: /graduat|diploma|universit|college|academ/i, lettering: 'diploma', layout: 'crest', head: '#1d2a4a', text: '#1f2430' },
  { re: /veteran|military|army|navy|marine|air force|police|fire|sheriff|honor guard/i, lettering: 'engraved', layout: 'crest', head: '#1c2b4b', text: '#1f2430' },
  { re: /wedding|anniversar|love|memor|garden|flower|nurse|caregiver/i, lettering: 'elegant', layout: 'framed', head: '#5a2a3a', text: '#2e2228' },
  { re: /tech|software|engineer|startup|sales|marketing|design/i, lettering: 'modern', layout: 'art-right', head: '#16324f', text: '#1e2a36' },
  { re: /kid|child|scout|camp|class|grade|student|reading/i, lettering: 'personal', layout: 'scene', head: '#1e4d6b', text: '#23313b' },
  { re: /fish|hunt|lake|outdoor|camp|hik|mountain|forest|cabin/i, lettering: 'workshop', layout: 'scene', head: '#24402c', text: '#22302a' },
];

export function localPlan({ idea = '', output = 'certificate', photo = false }) {
  // started from just a photo: a versatile, elegant frame that suits almost any subject
  const photoOnly = !idea.trim() && photo;
  if (photoOnly) idea = 'a heartfelt appreciation featuring a cherished photo';
  const occ = OCCASIONS.find((o) => o.re.test(idea)) || OCCASIONS[OCCASIONS.length - 1];
  const hint = STYLE_HINTS.find((h) => h.re.test(idea)) || { lettering: 'classic', layout: 'framed', head: '#2a2a3a', text: '#2b2b33' };
  const years = idea.match(/(\d{1,2})\s*(?:years?|yrs?)/i);
  const pyro = output === 'pyrography';
  const subject = idea.replace(/\s+/g, ' ').trim() || 'a general recognition award';
  return {
    projectTitle: photoOnly ? `${occ.title} – photo` : (occ.title + (subject ? ' – ' + subject.split(/[,.]/)[0] : '')).slice(0, 70),
    layout: hint.layout,
    artPrompt: `Decorative artwork celebrating ${subject}, using concrete, recognizable objects, tools and symbols from that person's work, interests and occasion`,
    lettering: hint.lettering,
    headColor: pyro ? '#1f1610' : hint.head,
    textColor: pyro ? '#1f1610' : hint.text,
    designNotes: 'Designed from your description with motifs placed so the lettering has clear space.',
    wording: {
      kicker: occ.kicker,
      title: years && /service/i.test(occ.title) ? `${years[1]} Years of Service` : occ.title,
      presented: 'Proudly presented to',
      name: '',
      body: occ.body,
      details: '',
      date: '',
      sig1Name: '',
      sig1Role: 'Presented by',
      sig2Name: '',
      sig2Role: '',
    },
  };
}
