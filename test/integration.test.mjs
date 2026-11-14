import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createActivityModel, classifyTool, describeCall } from '../sidecars/usage_hud/activity-engine.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const collectorPath = path.resolve(__dirname, '../scripts/hook-collector.mjs')

console.log('🧪 Iniciando suíte de testes de integração do AGY UsageHUD V7...\n')

// Helper to spawn hook-collector with stdin and get stdout/stderr
function runHook(eventName, inputJson, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [collectorPath, eventName], {
      env: { ...process.env, ...env }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => stdout += d)
    child.stderr.on('data', d => stderr += d)
    child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }))
    child.on('error', reject)

    if (inputJson !== null) {
      child.stdin.write(typeof inputJson === 'string' ? inputJson : JSON.stringify(inputJson))
    }
    child.stdin.end()
  })
}

// 1. Testes de parser de hooks e respostas de stdout
console.log('1. Validando parser de hooks e respostas neutras de stdout...')
for (const ev of ['SessionStart', 'PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation', 'Stop']) {
  const res = await runHook(ev, { conversationId: 'test-session-1' })
  assert.equal(res.code, 0, `Hook ${ev} deve sair com código 0`)
  assert.equal(res.stdout, '{}', `Hook ${ev} deve retornar {} neutro no stdout`)
}

// Test invalid JSON input
{
  const res = await runHook('PreToolUse', 'INVALID_JSON_CONTENT{{{{')
  assert.equal(res.code, 0, 'Hook com JSON inválido deve sair com 0')
  assert.equal(res.stdout, '{}', 'Hook com JSON inválido deve retornar {} no stdout')
}

// Test missing fields and null input
{
  const res = await runHook('Stop', null)
  assert.equal(res.code, 0, 'Hook com stdin vazio deve sair com 0')
  assert.equal(res.stdout, '{}', 'Hook com stdin vazio deve retornar {}')
}
console.log('   ✓ Parser e saídas de stdout validados para todos os eventos e falhas de input.')

// 2. Classificação de ferramentas reais e geração de descrições sanitizadas
console.log('2. Validando classificação e sanitização das ferramentas reais...')
const toolTests = [
  { call: { name: 'search_web', args: { query: 'google antigravity v7' } }, expectedKind: 'web', expectedSub: 'Busca: google antigravity v7' },
  { call: { name: 'read_url_content', args: { Url: 'https://antigravity.google/docs/hooks?token=SECRET123' } }, expectedKind: 'page', expectedSub: 'Fonte: antigravity.google' },
  { call: { name: 'read_file', args: { Path: 'C:\\projects\\app\\src\\index.js' } }, expectedKind: 'reading', expectedSub: 'Arquivo: index.js' },
  { call: { name: 'grep_search', args: { Query: 'function test()' } }, expectedKind: 'files', expectedSub: 'Busca no projeto: function test()' },
  { call: { name: 'edit_file', args: { Path: 'E:\\Brain\\config.json' } }, expectedKind: 'writing', expectedSub: 'Arquivo: config.json' },
  { call: { name: 'run_command', args: { toolSummary: 'Package build' } }, expectedKind: 'terminal', expectedSub: 'Comando: Package build' },
  { call: { name: 'invoke_subagent', args: { Role: 'Pesquisador de código' } }, expectedKind: 'agents', expectedSub: 'Invocando subagente: Pesquisador de código' },
  { call: { name: 'ask_question', args: { questions: ['Sim', 'Não'] } }, expectedKind: 'question', expectedSub: 'Aguardando sua confirmação ou resposta' },
]

for (const t of toolTests) {
  const kind = classifyTool(t.call.name)
  const detail = describeCall(t.call)
  assert.equal(kind, t.expectedKind, `Tool ${t.call.name} deve ter kind ${t.expectedKind}`)
  assert.ok(detail.includes(t.expectedSub), `Detail "${detail}" deve conter "${t.expectedSub}"`)
}
console.log('   ✓ Mapeamento, classificação e sanitização das ferramentas comprovados.')

// 3. Concorrência, duplicação e reordenação no ActivityModel
console.log('3. Validando máquina de estados contra duplicações e reordenações...')
{
  const model = createActivityModel('test-session-2')
  assert.equal(model.snapshot().kind, 'idle')

  // PreToolUse 1
  model.receive('PreToolUse', { conversationId: 'test-session-2', stepIdx: 1, toolCall: { name: 'search_web', args: { query: 'antigravity' } } })
  assert.equal(model.snapshot().kind, 'web')
  assert.equal(model.snapshot().activeCount, 1)

  // PreToolUse 2 (simultâneo)
  model.receive('PreToolUse', { conversationId: 'test-session-2', stepIdx: 2, toolCall: { name: 'run_command', args: { toolSummary: 'build' } } })
  assert.equal(model.snapshot().kind, 'terminal')
  assert.equal(model.snapshot().activeCount, 2)

  // PostToolUse 2 antes de 1 (reordenação)
  model.receive('PostToolUse', { conversationId: 'test-session-2', stepIdx: 2, toolCall: { name: 'run_command' } })
  assert.equal(model.snapshot().activeCount, 1)
  assert.equal(model.snapshot().kind, 'web', 'Tool 1 ainda ativa deve permanecer como foco')

  // Duplicação de PostToolUse 2 não deve corromper estado
  model.receive('PostToolUse', { conversationId: 'test-session-2', stepIdx: 2, toolCall: { name: 'run_command' } })
  assert.equal(model.snapshot().activeCount, 1)

  // Conclusão de 1
  model.receive('PostToolUse', { conversationId: 'test-session-2', stepIdx: 1, toolCall: { name: 'search_web' } })
  assert.equal(model.snapshot().activeCount, 0)
  assert.equal(model.snapshot().kind, 'waiting')

  // PreInvocation (pensando)
  model.receive('PreInvocation', { conversationId: 'test-session-2' })
  assert.equal(model.snapshot().kind, 'model')

  // Stop normal: pose "Concluído" transitória (o assentamento é testado abaixo)
  model.receive('Stop', { conversationId: 'test-session-2', terminationReason: 'NO_TOOL_CALL', fullyIdle: true })
  assert.equal(model.snapshot().kind, 'done')
  assert.equal(model.snapshot().activeCount, 0)
}
console.log('   ✓ Concorrência, reordenação e recuperação comprovadas.')

// 3b. Stop/terminationReason reais, assentamento e erro curto de ferramenta
console.log('3b. Validando reações de Stop e assentamento...')
{
  let clock = Date.parse('2026-11-14T12:00:00Z')
  const now = () => clock
  const stamp = () => new Date(clock).toISOString()
  const stopCase = (reason, extra = {}) => {
    const m = createActivityModel('stop', { now })
    m.receive('PreToolUse', { conversationId: 'stop', stepIdx: 1, toolCall: { name: 'run_command' }, timestamp: stamp() })
    return { m, snap: m.receive('Stop', { conversationId: 'stop', terminationReason: reason, fullyIdle: true, timestamp: stamp(), ...extra }) }
  }

  const cases = [
    ['NO_TOOL_CALL', 'done'],
    ['USER_CANCELED', 'interrupted'],
    ['USER_CANCELLED', 'interrupted'],
    ['CANCELED', 'interrupted'],
    ['EXECUTOR_TERMINATION_REASON_USER_CANCELED', 'interrupted'],
    ['ERROR', 'error'],
    ['MAX_INVOCATIONS', 'ended'],
    ['MAX_FORCED_INVOCATIONS', 'ended'],
    ['TERMINAL_STEP_TYPE', 'ended'],
    ['TERMINAL_CUSTOM_HOOK', 'ended'],
    ['', 'ended'],
  ]
  for (const [reason, expected] of cases) {
    const { snap } = stopCase(reason)
    assert.equal(snap.kind, expected, `Stop ${reason || '(vazio)'} → ${expected}`)
    assert.equal(snap.activeCount, 0, 'Stop limpa chamadas ativas')
    assert.ok(snap.settleMs > 5000 && snap.settleMs <= 6000, 'transitória de ~6 s')
  }
  // Cancelamento vence o campo error; error preenchido sem motivo vira erro.
  assert.equal(stopCase('USER_CANCELED', { error: 'canceled by user' }).snap.kind, 'interrupted')
  assert.equal(stopCase('NO_TOOL_CALL', { error: 'boom' }).snap.kind, 'error')

  // Assenta: concluído → idle; interrompido com background → waiting.
  {
    const { m } = stopCase('NO_TOOL_CALL')
    clock += 6001
    assert.equal(m.snapshot().kind, 'idle')
    assert.equal(m.snapshot().settleMs, 0)
    clock -= 6001
  }
  {
    const m = createActivityModel('bg', { now })
    m.receive('Stop', { conversationId: 'bg', terminationReason: 'USER_CANCELED', fullyIdle: false, timestamp: stamp() })
    assert.equal(m.snapshot().kind, 'interrupted')
    assert.ok(m.snapshot().detail.includes('segundo plano'))
    clock += 6001
    assert.equal(m.snapshot().kind, 'waiting')
    clock -= 6001
  }

  // O mesmo Stop relido do activity-state.json não reacende a pose.
  {
    const m = createActivityModel('replay', { now })
    const stop = { conversationId: 'replay', terminationReason: 'NO_TOOL_CALL', fullyIdle: true, timestamp: stamp() }
    m.receive('Stop', stop)
    clock += 6001
    assert.equal(m.receive('Stop', stop).kind, 'idle', 'replay do mesmo Stop é ignorado')
    // Stop antigo num modelo novo (servidor reiniciado) já nasce assentado.
    assert.equal(createActivityModel('replay', { now }).receive('Stop', stop).kind, 'idle')
    clock -= 6001
  }

  // Erro de ferramenta: aviso curto e volta para waiting.
  {
    const m = createActivityModel('tool-err', { now })
    m.receive('PreToolUse', { conversationId: 'tool-err', stepIdx: 3, toolCall: { name: 'read_file' }, timestamp: stamp() })
    const snap = m.receive('PostToolUse', { conversationId: 'tool-err', stepIdx: 3, toolCall: { name: 'read_file' }, error: 'ENOENT', timestamp: stamp() })
    assert.equal(snap.kind, 'error')
    assert.ok(snap.settleMs > 0 && snap.settleMs <= 4000)
    clock += 4001
    assert.equal(m.snapshot().kind, 'waiting')
    clock -= 4001
    // PostToolUse sem erro (string vazia) não é erro.
    m.receive('PreToolUse', { conversationId: 'tool-err', stepIdx: 4, toolCall: { name: 'read_file' }, timestamp: stamp() })
    assert.equal(m.receive('PostToolUse', { conversationId: 'tool-err', stepIdx: 4, toolCall: { name: 'read_file' }, error: '' }).kind, 'waiting')
  }

  // Eventos → animação.
  {
    const m = createActivityModel('flow', { now })
    assert.equal(m.receive('SessionStart', { conversationId: 'flow' }).kind, 'idle')
    assert.equal(m.receive('PreInvocation', { conversationId: 'flow', invocationNum: 1 }).kind, 'model')
    assert.equal(m.receive('PostInvocation', { conversationId: 'flow', invocationNum: 1 }).kind, 'waiting')
  }

  // Mapeamento das ferramentas reais do transcript.
  const kinds = {
    read_file: 'reading', view_file: 'reading',
    write_file: 'writing', edit_file: 'writing', write_to_file: 'writing', replace_file_content: 'writing', multi_replace_file_content: 'writing',
    grep_search: 'files', find_by_name: 'files', list_dir: 'files', list_resources: 'files',
    search_web: 'web', read_url_content: 'page', webview_browser: 'browser',
    run_command: 'terminal', manage_task: 'terminal',
    invoke_subagent: 'agents', manage_subagents: 'agents', define_subagent: 'agents', send_message: 'agents', swarm: 'agents', swarm_spawn: 'agents', run_workflow: 'agents',
    ask_question: 'question', ask_permission: 'question', generate_image: 'image', schedule: 'timer',
    list_permissions: 'external', list_plugin_accounts: 'external', search_marketplace: 'external', call_mcp_tool: 'external', mcp_github_search: 'external',
  }
  for (const [name, kind] of Object.entries(kinds)) assert.equal(classifyTool(name), kind, `${name} → ${kind}`)
  assert.equal(describeCall({ name: 'webview_browser', args: { Url: 'https://example.com/a?token=x' } }), 'Navegador: example.com')
  assert.equal(describeCall({ name: 'mcp_github_search' }), 'MCP: github_search')
  // Payload sanitizado do coletor (sem args) mantém o detalhe calculado no hook.
  assert.equal(describeCall({ name: 'read_file', kind: 'reading', detail: 'Arquivo: index.js' }), 'Arquivo: index.js')
}
console.log('   ✓ Concluído, interrompido, erro, encerrado e assentamento comprovados.')

// 4. Isolamento estrito de sessão
console.log('4. Validando isolamento de sessões...')
{
  const modelA = createActivityModel('conv-A')
  const modelB = createActivityModel('conv-B')

  modelA.receive('PreToolUse', { conversationId: 'conv-A', stepIdx: 1, toolCall: { name: 'view_file', args: { Path: 'a.js' } } })
  modelB.receive('PreToolUse', { conversationId: 'conv-B', stepIdx: 1, toolCall: { name: 'run_command', args: { toolSummary: 'test' } } })

  assert.equal(modelA.snapshot().kind, 'reading')
  assert.equal(modelB.snapshot().kind, 'terminal')

  // Enviar evento de conv-A para modelB deve ser completamente ignorado
  modelB.receive('PostToolUse', { conversationId: 'conv-A', stepIdx: 1, toolCall: { name: 'view_file' } })
  assert.equal(modelB.snapshot().kind, 'terminal', 'Evento de outra conversa não pode alterar modelB')
}
console.log('   ✓ Isolamento entre conversas comprovado.')

// 5. Verificação da escrita atômica no diretório da sessão
console.log('5. Validando gravação atômica de telemetria no diretório de artefatos...')
{
  const tmpArtifactDir = path.join(os.tmpdir(), `agy-test-artifact-${Date.now()}`)
  fs.mkdirSync(tmpArtifactDir, { recursive: true })

  await runHook('PreToolUse', {
    conversationId: 'atomic-test-conv',
    artifactDirectoryPath: tmpArtifactDir,
    stepIdx: 10,
    toolCall: { name: 'search_web', args: { query: 'atomic write' } }
  })

  const stateFile = path.join(tmpArtifactDir, '.system_generated', 'activity-state.json')
  assert.ok(fs.existsSync(stateFile), 'activity-state.json deve existir no artifactDir')
  const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  assert.equal(content.conversationId, 'atomic-test-conv')
  assert.equal(content.toolCall.kind, 'web')
  assert.equal(content.toolCall.detail, 'Busca: atomic write')

  // Cleanup
  fs.rmSync(tmpArtifactDir, { recursive: true, force: true })
}
console.log('   ✓ Gravação atômica local comprovada.')

// 6. Endpoint real de parada: validação sem tocar no Language Server
console.log('6. Validando o endpoint de parada do sidecar...')
{
  const serverPath = path.resolve(__dirname, '../sidecars/usage_hud/server.mjs')
  const sidecar = spawn(process.execPath, [serverPath], {
    env: { ...process.env, ANTIGRAVITY_SIDECAR_WEB_PORT: '0', USAGE_HUD_NO_INFO: '1' },
  })
  let output = ''
  sidecar.stdout.on('data', chunk => (output += chunk))
  sidecar.stderr.on('data', () => {})

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sidecar não iniciou a tempo')), 8000)
    sidecar.stdout.on('data', () => {
      const match = /127\.0\.0\.1:(\d+)/.exec(output)
      if (!match) return
      clearTimeout(timer)
      resolve(Number(match[1]))
    })
    sidecar.on('exit', code => {
      clearTimeout(timer)
      reject(new Error(`sidecar saiu com código ${code}`))
    })
  })

  try {
    const missing = await fetch(`http://127.0.0.1:${port}/api/subagents/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(missing.status, 400, 'Sem conversationId e agentId deve recusar com 400')

    const foreign = await fetch(`http://127.0.0.1:${port}/api/subagents/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv-sem-filhos', agentId: 'filho-inexistente' }),
    })
    assert.equal(foreign.status, 403, 'Subagente que não pertence à conversa deve recusar com 403')
  } finally {
    sidecar.kill()
  }
}
console.log('   ✓ Endpoint de parada valida entrada e vínculo antes do Language Server.')

// 7. Language Server fora do ar: /api/activity e /api/stats não podem dar 500
console.log('7. Validando queda do Language Server (porta recusada, sem token)...')
{
  const serverPath = path.resolve(__dirname, '../sidecars/usage_hud/server.mjs')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-ls-down-'))
  const convId = 'conv-ls-down'
  const logs = path.join(home, '.gemini', 'antigravity', 'brain', convId, '.system_generated', 'logs')
  fs.mkdirSync(logs, { recursive: true })
  fs.writeFileSync(path.join(logs, 'transcript.jsonl'), JSON.stringify({ type: 'PLANNER_RESPONSE', input_tokens: 1000, cache_read_tokens: 500, output_tokens: 20 }) + '\n')

  const env = { ...process.env, USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData'), ANTIGRAVITY_SIDECAR_WEB_PORT: '0', USAGE_HUD_NO_INFO: '1', ANTIGRAVITY_LS_ADDRESS: 'http://127.0.0.1:1' }
  delete env.ANTIGRAVITY_CSRF_TOKEN
  delete env.ANTIGRAVITY_APP_DATA_DIR
  const sidecar = spawn(process.execPath, [serverPath], { env })
  let output = ''
  sidecar.stdout.on('data', chunk => (output += chunk))
  sidecar.stderr.on('data', () => {})
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sidecar não iniciou a tempo')), 8000)
    sidecar.stdout.on('data', () => {
      const match = /127\.0\.0\.1:(\d+)/.exec(output)
      if (!match) return
      clearTimeout(timer)
      resolve(Number(match[1]))
    })
    sidecar.on('exit', code => { clearTimeout(timer); reject(new Error(`sidecar saiu com código ${code}`)) })
  })
  const base = `http://127.0.0.1:${port}`

  try {
    await fetch(`${base}/api/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'PreToolUse', conversationId: convId, stepIdx: 1, toolCall: { name: 'run_command', detail: 'Comando: npm test' }, timestamp: new Date().toISOString() }),
    })

    // Duas vezes: a segunda passa pelo null em cache.
    for (let i = 0; i < 2; i++) {
      const act = await fetch(`${base}/api/activity?convId=${convId}`)
      assert.equal(act.status, 200, '/api/activity deve responder 200 com o Language Server fora do ar')
      const data = await act.json()
      assert.equal(data.kind, 'terminal', 'estado atual preservado')
      assert.ok(Array.isArray(data.subagents), 'subagentes presentes (sem janela)')
    }

    const stats = await fetch(`${base}/api/stats?convId=${convId}`)
    assert.equal(stats.status, 200, '/api/stats deve responder 200 com o Language Server fora do ar')
    const data = await stats.json()
    assert.equal(data.context.source, 'transcript', 'cai na leitura do transcript')
    assert.equal(data.context.tokens, 1500, 'tokens vindos do transcript')
    assert.equal(data.context.window, null, 'sem janela do Language Server')
    assert.equal(data.context.pct, null, 'sem percentual sem janela')
  } finally {
    sidecar.kill()
    fs.rmSync(home, { recursive: true, force: true })
  }
}
console.log('   ✓ Language Server fora do ar: activity e stats respondem 200 pelo transcript.')

// 8. Descoberta do Language Server: a porta mais nova do log pode estar morta
//    (o app reinicia e deixa rastro), e o painel precisa achar a anterior viva.
console.log('\n8. Validando descoberta do Language Server (porta nova morta, anterior viva)...')
{
  const serverPath = path.resolve(__dirname, '../sidecars/usage_hud/server.mjs')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-ls-discovery-'))
  const convId = 'conv-ls-discovery'
  const logs = path.join(home, '.gemini', 'antigravity', 'brain', convId, '.system_generated', 'logs')
  fs.mkdirSync(logs, { recursive: true })
  fs.writeFileSync(path.join(logs, 'transcript.jsonl'), JSON.stringify({ type: 'PLANNER_RESPONSE', input_tokens: 1000, cache_read_tokens: 500, output_tokens: 20 }) + '\n')

  const usage = { estimatedTokensUsed: 1500, maxContextTokens: 256000, tokenGroups: [{ name: 'Mensagens', numTokens: 900 }] }
  const fakeLs = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><script>window.__x = {"csrfToken":"teste-csrf"}</script></html>')
      return
    }
    if (req.method === 'POST' && req.url.includes('StreamAgentStateUpdates')) {
      let body = ''
      req.on('data', chunk => (body += chunk))
      req.on('end', () => {
        const payload = Buffer.from(JSON.stringify({ update: { conversationId: convId, contextWindowUsage: usage } }))
        const header = Buffer.from([0, (payload.length >>> 24) & 255, (payload.length >>> 16) & 255, (payload.length >>> 8) & 255, payload.length & 255])
        res.writeHead(200, { 'Content-Type': 'application/connect+json' })
        res.end(Buffer.concat([header, payload]))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  const livePort = await new Promise(resolve => fakeLs.listen(0, '127.0.0.1', () => resolve(fakeLs.address().port)))

  // A porta viva vem antes no arquivo; a morte entra depois, como "mais nova".
  const logDir = path.join(home, 'AppData', 'Antigravity', 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  fs.writeFileSync(
    path.join(logDir, 'language_server.log'),
    [
      `ERROR: logging before google.Init: I1114 10:00:00.000000 1 server.go:1131] Language server listening on random port at ${livePort} for HTTPS (gRPC)`,
      `ERROR: logging before google.Init: I1114 10:00:00.001000 1 server.go:1139] Language server listening on random port at ${livePort} for HTTP`,
      'ERROR: logging before google.Init: I1114 10:05:00.000000 1 server.go:1139] Language server listening on random port at 9 for HTTP',
    ].join('\n') + '\n',
  )

  const env = { ...process.env, USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData'), ANTIGRAVITY_SIDECAR_WEB_PORT: '0', USAGE_HUD_NO_INFO: '1' }
  delete env.ANTIGRAVITY_CSRF_TOKEN
  delete env.ANTIGRAVITY_LS_ADDRESS
  const sidecar = spawn(process.execPath, [serverPath], { env })
  let output = ''
  sidecar.stdout.on('data', chunk => (output += chunk))
  sidecar.stderr.on('data', () => {})
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sidecar não iniciou a tempo')), 8000)
    sidecar.stdout.on('data', () => {
      const match = /127\.0\.0\.1:(\d+)/.exec(output)
      if (!match) return
      clearTimeout(timer)
      resolve(Number(match[1]))
    })
    sidecar.on('exit', code => { clearTimeout(timer); reject(new Error(`sidecar saiu com código ${code}`)) })
  })

  try {
    const stats = await fetch(`http://127.0.0.1:${port}/api/stats?convId=${convId}`)
    assert.equal(stats.status, 200)
    const data = await stats.json()
    assert.equal(data.context.source, 'language-server', 'usa o Language Server vivo, não a porta morta')
    assert.equal(data.context.window, 256000, 'limite efetivo vem do Language Server')
    assert.equal(data.context.tokens, 1500, 'tokens do Language Server')
    assert.equal(data.context.pct, 1, 'percentual calculado sobre o limite real')
  } finally {
    sidecar.kill()
    fakeLs.close()
    fs.rmSync(home, { recursive: true, force: true })
  }
}
console.log('   ✓ Porta morta é descartada e o limite vem do Language Server vivo.')

// 9. App recém-aberto: nenhuma sessão desta execução, painel vazio.
console.log('\n9. Validando painel zerado ao abrir o app (sessão de ontem não conta)...')
{
  const serverPath = path.resolve(__dirname, '../sidecars/usage_hud/server.mjs')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-fresh-'))
  const convId = 'conv-de-ontem'
  const logs = path.join(home, '.gemini', 'antigravity', 'brain', convId, '.system_generated', 'logs')
  fs.mkdirSync(logs, { recursive: true })
  const transcript = path.join(logs, 'transcript.jsonl')
  fs.writeFileSync(transcript, JSON.stringify({ type: 'PLANNER_RESPONSE', input_tokens: 90000, output_tokens: 10 }) + '\n')
  const old = new Date(Date.now() - 3 * 3600_000)
  fs.utimesSync(transcript, old, old)

  const env = { ...process.env, USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData'), ANTIGRAVITY_SIDECAR_WEB_PORT: '0', USAGE_HUD_NO_INFO: '1' }
  delete env.ANTIGRAVITY_CSRF_TOKEN
  delete env.ANTIGRAVITY_LS_ADDRESS
  const sidecar = spawn(process.execPath, [serverPath], { env })
  let output = ''
  sidecar.stdout.on('data', chunk => (output += chunk))
  sidecar.stderr.on('data', () => {})
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sidecar não iniciou a tempo')), 8000)
    sidecar.stdout.on('data', () => {
      const match = /127\.0\.0\.1:(\d+)/.exec(output)
      if (!match) return
      clearTimeout(timer)
      resolve(Number(match[1]))
    })
    sidecar.on('exit', code => { clearTimeout(timer); reject(new Error(`sidecar saiu com código ${code}`)) })
  })

  try {
    const stats = await (await fetch(`http://127.0.0.1:${port}/api/stats`)).json()
    assert.equal(stats.conversationId, null, 'sem convId, a sessão de ontem não é adotada')
    assert.equal(stats.hasSession, false)
    assert.equal(stats.context.tokens, null, 'nenhum token inventado')
    assert.equal(stats.context.window, null)

    const activity = await (await fetch(`http://127.0.0.1:${port}/api/activity`)).json()
    assert.equal(activity.kind, 'idle')
    assert.match(activity.detail, /Nenhuma sess/i)

    // A sessão desta execução aparece assim que existe.
    const fresh = path.join(home, '.gemini', 'antigravity', 'brain', 'conv-de-agora', '.system_generated', 'logs')
    fs.mkdirSync(fresh, { recursive: true })
    fs.writeFileSync(path.join(fresh, 'transcript.jsonl'), JSON.stringify({ type: 'PLANNER_RESPONSE', input_tokens: 1234, output_tokens: 5 }) + '\n')
    const next = await (await fetch(`http://127.0.0.1:${port}/api/stats?_t=1`)).json()
    assert.equal(next.conversationId, 'conv-de-agora', 'a conversa nova entra no lugar')
    assert.equal(next.context.tokens, 1234)
  } finally {
    sidecar.kill()
    fs.rmSync(home, { recursive: true, force: true })
  }
}
console.log('   ✓ Painel abre zerado e adota a sessão nova quando ela existe.')

console.log('\n🎉 Todos os testes de integração foram executados e passaram com 100% de sucesso!')
