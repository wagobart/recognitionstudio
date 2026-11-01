// Artwork the site owner adds to the public gallery from the repo (public/gallery-seed/*).
// The first gallery request after a deploy copies any missing ones into R2 (owner's folder) and
// lists them — idempotent, so adding a file + an entry here is all it takes. Zones are the
// measured empty lettering area in the design space: 1500×1000 for landscape (3:2) images,
// 1000×1500 for portrait (2:3) ones (orient: 'portrait').
export const GALLERY_SEEDS = [
  {
    id: 'g_vdayeaglelake', file: 'vday-eagle-over-lake.jpg', output: 'pyrography', layout: 'crest',
    zone: { x: 80, y: 612, w: 1340, h: 228 },
    title: 'For Love of Country — eagle over the lake',
    idea: 'Veterans Day wood-burning pattern for a veteran. The artwork already reads "For Love of Country" at the top and "With Gratitude for Your Service" at the bottom, so the wording only needs their name, branch and years of service.',
  },
  {
    id: 'g_vdayeaglehonor', file: 'vday-eagle-lifetime-of-honor.jpg', output: 'pyrography', layout: 'art-left',
    zone: { x: 655, y: 205, w: 670, h: 600 },
    title: 'A Lifetime of Honor — bald eagle',
    idea: 'Veterans Day wood-burning pattern for a veteran. The artwork already reads "A Lifetime of Honor" and "Thank You for Your Service", so the wording only needs their name, branch and years of service.',
  },
  {
    id: 'g_vdayfoldedflag', file: 'vday-folded-flag.jpg', output: 'pyrography', layout: 'crest',
    zone: { x: 165, y: 465, w: 1170, h: 270 },
    title: 'With Honor & Gratitude — folded flag',
    idea: 'Veterans Day wood-burning pattern honoring a veteran. The artwork already reads "With Honor & Gratitude" and "Thank You for Your Service", so the wording only needs their name, branch and years of service.',
  },
  {
    id: 'g_vdayfoldedflagtall', file: 'vday-folded-flag-tall.jpg', output: 'pyrography', layout: 'crest', orient: 'portrait',
    zone: { x: 100, y: 680, w: 800, h: 480 },
    title: 'With Honor & Gratitude — folded flag (tall)',
    idea: 'Veterans Day wood-burning pattern honoring a veteran, on a tall page. The artwork already reads "With Honor & Gratitude" and "Thank You for Your Service", so the wording only needs their name, branch and years of service.',
  },
  {
    id: 'g_vdaybootscall', file: 'vday-boots-answered-the-call.jpg', output: 'pyrography', layout: 'crest', orient: 'portrait',
    zone: { x: 180, y: 690, w: 640, h: 400 },
    title: 'You Answered the Call — combat boots (tall)',
    idea: 'Veterans Day wood-burning pattern honoring a veteran, on a tall page. The artwork already reads "You Answered the Call" and "Our Nation Thanks You for Your Service", so the wording only needs their name, branch and years of service.',
  },
  {
    id: 'g_vdayeaglecountrytall', file: 'vday-eagle-love-of-country-tall.jpg', output: 'pyrography', layout: 'crest', orient: 'portrait',
    zone: { x: 165, y: 710, w: 670, h: 500 },
    title: 'For Love of Country — eagle over the lake (tall)',
    idea: 'Veterans Day wood-burning pattern honoring a veteran, on a tall page. The artwork already reads "For Love of Country" and "With Gratitude for Your Service", so the wording only needs their name, branch and years of service.',
  },
];
