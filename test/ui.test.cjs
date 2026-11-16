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

const agent = { id: 'demo-agent', name: 'HUD Fixer', task: 'Conferindo contraste e layout do painel', detail: 'Lendo arquivo da interface', kind: 'reading', status: 'running', depth: 1, context: { tokens: 42000, pct: 4 } };
const stats = {
  hasSession: true,
  conversationId: 'preview-session',
  title: 'Teste de Interface',
  project: 'Mods-Plugins',
  model: { name: 'Gemini 4 Hydrogen', effort: 'Medium', window: 1048576 },
  quota: { exposed: true, consumedPct: 19, remainingPct: 81, resetLabel: 'hoje 19:22', timeLeftMs: 17974000 },
  context: {
    tokens: 88900,
    window: 256000,
    pct: 35,
    free: 167100,
    source: 'language-server',
    groups: [
      { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', tokens: 60000 },
      { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', tokens: 20000 },
      { name: 'Tools', type: 'TOKEN_TYPE_TOOLS', tokens: 8900 },
    ],
  },
  mcp: [
    { server: 'chrome-devtools', tools: [{ name: 'click', bytes: 615 }, { name: 'navigate_page', bytes: 1166 }] },
  ],
};
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
      if (url.pathname === '/api/subagents/stop') { stopEndpointCalls++; return json({ ok: true }); }
      if (url.pathname === '/_sidecar/get-conversation-metadata') return json({ metadata: {} });
      return route.fulfill({ status: 204 });
    });
    await page.goto('http://hud.test/ui.html?conversationId=preview-session');
    await page.locator('#agent-list li').waitFor();
    await page.evaluate(() => document.fonts.ready);

    // O painel segue o tema do host. Legacy Dark e Default Light são os tokens do
    // renderer do Antigravity (2026-11-14); 'hsl' é o trio do shadcn que já quebrou o texto.
    const THEMES = {
      hsl: { '--background': '240 10% 3.9%', '--foreground': '0 0% 98%', '--muted': '240 3.7% 15.9%', '--muted-foreground': '240 5% 64.9%', '--faint': '#111111', '--surface': '#161616', '--ink': '#111111' },
      dark: { '--background': '#101010', '--foreground': '#cccccc', '--primary': '#007acc', '--card': 'color-mix(in srgb, #ffffff 6.5%, #101010)', '--card-border': 'color-mix(in srgb, #cccccc 10%, var(--card))', '--border': 'rgba(255, 255, 255, 0.1)', '--secondary': 'color-mix(in srgb, #ffffff 14%, #101010)', '--muted-foreground': 'color-mix(in srgb, #cccccc 50%, #101010)', '--chart-1': '#60a5fa', '--chart-2': '#fbbf24', '--chart-3': '#34d399' },
      light: { '--background': '#ffffff', '--foreground': '#0a0a0c', '--primary': '#2560a3', '--card': '#ffffff', '--card-border': 'rgb(10 10 12 / 0.12)', '--border': 'rgb(10 10 12 / 0.11)', '--secondary': 'rgb(10 10 12 / 0.095)', '--muted-foreground': '#52525b', '--chart-1': '#1d4ed8', '--chart-2': '#b45309', '--chart-3': '#15803d' },
    };
    async function hostTheme(name = 'hsl') {
      await page.evaluate(cssVariables => window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'theme-change', payload: { cssVariables }
      } })), THEMES[name]);
    }
    await hostTheme();
    assert.equal(await page.locator('#motion-toggle').count(), 0, 'Sem botão de pausa');
    await page.screenshot({ path: path.join(output, 'painel-472-dark.png'), fullPage: true });
    assert.equal(await page.locator('.agent-avatar .mascot').count(), 1, 'Task text must not replace the avatar');
    assert.equal(await page.locator('.agent-copy > span').textContent(), agent.task);
    assert.equal(await page.locator('.agent-copy > strong > b').textContent(), agent.name);
    assert.equal(await page.locator('#session-title').textContent(), stats.title);
    assert.equal(await page.locator('.usage-ring').getAttribute('aria-valuenow'), String(stats.quota.consumedPct));
    assert.equal(await page.locator('.context-track').getAttribute('aria-valuenow'), String(stats.context.pct));

    // Cota nova: 5h como principal e semana recolhida no detalhe.
    const quota5h = {
      exposed: true,
      window: '5 horas',
      consumedPct: 8,
      remainingPct: 92,
      resetLabel: 'em 3h30',
      timeLeftMs: 12_600_000,
      detail: [{ name: 'Semana', remainingPct: 82, resetLabel: 'em 4d14h' }],
      note: 'A janela principal é a de 5 horas.',
    };
    await page.evaluate(([base, q]) => renderTelemetry({ ...base, quota: q }), [stats, quota5h]);
    assert.equal(await page.locator('#time-caption').textContent(), 'Tempo até renovar · 5 horas');
    assert.equal(await page.locator('#quota-toggle').isVisible(), true);
    assert.equal(await page.locator('#quota-detail').isVisible(), false);
    await page.locator('#quota-toggle').click();
    assert.equal(await page.locator('#quota-detail').isVisible(), true);
    assert.equal(await page.locator('#quota-groups li').count(), 1);
    assert.equal(await page.locator('#quota-groups li .context-name').textContent(), 'Semana');
    assert.equal(await page.locator('#quota-groups li .context-pct').textContent(), '82%');
    assert.equal(await page.locator('#quota-note').textContent(), quota5h.note);

    // Semanal como principal: dias/horas sem segundos e 5h "Não se aplica".
    const quotaWeekly = {
      exposed: true,
      window: 'semana',
      consumedPct: 100,
      remainingPct: 0,
      resetLabel: 'em 3d15h',
      days: 3,
      hours: 15,
      detail: [{ name: '5 horas', notApplicable: true }],
      note: 'Cota semanal esgotada; a janela de 5 horas não se aplica.',
    };
    await page.evaluate(([base, q]) => renderTelemetry({ ...base, quota: q }), [stats, quotaWeekly]);
    assert.equal(await page.locator('#time-h').textContent(), '03d');
    assert.equal(await page.locator('#time-m').textContent(), '15h');
    assert.equal(await page.locator('.usage-remaining').textContent(), '0% disponível · esgotada');
    assert.equal(await page.locator('#quota-groups li .context-tokens').textContent(), 'Não se aplica');
    await page.locator('#quota-toggle').click();
    await page.evaluate(stub => renderTelemetry(stub), stats);

    // Sem remainingFraction o painel não pode inventar zero.
    await page.evaluate(stub => renderTelemetry({ ...stub, quota: { exposed: false, consumedPct: null, remainingPct: null, resetLabel: 'sex 08:44', timeLeftMs: 520303493 } }), stats);
    assert.equal(await page.locator('#usage-value').textContent(), '—');
    assert.equal(await page.locator('.usage-percent-symbol').isVisible(), false);
    assert.equal(await page.locator('#usage-caption').textContent(), 'sem percentual');
    await page.evaluate(stub => renderTelemetry(stub), stats);

    for (const theme of ['dark', 'light']) {
      await hostTheme(theme);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      await page.waitForTimeout(200); // Deixa a transição de cor existente assentar antes das capturas.
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
          return { width: innerWidth, scroll: document.documentElement.scrollWidth, contrasts,
            aligned: avatar.right <= copy.left && copy.right <= row.right,
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
    assert.equal(await page.locator('.agent-stop').count(), 1, 'Running subagent must have a stop button');
    assert.equal(await page.locator('.agent-stop').getAttribute('title'), 'Parar subagente');
    assert.equal(await page.locator('.agent-stop-confirm').isVisible(), false);
    assert.equal(await page.locator('.agent-stop-cancel').isVisible(), false);
    assert.ok(!/navigator\.clipboard|copyStopRequest|Parar pelo chat/.test(ui));

    // Primeiro clique pede confirmação; cancelar não chama o endpoint.
    await page.locator('.agent-stop').click();
    assert.equal(await page.locator('.agent-stop-confirm').isVisible(), true);
    assert.equal(await page.locator('.agent-stop-cancel').isVisible(), true);
    assert.equal(await page.locator('.agent-stop').isVisible(), false);
    assert.equal(stopEndpointCalls, 0);
    await page.locator('.agent-stop-cancel').click();
    assert.equal(await page.locator('.agent-stop-confirm').isVisible(), false);
    assert.equal(await page.locator('.agent-stop').isVisible(), true);
    assert.equal(stopEndpointCalls, 0);

    // Confirmar chama o endpoint e some com os controles.
    await page.locator('.agent-stop').click();
    await page.locator('.agent-stop-confirm').click();
    await page.waitForTimeout(150);
    assert.equal(stopEndpointCalls, 1, 'Confirming stop must call the stop endpoint');
    assert.equal(await page.locator('.agent-stop').isVisible(), false, 'Stop button disappears after the confirmation');
    assert.equal(await page.locator('.agent-stop-confirm').isVisible(), false);

    await page.locator('#context-toggle').click();
    assert.equal(await page.locator('#context-groups li').count(), 4, 'Context detail lists three groups plus free space');
    await page.locator('#mcp-toggle').click();
    assert.equal(await page.locator('.mcp-server').count(), 1);
    assert.equal(await page.locator('.mcp-tools li').count(), 2);
    await page.locator('#context-toggle').click();

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
    assert.equal(await page.locator('#companion-slot .mascot').evaluate(el => [el, ...el.querySelectorAll('*')].filter(node => getComputedStyle(node).animationName !== 'none').length), 0, 'Movimento reduzido para todas as animações do Sparky');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(path.join(output, 'verificacao.json'), JSON.stringify({ realAntigravityPreload: true, demoData: true, stopControlPresent: true, stopEndpointCalls, matchingMetricBackgrounds: true, checks, errors, external, limits: ['Headless browser; no interaction with the active Antigravity window', 'Telemetry mocked; no claim about live provider quota accuracy', 'The visual stop button is mocked here; the real cancellation was validated against the Antigravity Language Server on 2026-11-14'] }, null, 2));
    console.log(JSON.stringify({ success: true, layouts: checks.length, avatarAndTaskPreserved: true, hostColorsIsolated: true, stopControlPresent: true, output }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
