"""Public artwork gallery (test mode). Needs ADMIN_EMAILS=exadmin@example.com in .dev.vars.

Desktop designer: library idea → Design it → artwork is shared by default (toast says so, switch on),
listed in /api/gallery; switch off removes it, on again lists it. Own description → not shared (switch
off). Photo-painted art can never be listed (checked through the API). Duplicate → still listed once;
delete → gone.
iPhone 15 emulation, signed-out visitor: Browse → Artwork gallery shows images without signing in;
tapping one asks to sign in, then holds the artwork on the start screen; Design it with no description
→ editor with that artwork and no AI artwork call; share switch hidden (not their art). In the editor
"Use artwork from the gallery" swaps the art (versions = 2). Admin hides an item → gone for everyone.

usage: python3 tests/e2e_gallery.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-gallery').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
T = int(time.time())

async def signin(pg, email, signup=True, goto=True, pw='gallerypass1'):
    if goto:
        await pg.goto(B)
        await pg.click('#accountBtn')
    await pg.fill('#authEmail', email); await pg.fill('#authPass', pw)
    if signup: await pg.click('#authSeg button[data-mode=signup]')
    await pg.click('#authSubmit')
    await pg.wait_for_function('window.__rs.state.user')

async def settle(pg):
    await pg.wait_for_function("!window.__rs.state.save.dirty && !window.__rs.state.save.inflight", timeout=20000)

async def gallery_keys(pg):
    return await pg.evaluate("fetch('/api/gallery').then(r=>r.json()).then(d=>d.items.map(i=>i.url))")

async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        # ---------- designer ----------
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        toasts = []
        await signin(pg, f'galdesigner{T}@example.com')
        await pg.evaluate("new MutationObserver(()=>{const t=document.querySelector('.toast');if(t)window.__toasts=(window.__toasts||[]).concat(t.textContent)}).observe(document.body,{subtree:true,childList:true,characterData:true})")
        await pg.click('#browseBtn'); await pg.wait_for_selector('.lib-item')
        await pg.fill('#libSearch', 'veteran'); await pg.wait_for_timeout(400)
        await pg.click('.lib-item')
        await pg.fill('#idea', (await pg.input_value('#idea')) + ' For Sergeant Dale Brooks, 1968-1972.')
        await pg.click('#designBtn')
        await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.art && !window.__rs.state.busyArt", timeout=60000)
        await settle(pg); await pg.wait_for_timeout(600)
        p1 = await pg.evaluate("(()=>{const p=window.__rs.state.project;return {id:p.id, fromIdea:!!p.fromIdea, art:p.art.url}})()")
        await pg.evaluate("['secWording','secPhoto','secLettering'].forEach(i=>document.getElementById(i).open=false); document.getElementById('secArt').open=true")
        sw1 = await pg.evaluate("[!document.getElementById('shareRow').hidden, document.getElementById('shareToggle').checked]")
        listed1 = p1['art'] in await gallery_keys(pg)
        await pg.screenshot(path=O + 'designer-artwork-section.png')
        await pg.click('#shareToggle'); await settle(pg)
        listed_off = p1['art'] in await gallery_keys(pg)
        await pg.click('#shareToggle'); await settle(pg)
        listed_on = p1['art'] in await gallery_keys(pg)
        told = await pg.evaluate("(window.__toasts||[]).some(t=>t.includes('public gallery'))")
        # own description → not shared
        await pg.click('#navHomeBtn')
        await pg.fill('#idea', 'Thank-you certificate for our church choir director, music notes and stained glass')
        await pg.click('#designBtn')
        await pg.wait_for_function(f"window.__rs.state.project && window.__rs.state.project.id!={json.dumps(p1['id'])} && window.__rs.state.project.art && !window.__rs.state.busyArt", timeout=60000)
        await settle(pg)
        await pg.evaluate("document.getElementById('secArt').open=true")
        p2 = await pg.evaluate("[window.__rs.state.project.art.url, !document.getElementById('shareRow').hidden, document.getElementById('shareToggle').checked]")
        listed2 = p2[0] in await gallery_keys(pg)
        # photo-painted art is never listed, even if share is forced on
        forced = await pg.evaluate("""(async()=>{const p=JSON.parse(JSON.stringify(window.__rs.state.project));p.id='p_forcedphoto'+Date.now().toString(36);p.share=true;
            p.artHistory=p.artHistory.map(a=>({...a,fromPhoto:'photo/x/ph_y'}));p.art=p.artHistory[p.artHistory.length-1];
            await fetch('/api/projects/'+p.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)});
            const g=await (await fetch('/api/gallery')).json();return g.items.some(i=>i.url===p.art.url)})()""")
        # duplicate the shared project → still one listing; then delete the duplicate's original
        dup = await pg.evaluate(f"""(async()=>{{const r=await (await fetch('/api/projects/{p1['id']}')).json();const p=r.project;p.id='p_dup'+Date.now().toString(36);
            await fetch('/api/projects/'+p.id,{{method:'PUT',headers:{{'content-type':'application/json'}},body:JSON.stringify(p)}});
            const g=await (await fetch('/api/gallery')).json();return g.items.filter(i=>i.url===p.art.url).length}})()""")
        res['designer'] = dict(from_idea=p1['fromIdea'], switch_shown_on=sw1, listed_by_default=listed1, toast_told=told, off_removes=not listed_off,
                               on_relists=listed_on, own_desc_switch=[p2[1], p2[2]], own_desc_listed=listed2, photo_art_listed=forced, dup_listings=dup, errors=errs)

        # ---------- signed-out visitor on iPhone ----------
        uctx = await b.new_context(**p.devices['iPhone 15'])
        up = await uctx.new_page(); uerrs = []; up.on('pageerror', lambda e: uerrs.append(str(e)))
        bad = []; up.on('response', lambda r: '/api/art/' in r.url and r.status != 200 and bad.append((r.url, r.status)))
        arts = []; up.on('request', lambda r: r.url.endswith('/api/art') and r.method == 'POST' and arts.append(1))
        await up.goto(B)
        await up.click('#browseBtn'); await up.wait_for_selector('#libSeg')
        await up.click('#libSeg button[data-tab=gallery]')
        await up.wait_for_selector('.gal-item img'); await up.wait_for_timeout(1500)
        out_view = await up.evaluate("[document.querySelectorAll('.gal-item').length, [...document.querySelectorAll('.gal-item img')].every(i=>i.complete&&i.naturalWidth>0), !!document.querySelector('.gal-hide')]")
        await up.screenshot(path=O + 'iphone-1-gallery-signed-out.png')
        await up.click('.gal-item .gal-open')
        await up.wait_for_selector('#authSheet:not([hidden])')
        await signin(up, f'galvisitor{T}@example.com', goto=False)
        await up.wait_for_selector('#startGalNote:not([hidden])', timeout=15000)
        await up.screenshot(path=O + 'iphone-2-start-with-art.png')
        await up.click('#designBtn')
        await up.wait_for_function("window.__rs.state.project && window.__rs.state.project.art && document.getElementById('stageOverlay').hidden", timeout=30000)
        await settle(up); await up.wait_for_timeout(800)
        v = await up.evaluate("(()=>{const p=window.__rs.state.project;return {fromGallery:!!p.art.fromGallery, own:p.art.key.startsWith('art/'+window.__rs.state.user.id+'/'), title:p.text.title, share_hidden:document.getElementById('shareRow').hidden}})()")
        await up.screenshot(path=O + 'iphone-3-editor.png')
        # swap artwork from the editor
        await up.evaluate("document.getElementById('secArt').open=true")
        await up.evaluate("document.getElementById('galleryPickBtn').click()")
        await up.wait_for_selector('.gal-item'); await up.wait_for_timeout(600)
        seg_hidden = await up.evaluate("document.getElementById('libSeg').hidden")
        await up.evaluate("const it=[...document.querySelectorAll('.gal-item .gal-open')]; it[it.length>1?1:0].click()")
        await up.wait_for_function("window.__rs.state.project.artHistory.length===2", timeout=15000)
        await settle(up)
        res['visitor'] = dict(signed_out_gallery=out_view, gallery_start=v, ai_art_calls=len(arts), editor_sheet_seg_hidden=seg_hidden, bad_images=bad, errors=uerrs)

        # ---------- admin hides an item ----------
        actx = await b.new_context(viewport={'width': 1280, 'height': 800})
        ap = await actx.new_page(); ap.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await ap.goto(B)
        ok = await ap.evaluate("fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'exadmin@example.com',password:'examplepass1'})}).then(r=>r.ok)")
        if not ok: await signin(ap, 'exadmin@example.com', pw='examplepass1')
        else: await ap.reload(); await ap.wait_for_function('window.__rs.state.user')
        await ap.click('#browseBtn'); await ap.click('#libSeg button[data-tab=gallery]'); await ap.wait_for_selector('.gal-hide')
        hid = await ap.evaluate("document.querySelector('.gal-item img').src.replace(location.origin,'')")
        await ap.click('.gal-hide'); await ap.wait_for_timeout(800)
        still = hid in await gallery_keys(up)
        direct = await ap.evaluate(f"fetch('{hid}',{{credentials:'omit'}}).then(r=>r.status)")
        res['admin'] = dict(hidden_still_listed=still, hidden_art_status_signed_out=direct)
        # designer deletes the shared project → its listing goes
        await pg.evaluate(f"fetch('/api/projects/{p1['id']}',{{method:'DELETE'}})")
        res['designer']['after_delete_listed'] = p1['art'] in await gallery_keys(pg)
        await b.close()
    print(json.dumps(res, indent=1))

asyncio.run(main())
