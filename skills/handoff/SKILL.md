---
name: handoff
description: >-
  Gera o documento completo de handoff da sessão (em português do Brasil),
  abre no painel lateral de Artifacts (handoff.md), atualiza o usage-hud
  e copia o conteúdo automaticamente para a área de transferência. Use quando
  o usuário pedir "handoff", "gerar handoff", "resumo para próxima sessão"
  ou quando o contexto do usage-hud passar de 73%.
---

# Gerar Handoff da Sessão (`usage-hud`)

Quando o usuário solicitar o handoff da sessão:

## Passo 1: Escrever o Artifact `handoff.md`

Use a ferramenta `write_to_file` com `Overwrite: true` e `ArtifactMetadata` (`UserFacing: true`, `RequestFeedback: false`) para criar o arquivo `<artifactDirectoryPath>/handoff.md` (no diretório de artefatos da conversa atual).

O conteúdo de `handoff.md` deve ser escrito **sem preâmbulo**, em **português do Brasil** e em **markdown**, contendo exatamente estas seções:

```markdown
## Objetivo
O que estou tentando alcançar, em 2 a 4 frases.

## Estado atual
O que já está feito e verificado, e o que está em andamento.

## Próximos passos
Lista numerada, concreta, na ordem certa.

## Decisões e motivos
Escolhas já feitas e por quê, incluindo o que foi descartado.

## Arquivos e comandos
Caminhos dos arquivos alterados ou relevantes, o que mudou em cada um, e os comandos rodados com o resultado.

## Erros e pendências
Problemas encontrados, causa conhecida e o que ainda não foi resolvido.

## Preferências e restrições
Pedidos explícitos meus que valem na próxima sessão.

## Prompt para a próxima sessão
Um bloco de código com o texto exato para eu colar na sessão nova. Ele deve dizer que o handoff acima é a fonte de verdade, resumir o objetivo e pedir para começar pelo primeiro próximo passo.
```

## Passo 2: Copiar para a Área de Transferência e Atualizar o HUD

Logo após criar o arquivo `handoff.md`, execute o script auxiliar via `run_command` passando o `<artifactDirectoryPath>` da conversa atual:

```powershell
node "C:/Users/aliso/.gemini/config/plugins/usage-hud/scripts/copy-handoff.mjs" "<artifactDirectoryPath>"
```

Confirme de forma concisa para o usuário que o handoff está pronto no painel e já foi copiado para a área de transferência.
