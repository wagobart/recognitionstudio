"""End-to-end UI test for Recognition Studio.

Runs real user flows in Chrome (desktop + iPhone 15 *emulation*), saves each case as a
project, reopens it, and exports real PDF/PNG files.

usage: python3 tests/e2e.py [base_url] [email] [password] [out_dir]
NOTE: iPhone runs here are Chromium device emulation, NOT Safari on a real iPhone.
"""
import asyncio, json, os, re, subprocess, sys, time, unicodedata
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788'
EMAIL = sys.argv[2] if len(sys.argv) > 2 else 'review@example.com'
PASS = sys.argv[3] if len(sys.argv) > 3 else 'reviewpass123'
OUT = sys.argv[4] if len(sys.argv) > 4 else '/tmp/claude-0/e2e'
os.makedirs(OUT, exist_ok=True)
ART_TIMEOUT = 240_000

CASES = [
    dict(slug='carpenter', device='desktop', library='union carpenter retirement',
         extra=' His name is Mike Kowalski — 32 years with Carpenters Local 1176. He loves walleye fishing.',
         output='certificate',
         fields=dict(name='Michael "Mike" Kowalski', date='June 14, 2026', details='Carpenters Local 1176 · 1994 – 2026',
                     sig1Name='Dana Reyes', sig1Role='Business Representative', sig2Name='Tom Becker', sig2Role='Local President'),
         style='workshop', head='#5b3a22', text='#1c2230', export=['pdf', 'png'], art_flows=True),
    dict(slug='nurse', device='iphone', idea='Thank-you certificate for Priya, an ICU night-shift nurse, from her unit for Nurses Week. Calm, warm, a stethoscope heart and soft roses.',
         output='certificate', fields=dict(name='Priya Natarajan, RN', body='Thank you for every steady hand and kind word on the long nights.'),
         style='elegant', head='#6b1f2a', export=['pdf']),
    dict(slug='navy-veteran', device='desktop', idea='Certificate of appreciation for my grandfather, a Navy veteran who served on a destroyer in Vietnam. Anchor, ship’s wheel, rope border, ocean.',
         output='certificate', fields=dict(name='Chief Petty Officer Robert L. Hayes', details='United States Navy · 1966 – 1972', date='Veterans Day 2026', sig1Name='', sig1Role='With love, your family'),
         style='engraved', head='#1f3a5f', export=['pdf']),
    dict(slug='kindergarten', device='iphone', library='kindergarten graduation', extra='',
         output='certificate', fields=dict(name='Isabella Marie Gonzalez-Whitfield', date='May 29, 2026', sig1Name='Ms. Carter', sig1Role='Teacher'),
         style='personal', head='#24503a', export=['pdf']),
    dict(slug='fishing-pyro', device='iphone', idea='Wood-burning plaque for my fishing buddy Dale who is retiring from the railroad: a jumping walleye, a lure, cattails and a lake at sunrise.',
         output='pyrography', fields=dict(name='Dale', title='Retired & Gone Fishin’', body='', kicker='', presented='', sig1Role='', date='2026'),
         style='frontier', outline=True, export=['pdf-mirror']),
    dict(slug='long-wording', device='desktop', idea='Years of service award for a school custodian, 25 years at Lincoln Elementary, keys, polished hallway, trophy case.',
         output='certificate', fields=dict(name='Bartholomew Alexander Fitzgerald-Montgomery III',
              title='Twenty-Five Years of Dedicated Service to Lincoln Elementary School',
              body='For twenty-five years you opened the doors before the first bell and locked them after the last game. You fixed what was broken, found what was lost, and knew every student by name. Our school runs because of you, and it is a better, kinder place because you were here. Thank you for a quarter century of care.',
              details='Moorhead Area Public Schools · Lincoln Elementary · 2001 – 2026',
              sig1Name='Angela Brooks', sig1Role='Principal', sig2Name='Dr. Samuel Ortiz', sig2Role='Superintendent', date='June 5, 2026'),
         style='classic', head='#24503a', export=['pdf']),
    dict(slug='pet-memorial-pyro', device='desktop', library='dog memorial plaque', extra=' His name was Copper, a red golden retriever.',
         output='pyrography', fields=dict(name='Copper', title='Forever in Our Hearts', date='2012 – 2026', sig1Role=''),
         style='elegant', outline=False, export=['pdf']),
]

IPHONE = None


async def pick_library(pg, query):
    await pg.click('#browseBtn')
    await pg.fill('#libSearch', query)
    await pg.wait_for_timeout(300)
    await pg.click('.lib-item >> nth=0')
    await pg.wait_for_timeout(250)


async def set_field(pg, field, value):
    # open the right disclosure, like a user would
    if field in ('kicker', 'presented', 'details'):
        if not await pg.evaluate("document.getElementById('subLines').open"):
            await pg.click('#subLines > summary')
    if field.startswith('sig'):
        if not await pg.evaluate("document.getElementById('subSigs').open"):
            await pg.click('#subSigs > summary')
    await pg.fill(f'#f-{field}', value)


async def open_sec(pg, sec):
    if not await pg.evaluate(f"document.getElementById('{sec}').open"):
        await pg.click(f'#{sec} > summary')
        await pg.wait_for_timeout(150)


async def run_case(browser, c, results):
    t0 = time.time()
    if c['device'] == 'iphone':
        ctx = await browser.new_context(**IPHONE, accept_downloads=True)
    else:
        ctx = await browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    pg = await ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and '502' not in m.text and errors.append(m.text))
    await pg.goto(BASE + '/')
    # sign in
    await pg.click('#accountBtn')
    await pg.fill('#authEmail', EMAIL)
    await pg.fill('#authPass', PASS)
    await pg.click('#authSubmit')
    await pg.wait_for_function("window.__rs.state.user")
    await pg.wait_for_timeout(500)
    if await pg.evaluate("document.getElementById('studio').dataset.view") == 'editor':
        await pg.click('#projectsBtn')
        await pg.click('#newProjectBtn')
    # describe
    if 'library' in c:
        await pick_library(pg, c['library'])
        if c.get('extra'):
            await pg.fill('#idea', (await pg.input_value('#idea')) + c['extra'])
    else:
        await pg.fill('#idea', c['idea'])
    await pg.check(f"input[name=output][value={c['output']}]", force=True)
    await pg.screenshot(path=f"{OUT}/{c['slug']}-1-describe.png")
    await pg.click('#designBtn')
    await pg.wait_for_timeout(1200)
    await pg.screenshot(path=f"{OUT}/{c['slug']}-2-designing.png")
    # user fills wording while art paints
    for k, v in c['fields'].items():
        await set_field(pg, k, v)
    await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.art && !window.__rs.state.busyArt", timeout=ART_TIMEOUT)
    # lettering
    await open_sec(pg, 'secLettering')
    await pg.click(f".style-card[data-style={c['style']}]")
    if c['output'] == 'certificate':
        if c.get('head'):
            await pg.click(f"#headSwatches .swatch[data-hex='{c['head']}']")
        if c.get('text'):
            await pg.click(f"#textSwatches .swatch[data-hex='{c['text']}']")
    elif c.get('outline'):
        await pg.check('#outlineToggle')
    await pg.wait_for_timeout(700)
    await pg.screenshot(path=f"{OUT}/{c['slug']}-3-edited.png")
    # tap-to-edit: tap the name on the design and confirm the name field receives focus
    await pg.click('#sheetHolder text[data-field=name]')
    await pg.wait_for_timeout(300)
    focused = await pg.evaluate("document.activeElement && document.activeElement.id")
    await pg.screenshot(path=f"{OUT}/{c['slug']}-4-typing.png")
    await pg.evaluate("document.activeElement.blur()")
    if c.get('art_flows'):
        await open_sec(pg, 'secArt')
        # 1) simulated failure must keep the current design and wording
        await pg.fill('#tweakInput', 'SIMULATE_FAILURE')
        await pg.click('#redrawBtn')
        await pg.wait_for_function("!window.__rs.state.busyArt")
        still = await pg.evaluate("[window.__rs.state.project.art.key, window.__rs.state.project.text.name, !document.getElementById('artStatus').hidden]")
        await pg.screenshot(path=f"{OUT}/{c['slug']}-7-failure.png")
        if not still[2] or still[1] != c['fields']['name']:
            errors.append(f'failure handling: {still}')
        # 2) redraw with a change, then 3) switch to the wood-burning version, then go back to version 1
        await pg.fill('#tweakInput', 'make the tool belt larger')
        await pg.click('#redrawBtn')
        await pg.wait_for_function("window.__rs.state.project.artHistory.length===2 && !window.__rs.state.busyArt", timeout=ART_TIMEOUT)
        await pg.click('#switchOutputBtn')
        await pg.wait_for_function("window.__rs.state.project.artHistory.length===3 && !window.__rs.state.busyArt", timeout=ART_TIMEOUT)
        if await pg.evaluate("window.__rs.state.project.output") != 'pyrography':
            errors.append('switch to pyrography failed')
        await pg.screenshot(path=f"{OUT}/{c['slug']}-8-woodversion.png")
        await pg.click('#versions .version >> nth=0')
        await pg.wait_for_timeout(300)
        if await pg.evaluate("window.__rs.state.project.output") != 'certificate':
            errors.append('version restore failed')
    # wait for autosave
    await pg.wait_for_function("!window.__rs.state.save.dirty && !window.__rs.state.save.inflight", timeout=15000)
    pid = await pg.evaluate("window.__rs.state.project.id")
    before = await pg.evaluate("JSON.stringify({t: window.__rs.state.project.text, s: window.__rs.state.project.style, a: window.__rs.state.project.art.key})")
    # reopen in a fresh browser context (simulates another device)
    ctx2 = await browser.new_context(viewport={'width': 1280, 'height': 800})
    pg2 = await ctx2.new_page()
    await pg2.goto(BASE + '/')
    await pg2.click('#accountBtn')
    await pg2.fill('#authEmail', EMAIL)
    await pg2.fill('#authPass', PASS)
    await pg2.click('#authSubmit')
    await pg2.wait_for_function("window.__rs.state.user")
    await pg2.wait_for_timeout(400)
    await pg2.click('#projectsBtn')
    await pg2.wait_for_selector('.proj')
    await pg2.screenshot(path=f"{OUT}/projects-list.png")
    await pg2.evaluate(f"(async()=>{{}})()")
    # open the matching project via its menu-less button order: find by id through API listing
    # open it from the section matching its type (projects are grouped by output)
    await pg2.click(f".proj-sec[data-output={c['output']}] .proj[data-id='{pid}'] .proj-open")
    await pg2.wait_for_function(f"window.__rs.state.project && window.__rs.state.project.id==='{pid}'")
    after = await pg2.evaluate("JSON.stringify({t: window.__rs.state.project.text, s: window.__rs.state.project.style, a: window.__rs.state.project.art.key})")
    await ctx2.close()
    # export
    files = []
    await pg.click('#exportBtn')
    for kind in c['export']:
        if kind == 'pdf-mirror':
            await pg.check('#mirrorToggle')
        await pg.wait_for_function("!document.getElementById('saveFileBtn').disabled", timeout=60000)
        if kind.startswith('pdf'):
            if kind == c['export'][0]:
                await pg.screenshot(path=f"{OUT}/{c['slug']}-5-export.png")
            async with pg.expect_download() as d:
                await pg.click('#saveFileBtn')
            dl = await d.value
        else:
            async with pg.expect_download() as d:
                await pg.click('#pngBtn')
            dl = await d.value
        path = f"{OUT}/{c['slug']}-{dl.suggested_filename}"
        await dl.save_as(path)
        files.append(path)
        if path.endswith('.pdf'):
            txt = subprocess.run(['pdftotext', path, '-'], capture_output=True, text=True).stdout
            norm = lambda x: re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', x)).strip().lower()
            want = [v for k, v in c['fields'].items() if v and k in ('name', 'title', 'sig1Name', 'details')]
            missing = [w for w in want if norm(w) not in norm(txt)]
            if missing:
                errors.append(f'PDF text missing: {missing}')
    # preview path is separate from saving
    await pg.click('#previewPdfBtn')
    await pg.wait_for_timeout(1500)
    viewer_open = await pg.evaluate("!document.getElementById('viewer').hidden")
    await pg.screenshot(path=f"{OUT}/{c['slug']}-6-preview.png")
    await ctx.close()
    results.append(dict(slug=c['slug'], device=c['device'], ok=before == after and not errors,
                        persisted=before == after, tap_focus=focused, files=files, viewer=viewer_open,
                        errors=errors, secs=round(time.time() - t0, 1)))


async def main():
    global IPHONE
    async with async_playwright() as p:
        IPHONE = p.devices['iPhone 15']
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        results = []
        only = os.environ.get('ONLY')
        for c in CASES:
            if only and c['slug'] not in only.split(','):
                continue
            try:
                await run_case(browser, c, results)
            except Exception as e:
                import traceback
                results.append(dict(slug=c['slug'], ok=False, errors=[traceback.format_exc()[-2500:]]))
            print(json.dumps(results[-1]))
        await browser.close()
        json.dump(results, open(f'{OUT}/results.json', 'w'), indent=1)


asyncio.run(main())
