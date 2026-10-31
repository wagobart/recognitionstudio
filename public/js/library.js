// Idea library: search + quick filters over the prebuilt prompt collection.
let data = null;
let loading = null;

export const CHIPS = [
  { label: 'All', test: () => true },
  { label: 'Retirement', test: (x) => x.o === 'Retirement' },
  { label: 'Years of service', test: (x) => x.o === 'Years of Service' },
  { label: 'Thank you', test: (x) => x.o === 'Appreciation' },
  { label: 'Excellence', test: (x) => x.o === 'Excellence' || x.o === 'MVP' },
  { label: 'Trades', test: (x) => x.c === 'Trades & Construction' },
  { label: 'Healthcare', test: (x) => x.c === 'Healthcare' },
  { label: 'Teachers', test: (x) => x.c === 'Education' },
  { label: 'Military & veterans', test: (x) => x.c === 'Military & Veterans' },
  { label: 'First responders', test: (x) => x.c === 'Public Service' },
  { label: 'Sports & coaching', test: (x) => x.c === 'Sports & Coaching' },
  { label: 'Hobbies', test: (x) => x.c === 'Hobbies & Interests' },
  { label: 'School & kids', test: (x) => x.c === 'School & Youth' },
  { label: 'Family & birthdays', test: (x) => x.c === 'Family & Milestones' },
  { label: 'Community & faith', test: (x) => x.c === 'Faith & Community' },
  { label: 'Fun awards', test: (x) => x.c === 'Fun & Lighthearted' },
  { label: 'Memorial', test: (x) => x.c === 'Memorial & Tribute' },
  { label: 'Wood-burning', test: (x) => x.c === 'Wood-Burning Showpieces' },
  { label: 'Business & office', test: (x) => x.c === 'Business & Office' || x.c === 'Hospitality' || x.c === 'Transportation' },
  { label: 'Farm & outdoors', test: (x) => x.c === 'Agriculture & Outdoors' },
  { label: 'Arts & music', test: (x) => x.c === 'Arts & Media' },
];

export function loadLibrary() {
  if (data) return Promise.resolve(data);
  if (!loading)
    loading = fetch('/data/prompts.json')
      .then((r) => r.json())
      .then((d) => {
        data = d.map((x) => ({ ...x, _s: (x.t + ' ' + x.p + ' ' + x.k + ' ' + x.c + ' ' + x.o).toLowerCase() }));
        return data;
      });
  return loading;
}

export function searchLibrary(q, chipIndex = 0) {
  if (!data) return [];
  const chip = CHIPS[chipIndex] || CHIPS[0];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean).map((t) => t.replace(/s$/, ''));
  const res = [];
  for (const x of data) {
    if (!chip.test(x)) continue;
    if (terms.length && !terms.every((t) => x._s.includes(t))) continue;
    res.push(x);
  }
  if (terms.length) {
    // titles that match rank first
    res.sort((a, b) => terms.filter((t) => b.t.toLowerCase().includes(t)).length - terms.filter((t) => a.t.toLowerCase().includes(t)).length);
  }
  return res;
}
