import assert from 'node:assert/strict'
import {
  contextFromSteps,
  contextPct,
  modelFromSteps,
  parseDbTime,
  projectOf,
  quotaFor,
  quotaReading,
  splitModel,
  windowForModel,
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

// 3. Janela por família, sem inventar para modelo desconhecido.
{
  assert.equal(windowForModel('Gemini 4 Hydrogen (Medium)', 140_882), 1_048_576)
  assert.equal(windowForModel('Claude Opus 5.5 (Medium)', 140_882), 1_000_000)
  assert.equal(windowForModel('GPT-OSS 120B (Medium)', 140_882), 131_072)
  assert.equal(windowForModel('Modelo Misterioso', 140_882), null)
  assert.equal(windowForModel('Gemini 4 Hydrogen', 1_500_000), 1_048_576)
}
console.log('   ✓ Tabela de janelas e modelo desconhecido sem percentual.')

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

// 6. Utilitários de banco e projeto.
{
  assert.equal(parseDbTime('2026-11-14 10:55:46.2862034+00:00') > 0, true)
  assert.equal(projectOf('["file:///e%3A/Users/aliso/Documents/.Bali_Brain"]'), '.Bali_Brain')
  assert.equal(projectOf(''), null)
}
console.log('   ✓ Timestamp do SQLite e nome do projeto.')

console.log('\n🎉 Métricas validadas.')
