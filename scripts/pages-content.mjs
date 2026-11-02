// Hand-written copy for the public idea pages (built by scripts/build-pages.mjs).
// Each page: unique intro + a selection of library ideas + FAQ. Keep every claim true to what the app does.
// `ideas(all)` returns the library ideas for the page; `make` = 'pattern' starts the app on wood-burning.

const by = (f) => (all) => all.filter(f);
const has = (x, ...words) => words.some((w) => (x.t + ' ' + x.p).toLowerCase().includes(w));
const MEMORIAL_PET = (x) => x.c === 'Memorial & Tribute' && has(x, 'pet', 'dog', 'cat', 'horse');

// shared FAQ answers (each page adds its own on top)
export const FAQ_COMMON = [
  {
    q: 'Do I need design skills?',
    a: 'No. Describe the person and the occasion in your own words, or start from one of the ideas on this page. The AI paints artwork made for them and lays out the page; you type the exact wording and pick lettering and colors. Every change shows on the design as you make it.',
  },
  {
    q: 'Can I fix the wording after the artwork is made?',
    a: 'Yes, as often as you like. The words are set in real fonts on top of the artwork, so changing a name, a date, the wording, the lettering style or the colors never redraws the artwork.',
  },
  {
    q: 'How do I print it?',
    a: 'Export a print-ready PDF sized for US Letter, A4 or 11×17. On an iPhone you can save it to Files, print it or mail it straight from the share sheet.',
  },
];

export const PAGES = [
  // ---------- high-intent topics ----------
  {
    slug: 'veterans-day-certificate',
    title: 'Veterans Day Certificates & Tribute Patterns | Crafted In Honor',
    h1: 'Veterans Day certificates and tributes',
    description: 'Design a personal Veterans Day certificate or wood-burning tribute for a veteran — artwork for their branch and service, your exact wording, print-ready PDF.',
    nav: 'Veterans Day',
    intro: [
      'A thank-you that carries their branch, their years and their name means more than a store-bought card. Describe the veteran — Army, Navy, Marine Corps, Air Force, Coast Guard, National Guard or Space Force, when they served, what they did — and Crafted In Honor paints artwork for that service, with a clear space for your words.',
      'Make it a full-color certificate to frame, or a graphite drawing to burn into wood as a lasting plaque. Add a photo of them in uniform if you have one.',
    ],
    images: 'veterans',
    ideas: by((x) => x.c === 'Military & Veterans' && (x.o === 'Honor' || x.o === 'Appreciation') || (x.c === 'Memorial & Tribute' && has(x, 'veteran')) || x.t === 'Veteran honor plaque'),
    faq: [
      { q: 'Can I add their photo?', a: 'Yes. Add a photo and choose how it appears: the exact photo in color, the exact photo as a pencil-style drawing (good for wood-burning), or soft-edged in a circle or oval beside the words.' },
      { q: 'Can I include rank, unit and years of service?', a: 'Yes. The form has a line for details such as rank, unit, branch and years, plus up to two signature lines and a date.' },
    ],
  },
  {
    slug: 'military-retirement-certificate',
    title: 'Military Retirement & Promotion Certificates | Crafted In Honor',
    h1: 'Military retirement and promotion certificates',
    description: 'Personal certificates for a military retirement, promotion or a thank-you to a military family — artwork for the branch, your wording, ready to print.',
    nav: 'Military retirement',
    intro: [
      'A career in uniform deserves more than a template with a blank line. Tell us who is retiring or being promoted and what their service looked like, and the artwork is painted for that branch and that person.',
      'There are ideas here for every branch, and for thanking the families who served alongside them.',
    ],
    images: 'veterans',
    ideas: by((x) => x.c === 'Military & Veterans' && ['Retirement', 'Completion & Certification', 'Family'].includes(x.o)),
    faq: [{ q: 'Can two people sign it?', a: 'Yes. Each certificate has up to two signature lines with names and titles, and a date. Leave a name off to get a blank line to sign by hand.' }],
  },
  {
    slug: 'retirement-certificate',
    title: 'Personalized Retirement Certificates & Plaques | Crafted In Honor',
    h1: 'Personalized retirement certificates',
    description: 'A one-of-a-kind retirement certificate or wood-burned plaque with artwork from their career — a carpenter’s tool belt, a nurse’s stethoscope, a lineman’s gear.',
    nav: 'Retirement',
    intro: [
      'The best retirement gifts look like the career they honor. A union carpenter’s certificate with his leather tool belt in the border. A railroader’s with the trestle he crossed for thirty years. Describe the person and their work, and the artwork is painted around it.',
      'Then type the wording yourself — their name, years of service, a line from the crew — and print it, or turn the same design into a pattern to burn into wood.',
    ],
    ideas: by((x) => x.o === 'Retirement'),
    limit: 30,
    faq: [{ q: 'What if their job isn’t listed?', a: 'Just describe it. The ideas are starting points; the AI designs from whatever you write, so “retiring after 31 years as a grain elevator operator who loves walleye fishing” works just as well.' }],
  },
  {
    slug: 'certificate-of-appreciation',
    title: 'Custom Certificates of Appreciation | Crafted In Honor',
    h1: 'Certificates of appreciation',
    description: 'Say thank you with a certificate of appreciation designed for the person — a volunteer, coworker, coach, nurse or neighbor — with your own wording.',
    nav: 'Appreciation',
    intro: [
      'A thank-you lands best when it’s clearly about them. Describe who you’re thanking and what they did, and you get artwork drawn from their work or their passion instead of generic gold swirls.',
      'Short and sweet or a full paragraph — you choose the words, and the layout adjusts to fit.',
    ],
    ideas: by((x) => x.o === 'Appreciation'),
    limit: 30,
    faq: [],
  },
  {
    slug: 'years-of-service-award',
    title: 'Years of Service Awards & Certificates | Crafted In Honor',
    h1: 'Years of service awards',
    description: 'Mark 5, 10, 25 or 40 years with a service award designed for the job they do — personalized wording, printable certificate or wood-burned plaque.',
    nav: 'Years of service',
    intro: [
      'Ten years on the line crew, twenty-five at the front desk, forty in the classroom. A service anniversary is a good moment to show you noticed. Describe the person and the milestone and the artwork reflects their work.',
      'Use it for one person or make a set — open a design, change the name and years, and export again. Text changes never use up an AI design.',
    ],
    ideas: by((x) => x.o === 'Years of Service'),
    limit: 30,
    faq: [],
  },
  {
    slug: 'memorial-tribute',
    title: 'Memorial Tributes & In Loving Memory Keepsakes | Crafted In Honor',
    h1: 'Memorial tributes and keepsakes',
    description: 'Create an in-loving-memory tribute or celebration-of-life keepsake with artwork from the life they lived — printable, or as a pattern to burn into wood.',
    nav: 'Memorial',
    intro: [
      'A memorial keepsake can hold the things that made someone who they were — the lake they fished, the garden they kept, the fire hall they served. Describe them and the artwork is gentle and personal, with room for their name, dates and a few words.',
      'Many families make a framed print for the service and a wood-burned plaque to keep.',
    ],
    ideas: by((x) => x.c === 'Memorial & Tribute' && !MEMORIAL_PET(x) || x.t === 'Memorial wood plaque'),
    faq: [{ q: 'Can I use a photo of them?', a: 'Yes. The exact photo can sit beside the words — in color, or as a pencil-style drawing that suits a wood-burned plaque.' }],
  },
  {
    slug: 'pet-memorial',
    title: 'Pet Memorial Keepsakes & Wood-Burning Patterns | Crafted In Honor',
    h1: 'Pet memorial keepsakes',
    description: 'Remember a dog, cat or horse with a memorial keepsake made for them — add their photo, their name and a few words; print it or burn it into wood.',
    nav: 'Pet memorial',
    intro: [
      'Losing a pet is losing family. Describe them — the breed, the favorite spot by the stove, the ball they never gave back — and add a photo if you’d like their exact face on it.',
      'Print it to frame, or make it a pattern and burn it into a small plaque for the shelf where their collar hangs.',
    ],
    ideas: by((x) => MEMORIAL_PET(x) || ['Pet memorial plaque', 'Hunting dog honor plaque', 'Horse lover plaque'].includes(x.t)),
    faq: [{ q: 'Will it look like my pet?', a: 'For an exact likeness, add a photo: it is placed on the design as-is, in color or as a pencil-style drawing. The AI artwork around it is decorative.' }],
  },
  {
    slug: 'wood-burning-patterns',
    title: 'Custom Wood-Burning Patterns for Plaques & Gifts | Crafted In Honor',
    h1: 'Custom wood-burning patterns',
    description: 'Design a personalized pyrography pattern — lifelike graphite artwork with crisp lettering, plus a mirrored transfer page for tracing onto wood.',
    nav: 'Wood-burning patterns',
    make: 'pattern',
    intro: [
      'Choose “Wood-burning pattern” and the artwork comes out as a lifelike graphite drawing with tonal shading, ready to transfer and burn. The lettering is set in real fonts, so the name and dates are crisp and spelled exactly right.',
      'The PDF can include a mirrored second page for heat or graphite transfer. Any certificate you make can be turned into a matching pattern with the same artwork, at no extra cost.',
    ],
    images: 'veterans',
    ideas: by((x) => x.c === 'Wood-Burning Showpieces'),
    faq: [
      { q: 'What paper sizes can I print?', a: 'US Letter, A4 or 11×17, with the artwork fitted to the page. Add the mirrored transfer page if you transfer by heat or trace from the back.' },
      { q: 'Can I outline the letters?', a: 'Yes. Outline lettering gives you clean edges to burn and fill.' },
    ],
  },
  // ---------- by who they are ----------
  {
    slug: 'trades-and-union-awards',
    title: 'Awards for Union Trades, Carpenters, Electricians & Linemen | Crafted In Honor',
    h1: 'Awards for the trades',
    description: 'Retirement, years-of-service and thank-you certificates for carpenters, electricians, plumbers, welders, linemen and every union trade — with their tools in the artwork.',
    nav: 'Trades & union',
    intro: [
      'Tradespeople spend a career with their hands on the work, and the artwork should show it: the tool belt, the lineman’s climbing gear, the welding hood, the level and the plumb bob. These ideas cover the building trades and the union brotherhood.',
      'Union hall, contractor or crew — add the local number, years of service and a signature from the business manager or foreman.',
    ],
    ideas: by((x) => x.c === 'Trades & Construction'),
    limit: 36,
    faq: [],
  },
  {
    slug: 'teacher-appreciation',
    title: 'Teacher Appreciation & Retirement Certificates | Crafted In Honor',
    h1: 'Teacher appreciation and retirement',
    description: 'Thank a teacher, principal or school staff member with a personal certificate — for Teacher Appreciation Week, a retirement or years of service.',
    nav: 'Teachers',
    intro: [
      'From the kindergarten teacher who learned every name on day one to the band director who ran the same fight song for thirty years, describe who they are and what they teach, and the artwork follows.',
      'Great for Teacher Appreciation Week, end-of-year thank-yous, and retirements.',
    ],
    ideas: by((x) => x.c === 'Education'),
    limit: 30,
    faq: [],
  },
  {
    slug: 'nurse-appreciation',
    title: 'Nurse & Healthcare Appreciation Certificates | Crafted In Honor',
    h1: 'Nurse and healthcare appreciation',
    description: 'Certificates for nurses, doctors, techs and caregivers — Nurses Week, retirements, years of service and thank-yous, designed for their specialty.',
    nav: 'Nurses & healthcare',
    intro: [
      'Healthcare work is personal, and recognition should be too. Describe the person and their work — the nursing floor, the lab, the pharmacy, hospice care — and the artwork is drawn from that world.',
      'Use them for Nurses Week, Hospital Week, retirements and service milestones.',
    ],
    ideas: by((x) => x.c === 'Healthcare'),
    limit: 30,
    faq: [],
  },
  {
    slug: 'first-responder-awards',
    title: 'Firefighter, Police & EMS Awards and Certificates | Crafted In Honor',
    h1: 'Awards for first responders',
    description: 'Retirement, service and appreciation certificates for firefighters, police officers, EMTs, dispatchers and public servants — artwork from the job they do.',
    nav: 'First responders',
    intro: [
      'Firefighters, officers, paramedics, dispatchers and the people who keep a town running. Describe the department and the person, and the artwork carries their gear and their station instead of stock clip art.',
      'Add the department name, badge or unit number and years of service in the details line.',
    ],
    ideas: by((x) => x.c === 'Public Service'),
    limit: 30,
    faq: [],
  },
  {
    slug: 'coach-appreciation',
    title: 'Coach Appreciation & Sports Award Certificates | Crafted In Honor',
    h1: 'Coach appreciation and sports awards',
    description: 'Thank a coach or celebrate a player — MVP, most improved, senior night and team spirit awards designed for the sport.',
    nav: 'Coaches & sports',
    intro: [
      'Season-end awards are better when every player’s certificate looks like their sport. Describe the team, the sport and the award — MVP, most improved, senior night, coach appreciation — and the artwork follows.',
      'Make one, then change the name and award line for each player. Text changes are free.',
    ],
    ideas: by((x) => x.c === 'Sports & Coaching'),
    limit: 36,
    faq: [],
  },
  {
    slug: 'employee-recognition',
    title: 'Employee Recognition Certificates & Awards | Crafted In Honor',
    h1: 'Employee recognition certificates',
    description: 'Safety, excellence, years-of-service and retirement awards designed for the job — office, restaurants, salons, trucking, airlines and more.',
    nav: 'Employee recognition',
    intro: [
      'Recognition that looks like the work gets kept. Describe the role — truck driver, restaurant chef, hair stylist, accountant, airline pilot — and the award, and the design is built for them.',
      'Add your company name in the wording and signatures from a manager or owner.',
    ],
    ideas: by((x) => ['Business & Office', 'Hospitality', 'Transportation'].includes(x.c)),
    limit: 36,
    faq: [],
  },
  {
    slug: 'school-awards',
    title: 'School & Student Award Certificates | Crafted In Honor',
    h1: 'School and student awards',
    description: 'Student certificates for graduations, honor roll, scouts, science fairs and more — designed for the achievement, with your own wording.',
    nav: 'School & kids',
    intro: [
      'Kindergarten graduation, a science-fair ribbon, an Eagle Scout, a spelling-bee champion. Describe the child and the achievement and the artwork is made for it.',
      'Long names fit — the lettering shrinks to keep everything on the page.',
    ],
    ideas: by((x) => x.c === 'School & Youth'),
    faq: [],
  },
  {
    slug: 'birthday-and-anniversary',
    title: 'Birthday, Anniversary & Family Milestone Keepsakes | Crafted In Honor',
    h1: 'Birthdays, anniversaries and family milestones',
    description: 'A keepsake for a 90th birthday, a 50th anniversary or a new grandparent — artwork from their life together, your own words, framed or burned in wood.',
    nav: 'Family milestones',
    intro: [
      'For the big birthdays and anniversaries, a keepsake that tells their story: the farm, the lake cabin, the life they built together. Describe them and the milestone.',
      'Add a favorite photo and make one as a framed print and one as a wood-burned plaque.',
    ],
    ideas: by((x) => x.c === 'Family & Milestones'),
    faq: [],
  },
  {
    slug: 'church-and-community',
    title: 'Church, Volunteer & Community Recognition | Crafted In Honor',
    h1: 'Church, volunteer and community recognition',
    description: 'Certificates for pastors, volunteers, choir members, Legion and VFW posts, and community leaders — designed for the service they give.',
    nav: 'Church & community',
    intro: [
      'The church volunteers who never miss a Sunday, the VFW or Legion post, the pastor celebrating years of service. Describe the person and how they serve.',
      'Add the congregation or organization in the wording and a signature from the board or council.',
    ],
    ideas: by((x) => x.c === 'Faith & Community'),
    faq: [],
  },
  {
    slug: 'funny-awards',
    title: 'Funny Award Certificates for Friends & Coworkers | Crafted In Honor',
    h1: 'Funny awards',
    description: 'Lighthearted award certificates — grill master, coffee pot hero, dad joke champion, “the boss of nothing” retirement — with artwork that’s in on the joke.',
    nav: 'Funny awards',
    intro: [
      'Not every award has to be solemn. Describe the inside joke and the person, and the artwork plays along. Office parties, family reunions and fishing trips all have someone who deserves one.',
    ],
    ideas: by((x) => x.c === 'Fun & Lighthearted'),
    faq: [],
  },
  {
    slug: 'farm-and-outdoors',
    title: 'Farm, Ranch, Hunting & Outdoor Awards | Crafted In Honor',
    h1: 'Farm, ranch and outdoor awards',
    description: 'Keepsakes for farmers, ranchers, beekeepers, foresters and fishermen — retirements, service and outdoor awards with artwork from the land.',
    nav: 'Farm & outdoors',
    intro: [
      'A farm family’s heritage, a last harvest before retirement, a hunting camp’s honor board. Describe the place and the person and the artwork comes from their land, their equipment and their seasons.',
      'These make especially good wood-burning patterns.',
    ],
    ideas: by((x) => x.c === 'Agriculture & Outdoors'),
    faq: [],
  },
  {
    slug: 'hobby-and-club-awards',
    title: 'Club & Hobby Award Certificates | Crafted In Honor',
    h1: 'Club and hobby awards',
    description: 'Award certificates for bowling and golf leagues, barbecue cook-offs, choirs and every hobby — champions, birthdays, lifetime achievement.',
    nav: 'Clubs & hobbies',
    intro: [
      'The bowling league champion, the golf league’s lifetime achievement, the barbecue cook-off winner. Describe the hobby and the honor, and the artwork is drawn from that hobby — not a generic trophy.',
    ],
    ideas: by((x) => x.c === 'Hobbies & Interests'),
    limit: 36,
    faq: [],
  },
  {
    slug: 'arts-and-music-awards',
    title: 'Music, Theater & Arts Award Certificates | Crafted In Honor',
    h1: 'Music, theater and arts awards',
    description: 'Recognition for musicians, church organists, theater directors, photographers, quilters and woodturners — retirements, service and excellence.',
    nav: 'Arts & music',
    intro: [
      'From a church organist’s fortieth Easter to a theater director’s last curtain call, describe the art form and the moment and the artwork is drawn from it.',
    ],
    ideas: by((x) => x.c === 'Arts & Media'),
    faq: [],
  },
];
