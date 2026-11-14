/**
 * Leitura das fontes reais do Antigravity.
 *
 * Contexto e modelo saem do transcript da conversa; títulos e a árvore de
 * subagentes saem do conversation_summaries.db que o app mantém. Nada aqui
 * inventa número: quando o host não expõe um dado, o campo volta null.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { classifyTool, describeCall, sanitizeText } from './activity-engine.mjs'

const require = createRequire(import.meta.url)

const TAIL_BYTES = 256 * 1024
const HEAD_BYTES = 64 * 1024
const SUMMARY_TTL_MS = 1000
const MODEL_TTL_MS = 10_000
const ACTIVE_MS = 10 * 60_000

// O Antigravity não informa a janela do modelo em nenhuma API local. Esta
// tabela é o que o modelo declara; para um modelo fora dela, a janela fica
// null e o painel mostra só os tokens, sem percentual inventado.
const WINDOWS = [
  [/gemini/i, 1_048_576],
  [/claude/i, 1_000_000],
  [/gpt-oss/i, 131_072],
]

const AGENT_LABEL = { browser: 'Navegador', research: 'Pesquisa', self: 'Auxiliar' }

const modelCache = new Map()
const taskCache = new Map()
let summariesCache = { at: 0, rows: [] }
let sqlite = null
let sqliteUnavailable = false

export function homeDir() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir()
}

export function brainDirs() {
  const home = homeDir()
  const list = []
  if (process.env.ANTIGRAVITY_APP_DATA_DIR) list.push(path.join(process.env.ANTIGRAVITY_APP_DATA_DIR, 'brain'))
  list.push(path.join(home, '.gemini', 'antigravity', 'brain'))
  list.push(path.join(home, '.gemini', 'antigravity-cli', 'brain'))
  list.push(path.join(home, '.gemini', 'antigravity-ide', 'brain'))
  return [...new Set(list.filter(d => fs.existsSync(d)))]
}

export function transcriptPath(convId, dirs = brainDirs()) {
  if (!convId) return null
  for (const dir of dirs) {
    const file = path.join(dir, convId, '.system_generated', 'logs', 'transcript.jsonl')
    if (fs.existsSync(file)) return file
  }
  return null
}

export function latestConversationId(dirs = brainDirs()) {
  let latest = null
  let latestAt = -1
  for (const dir of dirs) {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = path.join(dir, entry.name, '.system_generated', 'logs', 'transcript.jsonl')
      try {
        const at = fs.statSync(file).mtimeMs
        if (at > latestAt) {
          latestAt = at
          latest = entry.name
        }
      } catch {}
    }
  }
  return latest
}

function readRange(file, start, length) {
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const read = fs.readSync(fd, buffer, 0, length, start)
    return buffer.subarray(0, read).toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

// A última parte do arquivo: os passos recentes, sem carregar a sessão inteira.
export function readTail(file, maxBytes = TAIL_BYTES) {
  try {
    const stat = fs.statSync(file)
    const start = Math.max(0, stat.size - maxBytes)
    let text = readRange(file, start, stat.size - start)
    if (start > 0) {
      const firstBreak = text.indexOf('\n')
      text = firstBreak === -1 ? '' : text.slice(firstBreak + 1)
    }
    return text
  } catch {
    return ''
  }
}

export function readHead(file, maxBytes = HEAD_BYTES) {
  try {
    const stat = fs.statSync(file)
    return readRange(file, 0, Math.min(maxBytes, stat.size))
  } catch {
    return ''
  }
}

export function parseSteps(text) {
  const steps = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      steps.push(JSON.parse(line))
    } catch {}
  }
  return steps
}

const MODEL_CHANGE = /Model Selection[`']?\s+from\s+.*?\s+to\s+(.*?)\.(?:\s+No need|\s*$)/

export function modelFromSteps(steps) {
  let model = null
  for (const step of steps) {
    if (step.type !== 'USER_INPUT' || typeof step.content !== 'string') continue
    const match = MODEL_CHANGE.exec(step.content)
    if (match) model = match[1].trim()
  }
  return model
}

// O modelo só aparece no transcript quando a sessão o registra. Guarda o que
// já foi visto para não varrer o começo da conversa a cada consulta.
export function modelFor(convId) {
  if (!convId) return null
  const cached = modelCache.get(convId)
  if (cached && Date.now() - cached.at < MODEL_TTL_MS) return cached.value

  const file = transcriptPath(convId)
  if (!file) return null
  const model = modelFromSteps(parseSteps(readTail(file))) || modelFromSteps(parseSteps(readHead(file)))
  modelCache.set(convId, { value: model, at: Date.now() })
  return model
}

export function splitModel(raw) {
  if (!raw) return { name: null, effort: null }
  const match = /^(.*?)(?:\s*\((.*?)\))?$/.exec(raw)
  return { name: match?.[1]?.trim() || raw, effort: match?.[2]?.trim() || null }
}

export function windowForModel(raw) {
  if (!raw) return null
  return WINDOWS.find(([re]) => re.test(raw))?.[1] ?? null
}

// O prompt real de cada turno é input_tokens + cache_read_tokens. output_tokens
// é o que foi gerado e só entra no prompt do turno seguinte; somá-lo aqui
// inflava o contexto.
export function contextFromSteps(steps) {
  let last = null
  for (const step of steps) {
    if (step.type === 'PLANNER_RESPONSE' && (step.input_tokens !== undefined || step.cache_read_tokens !== undefined)) last = step
  }
  if (!last) return { tokens: null, input: null, cache: null, output: null }
  const input = last.input_tokens || 0
  const cache = last.cache_read_tokens || 0
  return { tokens: input + cache, input, cache, output: last.output_tokens || 0 }
}

export function contextPct(tokens, window) {
  if (!Number.isFinite(tokens) || !Number.isFinite(window) || window <= 0) return null
  return Math.min(100, Math.max(0, Math.round((tokens / window) * 100)))
}

export function quotaFor(models, raw) {
  if (!raw || !Array.isArray(models)) return null
  const wanted = raw.toLowerCase()
  const match =
    models.find(model => typeof model.label === 'string' && model.label.toLowerCase() === wanted) ??
    models.find(model => typeof model.label === 'string' && model.label.toLowerCase().startsWith(wanted))
  if (!match) return null
  return {
    label: match.label,
    remainingFraction: typeof match.quotaInfo?.remainingFraction === 'number' ? match.quotaInfo.remainingFraction : null,
    resetTime: match.quotaInfo?.resetTime ?? null,
  }
}

// "2026-11-14 10:55:46.2862034+00:00" não passa no Date.parse do Node.
export function parseDbTime(value) {
  if (typeof value !== 'string' || !value) return null
  const normalized = value.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1')
  const at = Date.parse(normalized)
  return Number.isNaN(at) ? null : at
}

function openSummaries() {
  if (sqlite) return sqlite
  if (sqliteUnavailable) return null
  try {
    const file = path.join(homeDir(), '.gemini', 'antigravity', 'conversation_summaries.db')
    if (!fs.existsSync(file)) return null
    const { DatabaseSync } = requireSqlite()
    if (!DatabaseSync) {
      sqliteUnavailable = true
      return null
    }
    sqlite = new DatabaseSync(file, { readOnly: true })
  } catch {
    sqlite = null
  }
  return sqlite
}

function requireSqlite() {
  // node:sqlite é experimental; se a versão do Node não tiver, a árvore de
  // subagentes fica vazia em vez de derrubar o servidor.
  try {
    return require('node:sqlite')
  } catch {
    return {}
  }
}

export function summaries() {
  const now = Date.now()
  if (now - summariesCache.at < SUMMARY_TTL_MS) return summariesCache.rows
  const db = openSummaries()
  if (!db) return summariesCache.rows
  try {
    const rows = db.prepare('select * from conversation_summaries').all()
    summariesCache = { at: now, rows }
    return rows
  } catch {
    try { db.close() } catch {}
    sqlite = null
    return summariesCache.rows
  }
}

export function summaryFor(convId) {
  if (!convId) return null
  return summaries().find(row => row.conversation_id === convId) ?? null
}

export function childrenOf(convId) {
  if (!convId) return []
  const rows = summaries()
  const byParent = new Map()
  for (const row of rows) {
    if (!row.parent_conversation_id) continue
    const list = byParent.get(row.parent_conversation_id) ?? []
    list.push(row)
    byParent.set(row.parent_conversation_id, list)
  }
  const found = []
  const queue = [{ id: convId, depth: 0 }]
  const seen = new Set([convId])
  while (queue.length > 0) {
    const current = queue.shift()
    for (const row of byParent.get(current.id) ?? []) {
      if (seen.has(row.conversation_id)) continue
      seen.add(row.conversation_id)
      const depth = current.depth + 1
      found.push({ ...row, relative_depth: depth })
      queue.push({ id: row.conversation_id, depth })
    }
  }
  return found
}

export function projectOf(workspaceUris) {
  if (typeof workspaceUris !== 'string' || !workspaceUris) return null
  try {
    const uris = JSON.parse(workspaceUris)
    const first = Array.isArray(uris) ? uris[0] : null
    if (typeof first !== 'string') return null
    const clean = decodeURIComponent(first.replace(/^file:\/\/\//i, '')).replace(/\/$/, '')
    return clean.split(/[/\\]/).filter(Boolean).pop() ?? null
  } catch {
    return null
  }
}

// Fallback do título quando o app ainda não indexou a conversa no banco.
export function promptTitle(file, max = 64) {
  if (!file) return null
  const steps = parseSteps(readHead(file, 32 * 1024))
  for (const step of steps) {
    if (step.type !== 'USER_INPUT' || typeof step.content !== 'string') continue
    const text = sanitizeText(step.content.replace(/<[^>]+>/g, ' '), max)
    if (text) return text
  }
  return null
}

function firstTask(file) {
  if (!file) return ''
  const cached = taskCache.get(file)
  if (cached !== undefined) return cached
  const steps = parseSteps(readHead(file, 16 * 1024))
  let task = ''
  for (const step of steps) {
    if (step.type === 'USER_INPUT' && typeof step.content === 'string') {
      task = step.content
      break
    }
    if (step.type === 'SYSTEM_MESSAGE' && typeof step.content === 'string') {
      const match = /content=([\s\S]*?)(?:<\/SYSTEM_MESSAGE>|$)/.exec(step.content)
      if (match) {
        task = match[1]
        break
      }
    }
  }
  const text = sanitizeText(
    task
      .replace(/<USER_REQUEST>/gi, ' ')
      .replace(/<\/USER_REQUEST>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
    96,
  )
  taskCache.set(file, text)
  return text
}

export function childInfo(row, parentWindow, now = Date.now()) {
  const file = transcriptPath(row.conversation_id)
  const steps = file ? parseSteps(readTail(file, 131_072)) : []
  const lastStep = steps.at(-1) ?? null
  let lastPlanner = null
  for (const step of steps) {
    if (step.type === 'PLANNER_RESPONSE') lastPlanner = step
  }

  const calls = Array.isArray(lastPlanner?.tool_calls) ? lastPlanner.tool_calls : []
  const activeCall = calls.at(-1) ?? null
  const modifiedAt = parseDbTime(row.last_modified_time) ?? 0
  const ended =
    lastStep?.type === 'STOP' ||
    (lastStep?.type === 'PLANNER_RESPONSE' &&
      lastStep.status === 'DONE' &&
      (!Array.isArray(lastStep.tool_calls) || lastStep.tool_calls.length === 0))
  const running = !ended && modifiedAt > 0 && now - modifiedAt < ACTIVE_MS

  const reading = contextFromSteps(steps)
  const tokens = reading.tokens
  const pct = contextPct(tokens, parentWindow)
  const agent = typeof row.agent_name === 'string' ? row.agent_name : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''

  return {
    id: row.conversation_id,
    name: title || AGENT_LABEL[agent] || 'Subagente',
    agent,
    task: firstTask(file) || (running ? 'Processando tarefa' : 'Sem execução ativa'),
    detail: activeCall ? describeCall(activeCall) : running ? 'Trabalhando' : 'Chamada retornou',
    kind: running ? (activeCall ? classifyTool(activeCall.name) : 'agents') : 'ended',
    status: running ? 'running' : 'idle',
    depth: row.relative_depth ?? 1,
    killed: Boolean(row.killed),
    lastSeen: modifiedAt ? new Date(modifiedAt).toISOString() : null,
    context: {
      tokens,
      pct,
      window: parentWindow,
    },
  }
}

export function formatReset(reset, now = Date.now()) {
  if (!(reset instanceof Date) || Number.isNaN(reset.getTime())) return null
  const pad = value => String(value).padStart(2, '0')
  const clock = `${pad(reset.getHours())}:${pad(reset.getMinutes())}`
  const today = new Date(now).toDateString() === reset.toDateString()
  if (today) return `hoje ${clock}`
  const days = Math.round((reset.getTime() - now) / 86_400_000)
  if (days < 7) return `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][reset.getDay()]} ${clock}`
  return `${pad(reset.getDate())}/${pad(reset.getMonth() + 1)} ${clock}`
}

export function timeLeft(ms) {
  if (!Number.isFinite(ms)) return null
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}min`
}

export function quotaReading(quota, now = Date.now()) {
  if (!quota) {
    return {
      exposed: false,
      modelLabel: null,
      consumedPct: null,
      remainingPct: null,
      resetsAt: null,
      resetLabel: null,
      timeLeftMs: null,
      timeLeft: null,
    }
  }
  const reset = quota.resetTime ? new Date(quota.resetTime) : null
  const validReset = reset && !Number.isNaN(reset.getTime()) ? reset : null
  const hasFraction = typeof quota.remainingFraction === 'number'
  return {
    exposed: hasFraction,
    modelLabel: quota.label,
    consumedPct: hasFraction ? Math.round((1 - quota.remainingFraction) * 100) : null,
    remainingPct: hasFraction ? Math.round(quota.remainingFraction * 100) : null,
    resetsAt: validReset ? validReset.toISOString() : null,
    resetLabel: validReset ? formatReset(validReset, now) : null,
    timeLeftMs: validReset ? Math.max(0, validReset.getTime() - now) : null,
    timeLeft: validReset ? timeLeft(validReset.getTime() - now) : null,
  }
}

