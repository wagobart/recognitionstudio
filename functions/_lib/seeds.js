// Artwork the site owner adds to the public gallery from the repo (public/gallery-seed/*).
// The first gallery request after a deploy copies any missing ones into R2 (owner's folder) and
// lists them — idempotent, so adding a file + an entry here is all it takes. Zones are the
// measured empty lettering area in the 1500×1000 design space. Landscape (3:2) images only.
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
];
