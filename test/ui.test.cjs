// node test/ui.test.cjs [Playwright package] [Antigravity preload.js] [output directory]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ui = fs.readFileSync(path.join(__dirname, '../sidecars/usage_hud/ui.html'), 'utf8');
const preload = fs.readFileSync(process.argv[3] || path.join(os.homedir(), '.gemini/antigravity/lib/node_modules/sidecar_sdk/preload.js'), 'utf8');
const output = process.argv[4] || fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-ui-'));
fs.mkdirSync(output, { recursive: true });

const agent = { id: 'demo-agent', name: 'HUD Fixer', task: 'Conferindo contraste e layout do painel', detail: 'Lendo arquivo da interface', kind: 'reading', status: 'running' };
const stats = { hasSession: true, conversationId: 'preview-session', fiveHour: { timeLeftMs: 17974000, resetTime: '19:22', consumedPct: 19 }, context: { tokens: 88900, maxTokens: 1048576, pct: 8.48, remaining: 959676 } };
let activity = { kind: 'agents', label: 'Coordenando subagentes', detail: '1 de 1 subagente em atividade', subagents: [agent] };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 472, height: 862 } });
    const errors = [], external = [], checks = [];
    let stopEndpointCalls = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://hud.test') { external.push(url.href); return route.abort(); }
      const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname === '/ui.html') return route.fulfill({ contentType: 'text/html', body: ui });
      if (url.pathname === '/preload.js') return route.fulfill({ contentType: 'application/javascript', body: preload });
      if (url.pathname === '/api/stats') return json(stats);
      if (url.pathname === '/api/activity') return json(activity);
      if (url.pathname === '/api/subagents/stop') { stopEndpointCalls++; return json({ ok: false, status: 'unsupported' }); }
      if (url.pathname === '/_sidecar/get-conversation-metadata') return json({ metadata: {} });
      return route.fulfill({ status: 204 });
    });
    await page.goto('http://hud.test/ui.html?conversationId=preview-session');
    await page.locator('#agent-list li').waitFor();
    await page.evaluate(() => document.fonts.ready);

    // Real preload + host HSL tokens reproduce the inherited black text bug.
    async function hostTheme() {
      await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'theme-change', payload: { cssVariables: {
          '--background': '240 10% 3.9%', '--foreground': '0 0% 98%',
          '--muted': '240 3.7% 15.9%', '--muted-foreground': '240 5% 64.9%',
          '--faint': '#111111', '--surface': '#161616', '--ink': '#111111'
        } }
      } })));
    }
    await hostTheme();
    await page.screenshot({ path: path.join(output, 'painel-472-dark.png'), fullPage: true });
    assert.equal(await page.locator('.agent-avatar .mascot').count(), 1, 'Task text must not replace the avatar');
    assert.equal(await page.locator('.agent-copy > span').textContent(), agent.task);
    assert.equal(await page.locator('.agent-copy > strong').textContent(), agent.name);
    assert.equal(await page.locator('.usage-ring').getAttribute('aria-valuenow'), String(stats.fiveHour.consumedPct));
    assert.equal(await page.locator('.context-track').getAttribute('aria-valuenow'), String(stats.context.pct));

    for (const theme of ['dark', 'light']) {
      await page.evaluate(dark => setTheme(dark), theme === 'dark');
      await hostTheme();
      await page.waitForTimeout(200); // Let the existing button color transition settle before screenshots.
      for (const width of [320, 390, 472, 680, 1024]) {
        await page.setViewportSize({ width, height: 862 });
        const result = await page.evaluate(() => {
          const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          const rgb = css => css.match(/[\d.]+/g).slice(0, 3).map(Number);
          const samples = ['#companion-state', '#companion-detail', '.metric-caption', '#time-title', '#context-max-label', '.usage-caption', '#context-free-label', '#toggle-agents', '.icon-btn', '.agent-copy > span'];
          const contrasts = samples.map(selector => {
            const el = document.querySelector(selector);
            let surface = el;
            while (surface.parentElement && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
            const fg = luminance(rgb(getComputedStyle(el).color));
            const bg = luminance(rgb(getComputedStyle(surface).backgroundColor));
            return { selector, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
          });
          const row = document.querySelector('.agent-list li').getBoundingClientRect();
          const avatar = document.querySelector('.agent-avatar').getBoundingClientRect();
          const copy = document.querySelector('.agent-copy').getBoundingClientRect();
          const stop = document.querySelector('.stop-agent').getBoundingClientRect();
          return { width: innerWidth, scroll: document.documentElement.scrollWidth, contrasts,
            aligned: avatar.right <= copy.left && copy.right <= stop.left && stop.right <= row.right,
            font: getComputedStyle(document.querySelector('.dashboard')).fontFamily };
        });
        assert.equal(result.scroll, width, `Horizontal overflow at ${width}px (${theme})`);
        assert.equal(await page.locator('.time-panel').evaluate(el => getComputedStyle(el).backgroundColor), await page.locator('.context-panel').evaluate(el => getComputedStyle(el).backgroundColor), 'Both metric cards must have exactly the same background');
        assert.ok(result.aligned, `Agent row overlaps at ${width}px (${theme})`);
        assert.match(result.font, /Google Sans Flex/);
        for (const sample of result.contrasts) assert.ok(sample.ratio >= 4.5, `${theme} ${sample.selector} contrast ${sample.ratio.toFixed(2)}`);
        checks.push({ theme, ...result });
        if ([390, 472, 1024].includes(width)) await page.screenshot({ path: path.join(output, `painel-${width}-${theme}.png`), fullPage: true });
      }
    }

    await page.locator('#toggle-agents').click();
    assert.equal(await page.locator('#agent-list').isVisible(), false);
    await page.locator('#toggle-agents').click();
    assert.equal(await page.locator('.agent-avatar .mascot').count(), 1);
    // Fake clipboard: no writes to the user's system clipboard during verification.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedStopRequest = text; } } }));
    await page.locator('.stop-agent').click();
    await page.locator('#toast-notice').waitFor();
    assert.match(await page.locator('#toast-notice').textContent(), /Pedido copiado/);
    assert.match(await page.evaluate(() => window.copiedStopRequest), /demo-agent/);
    assert.match(await page.evaluate(() => window.copiedStopRequest), /HUD Fixer/);
    await page.locator('#stop-agents').click();
    assert.match(await page.evaluate(() => window.copiedStopRequest), /todos os subagentes ativos desta conversa/);
    assert.equal(await page.locator('#agent-list li').getAttribute('data-status'), 'running', 'Copying a request cannot fake a stopped task');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard denied'); } } }));
    await page.locator('.stop-agent').click();
    assert.equal(await page.locator('#stop-request').isVisible(), true);
    assert.match(await page.locator('#stop-request-text').inputValue(), /demo-agent/);
    assert.equal(await page.locator('#stop-request-text').evaluate(el => el.selectionEnd - el.selectionStart), (await page.locator('#stop-request-text').inputValue()).length);
    await page.locator('#close-stop-request').click();
    assert.equal(await page.locator('#stop-request').isVisible(), false);
    assert.equal(stopEndpointCalls, 0, 'The UI must not call the unsupported stop endpoint');

    await page.setViewportSize({ width: 320, height: 862 });
    await page.evaluate(sample => {
      renderActivity({ kind: 'agents', subagents: Array.from({ length: 6 }, (_, i) => ({ ...sample, id: `demo-${i}`, name: 'NomeSemEspacos'.repeat(8), task: 'tarefa/'.repeat(40) })) });
    }, agent);
    assert.equal(await page.locator('.agent-avatar .mascot').count(), 6);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    await page.evaluate(() => renderActivity({ kind: 'idle', subagents: [] }));
    assert.equal(await page.locator('#subagents').isVisible(), false);
    activity = { kind: 'idle', label: 'À disposição', detail: 'Aguardando sua próxima mensagem', subagents: [] };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('#companion-slot .float-body').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(path.join(output, 'verificacao.json'), JSON.stringify({ realAntigravityPreload: true, demoData: true, clipboardMocked: true, copyIndividualAndAll: true, clipboardDenialFallback: true, stopEndpointCalls, matchingMetricBackgrounds: true, checks, errors, external, limits: ['Headless browser; no interaction with the active Antigravity window', 'Telemetry mocked; no claim about live provider quota accuracy', 'Stop requires pasting the copied request into the Antigravity chat'] }, null, 2));
    console.log(JSON.stringify({ success: true, layouts: checks.length, avatarAndTaskPreserved: true, hostColorsIsolated: true, output }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
