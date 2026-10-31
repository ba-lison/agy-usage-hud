import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const DEFAULT_CONTEXT_WINDOW = 1_048_576 // 1M tokens oficial do Gemini Flash

function getHomeDir() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir()
}

function getBrainDirs() {
  const home = getHomeDir()
  const list = []
  if (process.env.ANTIGRAVITY_APP_DATA_DIR) {
    list.push(path.join(process.env.ANTIGRAVITY_APP_DATA_DIR, 'brain'))
  }
  list.push(path.join(home, '.gemini', 'antigravity', 'brain'))
  list.push(path.join(home, '.gemini', 'antigravity-cli', 'brain'))
  list.push(path.join(home, '.gemini', 'antigravity-ide', 'brain'))
  return [...new Set(list.filter(d => fs.existsSync(d)))]
}

function getLatestConversation(brainDirs, targetConvId) {
  if (targetConvId) {
    for (const bDir of brainDirs) {
      const convDir = path.join(bDir, targetConvId)
      const tPath = path.join(convDir, '.system_generated', 'logs', 'transcript.jsonl')
      if (fs.existsSync(tPath)) {
        return { convId: targetConvId, transcriptPath: tPath }
      }
    }
  }

  let latestFile = null
  let latestMtime = -1
  let foundConvId = null

  for (const bDir of brainDirs) {
    try {
      const entries = fs.readdirSync(bDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const tPath = path.join(bDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl')
        try {
          const stat = fs.statSync(tPath)
          if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs
            latestFile = tPath
            foundConvId = entry.name
          }
        } catch {}
      }
    } catch {}
  }

  return { convId: foundConvId, transcriptPath: latestFile }
}

let cachedQuota = null
let lastQuotaFetch = 0

async function fetchLiveQuota(targetModel) {
  const now = Date.now()
  if (cachedQuota && (now - lastQuotaFetch < 3000)) {
    return cachedQuota
  }
  try {
    const logPath = path.join(process.env.APPDATA || '', 'Antigravity', 'logs', 'language_server.log')
    if (!fs.existsSync(logPath)) return null
    const log = fs.readFileSync(logPath, 'utf8')
    const matches = [...log.matchAll(/listening on random port at (\d+) for HTTP/g)]
    if (matches.length === 0) return null
    const port = parseInt(matches[matches.length - 1][1], 10)

    // 1. Fetch index to get csrfToken
    const html = await new Promise((resolve, reject) => {
      const r = http.get(`http://127.0.0.1:${port}/`, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => resolve(d))
      })
      r.on('error', reject)
      r.setTimeout(1200, () => { r.destroy(); reject(new Error('timeout')) })
    })
    const mCsrf = html.match(/"csrfToken"\s*:\s*"([^"]+)"/)
    if (!mCsrf) return null
    const csrf = mCsrf[1]

    // 2. Post GetUserStatus
    const statusRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrf
        }
      }, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => {
          try {
            resolve(JSON.parse(d))
          } catch (e) {
            reject(e)
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(1500, () => { req.destroy(); reject(new Error('timeout')) })
      req.write('{}')
      req.end()
    })

    const cfg = statusRes.userStatus?.cascadeModelConfigData
    const models = cfg?.clientModelConfigs || []
    let current = null
    if (targetModel) {
      current = models.find(m => m.label?.toLowerCase() === targetModel.toLowerCase())
      if (!current) {
        current = models.find(m => m.label?.toLowerCase().includes(targetModel.toLowerCase()))
      }
    }
    if (!current) {
      current = models.find(m => m.label?.includes('Flash (High)') || m.label?.includes('Flash') || m.isRecommended)
    }
    if (current && current.quotaInfo) {
      cachedQuota = {
        modelLabel: current.label,
        remainingFraction: current.quotaInfo.remainingFraction,
        resetTime: current.quotaInfo.resetTime,
        fetchedAt: now
      }
      lastQuotaFetch = now
      return cachedQuota
    }
  } catch (err) {}
  return cachedQuota
}

async function computeMetrics(targetConvId, isRefinedV2Client) {
  const brainDirs = getBrainDirs()
  const { convId, transcriptPath } = getLatestConversation(brainDirs, targetConvId)

  const now = Date.now()
  const cutoff = now - FIVE_HOURS_MS

  let turns5h = 0
  let totalTokens5h = 0
  let oldestTs = Infinity
  let currentModel = 'Gemini 3.8 Flash (High)'

  const visited = new Set()

  for (const bDir of brainDirs) {
    try {
      const entries = fs.readdirSync(bDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const tPath = path.join(bDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl')
        if (visited.has(tPath)) continue
        visited.add(tPath)

        try {
          const stat = fs.statSync(tPath)
          if (stat.mtimeMs < cutoff) continue

          const lines = fs.readFileSync(tPath, 'utf8').split('\n')
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const step = JSON.parse(line)

              // Detect model changes from user input settings
              if (step.type === 'USER_INPUT' && typeof step.content === 'string') {
                const match = step.content.match(/Model Selection[`']?\s+from\s+.*?\s+to\s+(.*?)\.(?:\s+No need|\s*$)/)
                if (match) currentModel = match[1].trim()
              }

              if (step.type === 'PLANNER_RESPONSE') {
                const ts = step.created_at ? Date.parse(step.created_at) : NaN
                if (!isNaN(ts) && ts >= cutoff) {
                  turns5h++
                  const inTok = step.input_tokens || 0
                  const outTok = step.output_tokens || 0
                  const cacheTok = step.cache_read_tokens || 0
                  totalTokens5h += inTok + outTok + cacheTok
                  if (ts < oldestTs) oldestTs = ts
                }
              }
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }

  // Current session context
  let lastPlanner = null
  let sessionTurns = 0
  let maxContextSeen = 0
  let totalChatTokens = 0
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const step = JSON.parse(line)
          if (step.type === 'USER_INPUT' && typeof step.content === 'string') {
            const match = step.content.match(/Model Selection[`']?\s+from\s+.*?\s+to\s+(.*?)\.(?:\s+No need|\s*$)/)
            if (match) currentModel = match[1].trim()
          }
          if (step.type === 'PLANNER_RESPONSE' && (step.input_tokens !== undefined || step.cache_read_tokens !== undefined)) {
            lastPlanner = step
            sessionTurns++
            const turnTokens = (step.input_tokens || 0) + (step.cache_read_tokens || 0) + (step.output_tokens || 0)
            if (turnTokens > maxContextSeen) maxContextSeen = turnTokens
            totalChatTokens += turnTokens
          }
        } catch {}
      }
    } catch {}
  }

  const inputTokens = lastPlanner ? (lastPlanner.input_tokens || 0) : 0
  const cacheTokens = lastPlanner ? (lastPlanner.cache_read_tokens || 0) : 0
  const outputTokens = lastPlanner ? (lastPlanner.output_tokens || 0) : 0
  const lastTurnTotal = inputTokens + cacheTokens + outputTokens

  // Chat conversation context (retains the full chat session context, not just the post-truncation fragment)
  const chatContextTokens = Math.max(lastTurnTotal, maxContextSeen)
  const contextPct = Math.min(100, Math.round((chatContextTokens / DEFAULT_CONTEXT_WINDOW) * 100))
  const freeTokens = Math.max(0, DEFAULT_CONTEXT_WINDOW - chatContextTokens)
  const freePct = Math.max(0, 100 - contextPct)

  const resetMs = Number.isFinite(oldestTs) ? oldestTs + FIVE_HOURS_MS : null
  const timeLeftMs = resetMs ? Math.max(0, resetMs - now) : 0
  const leftMins = Math.round(timeLeftMs / 60000)
  const leftHours = Math.floor(leftMins / 60)
  const timeLeftFormatted = leftHours > 0 ? `${leftHours}h ${String(leftMins % 60).padStart(2, '0')}m` : `${leftMins}m`

  let resetTimeFormatted = '--:--'
  if (resetMs) {
    const d = new Date(resetMs)
    resetTimeFormatted = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  let modelName = 'Gemini 3.8 Flash'
  let effort = 'High'
  const effortMatch = currentModel.match(/^(.*?)(?:\s*\((.*?)\))?$/)
  if (effortMatch) {
    modelName = effortMatch[1].trim()
    effort = effortMatch[2] ? effortMatch[2].trim() : 'Padrão'
  }

  // Default values when no usage or live quota
  let consumedPct = 0
  let remainingPct = 100
  let officialResetTime = resetTimeFormatted
  let officialTimeLeftMs = timeLeftMs || FIVE_HOURS_MS
  let officialTimeLeftFormatted = timeLeftMs ? timeLeftFormatted : '5h 00m'

  // Official quota from language server
  const liveQuota = await fetchLiveQuota(currentModel)

  if (liveQuota && typeof liveQuota.remainingFraction === 'number') {
    consumedPct = Math.round((1 - liveQuota.remainingFraction) * 100)
    remainingPct = Math.round(liveQuota.remainingFraction * 100)
    if (liveQuota.resetTime) {
      const rDate = new Date(liveQuota.resetTime)
      if (!isNaN(rDate.getTime())) {
        officialResetTime = `${String(rDate.getHours()).padStart(2, '0')}:${String(rDate.getMinutes()).padStart(2, '0')}`
        const diff = Math.max(0, rDate.getTime() - now)
        officialTimeLeftMs = diff
        const mins = Math.round(diff / 60000)
        const hrs = Math.floor(mins / 60)
        officialTimeLeftFormatted = hrs > 0 ? `${hrs}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`
      }
    }
  } else if (turns5h > 0 && resetMs && timeLeftMs > 0) {
    // Fallback based on recent activity, NEVER pure clock time
    consumedPct = Math.min(100, Math.round((totalTokens5h / (10 * 1024 * 1024)) * 100))
    remainingPct = 100 - consumedPct
  } else {
    // 0 turns in the last 5h: completely full quota
    consumedPct = 0
    remainingPct = 100
    officialResetTime = '--:--'
    officialTimeLeftMs = FIVE_HOURS_MS
    officialTimeLeftFormatted = '5h 00m'
  }

  const formattedChatTokens = chatContextTokens >= 1000 
    ? (chatContextTokens / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k'
    : String(chatContextTokens)

  const livePatchCode = `
    document.querySelector('.model-topline')?.remove();
    try {
      Intl.NumberFormat.prototype.format = function(n) { return String(Math.round(n)); };
    } catch(e) {}
    const ps = document.querySelector('.preview-status');
    if (ps && !ps.dataset.patched) {
      ps.dataset.patched = '1';
      ps.className = 'icon-button reload-button';
      ps.style.cssText = 'width:36px;height:36px;border-radius:50%;border:1px solid var(--outline);background:var(--surface);display:grid;place-items:center;cursor:pointer;';
      ps.innerHTML = '<svg class="icon reload-icon" style="width:17px;height:17px;stroke:var(--faint);" viewBox="0 0 24 24"><use href="#i-reload"/></svg>';
      ps.onclick = () => { ps.querySelector('svg')?.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}], {duration: 600}); fetchLiveStats(); };
    }
    const uv = document.querySelector('#usage-value');
    if (uv) uv.textContent = '${consumedPct}';
    const ur = document.querySelector('.usage-remaining');
    if (ur) ur.textContent = '${remainingPct}% disponível';
    const cn = document.querySelector('#context-num');
    if (cn) cn.textContent = '${formattedChatTokens}';
    const cml = document.querySelector('#context-max-label');
    if (cml) cml.textContent = '1M';
    if (typeof renderUsage === 'function') {
      try { renderUsage(${consumedPct}); } catch(e) {}
    }
    this.remove();
  `.replace(/\\s+/g, ' ').trim()

  const injectedTokens = `${formattedChatTokens} / 1M<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="display:none" onload="${livePatchCode.replace(/"/g, '&quot;')}" onerror="${livePatchCode.replace(/"/g, '&quot;')}"/>`

  const elapsedMs = Math.max(0, FIVE_HOURS_MS - officialTimeLeftMs)

  return {
    rawModel: currentModel,
    model: `${modelName} (${effort})`,
    modelName,
    effort,
    conversationId: convId,
    buildId: 'v5.3.1-live-quota-fixed',
    fiveHour: {
      turns: turns5h,
      totalTokens: totalTokens5h,
      resetsAt: liveQuota?.resetTime || (resetMs ? new Date(resetMs).toISOString() : null),
      resetTime: officialResetTime,
      timeLeft: officialTimeLeftFormatted,
      timeLeftMs: officialTimeLeftMs,
      elapsedMs,
      elapsedPct: consumedPct,
      consumedPct,
      remainingPct,
      isExpired: officialTimeLeftMs <= 0 && turns5h > 0
    },
    context: {
      tokens: isRefinedV2Client ? chatContextTokens : injectedTokens,
      rawTokens: chatContextTokens,
      lastTurnTokens: lastTurnTotal,
      maxTokens: DEFAULT_CONTEXT_WINDOW,
      pct: contextPct,
      freePct,
      remaining: freeTokens,
      input: inputTokens,
      cache: cacheTokens,
      output: outputTokens,
      sessionTurns,
      peakContext: maxContextSeen
    },
    updatedAt: new Date(now).toISOString()
  }
}

function writeServerInfo(port) {
  const home = getHomeDir()
  const token = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN || process.env.ANTIGRAVITY_SIDECAR_AUTH_TOKEN || null
  const payload = JSON.stringify({
    host: '127.0.0.1',
    port,
    token,
    pid: process.pid
  }, null, 2)

  const targets = [
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage-hud', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage_hud', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage-hud', 'data', 'server_info.json')
  ]

  for (const t of targets) {
    try {
      fs.mkdirSync(path.dirname(t), { recursive: true })
      fs.writeFileSync(t, payload, 'utf8')
    } catch {}
  }
}

const reqPort = parseInt(
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || process.env.USAGE_HUD_PORT || '0',
  10
)

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
  const pathname = parsedUrl.pathname
  const convId = parsedUrl.searchParams.get('convId') || null

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

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
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      })
      res.end(fs.readFileSync(uiPath, 'utf8'))
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('ui.html not found')
    }
    return
  }

  if (pathname === '/preload.js') {
    const home = getHomeDir()
    const pPath = path.join(home, '.gemini', 'antigravity', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js')
    if (fs.existsSync(pPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end(fs.readFileSync(pPath, 'utf8'))
    } else {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end('// preload bridge stub\n')
    }
    return
  }

  if (pathname === '/api/stats') {
    try {
      const isRefinedV2 = req.headers['x-hud-client'] === 'refined-v2' || parsedUrl.searchParams.get('v') === 'refined-v2'
      const stats = await computeMetrics(convId, isRefinedV2)

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      })
      res.end(JSON.stringify(stats))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
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
  writeServerInfo(port)
})

// Also listen on fallback ports so existing webviews and iframes don't break
for (const p of [53805, 65018, 65254, 59944, 59005, 59314, 58601, 55869, 52041, 57986, 58255]) {
  try {
    const extraServer = http.createServer(handleRequest)
    extraServer.listen(p, '127.0.0.1').on('error', () => {})
  } catch {}
}

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
