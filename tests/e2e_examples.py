"""Shared Examples (test mode). Needs ADMIN_EMAILS=exadmin@example.com in .dev.vars.
Desktop admin: makes a certificate and a no-artwork photo pattern, adds both to Examples from the
card menu. iPhone 15 emulation, brand-new user: My projects shows Examples open in both sections
(no designs of their own), thumbnails load, opening one makes their own copy (images copied into
their account), it's then listed as their project, PDF exports. Admin removes an example: the
copy stays and still loads its artwork.

usage: python3 tests/e2e_examples.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time, subprocess
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-examples').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
FIX = os.path.join(HERE, 'fixtures') + '/'

async def signin(pg, email, signup=True):
    await pg.goto(B)
    await pg.click('#accountBtn'); await pg.fill('#authEmail', email); await pg.fill('#authPass', 'examplepass1')
    if signup: await pg.click('#authSeg button[data-mode=signup]')
    await pg.click('#authSubmit')
    await pg.wait_for_function('window.__rs.state.user')

async def settle(pg):
    await pg.wait_for_function("!window.__rs.state.save.dirty && !window.__rs.state.save.inflight", timeout=20000)

async def card_menu(pg, sel, action):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).closest('.proj').querySelector('.proj-menu').click()")
    await pg.evaluate(f"document.querySelector('.proj-actions button[data-a={action}]').click()")

async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        # ---------- admin ----------
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        try: await signin(pg, 'exadmin@example.com')
        except Exception: await signin(pg, 'exadmin@example.com', signup=False)
        # a certificate with artwork
        await pg.fill('#idea', 'Retirement award for a union carpenter, 30 years, tool belt')
        await pg.click('#designBtn')
        await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.art && !window.__rs.state.busyArt", timeout=60000)
        await pg.fill('#f-name', 'Example Carpenter'); await pg.evaluate("document.activeElement.blur()"); await settle(pg)
        cert_id = await pg.evaluate("window.__rs.state.project.id")
        # a no-artwork photo pattern
        await pg.click('#navHomeBtn')
        await pg.set_input_files('#startPhotoInput', FIX + 'pet-cat.jpg')
        await pg.wait_for_selector('#noArtRow:not([hidden])'); await pg.check('#noArtToggle', force=True)
        await pg.check('input[name=output][value=pyrography]', force=True)
        await pg.click('#designBtn')
        await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.photo && window.__rs.state.project.photo.key && window.__rs.state.project.id!=" + json.dumps(cert_id), timeout=30000)
        await pg.fill('#f-name', 'Example Cat'); await pg.evaluate("document.activeElement.blur()"); await settle(pg)
        cat_id = await pg.evaluate("window.__rs.state.project.id")
        await pg.click('#projectsBtn'); await pg.wait_for_selector(f'.proj[data-id="{cert_id}"]')
        await card_menu(pg, f'.proj-sec[data-output=certificate] > .proj-grid .proj[data-id="{cert_id}"]', 'share')
        await pg.wait_for_timeout(800)
        await card_menu(pg, f'.proj-sec[data-output=pyrography] > .proj-grid .proj[data-id="{cat_id}"]', 'share')
        await pg.wait_for_timeout(1200)
        admin_view = await pg.evaluate("[...document.querySelectorAll('.proj-ex')].map(e=>[e.closest('.proj-sec').dataset.output, e.open, e.querySelector('.proj-count').textContent])")
        await pg.screenshot(path=O + 'admin-projects.png')
        res['admin'] = dict(examples_folds=admin_view, errors=errs)

        # ---------- a brand-new user on iPhone ----------
        uctx = await b.new_context(**p.devices['iPhone 15'], accept_downloads=True)
        up = await uctx.new_page(); uerrs = []; up.on('pageerror', lambda e: uerrs.append(str(e)))
        bad = []; up.on('response', lambda r: ('/api/art/' in r.url or '/api/photo/' in r.url) and r.status != 200 and bad.append((r.url, r.status)))
        email = f'exuser{int(time.time())}@example.com'
        await signin(up, email)
        await up.click('#projectsBtn'); await up.wait_for_selector('.proj-ex .proj')
        await up.wait_for_timeout(2500)
        user_view = await up.evaluate("""[...document.querySelectorAll('.proj-sec')].map(s=>({out:s.dataset.output, mine:s.querySelectorAll(':scope > .proj-grid .proj').length,
            exOpen:s.querySelector('.proj-ex')?.open, ex:[...s.querySelectorAll('.proj-ex .proj')].map(c=>c.querySelector('b').textContent),
            thumbs:[...s.querySelectorAll('.proj-ex .proj-thumb')].map(t=>!!t.querySelector('svg image, svg'))}))""")
        await up.screenshot(path=O + 'iphone-1-examples.png')
        # non-admin sees no admin actions
        await up.evaluate("document.querySelector('.proj-sec[data-output=certificate] .proj-ex .proj .proj-menu').click()")
        menu = await up.evaluate("[...document.querySelectorAll('.proj-actions button')].map(b=>b.textContent)")
        await up.evaluate("document.querySelectorAll('.proj-actions').forEach(m=>m.remove())")
        # open the certificate example → own copy
        await up.evaluate("document.querySelector('.proj-sec[data-output=certificate] .proj-ex .proj .proj-open').click()")
        await up.wait_for_function("window.__rs.state.project && window.__rs.state.project.fromExample", timeout=20000)
        await up.wait_for_timeout(1500)
        uid_ = await up.evaluate("window.__rs.state.user.id")
        copy = await up.evaluate("(()=>{const p=window.__rs.state.project;return {id:p.id, name:p.text.name, artKey:p.art&&p.art.key, hist:p.artHistory.map(a=>a.key)}})()")
        copy_own = copy['artKey'].startswith(f'art/{uid_}/') and all(k.startswith(f'art/{uid_}/') for k in copy['hist'])
        await up.screenshot(path=O + 'iphone-2-copy.png')
        await up.fill('#f-name', 'Pat Rivera'); await up.evaluate("document.activeElement.blur()"); await settle(up)
        await up.click('#exportBtn')
        await up.wait_for_function("!document.getElementById('saveFileBtn').disabled", timeout=60000)
        async with up.expect_download() as d: await up.click('#saveFileBtn')
        pdf = O + 'iphone-copy.pdf'; await (await d.value).save_as(pdf)
        txt = subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout
        await up.evaluate("document.querySelector('[data-close]') && document.querySelectorAll('.sheet:not([hidden]) [data-close]').forEach(b=>b.click())")
        # open the photo example too
        await up.click('#projectsBtn'); await up.wait_for_selector('.proj-sec[data-output=pyrography] .proj-ex')
        await up.evaluate("const e=document.querySelector('.proj-sec[data-output=pyrography] .proj-ex'); e.open=true")
        await up.wait_for_selector('.proj-sec[data-output=pyrography] .proj-ex .proj')
        await up.evaluate("document.querySelector('.proj-sec[data-output=pyrography] .proj-ex .proj .proj-open').click()")
        await up.wait_for_function("window.__rs.state.project && window.__rs.state.project.fromExample && window.__rs.state.project.photo", timeout=20000)
        await up.wait_for_timeout(1500)
        photo_copy = await up.evaluate("[window.__rs.state.project.photo.key, window.__rs.state.project.plainBg, !!document.querySelector('#sheetHolder image[data-field=photo]')]")
        photo_own = photo_copy[0].startswith(f'photo/{uid_}/')
        # their list now has both copies as their own designs
        await up.click('#projectsBtn'); await up.wait_for_timeout(1500)
        mine_after = await up.evaluate("[...document.querySelectorAll('.proj-sec')].map(s=>[s.dataset.output, s.querySelectorAll(':scope > .proj-grid .proj').length, s.querySelector('.proj-ex')?.open])")
        await up.screenshot(path=O + 'iphone-3-after.png')

        # ---------- admin removes the certificate example; the user's copy keeps working ----------
        await pg.click('#projectsBtn') if not await pg.evaluate("!document.getElementById('projectsSheet').hidden") else None
        await pg.evaluate("document.querySelector('.proj-sec[data-output=certificate] .proj-ex').open=true")
        await pg.wait_for_selector('.proj-sec[data-output=certificate] .proj-ex .proj')
        await card_menu(pg, '.proj-sec[data-output=certificate] .proj-ex .proj .proj-open', 'unshare')
        await pg.wait_for_timeout(1200)
        left = await pg.evaluate("document.querySelectorAll('.proj-sec[data-output=certificate] .proj-ex .proj').length")
        r = await up.evaluate(f"fetch('/api/{copy['artKey']}').then(r=>r.status)")
        res['user'] = dict(sections=user_view, menu=menu, copy_images_in_own_account=copy_own, pdf_has_name='Pat Rivera' in txt,
                           photo_copy=photo_copy, photo_own=photo_own, own_designs_after=mine_after, bad_image_responses=bad, errors=uerrs)
        res['after_unshare'] = dict(cert_examples_left=left, copy_art_status=r)
        await b.close()
    print(json.dumps(res, indent=1))

asyncio.run(main())
