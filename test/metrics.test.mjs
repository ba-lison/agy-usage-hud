import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  contextFromSteps,
  contextPct,
  latestConversationId,
  modelFromSteps,
  parseDbTime,
  projectOf,
  compactTimeLeft,
  quotaFor,
  quotaReading,
  quotaSummaryReading,
  splitModel,
} from '../sidecars/usage_hud/metrics.mjs'

console.log('🧪 Métricas do AGY UsageHUD\n')

// 1. O prompt é input + cache; output não entra na conta.
{
  const steps = [
    { type: 'PLANNER_RESPONSE', input_tokens: 50088, cache_read_tokens: 8765, output_tokens: 572 },
    { type: 'PLANNER_RESPONSE', input_tokens: 2531, cache_read_tokens: 138351, output_tokens: 228 },
  ]
  const reading = contextFromSteps(steps)
  assert.equal(reading.tokens, 140882, 'contexto deve ser input + cache')
  assert.equal(reading.output, 228)
  assert.equal(contextPct(reading.tokens, 1_048_576), 13)
}
console.log('   ✓ Contexto = input + cache, sem somar output.')

// 2. O último model selection manda.
{
  const steps = [
    { type: 'USER_INPUT', content: 'Model Selection` from None to Claude Opus 5.5 (Medium). No need to comment' },
    { type: 'USER_INPUT', content: 'Model Selection` from Claude Opus 5.5 (Medium) to Gemini 4 Hydrogen (Medium). No need' },
  ]
  assert.equal(modelFromSteps(steps), 'Gemini 4 Hydrogen (Medium)')
  assert.deepEqual(splitModel('Gemini 4 Hydrogen (Medium)'), { name: 'Gemini 4 Hydrogen', effort: 'Medium' })
}
console.log('   ✓ Modelo e esforço vêm da última troca registrada.')

// 3. O limite vem do host; sem ele, o percentual fica null.
{
  assert.equal(contextPct(141110, 256000), 55)
  assert.equal(contextPct(141110, null), null)
}
console.log('   ✓ Percentual usa o limite do host; sem limite, não inventa.')

// 4. Cota só do modelo pedido; nada de cair no Flash por acidente.
{
  const models = [
    { label: 'Gemini 4 Hydrogen (Medium)', quotaInfo: { remainingFraction: 0.987, resetTime: '2026-11-14T15:49:34Z' } },
    { label: 'Claude Opus 5.5 (Medium)', quotaInfo: { resetTime: '2026-11-20T11:44:54Z' } },
  ]
  const gemini = quotaFor(models, 'Gemini 4 Hydrogen (Medium)')
  assert.equal(gemini.remainingFraction, 0.987)
  assert.equal(quotaFor(models, 'Claude Opus 5.5 (Medium)').remainingFraction, null)
  assert.equal(quotaFor(models, 'Gemini 9 Inexistente'), null, 'sem correspondência não pode escolher outro modelo')
  assert.equal(quotaFor(models, 'Claude Opus 5.5 (High)'), null)
}
console.log('   ✓ Cota sem fallback para outro modelo.')

// 5. Sem percentual, mostra renovação e nenhum número.
{
  const reading = quotaReading({ label: 'Claude Opus 5.5 (Medium)', remainingFraction: null, resetTime: '2026-11-20T11:44:54Z' })
  assert.equal(reading.exposed, false)
  assert.equal(reading.consumedPct, null)
  assert.ok(reading.timeLeftMs > 0)
  assert.ok(reading.resetLabel)

  const known = quotaReading({ label: 'Gemini 4 Hydrogen', remainingFraction: 0.75, resetTime: '2026-11-14T15:49:34Z' })
  assert.equal(known.exposed, true)
  assert.equal(known.consumedPct, 25)
  assert.equal(known.remainingPct, 75)
}
console.log('   ✓ Cota exposta e cota ausente tratadas de forma diferente.')

// 6. A cota real do View Usage tem 5 horas e semana; o painel usa a janela
//    principal do modelo ativo e deixa o resto no detalhe.
{
  const now = Date.parse('2026-11-16T20:00:00Z')
  const reset = ms => new Date(now + ms).toISOString()
  const summary = {
    groups: [
      {
        displayName: 'Gemini Models',
        description: 'Models within this group: Gemini 4 Hydrogen, Gemini 3.8 Flash',
        buckets: [
          { window: 'weekly', remainingFraction: 0.82, resetTime: reset(4 * 86_400_000 + 14 * 3_600_000) },
          { window: '5h', remainingFraction: 0.92, resetTime: reset(3 * 3_600_000 + 30 * 60_000) },
        ],
      },
      {
        displayName: 'Claude and GPT models',
        description: 'Models within this group: Claude Opus 5.5, Claude Sonnet 5.5, GPT-OSS 120B',
        buckets: [
          { window: 'weekly', remainingFraction: 0, resetTime: reset(3 * 86_400_000 + 15 * 3_600_000) },
          { window: '5h', remainingFraction: 1, disabled: true, resetTime: reset(4 * 3_600_000 + 59 * 60_000) },
        ],
      },
      {
        displayName: 'Gemini 4 Argon',
        buckets: [
          { window: 'weekly', remainingFraction: 0.81, resetTime: reset(6 * 86_400_000) },
        ],
      },
    ],
  }

  const argon = quotaSummaryReading(summary, 'Orchestrator (Argon)', now)
  assert.equal(argon.window, '5 horas')
  assert.equal(argon.remainingPct, 92)
  assert.equal(argon.consumedPct, 8)
  assert.equal(argon.resetLabel, 'em 3h30')
  assert.deepEqual(argon.detail.map(row => [row.name, row.remainingPct]), [
    ['Semana', 82],
    ['Gemini 4 Argon · própria', 81],
  ])

  const hydrogen = quotaSummaryReading(summary, 'Gemini 4 Hydrogen (Medium)', now)
  assert.deepEqual(hydrogen.detail.map(row => [row.name, row.remainingPct]), [['Semana', 82]])

  const claude = quotaSummaryReading(summary, 'Claude Opus 5.5 (Medium)', now)
  assert.equal(claude.window, 'semana')
  assert.equal(claude.remainingPct, 0)
  assert.equal(claude.resetLabel, 'em 3d15h')
  assert.deepEqual(claude.detail, [{ name: '5 horas', notApplicable: true, remainingPct: null, resetLabel: null }])
  assert.match(claude.note, /5 horas não se aplica/i)

  assert.equal(quotaSummaryReading(summary, 'Gemini 9 Inexistente', now), null)
  assert.equal(quotaSummaryReading({ groups: [] }, 'Gemini 4 Hydrogen', now), null)
  assert.equal(compactTimeLeft(3 * 3_600_000 + 30 * 60_000), '3h30')
  assert.equal(compactTimeLeft(4 * 86_400_000 + 14 * 3_600_000), '4d14h')
  assert.equal(compactTimeLeft(6 * 86_400_000), '6d')
}
console.log('   ✓ Cota de 5h e semanal separadas pelo grupo do modelo ativo.')

// 7. Utilitários de banco e projeto.
{
  assert.equal(parseDbTime('2026-11-14 10:55:46.2862034+00:00') > 0, true)
  assert.equal(projectOf('["file:///e%3A/Users/aliso/Documents/.Bali_Brain"]'), '.Bali_Brain')
  assert.equal(projectOf(''), null)
}
console.log('   ✓ Timestamp do SQLite e nome do projeto.')

// 8. Sessão de ontem não conta como sessão de agora.
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-latest-'))
  const brain = path.join(home, 'brain')
  const write = (convId, at) => {
    const dir = path.join(brain, convId, '.system_generated', 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'transcript.jsonl')
    fs.writeFileSync(file, '{}\n')
    fs.utimesSync(file, at, at)
  }
  const old = new Date(Date.now() - 3 * 3600_000)
  const fresh = new Date(Date.now() - 5_000)
  write('conv-ontem', old)
  write('conv-hoje', fresh)

  assert.equal(latestConversationId([brain], 0), 'conv-hoje')
  assert.equal(latestConversationId([brain], Date.now() - 3600_000), 'conv-hoje')
  assert.equal(latestConversationId([brain], Date.now() - 60_000), 'conv-hoje', 'só a sessão desta execução')
  assert.equal(latestConversationId([brain], Date.now() + 60_000), null, 'sem sessão nova, nada aparece')

  fs.rmSync(home, { recursive: true, force: true })
}
console.log('   ✓ Abrir o app de novo não revive a sessão anterior.')

console.log('\n🎉 Métricas validadas.')
