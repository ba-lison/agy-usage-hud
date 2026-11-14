/**
 * Activity Engine for AGY UsageHUD (V7)
 * Maps real Antigravity tool and lifecycle events to mascot activities and sanitized details.
 */

export const TOOL_KINDS = {
  // Web search
  search_web: 'web',
  // Page reading
  read_url_content: 'page',
  // Navegador embutido (237 chamadas no transcript real; não é ferramenta genérica)
  webview_browser: 'browser',
  // File viewing / reading
  view_file: 'reading',
  read_file: 'reading',
  // Project searching / listing
  list_dir: 'files',
  find_by_name: 'files',
  grep_search: 'files',
  list_resources: 'files',
  // File editing / writing
  write_to_file: 'writing',
  replace_file_content: 'writing',
  multi_replace_file_content: 'writing',
  write_file: 'writing',
  edit_file: 'writing',
  // Terminal and task execution
  run_command: 'terminal',
  manage_task: 'terminal',
  // Subagents
  invoke_subagent: 'agents',
  manage_subagents: 'agents',
  define_subagent: 'agents',
  send_message: 'agents',
  swarm: 'agents',
  run_workflow: 'agents',
  // User interaction
  ask_question: 'question',
  ask_permission: 'question',
  // Generation
  generate_image: 'image',
  // Timer / trabalho em segundo plano
  schedule: 'timer',
  // Genéricas: list_permissions, list_plugin_accounts, search_marketplace,
  // call_mcp_tool e mcp_* caem em 'external' (ver classifyTool).
}

export const ACTIVITIES = {
  idle: {
    label: 'À disposição',
    title: 'Aguardando próxima instrução.',
    detail: 'Aguardando sua próxima mensagem',
    glyph: ''
  },
  web: {
    label: 'Pesquisa na web',
    title: 'Buscando referências na web.',
    detail: 'Chamada de pesquisa solicitada; aguardando retorno.',
    tool: 'search_web',
    glyph: '<g class="globe"><circle cx="99" cy="88" r="12"/><g class="globe-grid"><ellipse cx="99" cy="88" rx="5" ry="12"/><path d="M87 88h24m-22-6h20m-20 12h20"/></g></g>'
  },
  page: {
    label: 'Lendo uma página',
    title: 'Lendo a página solicitada.',
    detail: 'Leitura de uma página solicitada.',
    tool: 'read_url_content',
    glyph: '<path d="M87 76h20v25H87Zm0 6h20m-15 6h10m-10 6h7"/>'
  },
  reading: {
    label: 'Lendo um arquivo',
    title: 'Lendo o arquivo solicitado.',
    detail: 'Leitura de arquivo solicitada.',
    tool: 'view_file',
    glyph: ''
  },
  files: {
    label: 'Buscando no projeto',
    title: 'Buscando no conteúdo do projeto.',
    detail: 'Busca de texto ou arquivos solicitada.',
    tool: 'grep_search',
    glyph: '<path d="M85 80h11l4 4h12v17H85Z"/><circle cx="96" cy="91" r="4"/><path d="m99 94 5 5"/>'
  },
  writing: {
    label: 'Editando arquivo',
    title: 'Preparando uma alteração.',
    detail: 'Edição de arquivo solicitada.',
    tool: 'edit_file',
    glyph: '<path d="m87 96 16-17 6 6-16 17-8 2Zm12-13 6 6"/>'
  },
  terminal: {
    label: 'Comando no terminal',
    title: 'Acompanhando o comando.',
    detail: 'Chamada ao terminal solicitada.',
    tool: 'run_command',
    glyph: '<path d="M84 78h29v24H84Zm0 5h29m-23 6 4 4-4 4"/><path class="cursor" d="M99 97h7"/>'
  },
  agents: {
    label: 'Coordenando subagentes',
    title: 'Pequenos Gemini, em paralelo.',
    detail: 'Subagentes em atividade.',
    tool: 'invoke_subagent',
    glyph: ''
  },
  question: {
    label: 'Pergunta para você',
    title: 'Uma pergunta a caminho.',
    detail: 'Aguardando sua confirmação ou resposta.',
    tool: 'ask_question',
    glyph: '<path d="M85 77h27v20h-11l-8 7v-7h-8Zm10 7q0-5 5-5t5 5q0 3-5 5v2m0 3v1"/>'
  },
  image: {
    label: 'Gerando imagem',
    title: 'Uma chamada de imagem.',
    detail: 'Geração de imagem solicitada.',
    glyph: '<path d="M85 78h28v24H85Zm2 22 8-9 6 5 5-8 6 12"/><circle cx="94" cy="85" r="2"/>'
  },
  external: {
    label: 'Usando ferramenta',
    title: 'Uma ferramenta em atividade.',
    detail: 'Executando ferramenta do assistente.',
    glyph: '<circle cx="92" cy="86" r="5"/><circle cx="106" cy="97" r="5"/><path d="m96 90 6 4"/>'
  },
  model: {
    label: 'Pensando',
    title: 'Organizando a próxima ideia.',
    detail: 'O modelo está preparando a próxima resposta.',
    glyph: '<g class="thought-bubble"><path d="M85 13h23q7 0 7 7v9q0 7-7 7H85q-7 0-7-7v-9q0-7 7-7Z"/><circle cx="79" cy="41" r="3"/><circle cx="74" cy="47" r="1.8"/></g><g fill="currentColor" stroke="none"><circle class="thought-dot" cx="88" cy="25" r="1.5"/><circle class="thought-dot" cx="97" cy="25" r="1.5"/><circle class="thought-dot" cx="106" cy="25" r="1.5"/></g>'
  },
  browser: {
    label: 'Usando o navegador',
    title: 'Navegando numa página.',
    detail: 'Ação no navegador solicitada.',
    tool: 'webview_browser',
    glyph: ''
  },
  timer: {
    label: 'Timer em segundo plano',
    title: 'Esperando o timer.',
    detail: 'Aguardando um timer ou tarefa em segundo plano.',
    tool: 'schedule',
    glyph: ''
  },
  done: {
    label: 'Concluído',
    title: 'Tarefa concluída.',
    detail: 'Turno concluído. Aguardando sua próxima mensagem.',
    glyph: ''
  },
  interrupted: {
    label: 'Interrompido',
    title: 'A execução foi interrompida.',
    detail: 'Você interrompeu a execução.',
    glyph: ''
  },
  waiting: {
    label: 'Aguardando próxima ação',
    title: 'A chamada retornou.',
    detail: 'Aguardando a próxima ação da sessão.',
    glyph: ''
  },
  ended: {
    label: 'Turno encerrado',
    title: 'O turno foi encerrado.',
    detail: 'Turno finalizado.',
    glyph: '<path d="M94 80v18m9-18v18"/>'
  },
  error: {
    label: 'Erro na ferramenta',
    title: 'A ferramenta informou um erro.',
    detail: 'O retorno trouxe um sinal de erro ou interrupção.',
    glyph: '<circle cx="100" cy="89" r="12"/><path d="M100 82v8m0 5v1"/>'
  }
}

export function classifyTool(name) {
  if (typeof name !== 'string') return 'external'
  if (Object.hasOwn(TOOL_KINDS, name)) return TOOL_KINDS[name]
  if (name.startsWith('swarm_')) return 'agents'
  return 'external'
}

// Pose transitória (concluído, interrompido, erro, encerrado) antes de assentar.
export const SETTLE_MS = 6000
// Erro de uma ferramenta: aviso curto e volta ao fluxo.
export const TOOL_ERROR_MS = 4000

const CANCEL_REASONS = new Set(['USER_CANCELED', 'USER_CANCELLED', 'CANCELED', 'CANCELLED'])
const REASON_LABEL = {
  MAX_INVOCATIONS: 'limite de invocações',
  MAX_FORCED_INVOCATIONS: 'limite de invocações forçadas',
  TERMINAL_STEP_TYPE: 'passo terminal',
  TERMINAL_CUSTOM_HOOK: 'encerrado por hook',
}

// O hook entrega o enum EXECUTOR_TERMINATION_REASON_* sem o prefixo; aceita os dois.
export function normalizeReason(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().toUpperCase().replace(/^EXECUTOR_TERMINATION_REASON_/, '')
}

// Stop → reação: NO_TOOL_CALL é o fim normal; cancelamento vence erro; o resto
// (limites, passo terminal, hook, motivo vazio) é "Turno encerrado", não "Concluído".
export function stopReaction(reason, error) {
  const r = normalizeReason(reason)
  if (CANCEL_REASONS.has(r)) return 'interrupted'
  if (r === 'ERROR' || (typeof error === 'string' && error.trim())) return 'error'
  if (r === 'NO_TOOL_CALL') return 'done'
  return 'ended'
}

export function sanitizeText(val, maxLen = 80) {
  if (typeof val !== 'string') return ''
  return val
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

export function sanitizeBasename(filePath, maxLen = 60) {
  if (typeof filePath !== 'string') return ''
  const clean = filePath.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim()
  const parts = clean.split(/[/\\]/).filter(Boolean)
  const base = parts.pop() || clean
  return sanitizeText(base, maxLen)
}

export function describeCall(call) {
  if (!call || typeof call !== 'object') return 'Atividade em execução'
  const name = typeof call.name === 'string' ? call.name : ''
  const args = (call.args && typeof call.args === 'object') ? call.args : {}

  if (name === 'search_web') {
    const q = sanitizeText(args.query || args.Query || '')
    if (q) return `Busca: ${q}`
  }
  if (name === 'read_url_content') {
    const uStr = args.Url || args.url || ''
    try {
      const u = new URL(uStr)
      if (['http:', 'https:'].includes(u.protocol)) return `Fonte: ${u.hostname}`
    } catch {}
    const cleanUrl = sanitizeText(uStr, 40)
    if (cleanUrl) return `Fonte: ${cleanUrl}`
  }
  if (name === 'view_file' || name === 'read_file') {
    const p = sanitizeBasename(args.AbsolutePath || args.Path || args.path || '')
    if (p) return `Arquivo: ${p}`
  }
  if (['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'write_file', 'edit_file'].includes(name)) {
    const p = sanitizeBasename(args.TargetFile || args.Path || args.path || '')
    if (p) return `Arquivo: ${p}`
  }
  if (name === 'grep_search') {
    const q = sanitizeText(args.Query || args.query || '')
    if (q) return `Busca no projeto: ${q}`
  }
  if (name === 'list_dir' || name === 'find_by_name') {
    const d = sanitizeBasename(args.DirectoryPath || args.Path || args.SearchPath || '')
    if (d) return `Pasta: ${d}`
  }
  if (name === 'run_command') {
    const summary = sanitizeText(args.toolSummary || '')
    if (summary) return `Comando: ${summary}`
    const cmd = sanitizeText(args.CommandLine || args.command || '', 50)
    if (cmd) return `Comando: ${cmd}`
  }
  if (name === 'manage_task') {
    const action = sanitizeText(args.Action || args.action || '')
    if (action) return `Tarefa em segundo plano: ${action}`
  }
  if (name === 'invoke_subagent') {
    const role = sanitizeText(args.Role || args.TypeName || '')
    if (role) return `Invocando subagente: ${role}`
  }
  if (name === 'ask_question' || name === 'ask_permission') {
    return 'Aguardando sua confirmação ou resposta'
  }
  if (name === 'webview_browser') {
    const uStr = args.Url || args.url || ''
    try {
      const u = new URL(uStr)
      if (['http:', 'https:'].includes(u.protocol)) return `Navegador: ${u.hostname}`
    } catch {}
    const action = sanitizeText(args.Action || args.action || args.toolSummary || '', 50)
    if (action) return `Navegador: ${action}`
  }
  if (name === 'send_message') return 'Mensagem para um subagente'
  if (name === 'define_subagent') return 'Definindo um subagente'
  if (name === 'manage_subagents') {
    const action = sanitizeText(args.Action || args.action || '')
    if (action) return `Subagentes: ${action}`
  }
  if (name === 'call_mcp_tool') {
    const server = sanitizeText(args.ServerName || args.serverName || args.server || '', 30)
    const tool = sanitizeText(args.ToolName || args.toolName || args.tool || '', 40)
    if (server || tool) return `MCP: ${[server, tool].filter(Boolean).join(' · ')}`
    return 'Ferramenta MCP em execução'
  }
  if (name.startsWith('mcp_')) {
    const tool = sanitizeText(name.slice(4), 50)
    if (tool) return `MCP: ${tool}`
  }

  // O coletor do hook já guarda só o detalhe sanitizado (sem args); usa-o.
  if (typeof call.detail === 'string' && call.detail.trim()) return sanitizeText(call.detail, 100)

  const kind = classifyTool(name)
  return ACTIVITIES[kind]?.detail || 'Executando ferramenta'
}

export function createActivityModel(conversationId, options = {}) {
  if (typeof conversationId !== 'string' || !conversationId) {
    throw new TypeError('conversationId is required')
  }
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const settleMs = Number.isFinite(options.settleMs) ? options.settleMs : SETTLE_MS
  const toolErrorMs = Number.isFinite(options.toolErrorMs) ? options.toolErrorMs : TOOL_ERROR_MS

  const activeCalls = new Map()      // key: `${stepIdx}:${name}` -> { kind, detail, startedAt }
  const completedKeys = new Set()
  let kind = 'idle'                  // estado assentado
  let transient = null               // { kind, detail, until }: pose curta antes de assentar
  let lastEvent = 'none'
  let lastKey = ''
  let stopped = false
  let lastReturnedLabel = ''
  let customDetail = ''
  let terminationReason = ''
  let fullyIdle = true

  // Hora do evento: o carimbo do coletor quando plausível. Assim um Stop antigo
  // relido do activity-state.json não reacende a pose de concluído.
  function eventTime(payload) {
    const t = now()
    const at = typeof payload.timestamp === 'string' ? Date.parse(payload.timestamp) : NaN
    return Number.isFinite(at) && at <= t + 1000 ? Math.min(at, t) : t
  }

  function setTransient(tKind, ms, detail, at) {
    const until = at + ms
    transient = until > now() ? { kind: tKind, detail, until } : null
  }

  function liveTransient() {
    if (transient && now() >= transient.until) transient = null
    return transient
  }

  function settledDetail() {
    if (customDetail) return customDetail
    if (kind === 'waiting' && stopped && !fullyIdle) return 'Ainda há tarefas em segundo plano.'
    if (kind === 'waiting' && lastReturnedLabel) {
      return `${lastReturnedLabel} retornou. Aguardando a próxima ação.`
    }
    return ACTIVITIES[kind]?.detail || 'À disposição'
  }

  function snapshot() {
    const running = [...activeCalls.values()]
    const t = running.length > 0 ? null : liveTransient()
    const effectiveKind = running.length > 0 ? running[running.length - 1].kind : t ? t.kind : kind
    const detail = running.length > 0
      ? running[running.length - 1].detail || ACTIVITIES[effectiveKind]?.detail || ''
      : t ? t.detail : settledDetail()

    return {
      conversationId,
      kind: effectiveKind,
      label: ACTIVITIES[effectiveKind]?.label || ACTIVITIES.external.label,
      title: ACTIVITIES[effectiveKind]?.title || ACTIVITIES.external.title,
      detail,
      activeCount: activeCalls.size,
      lastEvent,
      hasError: effectiveKind === 'error',
      stopped,
      fullyIdle,
      terminationReason,
      // ms até a pose transitória assentar; 0 quando não há transitória.
      settleMs: t ? Math.max(0, t.until - now()) : 0,
      updatedAt: new Date(now()).toISOString()
    }
  }

  function receive(event, payload) {
    if (!payload || typeof payload !== 'object') return snapshot()
    if (payload.conversationId && payload.conversationId !== conversationId) return snapshot()

    const validEvents = ['SessionStart', 'PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation', 'Stop']
    if (!validEvents.includes(event)) return snapshot()

    // O mesmo evento chega pelo POST e, depois, pela releitura do arquivo de estado.
    if (typeof payload.timestamp === 'string' && payload.timestamp) {
      const key = `${event}|${payload.timestamp}|${payload.stepIdx ?? ''}|${payload.toolCall?.name ?? ''}`
      if (key === lastKey) return snapshot()
      lastKey = key
    }

    lastEvent = event
    const at = eventTime(payload)

    if (event === 'PreToolUse') {
      stopped = false
      const name = payload.toolCall?.name
      const stepIdx = payload.stepIdx ?? 0
      if (typeof name === 'string' && name.length <= 128) {
        const key = `${stepIdx}:${name}`
        if (!completedKeys.has(key)) {
          const tKind = classifyTool(name)
          const detail = describeCall(payload.toolCall)
          activeCalls.set(key, { kind: tKind, detail, startedAt: at })
          kind = tKind
          transient = null
          customDetail = ''
        }
      }
    } else if (event === 'PostToolUse') {
      const name = payload.toolCall?.name
      const stepIdx = payload.stepIdx ?? 0
      if (typeof name === 'string') {
        const key = `${stepIdx}:${name}`
        activeCalls.delete(key)
        completedKeys.add(key)
        lastReturnedLabel = ACTIVITIES[classifyTool(name)]?.label || name
        kind = activeCalls.size > 0 ? [...activeCalls.values()].pop().kind : 'waiting'
        customDetail = ''
        const isErr = typeof payload.error === 'string' && payload.error.trim().length > 0
        if (isErr) setTransient('error', toolErrorMs, `${lastReturnedLabel} retornou um erro.`, at)
      }
    } else if (event === 'SessionStart') {
      stopped = false
      activeCalls.clear()
      transient = null
      kind = 'idle'
      customDetail = ''
      terminationReason = ''
      fullyIdle = true
    } else if (event === 'PreInvocation') {
      stopped = false
      if (activeCalls.size === 0) {
        kind = 'model'
        transient = null
        customDetail = 'O modelo está preparando a próxima resposta'
      }
    } else if (event === 'PostInvocation') {
      if (activeCalls.size === 0) {
        kind = 'waiting'
        customDetail = ''
      }
    } else if (event === 'Stop') {
      activeCalls.clear()
      stopped = true
      terminationReason = normalizeReason(payload.terminationReason)
      fullyIdle = payload.fullyIdle !== false
      kind = fullyIdle ? 'idle' : 'waiting'
      customDetail = ''
      const reaction = stopReaction(terminationReason, payload.error)
      const background = fullyIdle ? '' : ' Ainda há tarefas em segundo plano.'
      const detail = {
        done: fullyIdle ? ACTIVITIES.done.detail : `Turno concluído.${background}`,
        interrupted: `Você interrompeu a execução.${background}`,
        error: `O turno terminou com erro.${background}`,
        ended: `Turno encerrado: ${REASON_LABEL[terminationReason] || terminationReason || 'motivo não informado'}.${background}`,
      }[reaction]
      setTransient(reaction, settleMs, detail, at)
    }

    return snapshot()
  }

  function setSubagentsInfo(runningCount, totalCount) {
    if (runningCount > 0 && activeCalls.size === 0 && kind !== 'model') {
      kind = 'agents'
      customDetail = `${runningCount} de ${totalCount} subagente${totalCount > 1 ? 's' : ''} em atividade`
    }
  }

  return { receive, snapshot, setSubagentsInfo }
}
