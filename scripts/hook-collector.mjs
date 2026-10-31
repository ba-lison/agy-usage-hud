/**
 * Hook Collector for AGY UsageHUD (V7)
 * Runs synchronously via Antigravity lifecycle hooks, sanitizes telemetry,
 * notifies the sidecar server, and ensures zero interference with user approvals.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { classifyTool, describeCall } from '../sidecars/usage_hud/activity-engine.mjs'

const MAX_STDIN_BYTES = 1024 * 1024 // 1MB limit for hook payload

function getHomeDir() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir()
}

function getSidecarInfo() {
  const home = getHomeDir()
  const candidatePaths = [
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage-hud', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage-hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage_hud', 'usage_hud', 'data', 'server_info.json'),
    path.join(home, '.gemini', 'antigravity', 'sidecar_data', 'usage_hud', 'data', 'server_info.json'),
  ]

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8')
        const data = JSON.parse(raw)
        if (data && typeof data.port === 'number' && data.port > 0) {
          return data
        }
      } catch {}
    }
  }
  return null
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  let totalBytes = 0

  for await (const chunk of process.stdin) {
    totalBytes += chunk.length
    if (totalBytes > MAX_STDIN_BYTES) {
      break
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

function postToSidecar(port, token, eventPayload) {
  return new Promise(resolve => {
    try {
      const data = JSON.stringify(eventPayload)
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/event',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...(token ? { 'X-Sidecar-Token': token } : {}),
          },
        },
        res => {
          res.resume()
          res.on('end', () => resolve(true))
        },
      )

      req.on('error', () => resolve(false))
      req.setTimeout(250, () => {
        req.destroy()
        resolve(false)
      })

      req.write(data)
      req.end()
    } catch {
      resolve(false)
    }
  })
}

function saveAtomicState(artifactDir, sanitizedEvent) {
  if (!artifactDir || !fs.existsSync(artifactDir)) return
  try {
    const sysDir = path.join(artifactDir, '.system_generated')
    fs.mkdirSync(sysDir, { recursive: true })
    const stateFile = path.join(sysDir, 'activity-state.json')
    const tmpFile = path.join(sysDir, `activity-state-${process.pid}-${Date.now()}.tmp`)

    const payload = JSON.stringify(sanitizedEvent, null, 2)
    fs.writeFileSync(tmpFile, payload, 'utf8')
    fs.renameSync(tmpFile, stateFile)
  } catch {}
}

async function main() {
  const eventName = process.argv[2] || 'unknown'
  const rawStdin = await readStdin()

  let raw = {}
  if (rawStdin) {
    try {
      raw = JSON.parse(rawStdin)
    } catch {}
  }

  const conversationId = raw.conversationId || null
  const artifactDir = raw.artifactDirectoryPath || null

  // Build sanitized telemetry payload (NO sensitive secrets, full file bodies or prompt text)
  const sanitized = {
    event: eventName,
    conversationId,
    stepIdx: Number.isInteger(raw.stepIdx) ? raw.stepIdx : 0,
    timestamp: new Date().toISOString(),
  }

  if (raw.toolCall && typeof raw.toolCall === 'object') {
    sanitized.toolCall = {
      name: typeof raw.toolCall.name === 'string' ? raw.toolCall.name.slice(0, 128) : '',
      kind: classifyTool(raw.toolCall.name),
      detail: describeCall(raw.toolCall),
    }
  }

  if (raw.error && typeof raw.error === 'string') {
    sanitized.error = raw.error.slice(0, 200)
  }

  if (eventName === 'Stop') {
    sanitized.terminationReason = typeof raw.terminationReason === 'string' ? raw.terminationReason : ''
    sanitized.fullyIdle = raw.fullyIdle !== false
  }

  // 1. Notify sidecar via loopback HTTP if available
  const sidecarInfo = getSidecarInfo()
  if (sidecarInfo && sidecarInfo.port) {
    await postToSidecar(sidecarInfo.port, sidecarInfo.token, sanitized)
  }

  // 2. Persist state atomically in the conversation directory
  if (artifactDir) {
    saveAtomicState(artifactDir, sanitized)
  }

  // 3. For SessionStart, PostInvocation and Stop: trigger metric card & handoff update
  if (['SessionStart', 'PostInvocation', 'Stop'].includes(eventName) && artifactDir) {
    try {
      const updateScript = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'update-hud.mjs')
      if (fs.existsSync(updateScript)) {
        // Run update-hud inline or import if needed
        const { default: runUpdate } = await import('./update-hud.mjs').catch(() => ({ default: null }))
        if (typeof runUpdate === 'function') {
          await runUpdate(raw, artifactDir).catch(() => {})
        }
      }
    } catch {}
  }

  // 4. Return stdout contract response (NEUTRAL, never forces allow or continues)
  if (eventName === 'PreToolUse') {
    // Neutral decision: do not override agent policy
    process.stdout.write('{}\n')
  } else if (eventName === 'Stop') {
    // Empty decision allows the agent loop to stop normally
    process.stdout.write('{}\n')
  } else {
    process.stdout.write('{}\n')
  }
}

main().catch(() => {
  process.stdout.write('{}\n')
})
