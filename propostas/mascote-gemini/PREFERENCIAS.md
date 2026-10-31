# Mascote Gemini — direção vigente

Confirmado por Bali em 2026-10-30:

- **Seguir com a versão retrô “32 bits”, com olhos de bloco.** A escolha substitui a preferência anterior pela V2; preservar [v2.html](v2.html) como referência da rodada anterior.
- Usar o Gemini colorido, sem boca e sem brilho nos olhos. Retirar os seletores de versão e de olhos da proposta atual.
- As atividades devem acompanhar sinais da sessão. Pesquisa na web precisa ter uma reação própria; expressões avulsas não bastam.
- Pesquisa na web usa uma lupa simples: círculo e cabo. Dar mais informação sobre a ação, como termo da busca, domínio da fonte e nome do arquivo.
- Dar mais movimento ao mascote, incluindo flutuação e variação suave das cores dentro da estrela. Manter pausa e movimento reduzido.
- Remover do painel a seção Tokens inteira: distribuição, entrada, cache, saída e acumulado em 5 horas. Pedido confirmado em 2026-10-30; aplicado somente na prévia V5.
- No painel, manter o símbolo original do Antigravity e escrever somente **Antigravity**. Remover a linha do modelo e seu nível de esforço, deixando o mascote como apresentação da atividade.

[v5.html](v5.html) aplica a direção vigente sem a seção Tokens. A V4 permanece intacta em [v4.html](v4.html); as preferências anteriores estão em [PREFERENCIAS-v4.md](PREFERENCIAS-v4.md). A proposta ainda aguarda aprovação final. A interpretação visual de “32 bits” usa pixel art em uma grade de 32 × 32, derivada do símbolo colorido; a medida descreve a grade, não a profundidade de cor do arquivo. As cores variam em oito quadros com a mesma silhueta. Prévia atual do painel em `painel-v5.png`; o movimento foi preservado e sua captura anterior permanece em `movimento-v4.gif`. A comparação anterior permanece em [v3.html](v3.html).

O protótipo recebe eventos de exemplo no formato dos [hooks oficiais do Antigravity](https://antigravity.google/docs/hooks). `activity-model.js` define o mapeamento; o HTML incorpora o mesmo código para funcionar offline. `PreToolUse` indica uma chamada solicitada, que ainda pode depender de aprovação; `PostToolUse` indica seu retorno. A proposta não confirma processos em segundo plano nem sucesso geral da tarefa.

O `hooks.json` atual só usa SessionStart e eventos do modelo; o servidor atual expõe consumo, sem atividade de ferramenta. Nenhum desses arquivos foi alterado. Captura e transporte dos eventos reais ainda precisam ser implementados e testados na sessão correta. O protótipo não lê conversas reais.
