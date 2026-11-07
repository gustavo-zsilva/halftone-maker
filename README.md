# Halftone

Site para transformar uma arte em bolinhas coloridas com fundo transparente, no padrão usado para impressão DTF.

A imagem não sai do navegador. Abra `index.html` ou sirva a pasta com qualquer servidor estático.

## Como usar

1. Solte um PNG, JPG ou WebP (ou use o exemplo).
2. Ajuste a largura de impressão, o tamanho das bolinhas e o impacto. Impacto enche os tons escuros e deixa os claros abertos, sem fechar o vão. Preto e branco troca a cor por cinza. Contorno sólido deixa só a borda de fora em tinta contínua, na cor da arte. Ctrl + scroll altera o zoom da prévia.
3. Confira a prévia no xadrez — o xadrez não imprime — e nos fundos claro e escuro.
4. Use o zoom 1:1 para ver a borda real de cada bolinha.
5. Baixe o PNG transparente, o SVG (para o Inkscape) ou o PDF. A base branca em PNG é um arquivo à parte, se a gráfica pedir o branco separado.

## O que o arquivo já respeita

- PNG em RGB, com DPI gravado, no tamanho em centímetros escolhido. O padrão é 300 DPI.
- Cada pixel é tinta sólida ou transparência total. Não há véu semitransparente, porque no DTF qualquer pixel com tinta ganha branco por baixo e isso vira auréola.
- Bolinhas redondas. O piso inicial é 0,5 mm, para o pó adesivo conseguir ancorar.
- Frequência inicial perto de 28 LPI e ângulo de 22,5°.
- A base branca opcional nasce 1 px menor que a cor.
- O SVG sai em milímetros, com a cor e a base branca em camadas do Inkscape. O PDF traz as mesmas formas em vetor.
- O contorno sólido, se estiver ligado, cobre só a silhueta externa. O miolo segue em bolinhas, e os buracos internos não ganham essa borda.

A predefinição **DTF** é o ponto de partida. **Aberto** deixa o efeito mais gráfico. **Fino** ganha detalhe e exige mais da impressora.
