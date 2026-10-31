"""Photo feature end-to-end test (test mode).

Desktop: photo picked on the start screen -> exact photo -> exact graphite -> shape/position/size ->
"paint into art" (layer hides once the artwork is painted from it) -> back to graphite -> reopen in
another session -> PDF + PNG. iPhone 15 *emulation*: wood-burning memorial, photo added in the
editor (defaults to graphite), mirrored transfer PDF.

usage: python3 tests/e2e_photos.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time, subprocess
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-photos').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
PORTRAIT = os.path.join(HERE, 'fixtures', 'portrait-astronaut.jpg')
PET = os.path.join(HERE, 'fixtures', 'pet-cat.jpg')
async def signup(pg, email):
    await pg.goto(B)
    await pg.click('#accountBtn'); await pg.fill('#authEmail',email); await pg.fill('#authPass','photopass1')
    await pg.click('#authSeg button[data-mode=signup]'); await pg.click('#authSubmit')
    await pg.wait_for_function('window.__rs.state.user')
async def wait_art(pg, n=1):
    await pg.wait_for_function(f"window.__rs.state.project && window.__rs.state.project.artHistory.length>={n} && !window.__rs.state.busyArt", timeout=60000)
async def settle(pg):
    await pg.wait_for_timeout(700)
    await pg.wait_for_function("!window.__rs.state.save.dirty && !window.__rs.state.save.inflight", timeout=20000)
async def opensec(pg, sec):
    await pg.evaluate(f"['secWording','secPhoto','secLettering','secArt'].forEach(id=>document.getElementById(id).open = id==='{sec}')")
    await pg.wait_for_timeout(200)
async def main():
    res={}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errs=[]
        # ---------- desktop: certificate, photo chosen on the start screen ----------
        email=f'photo{int(time.time())}@example.com'
        ctx = await b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await signup(pg, email)
        await pg.set_input_files('#startPhotoInput', PORTRAIT)
        await pg.wait_for_selector('#startPhotoNote:not([hidden])')
        await pg.fill('#idea','Retirement for Eileen, a NASA astronaut and Space Shuttle commander, 20 years of service')
        await pg.screenshot(path=O+'d0-start.png')
        await pg.click('#designBtn')
        await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.photo && window.__rs.state.project.photo.key", timeout=30000)
        await wait_art(pg); await pg.fill('#f-name','Eileen M. Collins'); await settle(pg)
        await opensec(pg,'secPhoto'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=O+'d1-color.png')
        r1 = await pg.evaluate("[window.__rs.state.project.photo.mode, !!document.querySelector('#sheetHolder image[data-field=photo]')]")
        await pg.click('#photoModeSeg button[data-mode=graphite]'); await pg.wait_for_timeout(900)
        await pg.screenshot(path=O+'d2-graphite.png')
        await pg.click('#photoShapeChips .chip[data-v=circle]'); await pg.click('#photoPlaceChips .chip[data-v=right]')
        await pg.fill('#phSize','1.25'); await pg.dispatch_event('#phSize','input'); await pg.wait_for_timeout(900)
        await pg.screenshot(path=O+'d3-circle-right.png')
        # paint into art
        await pg.click('#photoModeSeg button[data-mode=ai]'); await pg.wait_for_timeout(300)
        still_layer = await pg.evaluate("!!document.querySelector('#sheetHolder image[data-field=photo]')")
        await pg.fill('#photoSubject','astronaut in an orange flight suit')
        await pg.click('#photoPaintBtn'); await wait_art(pg, 2)
        r2 = await pg.evaluate("[window.__rs.state.project.art.fromPhoto===window.__rs.state.project.photo.key, window.__rs.state.project.art.layout, !!document.querySelector('#sheetHolder image[data-field=photo]'), document.getElementById('photoSummary').textContent]")
        await pg.wait_for_timeout(500); await pg.screenshot(path=O+'d4-painted.png')
        await pg.click('#photoModeSeg button[data-mode=graphite]'); await pg.wait_for_timeout(800)
        r3 = await pg.evaluate("!!document.querySelector('#sheetHolder image[data-field=photo]')")
        await settle(pg)
        pid = await pg.evaluate("window.__rs.state.project.id")
        before = await pg.evaluate("JSON.stringify(window.__rs.state.project.photo)")
        # export PDF + PNG
        await pg.click('#exportBtn'); await pg.wait_for_function("!document.getElementById('saveFileBtn').disabled", timeout=60000)
        async with pg.expect_download() as d: await pg.click('#saveFileBtn')
        pdf = O+'desktop.pdf'; await (await d.value).save_as(pdf)
        async with pg.expect_download() as d: await pg.click('#pngBtn')
        png = O+'desktop.png'; await (await d.value).save_as(png)
        await ctx.close()
        # reopen elsewhere
        ctx2 = await b.new_context(viewport={'width':1280,'height':800}); pg2 = await ctx2.new_page()
        await pg2.goto(B); await pg2.click('#accountBtn'); await pg2.fill('#authEmail',email); await pg2.fill('#authPass','photopass1'); await pg2.click('#authSubmit')
        await pg2.wait_for_function('window.__rs.state.user'); await pg2.wait_for_timeout(600)
        await pg2.click('#projectsBtn'); await pg2.wait_for_selector('.proj svg image[data-field=photo]', timeout=15000)
        await pg2.wait_for_timeout(500); await pg2.screenshot(path=O+'d5-projects.png')
        await pg2.click(f".proj-sec[data-output=certificate] .proj[data-id='{pid}'] .proj-open")
        await pg2.wait_for_function(f"window.__rs.state.project && window.__rs.state.project.id==='{pid}'")
        await pg2.wait_for_selector('#sheetHolder image[data-field=photo]', timeout=15000)
        after = await pg2.evaluate("JSON.stringify(window.__rs.state.project.photo)")
        await ctx2.close()
        res['desktop']=dict(color_layer=r1, ai_before_paint_layer_visible=still_layer, painted=r2, back_to_graphite_layer=r3, persisted=before==after)
        # ---------- iPhone: wood-burning, photo added in the editor ----------
        ctx = await b.new_context(**p.devices['iPhone 15'], accept_downloads=True)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await signup(pg, f'photo-ip{int(time.time())}@example.com')
        await pg.fill('#idea','Wood-burning memorial plaque for our cat Chelsea, a tabby who loved sunny windowsills')
        await pg.check('input[name=output][value=pyrography]', force=True)
        await pg.click('#designBtn'); await wait_art(pg)
        await pg.fill('#f-name','Chelsea'); await pg.evaluate("document.activeElement.blur()")
        await opensec(pg,'secPhoto')
        await pg.set_input_files('#photoInput', PET)
        await pg.wait_for_function("window.__rs.state.project.photo && window.__rs.state.project.photo.key", timeout=30000)
        await pg.wait_for_timeout(1200)
        ip_mode = await pg.evaluate("[window.__rs.state.project.photo.mode, window.__rs.state.project.photo.place, document.documentElement.scrollWidth, innerWidth]")
        await pg.screenshot(path=O+'i1-pyro.png')
        await pg.evaluate("document.getElementById('photoPlaceChips').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=O+'i2-controls.png')
        await settle(pg)
        await pg.click('#exportBtn'); await pg.check('#mirrorToggle')
        await pg.wait_for_function("!document.getElementById('saveFileBtn').disabled", timeout=60000)
        async with pg.expect_download() as d: await pg.click('#saveFileBtn')
        ipdf = O+'iphone.pdf'; await (await d.value).save_as(ipdf)
        await ctx.close()
        res['iphone']=dict(mode_place_width=ip_mode)
        res['errors']=errs
        # exported PDFs must contain the photo (artwork + photo images; mirrored page repeats them)
        for f in ('desktop.pdf', 'iphone.pdf'):
            out = subprocess.run(['pdfimages', '-list', O + f], capture_output=True, text=True).stdout
            res[f] = len([l for l in out.splitlines()[2:] if l.strip()])
        d = res['desktop']
        res['ok'] = (not errs and d['color_layer'] == ['color', True] and d['ai_before_paint_layer_visible'] and d['painted'][0]
                     and not d['painted'][2] and d['back_to_graphite_layer'] and d['persisted']
                     and res['iphone']['mode_place_width'][0] == 'graphite' and res['iphone']['mode_place_width'][2] == res['iphone']['mode_place_width'][3]
                     and res['desktop.pdf'] >= 2 and res['iphone.pdf'] >= 4)
        print(json.dumps(res, indent=1))
        if not res['ok']:
            sys.exit(1)
        await b.close()
asyncio.run(main())
