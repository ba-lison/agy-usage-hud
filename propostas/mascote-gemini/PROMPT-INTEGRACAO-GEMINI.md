# Implementar a interface V7 e conectar o AGY UsageHUD à sessão real

Quero implementar a nova interface do meu AGY UsageHUD e conectar o mascote, as atividades e os subagentes aos eventos reais do Antigravity. A direção visual está fechada na V7. Agora o trabalho é transformar a proposta em um HUD funcional, testar e atualizar a instalação local deste plugin.

Trabalhe neste repositório:

```text
E:\Users\aliso\Documents\.Bali_Brain\alison_cruz.os\projetos\Mods-Plugins\Antigravity\agy-usage-hud
```

Leia este prompt inteiro antes de agir. Implemente a solução e confira o funcionamento; não encerre apenas com um plano. Não invente APIs nem substitua a integração real por uma demonstração. Se alguma capacidade não estiver acessível na versão instalada, conclua o que for possível, descreva o impedimento preciso e deixe a função indisponível de forma honesta.

## 1. Escopo, preservação e referências

Leia as instruções aplicáveis do workspace, da área pessoal e deste projeto. Preserve o isolamento: não consulte outros projetos nem varra conversas alheias para descobrir uma sessão. Confirme o estado atual do Git antes de alterar arquivos; este levantamento é de 30/10/2026 e precisa ser reconferido.

Use branch `codex/` e worktree própria em `<repositório>/.worktrees/<tarefa>/`, conforme as regras do workspace. Não inclua alterações preexistentes. Antes de substituir arquivos, apresente os alvos e o diff e preserve cópia íntegra ou versão recuperável no Git. Faça as alterações autorizadas sem pedir a mesma confirmação novamente. Integre e confira em sequência. Não publique nada no GitHub.

Referências dentro do repositório, nesta ordem:

1. `propostas/mascote-gemini/PREFERENCIAS.md`: escolhas vigentes.
2. `propostas/mascote-gemini/v7.html`: interface de referência. O painel está no `HUD_TEMPLATE`, renderizado no iframe `#hud-frame`; os controles e a página externa são a bancada de demonstração.
3. `propostas/mascote-gemini/painel-v7.png`: aparência do painel com seis subagentes.
4. `propostas/mascote-gemini/expressoes-v6.png` e `movimento-v6.gif`: expressões e movimento que a V7 preserva.
5. `propostas/mascote-gemini/activity-model.js`, `verify-v7.cjs` e `verification-v7.json`: reducer e verificações da proposta, úteis como referência, ainda sem integração real.
6. `plugin.json`, `hooks.json`, `sidecars/usage_hud/sidecar.json`, `sidecars/usage_hud/server.mjs`, `sidecars/usage_hud/ui.html`, `scripts/update-hud.mjs` e `sync.bat`: implementação existente.
7. `scripts/copy-handoff.mjs` e `skills/handoff/SKILL.md`, somente para verificar compatibilidade se suas mudanças afetarem esse fluxo. Não gere handoff nem altere o clipboard durante os testes desta integração.

Preserve as propostas V2 a V7 e suas evidências. A interface de produção deve aproveitar os componentes da V7; não copie toda a página de demonstração para `ui.html` nem mantenha seus eventos fictícios no caminho de produção.

## 2. Visual que precisa permanecer

- Gemini colorido em pixel art, grade 32 × 32, estética retrô “32 bits”. Preserve o sprite e a silhueta, sem redesenhar a estrela.
- Olhos de bloco, expressivos, sem brilho e sem boca. Manter olhares e proporções próprios por atividade.
- Flutuação suave e variação das cores dentro da estrela. Manter pausa e respeitar `prefers-reduced-motion`, inclusive nos mascotes dos subagentes.
- Pesquisa na web com globo mundial, sem lupa. Leitura com óculos. Pensamento com balão e olhos semicerrados. Coordenação com pequenos Gemini.
- Informar a atividade e um detalhe útil: termo de busca, domínio ou nome de arquivo. Manter a interface em português.
- Preservar Google Sans Flex, temas claro/escuro, tipografia, espaçamentos e estética do painel V7. A fonte e os assets devem carregar no webview real, sem depender de recursos que só existem na página de proposta.
- Manter janela de 5 horas e contexto, agora com os dados reais disponíveis. A remoção da seção Tokens não remove o indicador de capacidade de contexto.
- Não trazer de volta o nome/símbolo do Antigravity no cabeçalho, a linha modelo/esforço, a seção Tokens, o rodapé “Antigravity HUD”, o relógio decorativo de prévia ou a legenda “Fonte e componentes do HUD existente”.
- A galeria, os seletores 1–6, o botão “Reproduzir exemplos”, créditos e textos da bancada ficam fora da interface oficial. No HUD real, os subagentes aparecem quando existirem; não são criados só para preencher a tela.
- Se tema ou pausa precisarem de controles no painel real, mantenha-os discretos e acessíveis, sem recriar o cabeçalho de marca removido. Compare o resultado com a V7.

## 3. Primeiro valide o ambiente e o contrato disponível

Identifique em qual produto esta instalação está rodando: App, IDE ou CLI. Descubra a versão instalada, o sidecar carregado, o SDK/bridge disponível e a origem da sessão que o painel deve acompanhar. Não misture os contratos do aplicativo com os do SDK Python ou de outro produto de nome parecido.

Consulte as fontes oficiais e reconfira os detalhes na versão instalada:

- [Hooks do Antigravity](https://antigravity.google/docs/hooks).
- [Subagentes do Antigravity](https://antigravity.google/docs/subagents).
- [Sidecars do Antigravity](https://antigravity.google/docs/sidecars).

A documentação consultada em 30/10/2026 lista os seis eventos `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` e `Stop`. O evento `Stop` inclui `fullyIdle` e informações de término. Ela também lista a ferramenta `manage_subagents` com ações `list`, `kill` e `kill_all`, e IDs em `ConversationIds`. Esses nomes não provam que o JavaScript do painel possa chamar essa ferramenta. [Fonte: hooks](https://antigravity.google/docs/hooks).

Os subagentes têm ciclo próprio: podem estar em execução, ociosos ou encerrados e um agente ocioso pode voltar a executar. Não confunda esses estados com aprovação do resultado pelo usuário. [Fonte: subagentes](https://antigravity.google/docs/subagents).

O sidecar pode ter mecanismos próprios de comunicação. A página de sidecars descreve `agentapi`, mas não estabelece, por si só, uma API direta de cancelamento para este painel. Confira o que realmente está instalado antes de escolher o caminho de controle. [Fonte: sidecars](https://antigravity.google/docs/sidecars).

Registre brevemente, com evidências, como o ambiente permite: receber eventos, identificar a sessão, associar filhos ao pai, acompanhar seus estados e solicitar uma parada. Se algum desses pontos não tiver fonte confiável, trate-o como uma lacuna específica.

Não conte com um resultado completo da ferramenta dentro de `PostToolUse`, nem com IDs dos filhos nesse payload, sem confirmar que existem no ambiente. A confirmação da criação pode precisar de outra fonte. Não invente campos para completar a ligação.

## 4. Pontos da implementação atual que exigem atenção

Reconfira no código antes de mudar:

- `hooks.json` atualmente chama `scripts/update-hud.mjs` em três eventos; ainda não existe coletor de atividade real.
- `server.mjs` serve `/api/stats` e arquivos do HUD, mas não oferece a integração de atividade/subagentes da proposta.
- `getLatestConversation` pode selecionar o transcript pelo horário de modificação e até cair nesse fallback quando um ID solicitado não é encontrado. Isso não serve para vincular o mascote à conversa certa.
- `ui.html` consulta portas alternativas e atualiza seletores de modelo, esforço, tokens e rodapé. Esses nós desapareceram da V7: portar só o HTML vai quebrar a atualização.
- O servidor tem um caminho legado que injeta markup/código em `context.tokens` para certos clientes. Na nova interface, dados devem ser tipados e renderizados explicitamente; não use esse caminho de injeção.
- A rota `/preload.js` pode devolver apenas um stub quando o SDK não é encontrado. Carregar essa URL sem erro não comprova que a ponte com o host está funcionando.
- Há leitura agregada de transcripts, valores padrão de contexto e estimativas de cota. Não apresente ausência de telemetria como cota cheia, atividade real ou limite confirmado. Não amplie a leitura para conversas de outros projetos.
- `sync.bat` usa `robocopy /MIR` para a instalação local e exclui apenas `.git`. Isso pode espelhar propostas/worktrees e excluir arquivos existentes no destino. Não rode esse script sem corrigir o escopo da implantação.

Conserte o que for necessário para a integração funcionar de ponta a ponta, preservando o fluxo de métricas e handoff. Evite refatoração ampla sem relação com a tarefa.

## 5. Coleta e transporte dos eventos

Implemente um caminho completo: evento real → coletor → estado por sessão → servidor → painel. Escolha o mecanismo mais simples que funcione no ambiente; não crie banco, framework ou serviço remoto sem necessidade.

Requisitos do coletor:

- Cadastre os eventos usando o schema oficial, incluindo a estrutura de matchers de ferramentas. Preserve os handlers já existentes que ainda forem necessários.
- Não presuma que o payload traz o nome do evento. Se necessário, passe-o explicitamente no comando registrado para cada hook e valide-o no coletor.
- Leia o JSON do stdin com limites e tratamento de entrada inválida. Mantenha stdout reservado ao contrato de resposta do hook e diagnósticos em stderr, sem segredos.
- O coletor é de telemetria. Não autoaprove comandos, altere argumentos, injete instruções nem force continuação de turno para manter o mascote funcionando. Para `PreToolUse`, use a decisão neutra compatível com a política normal; o hook de `Stop` não deve impedir a parada. Reconfira as respostas exigidas na documentação.
- O HUD não pode travar a sessão se o servidor estiver indisponível. Use timeout curto e comportamento neutro, testado no host, inclusive quando uma gravação ou envio falhar.
- Hooks podem executar concorrentemente em processos distintos. Evite perda de atualização e sobrescrita de estado; trate escrita concorrente, leitura parcial e interrupção durante a gravação. Se houver arquivos de eventos, mantenha-os no runtime apropriado, com retenção limitada.
- Não registre o payload integral por padrão. Extraia apenas os metadados e o resumo necessários. Não guarde conteúdo de arquivos, respostas completas, raciocínio privado, prompts completos, senhas ou tokens de autenticação.

Requisitos do transporte e vínculo:

- Todo estado deve pertencer a uma sessão identificada. Não troque de conversa porque outra escreveu no disco mais recentemente.
- Descubra o ID por um mecanismo real do host/bridge. Valide-o no servidor. ID desconhecido deve resultar em estado indisponível, sem fallback silencioso para outra conversa.
- Não presuma campos de parentesco ausentes nos hooks. Construa a relação pai/filho a partir de IDs e vínculos comprovados por uma fonte válida.
- Consumo de cota e atividades podem ter fontes diferentes. Mantenha o vínculo de cada uma explícito; a atividade sempre precisa da sessão correta.
- Para atualizações, polling ou eventos são aceitáveis; evite requisições sobrepostas, leitura completa repetida de logs grandes e recriação do DOM em toda atualização.
- Se usar arquivos como fila/estado, resolva concorrência de verdade. Se usar HTTP, descubra a porta do sidecar corretamente em vez de acertar uma porta de outra instância por tentativa.
- Ao reiniciar o servidor ou reabrir o painel, recupere o estado disponível. Eventos repetidos não podem duplicar chamadas, agentes ou cancelamentos.
- Mostre desconexão, dado antigo e estado desconhecido quando apropriado. Um timeout não prova sucesso, falha ou parada de um agente.

## 6. Estados e atividades do mascote

Use `activity-model.js` como referência, não como contrato de produção pronto. Ele foi escrito para a proposta e precisa ser adaptado ao ciclo real, inclusive a trabalhos assíncronos e aos dados adicionais de `Stop`.

Mapeamento inicial da proposta, a validar com as ferramentas reais da sessão:

| Atividade | Ferramentas ou sinal de referência | Visual |
| --- | --- | --- |
| Pesquisa web | `search_web` | Olhar atento e globo |
| Leitura de página | `read_url_content` | Olhar de leitura, domínio da fonte |
| Leitura de arquivo | `view_file` | Óculos e nome do arquivo |
| Busca no projeto | `list_dir`, `find_by_name`, `grep_search` | Olhar de procura e termo/nome |
| Edição | `write_to_file`, `replace_file_content`, `multi_replace_file_content` | Concentração e arquivo |
| Terminal | `run_command`, operações reais de tarefas | Expressão de terminal e comando resumido |
| Subagentes | Invocação e estado comprovado dos filhos | Pequenos Gemini e lista de atividades |
| Pergunta/permissão | `ask_question`, `ask_permission` | Expressão interrogativa |
| Preparação de resposta | Chamada ao modelo, sem ferramenta de maior prioridade ativa | Balão e olhos semicerrados |

Regras de estado:

- Correlacione início/retorno pela identidade da sessão e chamada. Não use somente o nome da ferramenta nem a ordem de chegada.
- Aceite duplicação e reordenação. Retorno antes do início não pode ressuscitar uma chamada; falha de uma chamada não deve contaminar indefinidamente as seguintes.
- Com várias chamadas, mantenha o conjunto ativo e uma prioridade visual coerente. O retorno de uma delas não pode apagar outra ainda ativa.
- Um início de chamada pode estar aguardando permissão. Não afirme que o processo começou ou que o usuário precisa responder sem evidência do estado correspondente.
- Retorno da ferramenta não significa conclusão bem-sucedida da tarefa. Para comando assíncrono, a devolução de um identificador não significa que o processo terminou.
- Um turno encerrado não confirma a conclusão do trabalho. Respeite sinais de atividade em segundo plano; não aplique ao vivo a limpeza simplificada do reducer de demonstração.
- Sem confirmação do estado de fundo, use uma indicação de incerteza. Não mantenha uma animação de trabalho indefinidamente por falta de dados.
- Não acesse nem reproduza raciocínio privado para alimentar “Pensando”; use apenas o estado operacional da chamada ao modelo.
- Faça a passagem de estado sem reiniciar todas as animações a cada atualização. Preserve a mesma geometria e os movimentos escolhidos.
- Exiba texto dinâmico como texto. Reduza URLs ao domínio e caminhos ao nome de arquivo ou caminho relativo útil, com tamanho limitado. Remova credenciais/query strings sensíveis. Não interprete argumentos de ferramentas como HTML ou comandos do painel.

## 7. Subagentes reais e seus controles

Esta é a parte mais importante depois da interface.

- Troque o array `agentExamples` e os estados locais da demonstração por registros reais. Nomes, IDs, tarefas e contagem precisam vir da sessão, sem criar agentes fictícios.
- Uma invocação pode pedir vários filhos. Diferencie “solicitado” de “criado”; só confirme criação e identidade com evidência. Não associe filhos por posição no array ou semelhança de nome.
- Mostre apenas filhos da conversa acompanhada. Se houver descendentes, defina e apresente o escopo sem duplicar agentes nem absorver outros pais.
- Dê a cada filho seu ID real, estado, atividade resumida e instante de última observação. O nome visível pode ser amigável, mas o controle deve usar o ID validado.
- A atividade do filho deve refletir os eventos dele. Não copie a atividade do pai para todos, nem deixe para sempre a atividade inicial da invocação.
- Um agente ocioso não está necessariamente encerrado e pode voltar a trabalhar. Uma resposta enviada ao pai não equivale à aprovação do resultado.
- A referência mostra até seis agentes. Valide 1–6; não imponha um limite de execução de seis ao Antigravity. Se houver mais, use lista com rolagem ou expansão mantendo todos acessíveis.
- “Ocultar” recolhe a lista sem interromper agentes e sem perder seus estados. O resumo e o controle de parada continuam disponíveis. “Mostrar” restaura a lista atualizada.
- Ao parar um agente, envie uma solicitação real ao mecanismo comprovado, dirigida somente ao ID daquele filho. Não basta mudar o texto ou limpar o array no navegador.
- Mostre a solicitação pendente enquanto aguarda a confirmação. Só indique “Interrompido” depois da confirmação real; erro, permissão negada, timeout ou capacidade ausente precisam ser visíveis.
- “Parar todos” se limita aos agentes desta conversa. Congele os IDs-alvo da ação e preserve os resultados individuais; não use uma operação global se ela puder afetar outras conversas.
- Se surgir outro filho durante uma solicitação de parada em lote, não o cancele por acidente. Atualize a contagem e deixe seu estado visível.
- Não mate o processo do sidecar ou processos arbitrários do sistema operacional para simular cancelamento de subagente.
- Evite clique duplo e execução duplicada. Retente apenas de forma idempotente. Se o filho já tiver parado, trate como estado reconciliado, sem erro falso.
- Preserve foco de teclado, nomes acessíveis e estados desabilitados corretos. Desabilite apenas ações realmente indisponíveis.

Valide a ponte de controle antes de conectá-la aos botões. Uma ferramenta disponível para o agente não é automaticamente uma função disponível para o sidecar. Se for necessário encaminhar uma solicitação ao agente principal, implemente e documente esse fluxo, respeite as permissões e aguarde a execução e a confirmação; o mero envio de mensagem não comprova parada.

Se a instalação não oferecer um caminho verificável para cancelar, entregue observação real e deixe a parada indisponível com motivo curto. Identifique exatamente o que falta. Não declare a integração completa enquanto esse requisito permanecer pendente.

## 8. API local e compatibilidade

Ao acrescentar comandos de parada ao servidor, trate isso como controle de execução, não apenas leitura de métricas:

- Use métodos de escrita para ações; nenhuma parada por GET.
- Faça autenticação e validação de origem/host compatíveis com o webview e a instalação. Não herde `Access-Control-Allow-Origin: *` para comandos de execução. Proteja requisições contra acionamento por páginas externas.
- Valide no servidor o vínculo entre sessão, pai e IDs-alvo. Não aceite um ID arbitrário do cliente como autorização para encerrar outra conversa.
- Não execute strings de shell ou nomes de ferramentas fornecidos pelo navegador. Use argumentos estruturados e uma operação limitada ao controle autorizado.
- Não exponha tokens de autenticação em respostas, query strings, screenshots, logs ou commits. Trate o endpoint que recebe hooks separadamente de uma chamada de navegador se necessário.
- Retorne ao cliente dados com tipos consistentes. Métricas continuam numéricas; estados e capacidades devem ser explícitos. Se criar endpoints internos, documente-os como endpoints deste plugin, não como APIs oficiais do Antigravity.
- Remova os acessos a elementos excluídos da tela. Não resolva isso recolocando componentes rejeitados ou escondendo todas as exceções.
- Preserve o que ainda funciona no consumo e no handoff. Corrija valores fictícios, sessão errada e dependências incompatíveis que afetem este trabalho. Ausência de dado é desconhecido, não zero confirmado.
- Use a fonte mais confiável disponível para a cota. Diferencie medição, estimativa e dado antigo de forma discreta; não apresente estimativa como cota oficial.
- Mantenha limites internos de contexto coerentes com o modelo real quando houver fonte verificável, mesmo sem exibir nome/esforço na tela. Não invente uma janela universal a partir do exemplo de 1M da proposta.

## 9. Testes e evidências de aceite

Os testes da V7 validam a proposta; não provam esta integração. Reaproveite os casos úteis e acrescente testes do caminho real. Faça testes que possam detectar falhas, incluindo condições negativas.

Valide, no mínimo:

1. Parser de hooks e respostas de stdout para os seis eventos; JSON inválido, ausência de campos, servidor desligado, timeout e escrita concorrente. O host continua funcionando quando a telemetria falha.
2. Eventos de ferramentas reais para web, página, arquivo, busca, edição, terminal, pergunta e chamada ao modelo. Verifique tanto a atividade quanto o termo/domínio/arquivo mostrado.
3. Chamadas simultâneas, duplicadas e reordenadas; retorno anterior ao início; falha explícita; início sujeito a permissão; comando assíncrono.
4. Término de turno com e sem tarefas de fundo, sem concluir automaticamente o trabalho. Reinício e reativação da sessão não devem duplicar estado.
5. Vínculo correto com a conversa aberta: outra conversa mais recente não pode tomar o painel. ID inexistente não pode cair numa sessão diferente. Use fixtures isoladas quando não puder testar isso no host.
6. Subagentes reais em grupos de 1, 2, 3, 4, 5 e 6, com tarefas curtas e inofensivas em área temporária deste projeto. Este prompt autoriza esses subagentes de teste; siga a política de agentes antes de escolher modelos e não os use para acessar outros contextos.
7. Identidade e atividade de cada filho, ociosidade, retorno à execução e encerramento real. A lista precisa representar o que ocorreu, não o que o pai pretendia iniciar.
8. Ocultar/mostrar enquanto há atividade e enquanto chega atualização. A lista recolhida não cancela agentes.
9. Parar um filho e confirmar sua parada preservando os demais. Parar todos os filhos-alvo preservando o pai e qualquer agente fora do escopo. Teste agente já encerrado, clique repetido, falha parcial, acesso negado e timeout.
10. Ações de escrita sem autenticação, origem não permitida e IDs de outra sessão devem ser recusadas; nenhum dado recebido pode virar HTML executável ou comando arbitrário.
11. Reabrir painel, reiniciar sidecar, perder/restabelecer conexão e ler um registro parcial. A contagem não pode ficar falsa nem uma atividade parecer atual sem novas observações.
12. Capturas no webview real: tema claro/escuro, largura estreita e larga, seis filhos, lista recolhida e atividade individual. Confira Google Sans Flex, teclado, pausa/movimento reduzido, ausência dos elementos removidos e ausência de erros de JavaScript.
13. Cota, contagem regressiva e contexto continuam atualizando com dados válidos. Sem telemetria, a interface não mostra valores de exemplo como dados reais.
14. Verifique que o build exibido é o instalado: processo, caminho, identidade da sessão e atualização de um evento real. Não aceite um screenshot do HTML estático como prova de integração.

Não crie agentes em loop nem testes destrutivos. Encerre somente os agentes/processos de teste que você criou e preserve arquivos/históricos conforme as regras do workspace. Se um teste real depender de uma ação manual minha, prepare o cenário exato, diga o que preciso fazer e deixe esse item como não verificado.

## 10. Instalação local, conferência e recuperação

Depois de implementar e testar no repositório, atualize somente esta instalação local do plugin, se confirmada no ambiente:

```text
C:\Users\aliso\.gemini\config\plugins\usage-hud
```

Este pedido inclui a atualização local dos arquivos deste plugin; não autoriza modificar outros plugins, afrouxar permissões globais nem publicar no GitHub. Se o destino real for diferente, descubra-o e apresente o alvo antes de substituir arquivos; não copie para vários caminhos por tentativa.

Antes da instalação, mostre a lista concreta de arquivos e preserve a versão instalada, incluindo diferenças locais. Não sobrescreva alterações desconhecidas. Implante apenas os arquivos de runtime necessários e os assets usados; exclua `.git`, `.worktrees`, propostas, evidências e temporários. Evite espelhamento destrutivo e preserve arquivos existentes sem relação com a mudança.

Recarregue somente o necessário, com as ferramentas disponíveis, sem interromper meu trabalho nem encerrar todas as sessões. Confira a versão instalada no painel de verdade. Prepare um procedimento de restauração com origem/destino e arquivos exatos; não apague o backup nem reverta alterações de terceiros.

Se a configuração do host precisar de algo além da atualização deste plugin, prepare o diff mínimo e explique o motivo. Não substitua um arquivo global inteiro para habilitar um único recurso. Caso uma autorização adicional seja exigida pelas instruções aplicáveis, deixe esse último passo concreto e revisável.

## 11. Entrega

Entregue implementação, testes e evidências. No repositório, salve um registro de integração com:

- arquivos alterados e como restaurar;
- versão/ambiente testado e origem dos contratos usados;
- caminho dos eventos e mecanismo real de descoberta/controle dos filhos;
- capacidades suportadas e qualquer função indisponível;
- resultados dos testes, separando fixture, teste automatizado e verificação real no host;
- capturas finais e identificação do build instalado.

Faça commit das alterações pertinentes, sem segredos nem dados de conversas. Atualize a continuidade nas fontes aplicáveis e preserve as propostas. A resposta final deve ser curta: o que funciona, onde ficou, o que foi testado e o que ainda não foi verificado.

O trabalho só está completo quando a interface V7 estiver integrada aos dados da sessão correta e os controles declarados como funcionais tiverem confirmação real. Se houver bloqueio de API/capacidade, diga isso com precisão; uma lista animada com exemplos e botões que só mudam estado local não atende ao pedido.
