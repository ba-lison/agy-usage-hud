import fs from 'node:fs'
import path from 'node:path'

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
const DEFAULT_CONTEXT_WINDOW = Number(process.env.USAGE_HUD_CONTEXT_WINDOW || 200_000)
const DEFAULT_FIVE_HOUR_TURNS = Number(process.env.USAGE_HUD_FIVE_HOUR_TURNS || 150)
const RED_AT = 75
const WARN_AT = 73
const CELLS = 24
const PREVIEW_LINES = 8

const CARD = {
  width: 680,
  height: 68,
  padX: 20,
  row1: 23,
  row2: 45,
  label: 20,
  bar: 108,
  barWidth: 180,
  pct: 302,
  detail: 372,
}

const INK = {
  bg: '#151517',
  border: '#2a2a2d',
  label: '#7c7c82',
  figure: '#f2f2f5',
  of100: '#525257',
  detail: '#85858b',
  sep: '#3f3f44',
  faded: '#6e6e73',
  remaining: '#a1a1a6',
  lime: '#a3e635',
}

const GREEN = [61, 190, 106]
const AMBER = [224, 169, 59]
const RED = [229, 72, 77]

function heat(pct) {
  const p = Math.min(Math.max(pct, 0), RED_AT) / RED_AT
  const isFirstHalf = p <= 0.5
  const [fr, fg, fb] = isFirstHalf ? GREEN : AMBER
  const [tr, tg, tb] = isFirstHalf ? AMBER : RED
  const t = isFirstHalf ? p / 0.5 : (p - 0.5) / 0.5
  const hex = (a, b) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0')
  return `#${hex(fr, tr)}${hex(fg, tg)}${hex(fb, tb)}`
}

function bar(pct) {
  const p = Math.min(Math.max(pct ?? 0, 0), 100)
  const n = p > 0 ? Math.max(1, Math.round((p / 100) * CELLS)) : 0
  return { filled: '━'.repeat(n), track: '─'.repeat(CELLS - n) }
}

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return `${tokens}`
}

function resetLabel(reset, at) {
  const when = new Date(reset)
  const hour = `${pad(when.getHours())}:${pad(when.getMinutes())}`
  const isToday = when.toDateString() === new Date(at).toDateString()
  return isToday ? hour : `${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${hour}`
}

function timeLeft(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${pad(minutes % 60)}min` : `${minutes}min`
}

function preview(text) {
  const lines = text.trim().split(/\r?\n/)
  return (lines.length > PREVIEW_LINES ? [...lines.slice(0, PREVIEW_LINES), '…'] : lines).join('\n')
}

function hairline(row, cy, prevPct) {
  const p = Math.min(Math.max(row.pct ?? 0, 0), 100)
  const prev = Math.min(Math.max(prevPct ?? 0, 0), 100)
  const x = CARD.bar
  const w = (p / 100) * CARD.barWidth
  const w0 = (prev / 100) * CARD.barWidth
  const ease = 'dur=".7s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".16 1 .3 1"'
  const r = row.isPulsing ? 3 : 2
  const breathe = row.isPulsing
    ? `<animate attributeName="r" values="3;4;3" dur="1.4s" repeatCount="indefinite"/>`
    : ''
  const dot =
    p > 0
      ? [
          `<circle cx="${x + w}" cy="${cy}" r="${r + 3}" fill="${row.dot}" opacity=".55" filter="url(#${row.id}-glow)">`,
          `<animate attributeName="cx" from="${x + w0}" to="${x + w}" ${ease}/></circle>`,
          `<circle cx="${x + w}" cy="${cy}" r="${r}" fill="${row.dot}">`,
          `<animate attributeName="cx" from="${x + w0}" to="${x + w}" ${ease}/>${breathe}</circle>`,
        ].join('')
      : ''
  return [
    `<linearGradient id="${row.id}-fill" x1="0" x2="1"><stop offset="0" stop-color="${row.fill[0]}"/><stop offset="1" stop-color="${row.fill[1]}"/></linearGradient>`,
    `<filter id="${row.id}-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>`,
    `<rect x="${x}" y="${cy - 1}" width="${CARD.barWidth}" height="2" rx="1" fill="#ffffff" fill-opacity=".07"/>`,
    `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${row.id}-fill)">`,
    `<animate attributeName="width" from="${w0}" to="${w}" ${ease}/></rect>`,
    dot,
  ].join('')
}

function texts(row, cy) {
  const at = `y="${cy}" dominant-baseline="central"`
  const figure = row.figure.of100
    ? `<tspan fill="${row.figure.color}" font-weight="500">${esc(row.figure.text)}</tspan><tspan fill="${INK.of100}" font-size="11" dx="2">/100%</tspan>`
    : `<tspan fill="${row.figure.color}" font-weight="500">${esc(row.figure.text)}</tspan>`
  const detail = row.detail
    .map((run, i) => {
      const dx = i > 0 && row.detail[i - 1]?.color === null ? ' dx="8"' : ''
      return run.color === null
        ? `<tspan fill="${INK.sep}" dx="8">·</tspan>`
        : `<tspan fill="${run.color}"${dx}>${esc(run.text)}</tspan>`
    })
    .join('')
  return [
    `<text x="${CARD.label}" ${at} fill="${INK.label}">${esc(row.label)}</text>`,
    `<text x="${CARD.pct}" ${at}>${figure}</text>`,
    `<text x="${CARD.detail}" ${at}>${detail}</text>`,
  ].join('')
}

function windowRow(reading, at) {
  const pct = reading.fiveHourPct
  const isHot = (pct ?? 0) >= 85
  const reset = reading.fiveHourResetsAt === null ? Number.NaN : Date.parse(reading.fiveHourResetsAt)
  const left = reset - at
  const detail =
    pct === null
      ? [{ text: 'aguardando a primeira resposta', color: INK.detail }]
      : Number.isNaN(reset) || at === 0
        ? []
        : left <= 0
          ? [{ text: 'já renovou', color: INK.detail }]
          : [
              { text: `renova às ${resetLabel(reset, at)}`, color: INK.detail },
              { text: '·', color: null },
              { text: `faltam ${timeLeft(left)}`, color: INK.detail },
            ]
  return {
    id: 'window',
    label: 'Janela 5h',
    pct,
    figure: { text: pct === null ? '–' : `${pct}%`, color: INK.figure, of100: pct !== null },
    detail,
    fill: isHot ? ['rgba(211,98,65,0.65)', '#ef4444'] : ['rgba(211,98,65,0.45)', '#e07a5f'],
    dot: isHot ? '#ef4444' : '#e07a5f',
    isPulsing: false,
  }
}

function contextRow(reading, isPulsing) {
  const pct = reading.contextPct
  const used = reading.contextTokens
  const max = reading.contextWindow
  const color = pct === null ? INK.lime : pct >= 45 ? heat(pct) : INK.lime
  const detail =
    used === null || max === null
      ? [{ text: 'aguardando a primeira resposta', color: INK.detail }]
      : [
          { text: `${formatTokens(used)} de ${formatTokens(max)}`, color: INK.detail },
          { text: '·', color: null },
          { text: 'faltam ', color: INK.faded },
          { text: formatTokens(Math.max(0, max - used)), color: INK.remaining },
        ]
  return {
    id: 'context',
    label: 'Contexto',
    pct,
    figure: { text: pct === null ? '–' : `${pct}%`, color, of100: false },
    detail,
    fill: pct !== null && pct >= WARN_AT ? ['rgba(229,72,77,0.45)', color] : ['rgba(83,184,106,0.45)', color],
    dot: color,
    isPulsing,
  }
}

function svgCard(rows, prevState) {
  const [one, two] = rows
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}"`,
    ` font-family="Inter, -apple-system, 'Segoe UI', system-ui, sans-serif" font-size="13" style="font-variant-numeric:tabular-nums">`,
    `<rect x="0.5" y="0.5" width="${CARD.width - 1}" height="${CARD.height - 1}" rx="10" fill="${INK.bg}" stroke="${INK.border}" stroke-width="1"/>`,
    hairline(one, CARD.row1, prevState.fiveHourPct),
    texts(one, CARD.row1),
    hairline(two, CARD.row2, prevState.contextPct),
    texts(two, CARD.row2),
    '</svg>',
  ].join('')
}

function parseTranscriptSteps(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return []
  try {
    const raw = fs.readFileSync(transcriptPath, 'utf8')
    const lines = raw.split(/\r?\n/).filter(Boolean)
    const steps = []
    for (const line of lines) {
      try {
        steps.push(JSON.parse(line))
      } catch {
        // ignore malformed line
      }
    }
    return steps
  } catch {
    return []
  }
}

function computeFiveHourWindow(currentTranscriptPath, artifactDir, now) {
  const cutoff = now - FIVE_HOUR_MS
  const brainDirs = new Set()

  if (artifactDir) {
    brainDirs.add(path.dirname(artifactDir))
  }
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (home) {
    brainDirs.add(path.join(home, '.gemini', 'antigravity', 'brain'))
    brainDirs.add(path.join(home, '.gemini', 'antigravity-cli', 'brain'))
    brainDirs.add(path.join(home, '.gemini', 'antigravity-ide', 'brain'))
  }
  // Also check parent user folder if running inside .antigravity-cli-env
  if (home.endsWith('.antigravity-cli-env')) {
    const parentHome = path.dirname(home)
    brainDirs.add(path.join(parentHome, '.gemini', 'antigravity', 'brain'))
    brainDirs.add(path.join(parentHome, '.gemini', 'antigravity-cli', 'brain'))
    brainDirs.add(path.join(parentHome, '.gemini', 'antigravity-ide', 'brain'))
  }

  const visitedTranscripts = new Set()
  let turns = 0
  let totalTokens = 0
  let oldestTs = Infinity

  const inspectTranscript = tPath => {
    const resolved = path.resolve(tPath)
    if (visitedTranscripts.has(resolved) || !fs.existsSync(resolved)) return
    visitedTranscripts.add(resolved)
    const steps = parseTranscriptSteps(resolved)
    for (const s of steps) {
      if (s.type !== 'PLANNER_RESPONSE') continue
      const ts = s.created_at ? Date.parse(s.created_at) : Number.NaN
      if (!Number.isNaN(ts) && ts >= cutoff) {
        turns += 1
        totalTokens += (s.input_tokens || 0) + (s.output_tokens || 0) + (s.cache_read_tokens || 0)
        if (ts < oldestTs) oldestTs = ts
      }
    }
  }

  if (currentTranscriptPath) {
    inspectTranscript(currentTranscriptPath)
  }

  for (const bDir of brainDirs) {
    if (!fs.existsSync(bDir)) continue
    try {
      const entries = fs.readdirSync(bDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const tPath = path.join(bDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl')
        try {
          const stat = fs.statSync(tPath)
          if (stat.mtimeMs >= cutoff) {
            inspectTranscript(tPath)
          }
        } catch {
          // ignore missing transcript
        }
      }
    } catch {
      // ignore unreadable dir
    }
  }

  if (turns === 0) {
    return {
      fiveHourPct: null,
      fiveHourResetsAt: null,
      fiveHourTurns: 0,
      fiveHourTokens: 0,
    }
  }

  const pct = Math.min(100, Math.max(1, Math.round((turns / DEFAULT_FIVE_HOUR_TURNS) * 100)))
  const resetsAt = Number.isFinite(oldestTs) ? new Date(oldestTs + FIVE_HOUR_MS).toISOString() : null
  return {
    fiveHourPct: pct,
    fiveHourResetsAt: resetsAt,
    fiveHourTurns: turns,
    fiveHourTokens: totalTokens,
  }
}

async function readStdinJson() {
  if (process.stdin.isTTY) return {}
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function runUpdate(payload = {}, explicitArtifactDir = null) {
  const artifactDir = payload.artifactDirectoryPath || explicitArtifactDir
  const transcriptPath =
    payload.transcriptPath ||
    (artifactDir ? path.join(artifactDir, '.system_generated', 'logs', 'transcript.jsonl') : null)

  if (!artifactDir) {
    return
  }

  const now = Date.now()
  const steps = parseTranscriptSteps(transcriptPath)
  const plannerSteps = steps.filter(
    s => s.type === 'PLANNER_RESPONSE' && (s.input_tokens !== undefined || s.cache_read_tokens !== undefined),
  )
  const lastPlanner = plannerSteps.length > 0 ? plannerSteps[plannerSteps.length - 1] : null

  const inputTokens = lastPlanner ? lastPlanner.input_tokens || 0 : null
  const cacheTokens = lastPlanner ? lastPlanner.cache_read_tokens || 0 : null
  const outputTokens = lastPlanner ? lastPlanner.output_tokens || 0 : null
  const contextTokens = lastPlanner ? inputTokens + cacheTokens + outputTokens : null
  const contextWindow = DEFAULT_CONTEXT_WINDOW
  const contextPct =
    contextTokens !== null ? Math.min(100, Math.max(1, Math.round((contextTokens / contextWindow) * 100))) : null

  const fiveHour = computeFiveHourWindow(transcriptPath, artifactDir, now)

  const reading = {
    fiveHourPct: fiveHour.fiveHourPct,
    fiveHourResetsAt: fiveHour.fiveHourResetsAt,
    contextPct,
    contextTokens,
    contextWindow,
  }

  const sysGenDir = path.join(artifactDir, '.system_generated')
  fs.mkdirSync(sysGenDir, { recursive: true })
  const statePath = path.join(sysGenDir, 'usage-hud-state.json')
  let prevState = { fiveHourPct: 0, contextPct: 0 }
  if (fs.existsSync(statePath)) {
    try {
      prevState = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    } catch {
      // ignore
    }
  }
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      fiveHourPct: reading.fiveHourPct ?? 0,
      contextPct: reading.contextPct ?? 0,
      updatedAt: new Date(now).toISOString(),
    }),
  )

  const isWarning = contextPct !== null && contextPct >= WARN_AT
  const rows = [windowRow(reading, now), contextRow(reading, isWarning)]
  const svgContent = svgCard(rows, prevState)

  const svgPath = path.join(artifactDir, 'usage-hud-card.svg')
  fs.writeFileSync(svgPath, svgContent, 'utf8')
  const svgPosixPath = svgPath.replace(/\\/g, '/')

  const handoffPath = path.join(artifactDir, 'handoff.md')
  const hasHandoff = fs.existsSync(handoffPath)
  const handoffText = hasHandoff ? fs.readFileSync(handoffPath, 'utf8') : ''

  const wBar = bar(reading.fiveHourPct)
  const cBar = bar(reading.contextPct)

  const resetMs = reading.fiveHourResetsAt ? Date.parse(reading.fiveHourResetsAt) : Number.NaN
  const leftMs = resetMs - now
  const fiveDetail =
    reading.fiveHourPct === null
      ? 'aguardando a primeira resposta'
      : Number.isNaN(resetMs)
        ? 'ativa'
        : leftMs <= 0
          ? 'renovada'
          : `renova às ${resetLabel(resetMs, now)} · faltam ${timeLeft(leftMs)}`

  const ctxDetail =
    contextTokens === null
      ? 'aguardando a primeira resposta'
      : `${formatTokens(contextTokens)} de ${formatTokens(contextWindow)} · faltam ${formatTokens(Math.max(0, contextWindow - contextTokens))}`

  const mdLines = [
    '# 📊 usage-hud',
    '',
    `![usage-hud](/${svgPosixPath.replace(/^\/+/, '')})`,
    '',
  ]

  if (isWarning) {
    mdLines.push(
      `> [!WARNING]`,
      `> **Contexto em ${contextPct}%** (acima do limite de alerta de ${WARN_AT}%). Peça **\`gerar handoff\`** no chat para salvar e copiar o resumo completo desta sessão antes que o contexto encha, ou use \`/compact\`.`,
      '',
    )
  }

  mdLines.push(
    '```text',
    `Janela 5h   ${wBar.filled}${wBar.track}  ${String(reading.fiveHourPct ?? '–').padStart(3, ' ')}%   ${fiveDetail}`,
    `Contexto    ${cBar.filled}${cBar.track}  ${String(reading.contextPct ?? '–').padStart(3, ' ')}%   ${ctxDetail}`,
    '```',
    '',
    '### Detalhes da Sessão',
    '',
    '| Métrica | Valor | Detalhe |',
    '| :--- | :--- | :--- |',
    `| **⏱️ Janela de 5h** | **${reading.fiveHourPct !== null ? `${reading.fiveHourPct}%` : '–'}** | ${fiveHour.fiveHourTurns} turnos (${formatTokens(fiveHour.fiveHourTokens)} tokens) · ${fiveDetail} |`,
    `| **🧠 Contexto da Sessão** | **${contextPct !== null ? `${contextPct}%` : '–'}** | ${ctxDetail} |`,
    `| **📦 Cache / Novos / Saída** | ${lastPlanner ? `${formatTokens(cacheTokens)} / ${formatTokens(inputTokens)} / ${formatTokens(outputTokens)}` : '–'} | Passo #${lastPlanner ? lastPlanner.step_index : 0} (${plannerSteps.length} respostas na sessão) |`,
    '',
  )

  if (hasHandoff && handoffText.trim()) {
    const handoffPosix = handoffPath.replace(/\\/g, '/')
    mdLines.push(
      '---',
      '',
      '### 📋 Handoff pronto · copiado para a área de transferência',
      '',
      `📄 Documento completo: [handoff.md](file:///${handoffPosix.replace(/^\/+/, '')})`,
      '',
      '```markdown',
      preview(handoffText),
      '```',
      '',
    )
  } else {
    mdLines.push(
      '---',
      '',
      '> [!TIP]',
      '> **Handoff em um comando**: Digite **`gerar handoff`** (ou **`handoff`**) no chat a qualquer momento para gerar o documento estruturado em [handoff.md](file:///' +
        path.join(artifactDir, 'handoff.md').replace(/\\/g, '/').replace(/^\/+/, '') +
        ') e copiá-lo automaticamente para a área de transferência.',
      '',
    )
  }

  const hudMdPath = path.join(artifactDir, 'usage-hud.md')
  fs.writeFileSync(hudMdPath, mdLines.join('\n'), 'utf8')

  const metaPath = path.join(artifactDir, 'usage-hud.md.metadata.json')
  const meta = {
    summary: `Janela 5h: ${reading.fiveHourPct ?? '–'}% · Contexto: ${reading.contextPct ?? '–'}% (${contextTokens !== null ? formatTokens(contextTokens) : '0'}/${formatTokens(contextWindow)})${hasHandoff ? ' · Handoff pronto' : ''}`,
    updatedAt: new Date(now).toISOString(),
    userFacing: true,
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')

  process.stdout.write('{}\n')
}

export default runUpdate

async function main() {
  const payload = await readStdinJson()
  const artifactDir = payload.artifactDirectoryPath || process.argv[2]
  await runUpdate(payload, artifactDir)
  process.stdout.write('{}\n')
}

const isDirectCall = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
if (isDirectCall) {
  main().catch(() => {
    process.stdout.write('{}\n')
  })
}
