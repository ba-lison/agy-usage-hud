<div align="center">

# AGY - UsageHUD

### Acompanhe o consumo da janela de 5 horas, uso de tokens e contexto do Antigravity em tempo real na aba lateral.

<p>
  <img alt="Antigravity Plugin" src="https://img.shields.io/badge/Antigravity-Plugin-4285F4?style=flat-square&labelColor=202024">
  <img alt="Versão 1.0.0" src="https://img.shields.io/badge/versão-1.0.0-90b7f5?style=flat-square&labelColor=202024">
  <img alt="Windows validado" src="https://img.shields.io/badge/Windows-validado-9bc5ad?style=flat-square&labelColor=202024">
  <img alt="Interface em português" src="https://img.shields.io/badge/idioma-PT--BR-d7bd83?style=flat-square&labelColor=202024">
</p>

</div>

O **AGY - UsageHUD** é uma extensão/plugin local para o Google Antigravity. Ele monitora a sessão atual da IDE em tempo real através de um sidecar leve, exibindo atividade da sessão, subagentes, capacidade de contexto e consumo na janela de 5 horas em um painel vertical integrado.

## Abrir e atualizar o painel

O processo está em [Como carregar a atualização no Antigravity](INTEGRACAO-V7.md#carregar-atualizacao): pasta instalada, atualização dos arquivos, reabertura da página, diferença entre atualizar dados e atualizar a interface, fontes oficiais e limites do teste.

A lista de subagentes é somente de acompanhamento, com Ocultar/Mostrar. Não há controle de parada nem cópia de pedido.

## Estrutura do Plugin

- `plugin.json`: Manifesto oficial do plugin (`displayName: "AGY - UsageHUD"`).
- `sidecars/usage_hud/`:
  - `sidecar.json`: Configuração de execução do painel na aba lateral (`SIDECAR_UI_ENTRYPOINT_AUX_PANE`).
  - `server.mjs`: Servidor HTTP local que lê os metadados e o `transcript.jsonl` da sessão em tempo real.
  - `ui.html`: Interface visual responsiva, com tema claro/escuro e layout baseado nos tokens de design do Antigravity.
- `scripts/`:
  - `update-hud.mjs`: Script de atualização via hooks.
  - `copy-handoff.mjs`: Script de apoio para geração de handoff no clipboard.
- `skills/handoff/`: Skill acoplada para geração estruturada de handoff da sessão.
- `hooks.json`: Disparadores automáticos (`SessionStart`, `PreInvocation`, `PostInvocation`).

## Próximos Passos (Roadmap)

1. **Rastreamento de Subagentes**: Leitura de chamadas de `invoke_subagent` e tarefas em segundo plano no `transcript.jsonl` (tempo de atividade, quantidade ativa e progresso da tarefa).
2. **Mascote / Animação**: Animação interativa em SVG/Canvas do mascote (Gemini / Antigravity) refletindo o status da sessão (pensando, executando ferramenta, ocioso).
