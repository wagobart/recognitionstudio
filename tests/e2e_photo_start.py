"""Start a design from only a photo (no description), test mode.
Checks: empty start shows a nudge and stays put; photo-only starts a design on iPhone 15 emulation
(wood-burning, photo defaults to graphite) and desktop (certificate, color), with the photo layer drawn.

usage: python3 tests/e2e_photo_start.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-photos').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        res={}
        for dev in ['iphone','desktop']:
            ctx = await (b.new_context(**p.devices['iPhone 15']) if dev=='iphone' else b.new_context(viewport={'width':1440,'height':900}))
            pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(B)
            await pg.click('#accountBtn'); await pg.fill('#authEmail',f'only{dev}{int(time.time())}@example.com'); await pg.fill('#authPass','photopass1'); await pg.click('#authSeg button[data-mode=signup]'); await pg.click('#authSubmit')
            await pg.wait_for_function('window.__rs.state.user'); await pg.wait_for_timeout(400)
            # empty description, no photo -> gentle nudge, stays on start
            await pg.click('#designBtn'); await pg.wait_for_timeout(400)
            nudge = await pg.evaluate("[document.getElementById('studio').dataset.view, document.getElementById('toast').textContent]")
            # photo only
            await pg.set_input_files('#startPhotoInput', os.path.join(HERE, 'fixtures', 'pet-cat.jpg'))
            await pg.wait_for_selector('#startPhotoNote:not([hidden])')
            if dev=='iphone': await pg.check('input[name=output][value=pyrography]', force=True)
            await pg.click('#designBtn')
            await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.art && !window.__rs.state.busyArt", timeout=60000)
            await pg.wait_for_timeout(1200)
            r = await pg.evaluate("[window.__rs.state.project.idea, !!(window.__rs.state.project.photo && window.__rs.state.project.photo.key), window.__rs.state.project.photo && window.__rs.state.project.photo.mode, window.__rs.state.project.title, window.__rs.state.project.text.title, !!document.querySelector('#sheetHolder image[data-field=photo]')]")
            await pg.screenshot(path=O+f'only-{dev}.png')
            res[dev]=dict(nudge=nudge, photo_only=r, errors=errs)
            await ctx.close()
        ok = all(v['nudge'][0] == 'start' and v['photo_only'][1] and v['photo_only'][5] and not v['errors'] for v in res.values())
        ok = ok and res['iphone']['photo_only'][2] == 'graphite' and res['desktop']['photo_only'][2] == 'color'
        res['ok'] = ok
        print(json.dumps(res, indent=1))
        if not ok:
            sys.exit(1)
        await b.close()
asyncio.run(main())
