# Integração AGY UsageHUD — Interface V7 e Sessão Real

Documento técnico de referência sobre a integração da interface V7 com os eventos reais do Antigravity.

---


<a id="carregar-atualizacao"></a>

## Como carregar a atualização no Antigravity

Conferido em 2026-11-01. O plugin está instalado em:
%USERPROFILE%\.gemini\config\plugins\usage-hud

### Para Bali carregar esta correção

1. Os arquivos corrigidos já foram copiados para a instalação local. Não é preciso reinstalar o plugin.
2. Feche a aba AGY - UsageHUD e abra o painel novamente no Antigravity. O objetivo é recriar a página, que receberá o HTML novo do servidor.
3. Confira a versão visual: subagentes têm somente Ocultar/Mostrar, sem botões de parar ou copiar; os cards Janela de 5 horas e Contexto têm o mesmo fundo.
4. Se a aba ainda mostrar os controles antigos, o aplicativo pode ter mantido a página em memória. Quando não houver trabalho em execução, feche e abra o Antigravity e reabra o painel.

O botão circular do HUD é **Atualizar dados**: consulta métricas e atividade; não recarrega o HTML nem instala atualizações.

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
- **Interface atual:** a lista serve somente para acompanhar a atividade, com Ocultar/Mostrar. Por instrução de Bali em 2026-11-01, foram removidos todos os controles de parar, copiar pedido e "Parar pelo chat". O endpoint legado continua respondendo unsupported, mas não é chamado pela interface.

---

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
- Prévia fiel com dados de demonstração: propostas/correcao-runtime-2026-11-01/index.html. Capturas e verificacao.json ficam na mesma pasta.
- Limites: browser headless com o preload real; a janela aberta do Antigravity não foi controlada. A precisão das cotas e dos estados vindos do servidor não foi validada com uma sessão real nesta correção. O cancelamento direto de subagentes permanece não suportado.
- Instalação: atualizar somente sidecars/usage_hud/ui.html na cópia local do plugin, preservando o original e comparando o hash. O servidor lê esse arquivo a cada requisição; recriar a página do HUD carrega a correção. O procedimento e o limite do teste na janela real estão na seção Como carregar a atualização no Antigravity.

Aplicação local conferida em 2026-11-01: %USERPROFILE%\.gemini\config\plugins\usage-hud\sidecars\usage_hud\ui.html. O servidor ativo entregou exatamente o HTML instalado, conferido por SHA256. Os originais foram preservados em backup local, fora do repositório. Bali confirmou o funcionamento da atualização em 2026-11-01 e encerrou a correção visual.


### Cards iguais e subagentes somente para acompanhamento — 2026-11-01

- O card Contexto usa exatamente o mesmo token do card Janela de 5 horas (--hud-surface-low), nos dois temas.
- Bali dispensou as alternativas de parada pelo painel. Foram retirados os botões individuais, o botão geral, a cópia do pedido, o campo de cópia manual, os avisos e seus handlers. Ocultar/Mostrar preserva a atividade dos subagentes.
- A regressão visual confere os fundos iguais, avatar/tarefa, ausência desses controles e nenhuma chamada ao endpoint legado de parada.


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
