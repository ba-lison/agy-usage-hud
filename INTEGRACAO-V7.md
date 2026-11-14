# Integração AGY UsageHUD — Interface V7 e Sessão Real

Documento técnico de referência sobre a integração da interface V7 com os eventos reais do Antigravity.

## V8 — números reais — 2026-11-14

- **Contexto:** o total, o limite efetivo e os grupos vêm do `contextWindowUsage` do Language Server (`estimatedTokensUsed`, `maxContextTokens`, `tokenGroups`). O transcript é fallback: `input_tokens + cache_read_tokens`. No teste de 2026-11-14, o Gemini 4 Hydrogen mostrou **256k de limite efetivo** e 141,1k usados (55%), não 1M.
- **Detalhamento:** o cartão Contexto abre uma barra empilhada e as linhas Mensagens, Prompt de sistema, Ferramentas e Livre. O botão Ferramentas MCP abre os servidores do `mcp_config.json` e as ferramentas de cada um; o host só informa o total de Ferramentas, então cada ferramenta mostra o tamanho do schema em KB.
- **Título da sessão:** vem de `conversation_summaries.title`, a mesma lista lateral do app. O UUID não aparece mais no cabeçalho.
- **Subagentes:** vêm de `conversation_summaries.parent_conversation_id`, com `agent_name`, profundidade e o contexto de cada filho lido do próprio transcript. A varredura de todas as pastas e o nome `Subagente` aleatório saíram.
- **Cota:** usa apenas o modelo da sessão. Sem `remainingFraction` (caso dos modelos Claude), o painel mostra o horário de renovação e nenhum percentual. O fallback que podia exibir a cota do Gemini numa sessão Claude foi removido.
- **Janela do modelo:** vem de `maxContextTokens`, o limite efetivo que o app usa na sessão; não há mais tabela local. Sem resposta do Language Server, o painel mostra só os tokens e não inventa limite.
- **Interface:** botões de tema e de recarregar removidos; o painel atualiza sozinho a cada 5 s e segue o tema do sistema quando não há escolha salva. Pausa de animação mantida.
- **Cartão `usage-hud.md`:** o hook deixou de gerá-lo. Ele usava janela de 200k e somava output, então mostrava 94% onde o painel agora mostra 55% (256k). O painel passa a ser a única fonte.
- **Parada:** botão por subagente em execução, com confirmação em dois cliques; o mesmo `CancelCascadeInvocation` da aba Overview. O nome vem do `Role` do invoke.
- **Limites:** o painel não renderiza acima do prompt. A parada usa o RPC do Language Server, não o `agentapi`. O `sidecar.json` não tem campo de auto-open: o HUD abre pela linha Extensions ou pela aba do painel lateral, não sozinho ao iniciar o app.

### Carregar a V8

1. Rode `sync.bat` com o Antigravity fechado ou ocioso; ele sobrescreve a cópia em `%USERPROFILE%\.gemini\config\plugins\usage-hud`.
2. Reabra a aba **AGY - UsageHUD**. Se a página antiga continuar, reinicie o app quando não houver trabalho em execução.

---


<a id="carregar-atualizacao"></a>

## Como carregar a atualização no Antigravity

Conferido em 2026-11-01. O plugin está instalado em:
%USERPROFILE%\.gemini\config\plugins\usage-hud

### Para Bali carregar esta correção

1. Os arquivos corrigidos já foram copiados para a instalação local. Não é preciso reinstalar o plugin.
2. Feche a aba AGY - UsageHUD e abra o painel novamente no Antigravity. O objetivo é recriar a página, que receberá o HTML novo do servidor.
3. Confira a versão visual: subagentes têm somente Ocultar/Mostrar, sem botões de parar ou copiar; os cards Cota do modelo e Contexto têm o mesmo fundo.
4. Se a aba ainda mostrar os controles antigos, o aplicativo pode ter mantido a página em memória. Quando não houver trabalho em execução, feche e abra o Antigravity e reabra o painel.

O painel não tem botão de recarregar: ele consulta métricas e atividade a cada 5 segundos. Recarregar o HTML instala atualizações; não é preciso reinstalar o plugin.

O servidor ativo foi consultado por HTTP e entregou o arquivo instalado, com hash idêntico. Em 2026-11-01, Bali confirmou que a atualização funcionou ("deu super certo") e pediu o encerramento desta frente. Ele não detalhou se reabriu apenas a aba ou reiniciou o aplicativo. O agente não controlou a janela real. O reload do HTML ao recriar a página é sustentado pelo código de server.mjs, que lê ui.html a cada requisição e envia Cache-Control: no-store.

### Para futuras atualizações

- Fonte de desenvolvimento: este repositório. Cópia executada pelo Antigravity: a pasta global de plugins acima.
- sync.bat, na raiz deste repositório, copia manifesto, hooks, runtime, scripts, skills e esta documentação para a instalação local. Preserve antes um backup íntegro dos arquivos de destino; o script sobrescreve arquivos e não cria esse backup.
- Depois de copiar apenas HTML/CSS/JS da página, recrie a página conforme o procedimento acima. Copiar arquivos não altera o documento já aberto.
- Mudanças em server.mjs, hooks ou manifestos exigem recarregar os componentes correspondentes. Reiniciar o Antigravity, após terminar atividades em execução, é a alternativa documentada aqui para iniciar novamente o runtime; não encerrar processos indiscriminadamente.
- Se o plugin deixar de aparecer, confira-o em Customizations > Installed, conforme a documentação oficial. Não remover nem substituir config.json para tentar reativá-lo.

### Fontes e limites

- [Plugins do Antigravity](https://antigravity.google/docs/plugins): instalação local/global e gerenciamento em Customizations > Installed.
- [Sidecars do Antigravity](https://antigravity.google/docs/sidecars): descoberta por sidecar.json, pasta global, configuração e ciclo de vida gerenciado pelo aplicativo.
- Fontes locais: sidecars/usage_hud/sidecar.json, sidecars/usage_hud/server.mjs e sync.bat.
- As fontes oficiais não especificam que fechar uma aba sempre destrói seu webview. Por isso o procedimento distingue a recriação da página, confirmada no código do HUD, do comportamento exato da aba. Bali validou o resultado da atualização, sem detalhar o modo de reabertura.

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
        │           └── 4. stdout neutro imediato ({}) — sem bloquear turnos
        │
        └── Sidecar Runtime (sidecars/usage_hud/)
              ├── server.mjs
              │     ├── GET /api/stats (métricas + contexto do Language Server)
              │     ├── GET /api/activity (estado do mascote + subagentes reais)
              │     ├── POST /api/event (ingestão localhost dos hooks)
              │     ├── POST /api/subagents/stop (CancelCascadeInvocation no Language Server)
              │     └── StreamAgentStateUpdates (Connect JSON; contextWindowUsage) + mcp_config.json
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
  - `/api/event` e `/api/subagents/stop` aceitam conexões apenas de `127.0.0.1` / `localhost`.
  - A parada valida que o `agentId` é filho da conversa informada antes de chamar o Language Server.

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

## 4. Subagentes: Descoberta, Nome e Parada

### Descoberta
Os subagentes vêm do `conversation_summaries.db`: `parent_conversation_id` dá a árvore, `agent_name` dá o tipo, `not_fully_idle` diz se o filho ainda está vivo (inclusive esperando um timer em segundo plano), e `last_modified_time` ordena a lista. A aba Overview do app mostra só os ativos; o HUD faz o mesmo e mantém um filho recém-terminado por dois minutos.

O nome exibido é o `Role` do `invoke_subagent` no transcript do pai — o mesmo "Timer Waiter" da aba Overview. O `title` do filho vem vazio; o fallback é o título, depois o `agent_name`.

### Capacidade de Cancelamento (Parada)
O CLI `agentapi --help` expõe só `get-conversation-metadata`, `new-conversation` e `send-message`, mas o Language Server tem RPC próprio:

- `CancelCascadeInvocation` com `cascade_id`, `kill_background_tasks` e `notify_parent`. É o caminho do botão **Stop Subagent** da aba Overview: encerra a invocação, mata tarefas em segundo plano e envia ao pai a mensagem `Subagent "..." has been explicitly canceled by the user...`.
- O corpo desse método é **protobuf binário** (`Content-Type: application/proto`); JSON cai no parser de texto e retorna `invalid value`.
- Fallback: `ForceStopCascadeTree` com `conversation_id`, que responde `stoppedConversationIds`.

O painel envia `POST /api/subagents/stop` com a conversa pai e o id do filho. O teste de 2026-11-14 disparou um subagente com timer de 5 minutos, parou pelo endpoint e confirmou `CASCADE_RUN_STATUS_IDLE`, `not_fully_idle=0` e o timer não acordou depois.

---

## 4.1 Contexto detalhado e ferramentas MCP

### Fonte do contexto
- `StreamAgentStateUpdates` (Connect JSON, `application/connect+json`, frame de 5 bytes) com `conversation_id`, `disable_rehydration` e page bounds zerados.
- O primeiro frame traz `AgentStateUpdate.contextWindowUsage`: `estimatedTokensUsed`, `maxContextTokens` e `tokenGroups`.
- Teste de 2026-11-14, Gemini 4 Hydrogen: **141.110 / 256.000 (55%)**; grupos `System Prompt` 34.084, `Tools` 6.940 e `Chat Messages` 100.086. O limite é o efetivo do app, não a janela teórica do provedor (1M).
- O sidecar lê só o primeiro frame, fecha a conexão e guarda o resultado por 4 s. Sem o Language Server, o painel usa o transcript (`input + cache`) e não exibe percentual.

### Grupos e cores
- `Chat Messages` → Mensagens (azul), `Tools` → Ferramentas (laranja), `System Prompt` → Prompt de sistema (verde), livre no track neutro.
- Se o host enviar outros tipos (`memory`, `skills`, `MCP`), o painel mapeia por `TokenType`/nome; não inventa categoria que o host não mandou.

### Ferramentas MCP
- `mcp_config.json` define os servidores; `~/.gemini/antigravity/mcp/<server>/*.json` guarda os schemas por ferramenta.
- O painel lê apenas nomes e tamanhos; nunca `command`/`env` (que podem conter token).
- O total de `Tools` é exato; o tamanho do schema de cada ferramenta aparece em KB. O host não informa tokens por ferramenta.
- A lista é “configuradas no app”, não “conectadas nesta sessão”: o estado leve não traz o conjunto montado na sessão.

### Auto-open
- `SidecarUIConfig` tem só `display_name` e `views`; não há campo `auto_open`. O app abre o Overview nativo por padrão; o HUD é uma view de plugin e abre pela linha **Extensions** ou pela aba do painel lateral.
- O esquema `sidecar://<id>/<path>` abre a view, mas exige clique.

## 5. Resiliência e Concorrência

- **Zero Bloqueio:** Os hooks respondem `{}` imediatamente no stdout para `PreToolUse` e `Stop`. Se o servidor sidecar estiver inacessível ou o timeout de 250ms expirar, o coletor silencia e permite a continuidade da sessão do Antigravity sem interrupção.
- **Gravação Atômica:** Estados de atividade são gravados com sufixo `.tmp.<pid>` e renomeados atomicamente, prevenindo corrupção em chamadas concorrentes de múltiplos hooks.
- **Assets Embutidos:** A fonte Google Sans Flex está embutida diretamente no `ui.html` como data URI WOFF2, eliminando qualquer dependência de CDNs ou acesso externo.


## Correção visual do runtime — 2026-11-01

- O preload do SDK Antigravity aplica cores e fonte diretamente ao body e injeta variáveis de tema no elemento raiz. As variáveis genéricas do HUD colidiam com as do host, deixando textos sem contraste. O HUD agora usa tokens próprios com prefixo --hud- e define cores e fonte no contêiner .dashboard.
- A atualização dos subagentes selecionava o primeiro span da linha, que era o avatar. O texto da tarefa substituía o mascote e vazava para fora da linha. Os seletores agora apontam para .agent-copy; textos longos quebram dentro da coluna e a barra de controles pode ocupar mais de uma linha.
- O SDK continua responsável pela ponte com o host. O listener duplicado de tema foi removido do HUD. O seletor claro/escuro e a pausa de animações continuam disponíveis.
- Os valores acessíveis dos indicadores de consumo e contexto acompanham os valores exibidos. Retorno de chamada de subagente não é apresentado como prova de sucesso.
- Teste de regressão: test/ui.test.cjs usa o preload real instalado, injeta cores do host e simula telemetria, sem acessar conversas reais. Confere avatar/tarefa, contraste mínimo de 4,5:1, ausência de sobreposição e rolagem horizontal, 0/1/6 subagentes, recolher/expandir, ausência de controles de parada/cópia e movimento reduzido. São cinco larguras (320, 390, 472, 680 e 1024 px), nos dois temas. A suíte de integração existente também passou.
- Prévia fiel com dados de demonstração: propostas/nativo-2026-11-15/index.html. Capturas ficam na mesma pasta.
- Limites: browser headless com o preload real; a janela aberta do Antigravity não foi controlada. A precisão das cotas e dos estados vindos do servidor não foi validada com uma sessão real nesta correção. O cancelamento direto de subagentes permanece não suportado.
- Instalação: atualizar somente sidecars/usage_hud/ui.html na cópia local do plugin, preservando o original e comparando o hash. O servidor lê esse arquivo a cada requisição; recriar a página do HUD carrega a correção. O procedimento e o limite do teste na janela real estão na seção Como carregar a atualização no Antigravity.

Aplicação local conferida em 2026-11-01: %USERPROFILE%\.gemini\config\plugins\usage-hud\sidecars\usage_hud\ui.html. O servidor ativo entregou exatamente o HTML instalado, conferido por SHA256. Os originais foram preservados em backup local, fora do repositório. Bali confirmou o funcionamento da atualização em 2026-11-01 e encerrou a correção visual.


### Cards iguais e subagentes somente para acompanhamento — 2026-11-01

- O card Contexto usa exatamente o mesmo token do card Janela de 5 horas (--hud-surface-low), nos dois temas.
- Bali dispensou as alternativas de parada pelo painel. Foram retirados os botões individuais, o botão geral, a cópia do pedido, o campo de cópia manual, os avisos e seus handlers. Ocultar/Mostrar preserva a atividade dos subagentes.
- A regressão visual confere os fundos iguais, avatar/tarefa, ausência desses controles e nenhuma chamada ao endpoint legado de parada.

> **Atualização 2026-11-14:** a parada voltou como botão por subagente, via `CancelCascadeInvocation` (V8). O registro acima descreve a versão de 2026-11-01.


## Encerramento confirmado por Bali — 2026-11-01

- A correção visual foi validada por Bali e encerrada a pedido dele. Não retomar o HUD como defeito pendente sem novo relato.
- Mantidos os cards com o mesmo fundo e a lista de subagentes somente para acompanhamento, com Ocultar/Mostrar.
- A confirmação do usuário valida o resultado observado; não equivale a um teste exaustivo da precisão de cotas, descoberta de subagentes ou todos os estados possíveis.
- Publicação autorizada em 2026-11-01: repositório público ba-lison/agy-usage-hud, licença MIT para o código próprio, preservação dos commits existentes e releases. Os 20 commits anteriores à preparação da publicação começam em 30/10/2026; suas datas e mensagens permanecem intactas.


## Distribuição pública

- Runtime: Antigravity App, Windows e Node.js 22+ no PATH. Teste local: Node.js 22.21.1. Não há dependências npm de runtime; o SDK vem da instalação do host.
- Desenvolvimento: o teste visual requer Playwright e Chrome. O teste de integração usa somente Node.js.
- sync.bat usa USERPROFILE em vez de um nome de usuário fixo e também copia a licença MIT, os avisos de terceiros e as licenças das fontes.
- A release v1.0.0 acompanha a versão 1.0.0 de plugin.json. O pacote de runtime exclui .git, .worktrees, propostas, capturas de desenvolvimento e testes.
- O histórico Git contém a evolução original. Não foram inventadas datas ou versões históricas nem reescritos os commits de criação.

Sparky é o nome confirmado por Bali para o mascote em 2026-11-01. A capa usa a mesma estrelinha com olhos do runtime, em assets/sparky.svg; o nome também identifica o mascote para tecnologias assistivas no painel.
