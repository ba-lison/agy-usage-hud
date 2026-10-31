import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const artifactDir = process.argv[2]
if (!artifactDir) {
  console.error('Uso: node copy-handoff.mjs <artifactDirectoryPath>')
  process.exit(1)
}

const handoffPath = path.join(artifactDir, 'handoff.md')
if (!fs.existsSync(handoffPath)) {
  console.error(`Arquivo não encontrado: ${handoffPath}`)
  process.exit(1)
}

const text = fs.readFileSync(handoffPath, 'utf8')

let copied = false
if (process.platform === 'win32') {
  const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())'], {
    input: text,
    encoding: 'utf8',
  })
  copied = res.status === 0
} else if (process.platform === 'darwin') {
  const res = spawnSync('pbcopy', [], { input: text, encoding: 'utf8' })
  copied = res.status === 0
} else {
  const res = spawnSync('xclip', ['-selection', 'clipboard'], { input: text, encoding: 'utf8' })
  copied = res.status === 0
}

// Refresh usage-hud.md so the Handoff preview card appears immediately
const updateScript = path.join(import.meta.dirname, 'update-hud.mjs')
spawnSync(process.execPath, [updateScript, artifactDir], { stdio: 'ignore' })

console.log(copied ? 'Handoff copiado para a área de transferência e painel atualizado!' : 'Handoff pronto no painel.')
