// node verify-v4.cjs [absolute path to an installed Playwright package]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage(); const errors = [], external = [], layouts = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route(/^https?:/, route => { external.push(route.request().url()); return route.abort(); });
    await page.goto(pathToFileURL(path.join(__dirname, 'v4.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    const frame = page.locator('#hud-frame').contentFrame();
    await frame.locator('#companion-slot .mascot').waitFor(); await page.evaluate(() => document.fonts.ready);
    assert.equal(await frame.locator('.brand').getAttribute('aria-label'), 'Antigravity');
    assert.equal(await frame.locator('.brand > span').textContent(), 'Antigravity');
    assert.ok(await frame.locator('.brand svg path').count() > 0);
    assert.equal(await frame.locator('.model-section,.effort-tag,#model-title').count(), 0);
    assert.ok(!/Google|Gemini|MEDIUM|Flash/.test(await frame.locator('body').innerText()));
    assert.equal(await page.locator('.direction,[data-eye-style]').count(), 0);
    assert.equal(await page.locator('#hero .mascot').getAttribute('data-shape'), 'retro');
    assert.equal(await page.locator('#hero .eye').first().evaluate(el => el.tagName), 'rect');
    assert.equal(await page.locator('#hero .eye').first().getAttribute('height'), '9.9375');
    const summaries = [];
    for (const activity of ['web','page','reading','files','writing','terminal','agents','question']) {
      await page.locator(`.reaction[data-activity="${activity}"]`).click();
      assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), activity);
      assert.equal(await page.locator('.mouth').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.activity), activity);
      summaries.push({ activity, text: await frame.locator('#companion-detail').textContent() });
      if (activity === 'web') {
        assert.equal(await page.locator('#hero .activity-glyph circle').count(), 1);
        assert.equal(await page.locator('#hero .activity-glyph path').getAttribute('d'), 'm102 91 8 8');
      }
      await page.getByRole('button', { name: 'Simular retorno' }).click();
      assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), 'waiting');
    }
    assert.ok(summaries.find(x=>x.activity==='web').text.includes('animação de mascotes em pixel art'));
    assert.ok(summaries.find(x=>x.activity==='page').text.includes('antigravity.google'));
    assert.ok(summaries.find(x=>x.activity==='reading').text.includes('painel.html'));
    assert.ok(summaries.find(x=>x.activity==='files').text.includes('mascote'));
    assert.ok(!summaries.some(x=>x.text.includes('/exemplo/')));
    const palette = await page.evaluate(async () => {
      const frames=[];
      for(const src of colorFrames){
        const image=new Image();image.src=src;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        frames.push({width:image.naturalWidth,height:image.naturalHeight,pixels:[...ctx.getImageData(0,0,32,32).data]});
      }
      return frames;
    });
    assert.equal(palette.length, 8);
    const mask = pixels => pixels.filter((_,i)=>i%4===3);
    for(const f of palette){assert.equal(f.width,32);assert.equal(f.height,32);assert.deepEqual(mask(f.pixels),mask(palette[0].pixels));}
    assert.ok(new Set(palette.map(f=>JSON.stringify(f.pixels))).size > 4);
    await page.locator('.reaction[data-activity="web"]').click();
    const atTime = async ms => page.evaluate(time => {
      for(const doc of [document,document.querySelector('#hud-frame').contentDocument])for(const a of doc.getAnimations()){a.pause();a.currentTime=time;}
      return { body:getComputedStyle(document.querySelector('#hero .float-body')).transform, palette:[...document.querySelectorAll('#hero .color-frame')].map(el=>getComputedStyle(el).opacity) };
    },ms);
    const before=await atTime(0), after=await atTime(2000);
    assert.notEqual(before.body,after.body); assert.notDeepEqual(before.palette,after.palette);
    assert.equal(await page.locator('.reaction .float-body').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    for(const theme of ['dark','light']){
      if(theme==='light')await page.getByRole('button',{name:'Ativar tema claro'}).click();
      for(const width of [320,390,768,1024,1440]){
        await page.setViewportSize({width,height:1100});await page.waitForTimeout(90);
        const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        const hud=await frame.locator('html').evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,content:Math.ceil(document.querySelector('.dashboard').getBoundingClientRect().height)}));
        assert.equal(layout.width,layout.scroll);assert.equal(hud.width,hud.scroll);assert.equal(hud.height,hud.content);
        layouts.push({theme,...layout,hud});
        if(theme==='dark'&&width===1440||theme==='light'&&width===390)await page.screenshot({path:path.join(__dirname,`v4-${width}-${theme}.png`),fullPage:true});
      }
    }
    await page.getByRole('button',{name:'Ativar tema escuro'}).click();
    await page.getByRole('button',{name:'Pausar movimentos',exact:true}).click();
    assert.equal(await page.locator('#hero .float-body').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await frame.locator('.float-body').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.getByRole('button',{name:'Retomar movimentos'}).click();
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(90);
    assert.equal(await page.locator('#hero .color-frame').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await frame.locator('.float-body').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(90);
    await page.setViewportSize({width:1440,height:1100});await page.waitForTimeout(100);
    await atTime(1000);
    await frame.locator('.dashboard').screenshot({path:path.join(__dirname,'painel-v4.png')});
    const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-v4-motion-'));
    for(let i=0;i<64;i++){await atTime(i*125);await page.locator('#hero').screenshot({path:path.join(scratch,`frame-${String(i).padStart(3,'0')}.png`)});}
    execFileSync('ffmpeg',['-v','error','-y','-framerate','8','-i',path.join(scratch,'frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',path.join(__dirname,'movimento-v4.gif')],{windowsHide:true});
    assert.ok(fs.statSync(path.join(__dirname,'movimento-v4.gif')).size>1000);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    fs.writeFileSync(path.join(__dirname,'verification-v4.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks:['Selected retro sprite and block eyes','Antigravity symbol retained, Google and model row removed','Simple magnifying glass','Informative tool summaries','Eight color frames with identical alpha masks','Float and color opacity change with time','Static gallery previews','Pause and reduced motion in parent and HUD','64-frame GIF from the actual HTML'],summaries,layouts,motion:{before,after},errors,externalRequests:external,limits:['Proposal only; live event transport still absent','No physical phone or Antigravity webview test']},null,2));
    console.log(JSON.stringify({success:true,layouts:layouts.length,activities:summaries.length,colorFrames:palette.length,gifFrames:64,errors,external}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
