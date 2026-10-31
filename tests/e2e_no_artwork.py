"""Designs with no artwork — just a photo and words (test mode).
iPhone 15 emulation: photo + "No artwork" on the start screen, wood-burning → no artwork API call,
photo at 150%, PDF contains the name. Desktop: same as a certificate, paper/border controls,
"Add AI artwork", then "Use no artwork" back again, PDF.

usage: python3 tests/e2e_no_artwork.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time, subprocess
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-noart').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
FIX = os.path.join(HERE, 'fixtures') + '/' 
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        res={}
        for dev in ['iphone','desktop']:
            ctx = await (b.new_context(**p.devices['iPhone 15'], accept_downloads=True) if dev=='iphone' else b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True))
            pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            calls=[]; pg.on('request', lambda r: '/api/art' in r.url and r.method=='POST' and calls.append(r.url))
            email=f'na{dev}{int(time.time())}@example.com'
            await pg.goto(B)
            await pg.click('#accountBtn'); await pg.fill('#authEmail',email); await pg.fill('#authPass','photopass1'); await pg.click('#authSeg button[data-mode=signup]'); await pg.click('#authSubmit')
            await pg.wait_for_function('window.__rs.state.user')
            noart_hidden_before = await pg.evaluate("document.getElementById('noArtRow').hidden")
            await pg.set_input_files('#startPhotoInput', FIX+('pet-cat.jpg' if dev=='iphone' else 'portrait-astronaut.jpg'))
            await pg.wait_for_selector('#noArtRow:not([hidden])')
            await pg.check('#noArtToggle', force=True)
            if dev=='iphone': await pg.check('input[name=output][value=pyrography]', force=True)
            await pg.screenshot(path=O+f'{dev}-0-start.png')
            await pg.click('#designBtn')
            await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.photo && window.__rs.state.project.photo.key && document.getElementById('stageOverlay').hidden", timeout=30000)
            await pg.wait_for_timeout(1200)
            st = await pg.evaluate("[!!window.__rs.state.project.art, window.__rs.state.project.plainBg, window.__rs.state.project.photo.size, document.getElementById('artStatus').hidden, !!document.querySelector('#sheetHolder image[data-field=photo]')]")
            await pg.fill('#f-name', 'Chelsea' if dev=='iphone' else 'Eileen M. Collins'); await pg.evaluate("document.activeElement.blur()")
            await pg.wait_for_timeout(800)
            await pg.screenshot(path=O+f'{dev}-1-plain.png')
            # paper + border toggles (certificate only), then add AI art, then back to no artwork
            if dev=='desktop':
                await pg.evaluate("['secWording','secPhoto','secLettering'].forEach(i=>document.getElementById(i).open=false); document.getElementById('secArt').open=true")
                await pg.wait_for_timeout(300)
                await pg.click("#paperChips .chip[data-paper=white]"); await pg.click('#borderToggle'); await pg.wait_for_timeout(400)
                await pg.screenshot(path=O+'desktop-2-white-noborder.png')
                await pg.click('#borderToggle'); await pg.click("#paperChips .chip[data-paper=cream]")
                await pg.click('#addArtBtn')
                await pg.wait_for_function("window.__rs.state.project.art && !window.__rs.state.busyArt", timeout=60000)
                with_art = await pg.evaluate("[window.__rs.state.project.plainBg, document.getElementById('plainControls').hidden, document.getElementById('noArtBtn').hidden]")
                await pg.click('#noArtBtn'); await pg.wait_for_timeout(500)
                back = await pg.evaluate("[!!window.__rs.state.project.art, window.__rs.state.project.plainBg, window.__rs.state.project.artHistory.length]")
                res['desktop_extra']=dict(with_art=with_art, back_to_plain=back)
            await pg.wait_for_function("!window.__rs.state.save.dirty && !window.__rs.state.save.inflight", timeout=20000)
            await pg.click('#exportBtn')
            await pg.wait_for_function("!document.getElementById('saveFileBtn').disabled", timeout=60000)
            async with pg.expect_download() as d: await pg.click('#saveFileBtn')
            pdf=O+f'{dev}.pdf'; await (await d.value).save_as(pdf)
            txt = subprocess.run(['pdftotext',pdf,'-'],capture_output=True,text=True).stdout
            res[dev]=dict(noart_option_hidden_until_photo=noart_hidden_before, state_after_design=st, art_api_calls=len(calls), pdf_has_name=('Chelsea' if dev=='iphone' else 'Eileen') in txt, errors=errs)
            await ctx.close()
        i, d, x = res['iphone'], res['desktop'], res['desktop_extra']
        ok = (i['noart_option_hidden_until_photo'] and i['state_after_design'] == [False, True, 1.5, True, True] and i['art_api_calls'] == 0
              and i['pdf_has_name'] and not i['errors'] and d['state_after_design'][:2] == [False, True] and d['pdf_has_name'] and not d['errors']
              and x['with_art'] == [False, True, False] and x['back_to_plain'][:2] == [False, True])
        res['ok'] = ok
        print(json.dumps(res, indent=1))
        if not ok:
            sys.exit(1)
        await b.close()
asyncio.run(main())
