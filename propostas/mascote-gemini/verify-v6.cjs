// node verify-v6.cjs [absolute path to an installed Playwright package]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage(); const errors = [], external = [], layouts = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route(/^https?:/, route => { external.push(route.request().url()); return route.abort(); });
    await page.goto(pathToFileURL(path.join(__dirname, 'v6.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    const frame = page.locator('#hud-frame').contentFrame();
    await frame.locator('#companion-slot .mascot').waitFor(); await page.evaluate(() => document.fonts.ready);
    assert.equal(await frame.locator('.tokens-section,.session-total,#tokens-title,#tok-input-val,#tok-cache-val,#tok-output-val,#total-tokens-label').count(), 0);
    assert.ok(!/Tokens|Acumulado em 5 horas|turnos registrados/.test(await frame.locator('body').innerText()));
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
    for (const activity of ['web','page','reading','files','writing','terminal','agents','question','model']) {
      await page.locator(`.reaction[data-activity="${activity}"]`).click();
      assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), activity);
      assert.equal(await page.locator('.mouth').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.activity), activity);
      summaries.push({ activity, text: await frame.locator('#companion-detail').textContent() });
      if (activity === 'web') {
        assert.equal(await page.locator('#hero .globe circle').count(), 1);
        assert.equal(await page.locator('#hero .globe-grid ellipse').count(), 1);
        assert.equal(await page.locator('#hero .globe-grid path').getAttribute('d'), 'M87 88h24m-22-6h20m-20 12h20');
      }
      if(activity==='reading'||activity==='page')assert.equal(await page.locator('#hero .glasses rect').count(),2);
      if(activity==='model'){
        assert.equal(await page.locator('#hero .thought-bubble').count(),1);
        assert.equal(await page.locator('#hero .eye').first().getAttribute('height'),'3.3125');
      }
      if(activity==='agents')assert.equal(await page.locator('#hero .mini-companion').count(),2);
      await page.getByRole('button', { name: 'Simular retorno' }).click();
      assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), 'waiting');
    }
    assert.ok(summaries.find(x=>x.activity==='web').text.includes('animação de mascotes em pixel art'));
    assert.ok(summaries.find(x=>x.activity==='page').text.includes('antigravity.google'));
    assert.ok(summaries.find(x=>x.activity==='reading').text.includes('painel.html'));
    assert.ok(summaries.find(x=>x.activity==='files').text.includes('mascote'));
    assert.ok(!summaries.some(x=>x.text.includes('/exemplo/')));
    const agentChecks=[];
    for(let count=1;count<=6;count++){
      await page.locator(`[data-agent-count="${count}"]`).click();
      assert.equal(await frame.locator('#agent-list li').count(),count);
      assert.equal(await frame.locator('[data-status="running"]').count(),count);
      assert.equal(await frame.locator('#agents-summary').textContent(),`Subagentes · ${count}/${count} ativos`);
      const height=await page.locator('#hud-frame').evaluate(el=>el.offsetHeight);
      await frame.locator('#toggle-agents').click();
      assert.equal(await frame.locator('#toggle-agents').getAttribute('aria-expanded'),'false');
      assert.equal(await frame.locator('#agent-list').isVisible(),false);
      assert.equal(await frame.locator('[data-status="running"]').count(),count);
      await page.waitForTimeout(50);
      assert.ok(await page.locator('#hud-frame').evaluate(el=>el.offsetHeight)<height);
      await frame.locator('#toggle-agents').click();
      assert.equal(await frame.locator('#agent-list').isVisible(),true);
      await frame.locator('[data-stop-agent="1"]').click();
      assert.equal(await frame.locator('[data-status="stopped"]').count(),1);
      assert.equal(await frame.locator('[data-status="running"]').count(),count-1);
      assert.equal(await frame.locator('[data-stop-agent="1"]').isDisabled(),true);
      assert.equal(await frame.locator('html').evaluate(()=>document.activeElement.id||document.activeElement.dataset.stopAgent),count>1?'2':'toggle-agents');
      if(count>1){
        assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'),'agents');
        await frame.locator('#stop-agents').click();
      }
      assert.equal(await frame.locator('[data-status="running"]').count(),0);
      assert.equal(await frame.locator('[data-status="stopped"]').count(),count);
      assert.equal(await frame.locator('#stop-agents').isDisabled(),true);
      assert.match(await frame.locator('#companion-detail').textContent(),/Simulação interrompida/);
      assert.ok(!/concluíd|sucesso|finalizad/i.test(await frame.locator('#subagents').innerText()));
      agentChecks.push({count,collapsePreservesActivity:true,stopOne:true,stopAll:true});
    }
    // A turn ending is never evidence that the delegated task succeeded.
    await page.locator('[data-agent-count="2"]').click();
    await page.evaluate(()=>receiveActivity('Stop',{conversationId:demoSession}));
    assert.equal(await frame.locator('[data-status="returned"]').count(),0);
    assert.ok(!/concluíd|sucesso/i.test(await frame.locator('#agent-list').innerText()));
    // Stopping while hidden remains possible; reinitializing never retains stale state.
    await page.locator('[data-agent-count="6"]').click();
    await frame.locator('#toggle-agents').click();await frame.locator('#stop-agents').click();
    await frame.locator('#toggle-agents').click();
    assert.equal(await frame.locator('[data-status="stopped"]').count(),6);
    await page.locator('[data-agent-count="3"]').click();
    await page.getByRole('button',{name:'Simular retorno'}).click();
    assert.equal(await frame.locator('[data-status="returned"]').count(),3);
    assert.ok(!/concluíd|sucesso/i.test(await frame.locator('#agent-list').innerText()));
    await page.getByRole('button',{name:'Reiniciar',exact:true}).click();
    assert.equal(await frame.locator('#subagents').isVisible(),false);
    const invalid=await page.evaluate(()=>{startAgents(0);startAgents(7);startAgents(2.5);return demoAgents.length;});
    assert.equal(invalid,0);
    await page.locator('[data-agent-count="6"]').click();
    await page.evaluate(()=>receiveActivity('Stop',{conversationId:'another-session'}));
    assert.equal(await frame.locator('[data-status="running"]').count(),6);
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
      return { gaze:getComputedStyle(document.querySelector('#hero .glance')).transform, hudGaze:getComputedStyle(document.querySelector('#hud-frame').contentDocument.querySelector('#companion-slot .glance')).transform, body:getComputedStyle(document.querySelector('#hero .float-body')).transform, palette:[...document.querySelectorAll('#hero .color-frame')].map(el=>getComputedStyle(el).opacity) };
    },ms);
    const before=await atTime(0), after=await atTime(2000);
    assert.notEqual(before.body,after.body); assert.notDeepEqual(before.palette,after.palette);assert.notEqual(before.gaze,after.gaze);assert.notEqual(before.hudGaze,after.hudGaze);
    assert.equal(await page.locator('.reaction .float-body').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.locator('[data-agent-count="6"]').click();
    for(const theme of ['dark','light']){
      if(theme==='light')await page.getByRole('button',{name:'Ativar tema claro'}).click();
      for(const width of [320,390,768,1024,1440]){
        await page.setViewportSize({width,height:1100});await page.waitForTimeout(90);
        const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        const hud=await frame.locator('html').evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,content:Math.ceil(document.querySelector('.dashboard').getBoundingClientRect().height)}));
        assert.equal(layout.width,layout.scroll);assert.equal(hud.width,hud.scroll);assert.equal(hud.height,hud.content);
        layouts.push({theme,...layout,hud});
        if(theme==='dark'&&width===1440||theme==='light'&&width===390)await page.screenshot({path:path.join(__dirname,`v6-${width}-${theme}.png`),fullPage:true});
      }
    }
    await page.getByRole('button',{name:'Ativar tema escuro'}).click();
    await page.getByRole('button',{name:'Pausar movimentos',exact:true}).click();
    assert.equal(await page.locator('#hero .float-body').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await frame.locator('#companion-slot .float-body').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.ok((await frame.locator('.agent-avatar .glance').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).animationName))).every(name=>name==='none'));
    await page.getByRole('button',{name:'Retomar movimentos'}).click();
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(90);
    assert.equal(await page.locator('#hero .color-frame').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await frame.locator('#companion-slot .float-body').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.ok((await frame.locator('.agent-avatar .glance').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).animationName))).every(name=>name==='none'));
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(90);
    await page.setViewportSize({width:1440,height:1100});await page.waitForTimeout(100);
    await atTime(1000);
    await frame.locator('.dashboard').screenshot({path:path.join(__dirname,'painel-v6.png')});
    const expressionData=await page.evaluate(()=>({
      font:document.getElementById('font-css').outerHTML,css:document.getElementById('mascot-css').outerHTML,
      cards:['web','reading','model','agents','question','terminal'].map(kind=>({kind,label:activities[kind].label,svg:mascot('retro',kind,156,true)}))
    }));
    const expressionHtml=`<!doctype html><html lang="pt-BR" data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gemini · expressões V6</title>${expressionData.font}${expressionData.css}<style>:root{--surface:#18191d;--blue:#8bb4ff;}*{box-sizing:border-box}body{margin:0;padding:28px;background:#121317;color:#f8f9fc;font-family:'Google Sans Flex',sans-serif}h1{font-size:22px;font-weight:500;margin:0 0 8px}p{font-size:12px;color:#a6a9b0;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{background:#18191d;border:1px solid #303137;border-radius:16px;text-align:center;padding:14px 6px 18px}h2{font-size:12px;font-weight:500;margin:8px 0 0}@media(max-width:550px){.grid{grid-template-columns:repeat(2,1fr)}}</style><h1>Olhos de bloco, mais expressão.</h1><p>Globo na web · óculos na leitura · olhos semicerrados ao pensar</p><div class="grid">${expressionData.cards.map(card=>`<article>${card.svg}<h2>${card.label}</h2></article>`).join('')}</div></html>`;
    fs.writeFileSync(path.join(__dirname,'expressoes-v6.html'),expressionHtml);
    const sheet=await context.newPage();await sheet.setViewportSize({width:760,height:640});await sheet.setContent(expressionHtml);await sheet.evaluate(()=>document.fonts.ready);
    await sheet.screenshot({path:path.join(__dirname,'expressoes-v6.png'),fullPage:true});await sheet.close();
    const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-v6-motion-'));
    for(const [index,kind] of ['web','reading','model','agents'].entries()){
      await page.locator(`.reaction[data-activity="${kind}"]`).click();
      for(let frameIndex=0;frameIndex<24;frameIndex++){
        await atTime(frameIndex*125);
        await page.locator('#hero').screenshot({path:path.join(scratch,`frame-${String(index*24+frameIndex).padStart(3,'0')}.png`),animations:'allow'});
      }
    }
    execFileSync('ffmpeg',['-v','error','-y','-framerate','8','-i',path.join(scratch,'frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',path.join(__dirname,'movimento-v6.gif')],{windowsHide:true});
    assert.ok(fs.statSync(path.join(__dirname,'movimento-v6.gif')).size>1000);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    fs.writeFileSync(path.join(__dirname,'verification-v6.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks:['Selected retro sprite and block eyes','Antigravity symbol retained, Google and model row removed','World globe replaces web magnifier; reading glasses; thought bubble and half-closed block eyes; mini Gemini companions','Informative tool summaries','Eight color frames with identical alpha masks','Float and color opacity change with time','Static gallery previews','Pause and reduced motion in parent and HUD','Token section and accumulated token total removed'],agentChecks,summaries,layouts,motion:{before,after},errors,externalRequests:external,limits:['Proposal only; live event transport still absent','No physical phone or Antigravity webview test']},null,2));
    console.log(JSON.stringify({success:true,layouts:layouts.length,activities:summaries.length,agentCounts:agentChecks.length,gifFrames:96,colorFrames:palette.length,errors,external}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
