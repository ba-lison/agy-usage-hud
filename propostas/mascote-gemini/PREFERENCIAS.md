# Mascote Gemini — direção vigente

Confirmado por Bali em 2026-10-30:

- **Seguir com a versão retrô “32 bits”, com olhos de bloco.** A escolha substitui a preferência anterior pela V2; preservar [v2.html](v2.html) como referência da rodada anterior.
- Usar o Gemini colorido, sem boca e sem brilho nos olhos. Retirar os seletores de versão e de olhos da proposta atual.
- As atividades devem acompanhar sinais da sessão. Pesquisa na web precisa ter uma reação própria; expressões avulsas não bastam.
- Pesquisa na web usa um globo mundial simples, substituindo a lupa (pedido de 2026-10-30). Dar mais informação sobre a ação, como termo da busca, domínio da fonte e nome do arquivo.
- Olhos de bloco mais expressivos: olhares e abertura variam pela atividade; leitura com óculos, pensamento com olhos semicerrados e balão. Sem boca e sem brilho nos olhos.
- Subagentes representados por pequenos Gemini, substituindo o símbolo anterior. Simular de 1 a 6, com atividade individual, ocultar/mostrar, parar um e parar todos. Ocultar não interrompe; parar afeta somente a simulação. Retorno e interrupção não confirmam sucesso.
- Dar mais movimento ao mascote, incluindo flutuação e variação suave das cores dentro da estrela. Manter pausa e movimento reduzido.
- Remover do painel a seção Tokens inteira: distribuição, entrada, cache, saída e acumulado em 5 horas. Pedido confirmado em 2026-10-30; aplicado nas prévias a partir da V5, sem mudar o plugin ativo.
- No painel, manter o símbolo original do Antigravity e escrever somente **Antigravity**. Remover a linha do modelo e seu nível de esforço, deixando o mascote como apresentação da atividade.

[v6.html](v6.html) aplica a direção vigente, com olhos expressivos e simulação de subagentes, sem a seção Tokens. A V5 está preservada em [v5.html](v5.html), com suas preferências em [PREFERENCIAS-v5.md](PREFERENCIAS-v5.md). A V4 permanece intacta em [v4.html](v4.html); as preferências anteriores estão em [PREFERENCIAS-v4.md](PREFERENCIAS-v4.md). A proposta ainda aguarda aprovação final. A interpretação visual de “32 bits” usa pixel art em uma grade de 32 × 32, derivada do símbolo colorido; a medida descreve a grade, não a profundidade de cor do arquivo. As cores variam em oito quadros com a mesma silhueta. Prévia atual do painel em `painel-v6.png`, expressões em `expressoes-v6.png` e movimento capturado do HTML em `movimento-v6.gif`. A comparação anterior permanece em [v3.html](v3.html).

O protótipo recebe eventos de exemplo no formato dos [hooks oficiais do Antigravity](https://antigravity.google/docs/hooks). `activity-model.js` define o mapeamento; o HTML incorpora o mesmo código para funcionar offline. `PreToolUse` indica uma chamada solicitada, que ainda pode depender de aprovação; `PostToolUse` indica seu retorno. A proposta não confirma processos em segundo plano nem sucesso geral da tarefa.

O `hooks.json` atual só usa SessionStart e eventos do modelo; o servidor atual expõe consumo, sem atividade de ferramenta. Nenhum desses arquivos foi alterado. Captura e transporte dos eventos reais ainda precisam ser implementados e testados na sessão correta. O protótipo não lê conversas reais.
