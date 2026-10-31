# Mascote Gemini — direção escolhida

Confirmado por Bali em 2026-10-30:

- **A V2 é a favorita.** Preservar [v2.html](v2.html) como referência visual.
- Usar o Gemini colorido, sem boca, com olhos simples e sem brilho. A escolha final entre Pontos e Blocos permanece aberta.
- As atividades devem acompanhar sinais da sessão. Pesquisa na web precisa ter uma reação própria; expressões avulsas não bastam.
- A antiga opção em pixel foi rejeitada. A nova variante retrô é um experimento separado, solicitado depois da aprovação da V2.

[v3.html](v3.html) compara a V2 com a interpretação visual de “32 bits”: pixel art em uma grade de 32 × 32, derivada do símbolo colorido. Essa medida descreve a grade do sprite, não a profundidade de cor do arquivo.

O protótipo recebe eventos de exemplo no formato dos [hooks oficiais do Antigravity](https://antigravity.google/docs/hooks). `activity-model.js` define o mapeamento; o HTML incorpora o mesmo código para funcionar offline. `PreToolUse` indica uma chamada solicitada, que ainda pode depender de aprovação; `PostToolUse` indica seu retorno. A proposta não confirma processos em segundo plano nem sucesso geral da tarefa.

O `hooks.json` atual só usa SessionStart e eventos do modelo; o servidor atual expõe consumo, sem atividade de ferramenta. Nenhum desses arquivos foi alterado. Captura e transporte dos eventos reais ainda precisam ser implementados e testados na sessão correta. O protótipo não lê conversas reais.
