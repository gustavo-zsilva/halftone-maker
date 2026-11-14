# Halftone

Site para transformar uma arte em bolinhas coloridas com fundo transparente, no padrão usado para impressão DTF.

A imagem não sai do navegador. Abra `index.html` ou sirva a pasta com qualquer servidor estático.

## Como usar

1. Solte um PNG, JPG ou WebP (ou use o exemplo).
2. Escolha o tipo de estampa. Halftone troca a tinta por bolinhas. Furos leves mantêm a arte original e abrem círculos, listras ou grade, com vão de 0,7 mm e 20% de tinta a menos. De longe ela continua lisa. Se um controle descer do piso da prensa, um aviso explica o que pode falhar.
3. Se a camiseta for branca, use Camiseta clara: o branco sai e a tinta fica nos escuros. Se for preta, use Camiseta preta: os tons invertem e o preto sai, para a malha fazer o papel do preto. Em Outra, escolha outra cor. A cor sai do desenho inteiro, não só do fundo.
4. Ajuste a largura de impressão. No halftone, o impacto enche os tons escuros e deixa os claros abertos. Inteligente deixa as cores chapadas inteiras e põe bolinha só onde o tom muda. Preto e branco troca a cor por cinza. Contorno sólido deixa só a borda de fora em tinta contínua. Ctrl + scroll altera o zoom da prévia.
5. Confira a prévia no xadrez — o xadrez não imprime — e nos fundos claro e escuro. Em Selecionar, use o pincel ou a varinha para tirar o halftone de uma área ou devolver as bolinhas. O laranja é só a marca. Aplicar esconde a marca e deixa a arte; a varinha continua no próximo clique. Ctrl+Z desfaz a seleção e Ctrl+Y refaz.
6. Use o zoom 1:1 para ver a borda real de cada bolinha ou furo.
7. Baixe o PNG transparente, o SVG (para o Inkscape) ou o PDF. A base branca em PNG é um arquivo à parte, se a gráfica pedir o branco separado.

## O que o arquivo já respeita

- PNG em RGB, com DPI gravado, no tamanho em centímetros escolhido. O padrão é 300 DPI.
- Cada pixel é tinta sólida ou transparência total. Não há véu semitransparente, porque no DTF qualquer pixel com tinta ganha branco por baixo e isso vira auréola.
- Bolinhas redondas. O piso inicial é 0,5 mm, para o pó adesivo conseguir ancorar.
- Frequência inicial perto de 28 LPI e ângulo de 22,5°. A predefinição Malha usa 35 LPI, ponto elíptico e níveis: o preto mais fundo vai a 100% de tinta e o branco sujo sai, sem embaralhar os tons do meio.
- A base branca opcional nasce 1 px menor que a cor.
- O SVG sai em milímetros, com a cor e a base branca em camadas do Inkscape. O PDF traz as mesmas formas em vetor.
- O contorno sólido, se estiver ligado, cobre só a silhueta externa. O miolo segue em bolinhas, e os buracos internos não ganham essa borda.
- Furos leves deixam a arte original e tiram 20% da tinta em círculos, listras ou grade, com vão de 0,7 mm. Abaixo disso o pó costuma fechar o vão. A borda de fora fica sem textura. No SVG e no PDF desse modo, a arte entra como imagem no tamanho da prensa.
- Avisos aparecem quando bolinha, vão, alívio, contorno, corte de opacidade, base branca ou tolerância descem do que a prensa costuma segurar.
- Branco, preto ou uma cor escolhida podem ser removidos da arte inteira, para a camiseta aparecer no lugar.

A predefinição **DTF** é o ponto de partida. **Aberto** deixa o efeito mais gráfico e a malha respira mais, porque a frequência cai e o ponto cresce. **Fino** ganha detalhe e exige mais da impressora. **Malha** segue a retícula de 35 LPI com ponto elíptico. A fresta desse ponto é fina: se o aviso aparecer, o pó pode fechá-la.
