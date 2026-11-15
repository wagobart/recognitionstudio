"""AI-designed border for photo + words designs (test mode, added 2026-11-14).

Desktop: start screen photo + "No artwork" → Border: AI-designed → one /api/art call with layout
'border'; photo and lettering stay inside the measured open area; Artwork → Border seg switches
Simple / None (free, AI border kept under versions) and back to AI (reused, free); a new design
started with a Simple border asks "What should the border feature?" and sends that theme; the
wood-burning version of an AI border costs nothing; reopen keeps it; PDF has the name.
iPhone 15 emulation: wood-burning design started with an AI border, no sideways scroll.

usage: python3 tests/e2e_ai_border.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time, subprocess
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-aiborder').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
FIX = os.path.join(HERE, 'fixtures') + '/'
LV = None

INSIDE = """async () => {
  const s = [...document.scripts].map(x=>x.src).find(x=>x.includes('app.js')) || '';
  const v = (s.match(/v=(\\d+)/)||[])[1];
  const m = await import('/js/layout.js?v=' + v);
  const p = window.__rs.state.project;
  const L = m.computeLayout(p);
  const z = p.art ? (p.art.zone || m.zonesFor(m.orientOf(p)).border) : null;
  const inBox = (b) => !!(z && b && b.x >= z.x - 2 && b.y >= z.y - 2 && b.x + b.w <= z.x + z.w + 2 && b.y + b.h <= z.y + z.h + 2);
  return { photoInside: inBox(L.photo), letteringInside: inBox(L.zone), zone: z };
}"""

async def signup(pg, email):
    await pg.goto(B)
    await pg.click('#accountBtn'); await pg.fill('#authEmail', email); await pg.fill('#authPass', 'borderpass1')
    await pg.click('#authSeg button[data-mode=signup]'); await pg.click('#authSubmit')
    await pg.wait_for_function('window.__rs.state.user')

async def idle(pg, t=60000):
    await pg.wait_for_function("window.__rs.state.project && !window.__rs.state.busyArt && document.getElementById('stageOverlay').hidden", timeout=t)
    await pg.wait_for_timeout(700)

async def saved(pg):
    await pg.wait_for_function("!window.__rs.state.save.dirty && !window.__rs.state.save.inflight", timeout=20000)

def seg(pg):
    return pg.evaluate("[...document.querySelectorAll('#borderSeg button')].filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.dataset.border).join()")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        res = {}
        # ---------------- desktop ----------------
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        arts = []
        async def on_resp(r):
            if r.url.endswith('/api/art') and r.request.method == 'POST':
                try: arts.append({'req': json.loads(r.request.post_data or '{}'), 'art': (await r.json()).get('art', {})})
                except Exception as e: arts.append({'err': str(e)})
        pg.on('response', lambda r: asyncio.ensure_future(on_resp(r)))
        await signup(pg, f'aib{int(time.time())}@example.com')
        d = {}
        await pg.fill('#idea', 'In loving memory of Ruger, our German Shepherd, 2014-2025')
        await pg.set_input_files('#startPhotoInput', FIX + 'pet-cat.jpg')
        await pg.wait_for_selector('#noArtRow:not([hidden])')
        d['border_row_hidden_before_check'] = await pg.evaluate("document.getElementById('startBorderRow').hidden")
        await pg.check('#noArtToggle', force=True)
        await pg.check('input[name=startBorder][value=ai]', force=True)
        d['start_hint'] = await pg.text_content('#startBorderHint')
        await pg.screenshot(path=O + 'desk-0-start.png')
        await pg.click('#designBtn')
        await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.art", timeout=60000)
        await idle(pg)
        await pg.fill('#f-name', 'Ruger'); await pg.evaluate("document.activeElement.blur()")
        await pg.evaluate("['secWording','secPhoto','secLettering'].forEach(i=>document.getElementById(i).open=false); document.getElementById('secArt').open=true")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=O + 'desk-1-ai-border.png')
        st = await pg.evaluate("(()=>{const p=window.__rs.state.project;return [p.art.layout,p.plainBg,p.photo.size,p.artHistory.length,document.getElementById('artSummary').textContent]})()")
        d['after_design'] = st
        d['seg_after_design'] = await seg(pg)
        d['fit'] = await pg.evaluate(INSIDE)
        d['first_call'] = {'layout': arts[0]['req'].get('layout'), 'has_theme_key': 'borderTheme' in arts[0]['req'], 'prompt_border': 'ONLY a decorative border band' in arts[0]['art'].get('prompt', '')} if arts else None
        d['full_art_controls_hidden'] = await pg.evaluate("[document.getElementById('designNotes').hidden, document.getElementById('artPromptInput').closest('details').hidden, document.getElementById('noArtBtn').hidden, document.getElementById('washRow').hidden]")
        # Simple → None → AI (reused, free)
        n0 = len(arts)
        await pg.click('#borderSeg button[data-border=simple]'); await pg.wait_for_timeout(400)
        d['simple'] = await pg.evaluate("(()=>{const p=window.__rs.state.project;return [!!p.art,p.plainBg,p.style.border!==false,p.artHistory.length]})()") + [await seg(pg)]
        await pg.screenshot(path=O + 'desk-2-simple.png')
        await pg.click('#borderSeg button[data-border=none]'); await pg.wait_for_timeout(400)
        d['none'] = await pg.evaluate("(()=>{const p=window.__rs.state.project;return [!!p.art,p.plainBg,p.style.border!==false]})()") + [await seg(pg)]
        await pg.click('#borderSeg button[data-border=ai]'); await pg.wait_for_timeout(600)
        d['ai_again'] = await pg.evaluate("(()=>{const p=window.__rs.state.project;return [p.art&&p.art.layout,p.plainBg,document.getElementById('aiBorderBox').hidden]})()") + [await seg(pg)]
        d['calls_for_switching'] = len(arts) - n0
        # wood-burning version of the AI border: free
        n0 = len(arts)
        await pg.click('#switchOutputBtn'); await idle(pg)
        d['wood'] = await pg.evaluate("(()=>{const p=window.__rs.state.project;return [p.output,p.art.layout,!!p.art.derivedFrom]})()") + [await seg(pg), len(arts) - n0]
        await pg.screenshot(path=O + 'desk-3-wood.png')
        await pg.click('#switchOutputBtn'); await idle(pg)
        pid = await pg.evaluate("window.__rs.state.project.id")
        await saved(pg)
        # PDF
        await pg.click('#exportBtn')
        await pg.wait_for_function("!document.getElementById('saveFileBtn').disabled", timeout=60000)
        async with pg.expect_download() as dl: await pg.click('#saveFileBtn')
        pdf = O + 'desk.pdf'; await (await dl.value).save_as(pdf)
        d['pdf_has_name'] = 'Ruger' in subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout
        subprocess.run(['pdftoppm', '-r', '40', '-png', '-singlefile', pdf, O + 'desk-pdf'])
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # reopen
        await pg.click('#navHomeBtn'); await pg.wait_for_timeout(500)
        await pg.click('#projectsBtn'); await pg.wait_for_selector(f'.proj[data-id="{pid}"]')
        await pg.click(f'.proj[data-id="{pid}"] .proj-open')
        await pg.wait_for_function("window.__rs.state.project && document.getElementById('studio').dataset.view==='editor'")
        await pg.wait_for_timeout(700)
        d['reopened'] = await pg.evaluate("[window.__rs.state.project.art.layout, window.__rs.state.project.output]")

        # a design started with a Simple border, then "AI-designed" asks what to feature
        await pg.click('#navHomeBtn'); await pg.wait_for_timeout(500)
        await pg.fill('#idea', 'Thank you to Coach Dana for 20 seasons of girls basketball')
        await pg.set_input_files('#startPhotoInput', FIX + 'portrait-astronaut.jpg')
        await pg.wait_for_selector('#noArtRow:not([hidden])')
        await pg.check('#noArtToggle', force=True)
        d['default_border'] = await pg.evaluate("document.querySelector('input[name=startBorder]:checked').value")
        n0 = len(arts)
        await pg.click('#designBtn'); await idle(pg)
        d['simple_start'] = await pg.evaluate("(()=>{const p=window.__rs.state.project;return [!!p.art,p.plainBg,p.style.border!==false]})()") + [len(arts) - n0]
        await pg.evaluate("['secWording','secPhoto','secLettering'].forEach(i=>document.getElementById(i).open=false); document.getElementById('secArt').open=true")
        await pg.click('#borderSeg button[data-border=ai]'); await pg.wait_for_timeout(300)
        d['ask_box'] = await pg.evaluate("[document.getElementById('aiBorderBox').hidden, !!window.__rs.state.project.art]") + [await seg(pg)]
        await pg.fill('#borderThemeInput', 'basketballs, a whistle and a net')
        await pg.screenshot(path=O + 'desk-4-ask.png')
        await pg.click('#aiBorderBtn')
        await pg.wait_for_function("window.__rs.state.project.art", timeout=60000); await idle(pg)
        last = arts[-1] if arts else {}
        d['themed_call'] = [last.get('req', {}).get('layout'), last.get('req', {}).get('borderTheme'), 'Border motifs: basketballs' in last.get('art', {}).get('prompt', '')]
        d['fit2'] = await pg.evaluate(INSIDE)
        await pg.screenshot(path=O + 'desk-5-themed.png')
        d['errors'] = errs
        res['desktop'] = d
        await ctx.close()

        # ---------------- iPhone 15 emulation ----------------
        ctx = await b.new_context(**p.devices['iPhone 15'], accept_downloads=True)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await signup(pg, f'aibi{int(time.time())}@example.com')
        i = {}
        await pg.set_input_files('#startPhotoInput', FIX + 'pet-cat.jpg')
        await pg.wait_for_selector('#noArtRow:not([hidden])')
        await pg.check('#noArtToggle', force=True)
        await pg.check('input[name=startBorder][value=ai]', force=True)
        await pg.check('input[name=output][value=pyrography]', force=True)
        i['start_no_sideways'] = await pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        await pg.screenshot(path=O + 'iph-0-start.png', full_page=True)
        await pg.click('#designBtn')
        await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.art", timeout=60000)
        await idle(pg)
        await pg.fill('#f-name', 'Chelsea'); await pg.evaluate("document.activeElement.blur()")
        await pg.evaluate("['secWording','secPhoto','secLettering'].forEach(i=>document.getElementById(i).open=false); document.getElementById('secArt').open=true")
        await pg.wait_for_timeout(600)
        i['state'] = await pg.evaluate("(()=>{const p=window.__rs.state.project;return [p.output,p.art.layout,p.plainBg]})()") + [await seg(pg)]
        i['fit'] = await pg.evaluate(INSIDE)
        i['no_sideways'] = await pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        await pg.screenshot(path=O + 'iph-1-editor.png')
        await pg.evaluate("document.getElementById('borderSeg').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=O + 'iph-2-seg.png')
        i['errors'] = errs
        res['iphone'] = i
        await ctx.close()
        await b.close()

        d = res['desktop']
        ok = (d['border_row_hidden_before_check'] and d['after_design'][:4] == ['border', False, 1.5, 1]
              and d['seg_after_design'] == 'ai' and d['fit']['photoInside'] and d['fit']['letteringInside']
              and d['first_call'] and d['first_call']['layout'] == 'border' and d['first_call']['prompt_border']
              and all(d['full_art_controls_hidden'])
              and d['simple'] == [False, True, True, 1, 'simple'] and d['none'] == [False, True, False, 'none']
              and d['ai_again'] == ['border', False, True, 'ai'] and d['calls_for_switching'] == 0
              and d['wood'] == ['pyrography', 'border', True, 'ai', 0]
              and d['pdf_has_name'] and d['reopened'] == ['border', 'certificate']
              and d['default_border'] == 'simple' and d['simple_start'] == [False, True, True, 0]
              and d['ask_box'] == [False, False, 'ai']
              and d['themed_call'] == ['border', 'basketballs, a whistle and a net', True]
              and d['fit2']['photoInside'] and d['fit2']['letteringInside'] and not d['errors'])
        i = res['iphone']
        ok = ok and i['state'] == ['pyrography', 'border', False, 'ai'] and i['fit']['photoInside'] and i['no_sideways'] and i['start_no_sideways'] and not i['errors']
        res['ok'] = ok
        print(json.dumps(res, indent=1))
        if not ok: sys.exit(1)

asyncio.run(main())
