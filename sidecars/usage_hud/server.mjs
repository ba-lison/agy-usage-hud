import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createActivityModel } from './activity-engine.mjs'
import {
  childInfo,
  childrenOf,
  contextFromSteps,
  contextPct,
  homeDir,
  latestConversationId,
  modelFor,
  parseSteps,
  projectOf,
  promptTitle,
  quotaFor,
  quotaReading,
  readTail,
  splitModel,
  summaryFor,
  transcriptPath,
} from './metrics.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Marca de quando o app subiu: o carregamento deste sidecar, que sobe junto com
// o app. Tudo que for mais antigo é sessão da execução anterior e não deve
// aparecer no painel recém-aberto. O log do Language Server não serve de âncora:
// o app trunca o arquivo em vez de recriá-lo, então a data de criação fica
// meses atrás e qualquer conversa de hoje passaria pelo corte.
const RUN_STARTED_AT = Date.now()

// Session state storage: Map<conversationId, ActivityModel>
const sessionModels = new Map()

/* ---------------- quota do host ---------------- */

// A cota por modelo vem do Language Server do próprio app. O percentual só
// existe quando o modelo informa remainingFraction; sem isso, o painel mostra
// a renovação e nenhum número.
const configsCache = { at: 0, models: [] }
const csrfCache = { at: 0, port: 0, token: null }
const baseCache = { at: 0, base: '' }

function languageServerLogPorts() {
  const roam = process.env.APPDATA || path.join(homeDir(), 'AppData', 'Roaming')
  try {
    const log = fs.readFileSync(path.join(roam, 'Antigravity', 'logs', 'language_server.log'), 'utf8')
    const ports = [...log.matchAll(/listening on random port at (\d+) for HTTP/g)]
      .map(match => parseInt(match[1], 10))
      .filter(port => Number.isFinite(port) && port > 0)
    // A porta mais nova fica por último no log. O app sobe dois listeners (HTTPS
    // e HTTP); só o HTTP responde ao CSRF, então a ordem importa.
    return [...new Set(ports)].reverse()
  } catch {
    return []
  }
}

// O app reinicia o Language Server com outra porta e pode deixar mais de um
// vivo (app e CLI). Em vez de confiar em uma única porta, os candidatos são
// testados e o que responde fica em cache até falhar.
function languageServerCandidates() {
  const list = []
  const cached = baseCache.base
  if (cached && Date.now() - baseCache.at < 5 * 60_000) list.push(cached)
  const env = process.env.ANTIGRAVITY_LS_ADDRESS
  if (env) list.push(env.replace(/\/$/, ''))
  for (const port of languageServerLogPorts()) list.push(`http://127.0.0.1:${port}`)
  return [...new Set(list)]
}

function forgetLanguageServer() {
  baseCache.base = ''
  baseCache.at = 0
  csrfCache.at = 0
}

function request(port, pathname, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers }, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.setTimeout(2000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    if (body !== null) req.write(body)
    req.end()
  })
}

async function csrfFor(port) {
  if (csrfCache.port === port && Date.now() - csrfCache.at < 5 * 60_000) return csrfCache.token
  const html = await request(port, '/')
  const token = /"csrfToken"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null
  if (token) {
    csrfCache.port = port
    csrfCache.token = token
    csrfCache.at = Date.now()
  }
  return token
}

async function modelConfigs() {
  const now = Date.now()
  if (now - configsCache.at < 30_000) return configsCache.models
  const base = await resolveLanguageServerBase()
  if (!base) return configsCache.models
  try {
    const port = Number(new URL(base).port) || 0
    const csrf = await csrfFor(port)
    if (!csrf) return configsCache.models
    const body = await request(port, '/exa.language_server_pb.LanguageServerService/GetUserStatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-codeium-csrf-token': csrf },
      body: '{}',
    })
    const models = JSON.parse(body)?.userStatus?.cascadeModelConfigData?.clientModelConfigs
    if (Array.isArray(models)) {
      configsCache.models = models
      configsCache.at = now
    }
  } catch {
    // Porta ou CSRF mudaram (o app reiniciou): relê o log na próxima consulta.
    forgetLanguageServer()
  }
  return configsCache.models
}

/* ---------------- contexto detalhado ---------------- */

// O Language Server expõe o estado do agente via Connect (server streaming).
// O primeiro frame já traz contextWindowUsage com o total, o limite efetivo do
// app e os grupos de tokens. Lemos só o primeiro frame e fechamos a conexão.
const contextCache = new Map()
const contextInFlight = new Map()

function connectFirstFrame(base, pathname, body, csrf) {
  const target = new URL(pathname, `${base}/`)
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      req.destroy()
      if (error) reject(error)
      else resolve(value)
    }
    const req = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/connect+json',
        'Content-Length': body.length,
        'Connect-Protocol-Version': '1',
        ...(csrf ? { 'x-codeium-csrf-token': csrf } : {}),
      },
    }, res => {
      if (res.statusCode !== 200) {
        finish(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk])
        if (buffer.length < 5) return
        const length = buffer.readUInt32BE(1)
        if (buffer.length < 5 + length) return
        finish(null, buffer.subarray(5, 5 + length).toString('utf8'))
      })
      res.on('end', () => finish(new Error('stream encerrou sem frame')))
    })
    req.on('error', err => finish(err))
    req.setTimeout(3500, () => finish(new Error('timeout')))
    req.write(body)
    req.end()
  })
}

function contextGroups(groups) {
  if (!Array.isArray(groups)) return []
  return groups.map(group => ({
    name: typeof group.name === 'string' ? group.name : '',
    type: typeof group.type === 'string' ? group.type : '',
    source: typeof group.source === 'string' ? group.source : '',
    tokens: Number.isFinite(group.numTokens) ? group.numTokens : 0,
    children: contextGroups(group.children),
  }))
}

function fetchContextUsage(convId) {
  if (!convId) return Promise.resolve(null)
  const cached = contextCache.get(convId)
  if (cached && Date.now() - cached.at < 4000) return Promise.resolve(cached.value)
  if (contextInFlight.has(convId)) return contextInFlight.get(convId)
  const pending = loadContextUsage(convId)
    .catch(() => null)
    .finally(() => contextInFlight.delete(convId))
  contextInFlight.set(convId, pending)
  return pending
}

// Qualquer falha do Language Server (porta velha, raiz/CSRF recusados, frame
// inválido) vira null: /api/activity e /api/stats seguem pelo transcript em vez
// de responder 500 e congelar o mascote. O null também fica 4 s em cache.
async function loadContextUsage(convId) {
  let value = null
  try {
    value = await readContextUsage(convId)
  } catch {
    value = null
  }
  contextCache.set(convId, { at: Date.now(), value })
  return value
}

// Percorre os candidatos porque o app pode ter mais de um Language Server vivo
// e a porta muda a cada reinício; só troca a escolha quando um deles devolve o
// contexto desta conversa.
async function readContextUsage(convId) {
  const request = {
    conversation_id: convId,
    subscriber_id: `usage-hud-${process.pid}-${Math.random().toString(36).slice(2)}`,
    disable_rehydration: true,
    trajectory_verbosity: 'CLIENT_TRAJECTORY_VERBOSITY_PROD_UI',
    initial_steps_page_bounds: { start_index: 0, end_index_exclusive: 0 },
    initial_generator_metadatas_page_bounds: { start_index: 0, end_index_exclusive: 0 },
    initial_executor_metadatas_page_bounds: { start_index: 0, end_index_exclusive: 0 },
  }
  const payload = Buffer.from(JSON.stringify(request))
  const frame = Buffer.concat([
    Buffer.from([0, (payload.length >>> 24) & 255, (payload.length >>> 16) & 255, (payload.length >>> 8) & 255, payload.length & 255]),
    payload,
  ])

  for (const base of languageServerCandidates()) {
    try {
      const port = Number(new URL(base).port) || 0
      if (!port) continue
      const csrf = await csrfFor(port)
      if (!csrf) continue

      const body = await connectFirstFrame(
        base,
        '/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates',
        frame,
        csrf,
      )
      const usage = JSON.parse(body)?.update?.contextWindowUsage
      if (
        usage &&
        Number.isFinite(usage.estimatedTokensUsed) &&
        Number.isFinite(usage.maxContextTokens) &&
        usage.maxContextTokens > 0
      ) {
        baseCache.base = base
        baseCache.at = Date.now()
        return {
          tokens: usage.estimatedTokensUsed,
          window: usage.maxContextTokens,
          groups: contextGroups(usage.tokenGroups),
        }
      }
    } catch {
      continue
    }
  }
  forgetLanguageServer()
  return null
}

// Ferramentas MCP configuradas no app. Lê apenas os nomes dos servidores e os
// arquivos de schema; nunca devolve command/env (que podem conter token).
const mcpCache = { at: 0, value: [] }

function readMcpServers() {
  if (Date.now() - mcpCache.at < 30_000) return mcpCache.value
  const home = homeDir()
  const configPath = path.join(home, '.gemini', 'antigravity', 'mcp_config.json')
  let servers = []
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    servers = Object.keys(config.mcpServers || {})
  } catch {}

  const base = path.join(home, '.gemini', 'antigravity', 'mcp')
  const value = servers.map(server => {
    const candidates = [server, server.replace(/-/g, '_')]
    const dir = candidates.map(name => path.join(base, name)).find(candidate => fs.existsSync(candidate))
    const tools = []
    if (dir) {
      let entries = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {}
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        let bytes = 0
        try {
          bytes = fs.statSync(path.join(dir, entry.name)).size
        } catch {}
        tools.push({ name: entry.name.replace(/\.json$/i, ''), bytes })
      }
      tools.sort((a, b) => a.name.localeCompare(b.name))
    }
    return { server, tools }
  })

  mcpCache.value = value
  mcpCache.at = Date.now()
  return value
}

/* ---------------- parar subagente ---------------- */

async function languageServerBase() {
  return resolveLanguageServerBase()
}

async function resolveLanguageServerBase() {
  for (const base of languageServerCandidates()) {
    try {
      const port = Number(new URL(base).port) || 0
      if (!port) continue
      const csrf = await csrfFor(port)
      if (!csrf) continue
      baseCache.base = base
      baseCache.at = Date.now()
      return base
    } catch {
      continue
    }
  }
  forgetLanguageServer()
  return null
}

async function languageServerCsrf(base) {
  if (process.env.ANTIGRAVITY_CSRF_TOKEN) return process.env.ANTIGRAVITY_CSRF_TOKEN
  const port = Number(new URL(base).port) || 0
  return port ? csrfFor(port) : null
}

function postRaw(base, pathname, body, contentType, csrf) {
  const target = new URL(pathname, `${base}/`)
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.length,
        ...(csrf ? { 'x-codeium-csrf-token': csrf } : {}),
      },
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.setTimeout(4000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

// CancelCascadeInvocation é o mesmo comando que a aba Overview usa no botão
// "Stop Subagent": encerra a invocação, mata tarefas em segundo plano e avisa o
// pai. O endpoint só aceita application/proto; JSON cai no parser de texto.
function cancelBody(cascadeId) {
  const id = Buffer.from(cascadeId, 'utf8')
  return Buffer.concat([Buffer.from([0x0a, id.length]), id, Buffer.from([0x10, 0x01, 0x18, 0x01])])
}

async function cancelCascade(cascadeId) {
  const base = await languageServerBase()
  if (!base) return { ok: false, message: 'Language Server não localizado' }
  const csrf = await languageServerCsrf(base)
  if (!csrf) return { ok: false, message: 'CSRF do Language Server não localizado' }

  try {
    const res = await postRaw(
      base,
      '/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation',
      cancelBody(cascadeId),
      'application/proto',
      csrf,
    )
    if (res.status === 200) return { ok: true }
    // Alguns builds só expõem a parada da árvore; a resposta traz os ids parados.
    const fallback = await postRaw(
      base,
      '/exa.language_server_pb.LanguageServerService/ForceStopCascadeTree',
      Buffer.from(JSON.stringify({ conversation_id: cascadeId }), 'utf8'),
      'application/json',
      csrf,
    )
    if (fallback.status === 200) return { ok: true }
    return { ok: false, message: fallback.body || `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

/* ---------------- métricas ---------------- */

async function computeMetrics(targetConvId) {
  const id = targetConvId || currentConversationId()
  const file = id ? transcriptPath(id) : null
  const raw = id ? modelFor(id) : null
  const reading = file ? contextFromSteps(parseSteps(readTail(file))) : contextFromSteps([])
  const live = id ? await fetchContextUsage(id) : null
  const tokens = live ? live.tokens : reading.tokens
  const window = live ? live.window : null
  const pct = contextPct(tokens, window)
  const summary = summaryFor(id)
  const models = await modelConfigs()
  const quota = quotaReading(quotaFor(models, raw))
  const model = splitModel(raw)

  return {
    conversationId: id,
    title: summary?.title?.trim() || promptTitle(file) || null,
    project: projectOf(summary?.workspace_uris),
    model: { raw, name: model.name, effort: model.effort, window },
    context: {
      tokens,
      input: reading.input,
      cache: reading.cache,
      output: reading.output,
      window,
      pct,
      free: window !== null && tokens !== null ? Math.max(0, window - tokens) : null,
      groups: live?.groups ?? [],
      source: live ? 'language-server' : 'transcript',
    },
    mcp: readMcpServers(),
    quota,
    hasSession: Boolean(file),
    updatedAt: new Date().toISOString(),
  }
}

/* ---------------- atividade ---------------- */

function getSessionModel(conversationId) {
  if (!conversationId) return null
  if (!sessionModels.has(conversationId)) {
    sessionModels.set(conversationId, createActivityModel(conversationId))
  }
  return sessionModels.get(conversationId)
}

function savedActivity(convId) {
  const file = transcriptPath(convId)
  if (!file) return null
  const convDir = path.dirname(path.dirname(path.dirname(file)))
  const stateFile = path.join(convDir, '.system_generated', 'activity-state.json')
  try {
    // Estado gravado por uma execução anterior do app não vale: descreveria a
    // sessão de ontem no painel de hoje.
    if (fs.statSync(stateFile).mtimeMs < RUN_STARTED_AT) return null
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    return saved && saved.conversationId === convId ? saved : null
  } catch {
    return null
  }
}

function currentConversationId() {
  return latestConversationId(undefined, RUN_STARTED_AT)
}

function subagentsFor(convId, parentWindow) {
  const now = Date.now()
  const list = childrenOf(convId)
    .map(row => childInfo(row, parentWindow, now))
    // A aba Overview mostra só o que está vivo; um filho recém-terminado fica
    // na lista por dois minutos para o resultado não sumir de imediato.
    .filter(agent => agent.status === 'running' || (agent.lastSeenMs > 0 && now - agent.lastSeenMs < 120_000))
  list.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'running' ? -1 : 1
    return b.lastSeenMs - a.lastSeenMs
  })
  return list
}

async function computeActivity(targetConvId) {
  const convId = targetConvId || currentConversationId()
  const model = getSessionModel(convId)
  let snap = model ? model.snapshot() : null

  if ((!snap || snap.kind === 'idle') && convId) {
    const saved = savedActivity(convId)
    if (saved && model) snap = model.receive(saved.event, saved)
  }

  const live = convId ? await fetchContextUsage(convId) : null
  const subagents = subagentsFor(convId, live?.window ?? null)

  if (model && subagents.length > 0) {
    const runningCount = subagents.filter(agent => agent.status === 'running').length
    model.setSubagentsInfo(runningCount, subagents.length)
    snap = model.snapshot()
  }

  if (!snap) {
    snap = {
      conversationId: convId || null,
      kind: 'idle',
      label: 'À disposição',
      title: 'Aguardando próxima instrução.',
      detail: convId ? 'Aguardando sua próxima mensagem' : 'Nenhuma sessão conectada',
      activeCount: 0,
      lastEvent: 'none',
      hasError: false,
      stopped: true,
      fullyIdle: true,
      updatedAt: new Date().toISOString(),
    }
  }

  // A sessão pode estar em outro estado enquanto o subagente trabalha: nesse
  // caso o mascote mostra a coordenação, não o repouso.
  if (subagents.some(agent => agent.status === 'running') && snap.kind === 'idle') {
    snap = {
      ...snap,
      kind: 'agents',
      label: 'Coordenando subagentes',
      detail: `${subagents.filter(agent => agent.status === 'running').length} de ${subagents.length} subagente(s) em atividade`,
    }
  }

  return { ...snap, subagents }
}

/* ---------------- servidor ---------------- */

function writeServerInfo(port) {
  const home = homeDir()
  const token = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN || process.env.ANTIGRAVITY_SIDECAR_AUTH_TOKEN || null
  const payload = JSON.stringify({ host: '127.0.0.1', port, token, pid: process.pid }, null, 2)

  const targets = [
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage-hud', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage_hud', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage-hud', 'data', 'server_info.json'),
  ]

  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, payload, 'utf8')
    } catch {}
  }
}

const reqPort = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || process.env.USAGE_HUD_PORT || '0', 10)

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
  const pathname = parsedUrl.pathname
  const convId = parsedUrl.searchParams.get('convId') || parsedUrl.searchParams.get('conversationId') || null
  const isLocalhost =
    req.socket.remoteAddress === '127.0.0.1' ||
    req.socket.remoteAddress === '::1' ||
    req.socket.remoteAddress === '::ffff:127.0.0.1'

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sidecar-Token, X-HUD-Client')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (pathname === '/' || pathname === '/ui.html') {
    const uiPath = path.join(__dirname, 'ui.html')
    if (fs.existsSync(uiPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      })
      res.end(fs.readFileSync(uiPath, 'utf8'))
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('ui.html not found')
    }
    return
  }

  if (pathname === '/preload.js') {
    const preload = path.join(homeDir(), '.gemini', 'antigravity', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js')
    if (fs.existsSync(preload)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end(fs.readFileSync(preload, 'utf8'))
    } else {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end('// preload bridge stub\n')
    }
    return
  }

  if (pathname === '/api/stats') {
    try {
      const stats = await computeMetrics(convId)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      })
      res.end(JSON.stringify(stats))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  if (pathname === '/api/activity') {
    try {
      const activity = await computeActivity(convId)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      })
      res.end(JSON.stringify(activity))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  if (pathname === '/api/event' && req.method === 'POST') {
    if (!isLocalhost) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Forbidden' }))
      return
    }

    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 512 * 1024) req.destroy()
    })

    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        if (payload && payload.conversationId && payload.event) {
          getSessionModel(payload.conversationId)?.receive(payload.event, payload)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // Botão "Parar subagente": mesma primitiva da aba Overview.
  if (pathname === '/api/subagents/stop' && req.method === 'POST') {
    if (!isLocalhost) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Forbidden' }))
      return
    }

    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 64 * 1024) req.destroy()
    })
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}')
        const parent = typeof data.conversationId === 'string' ? data.conversationId : ''
        const agentId = typeof data.agentId === 'string' ? data.agentId : ''
        if (!parent || !agentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, message: 'conversationId e agentId são obrigatórios' }))
          return
        }

        const belongs = childrenOf(parent).some(row => row.conversation_id === agentId)
        if (!belongs) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, message: 'subagente não pertence a esta conversa' }))
          return
        }

        const result = await cancelCascade(agentId)
        if (!result.ok) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, status: 'failed', message: result.message }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, agentId }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, status: 'failed', message: err.message }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
}

const server = http.createServer(handleRequest)

server.listen(reqPort, '127.0.0.1', () => {
  const address = server.address()
  const port = address.port
  console.log(`[usage-hud sidecar] listening on http://127.0.0.1:${port}`)
  if (process.env.USAGE_HUD_NO_INFO !== '1') writeServerInfo(port)
})

// O host escolhe uma porta entre algumas; manter as antigas evita que uma aba
// aberta antes da troca fique sem resposta.
if (process.env.USAGE_HUD_NO_INFO !== '1') {
  for (const port of [53805, 65018, 65254, 59944, 59005, 59314, 58601, 55869, 52041, 57986, 58255]) {
    try {
      const extraServer = http.createServer(handleRequest)
      extraServer.listen(port, '127.0.0.1').on('error', () => {})
    } catch {}
  }
}

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
