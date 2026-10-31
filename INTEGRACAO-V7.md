# Integração AGY UsageHUD — Interface V7 e Sessão Real

Documento técnico de referência sobre a integração da interface V7 com os eventos reais do Antigravity.

---

## 1. Visão Geral da Arquitetura

```text
[Antigravity Runtime]
        │
        ├── Hooks (hooks.json)
        │     ├── SessionStart
        │     ├── PreToolUse (*)
        │     ├── PostToolUse (*)
        │     ├── PreInvocation
        │     ├── PostInvocation
        │     └── Stop
        │           │ (stdin JSON via Node)
        │           ▼
        │   [scripts/hook-collector.mjs]
        │           │
        │           ├── 1. stdout neutro imediato ({}) — sem bloquear turnos
        │           ├── 2. POST http://127.0.0.1:<port>/api/event (timeout 250ms)
        │           ├── 3. Gravação atômica local em <brain>/<convId>/activity-state.json
        │           └── 4. Disparo de métricas/handoff em SessionStart, PostInvocation, Stop
        │
        └── Sidecar Runtime (sidecars/usage_hud/)
              ├── server.mjs
              │     ├── GET /api/stats (métricas tipadas sem injeção de HTML)
              │     ├── GET /api/activity (estado do mascote + subagentes reais)
              │     ├── POST /api/event (ingestão localhost dos hooks)
              │     └── POST /api/subagents/stop (resposta explícita de limitação)
              ├── activity-engine.mjs (normalizador de ferramentas e estados)
              └── ui.html (Painel V7 com mascote 32x32, WOFF2 embutido e polling)
```

---

## 2. Contratos e Identificação de Sessão

- **Identificação da Conversa:**
  - O sidecar webview recebe via `window.sidecar.conversationId` (e query param `?conversationId=...`).
  - Cada requisição para `/api/activity` e `/api/stats` valida estritamente a sessão (`convId`).
  - Elimina o fallback aleatório baseado em data de modificação (`mtime`), garantindo isolamento total entre chats e janelas.
- **Segurança de Endpoints:**
  - `/api/event` e `/api/subagents/stop` aceitam conexões apenas de `127.0.0.1` / `localhost` e validam autenticação via token local do sidecar (`x-sidecar-token`).

---

## 3. Classificação e Sanitização de Ferramentas

A engine (`sidecars/usage_hud/activity-engine.mjs`) mapeia as ferramentas do Antigravity para as expressões do mascote V7:

| Ferramenta Antigravity | Atividade V7 | Expressão Visual | Detalhe Exibido |
| :--- | :--- | :--- | :--- |
| `search_web` | `web` | Globo terrestre retrô | Termo de busca / domínio |
| `read_url_content` | `reading` | Óculos de leitura | Hostname ou URL sanitizada |
| `view_file`, `read_file` | `reading` | Óculos de leitura | Nome do arquivo (`basename`) |
| `grep_search`, `find_by_name`, etc. | `searching` | Olhar focado / busca | Termo ou pasta pesquisada |
| `write_to_file`, `edit_file` | `coding` | Olhar técnico focado | Nome do arquivo editado |
| `run_command` | `terminal` | Olhar concentrado | Comando ou ferramenta |
| `ask_question` | `question` | Expressão interrogativa | Pergunta ao usuário |
| Resposta do modelo (`thought`) | `thinking` | Balão de pensamento + semicerrados | "Pensando..." |
| Subagentes ativos | `agents` | Mini Geminis coordenados | Qtd. e nomes dos subagentes |

---

## 4. Subagentes: Descoberta e Limitações do Host

### Descoberta Real
Os subagentes são descobertos inspecionando o transcript e metadados da sessão pai (`transcript.jsonl` e arquivos de sessão do Antigravity). Quando não há subagentes na sessão, a seção permanece recolhida/oculta.

### Capacidade de Cancelamento (Parada)
Conforme auditoria do executável `language_server.exe agentapi --help`:
- O CLI do Language Server expõe apenas três comandos:
  1. `get-conversation-metadata`
  2. `new-conversation`
  3. `send-message`
- Não existe primitiva no protocolo de sidecar ou agentapi para terminar (`kill`) um processo de subagente.
- A ferramenta `manage_subagents` é uma capability interna de prompt do agente pai, inacessível diretamente via script HTTP ou iframe não privilegiado do webview.
- **Comportamento Honesto:** A interface e o endpoint `/api/subagents/stop` informam explicitamente o status `unsupported` ("Cancelamento direto de subagente não suportado pela agentapi nesta versão do Antigravity"), sem simular encerramentos locais falsos.

---

## 5. Resiliência e Concorrência

- **Zero Bloqueio:** Os hooks respondem `{}` imediatamente no stdout para `PreToolUse` e `Stop`. Se o servidor sidecar estiver inacessível ou o timeout de 250ms expirar, o coletor silencia e permite a continuidade da sessão do Antigravity sem interrupção.
- **Gravação Atômica:** Estados de atividade são gravados com sufixo `.tmp.<pid>` e renomeados atomicamente, prevenindo corrupção em chamadas concorrentes de múltiplos hooks.
- **Assets Embutidos:** A fonte Google Sans Flex está embutida diretamente no `ui.html` como data URI WOFF2, eliminando qualquer dependência de CDNs ou acesso externo.
