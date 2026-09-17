# Trilhas de Vida

> Um sistema de progressão por trilhas que substitui os antecedentes de D&D 5e.
> Ninguém é 100% nada — cada personagem é a soma das suas práticas.

---

## Sobre

**Trilhas de Vida** é um sistema alternativo de antecedentes para D&D 5e. Em vez de uma identidade fixa ("você era um ladrão"), o personagem constrói sua história em tempo real, investindo **pontos** em trilhas que representam práticas, ofícios e caminhos em desenvolvimento.

A filosofia é simples:

- **Antecedente** = passado fixo. **Trilha** = presente em construção.
- Nenhum personagem é 100% clérigo, 100% ladrão ou 100% sábio.
- Cada trilha mistura usos em **combate** e **fora de combate**.
- Nós de trilha podem ser combinados para formar **nós intermediários** — habilidades híbridas entre duas trilhas.

---

## As 16 trilhas

| # | Trilha | Essência |
|---|---|---|
| 1 | O Altar Interior | Fé como prática, não dogma |
| 2 | Mãos que Criam | Construir, reparar, improvisar |
| 3 | A Máscara | Identidade como performance |
| 4 | A Margem | Viver nas frestas da lei |
| 5 | O Silêncio | A mente como lugar |
| 6 | O Instinto | Corpo, natureza e negociação |
| 7 | A Voz | Palavras que movem pessoas |
| 8 | A Maré | Adaptação e ritmo |
| 9 | O Tabuleiro | Enxergar o todo, três lances à frente |
| 10 | A Página | Conhecimento como processo |
| 11 | A Lâmina | Preparação como respeito à vida |
| 12 | O Telhado | A cidade vista de cima |
| 13 | O Horizonte | Inquietação que não passa |
| 14 | O Cadinho | Transformação por calor e pressão |
| 15 | O Fio | Equilíbrio entre controle e queda |
| 16 | A Estrada | O mundo como professora |

Cada trilha possui **5 nós** (níveis 1 a 5) e conecta-se a duas trilhas vizinhas por **nós intermediários**.

---

## Como funciona

### Custo dos nós

| Nível | Custo | Pré-requisito |
|---|---|---|
| 1 | 1 pt | — |
| 2 | 3 pts | ter comprado o Nível 1 da mesma trilha |
| 3 | 6 pts | ter comprado o Nível 2 da mesma trilha |
| 4 | 10 pts | ter comprado o Nível 3 da mesma trilha |
| 5 | 15 pts | ter comprado o Nível 4 da mesma trilha |

**Total para completar uma trilha:** 35 pontos.

### Nós intermediários

- Custo: **7 pontos**
- Acesso: ter pelo menos **1 nó em qualquer uma** das duas trilhas vizinhas (não exige ambas).
- Representam habilidades híbridas que só fazem sentido quando duas práticas se cruzam.

### Pontos por nível de personagem

| Nível | Ganho | Acumulado |
|---|---|---|
| 1 | 2 | 2 |
| 2 | 3 | 5 |
| 3 | 3 | 8 |
| 4 | 5 | 13 |
| 5 | 4 | 17 |
| 6 | 4 | 21 |
| 7 | 4 | 25 |
| 8 | 6 | 31 |
| 9 | 4 | 35 |
| 10 | 4 | 39 |
| 11 | 4 | 43 |
| 12 | 6 | 49 |
| 13 | 4 | 53 |
| 14 | 4 | 57 |
| 15 | 4 | 61 |
| 16 | 6 | 67 |
| 17 | 4 | 71 |
| 18 | 4 | 75 |
| 19 | 6 | 81 |
| 20 | 7 | **88** |

**No nível 20:** é possível completar **duas trilhas inteiras** (70 pts) + **dois nós intermediários** (14 pts) + **4 pontos livres** para começar uma terceira.

### Pacote de Origem

O **primeiro nó de nível 1** escolhido recebe o status de **Trilha de Origem** e é **gratuito**. Além disso, o jogador ganha:

- **1 perícia fixa** (definida pela trilha)
- **1 perícia livre** (escolhida pelo jogador, de qualquer lista)
- **1 proficiência em ferramenta** (temática da trilha)
- **1 item pessoal** sem valor mecânico (gancho narrativo)

Trilhas compradas depois dão apenas os nós — o pacote de identidade pertence à Origem.

---

## O mapa interativo

O arquivo `index.html` contém uma visualização radial construída com **D3.js**, com:

- **Zoom** (roda do mouse) e **arraste** (clique e segure)
- **Clique em qualquer nó** para ver:
  - Custo do nó e custo acumulado na trilha
  - Pré-requisito em cadeia (com o nome do nó anterior)
  - Efeitos em combate e fora de combate
  - Botões para comprar, reembolsar ou definir como Origem
- **Contador de pontos** no topo (disponível / gasto / restante)
- **Seletor de nível** (1 a 20) que atualiza os pontos disponíveis
- **Feedback visual:** nós comprados (contorno verde), Origem (contorno dourado), nós de nível 1 (anel tracejado indicando que podem ser Origem)

---

## Como usar

### Ver o mapa online

Acesse diretamente pelo GitHub Pages:
https://SEU-USUARIO.github.io/trilhas-vida/


Substitua `SEU-USUARIO` pelo seu nome de usuário do GitHub.

### Rodar localmente

1. Baixe o arquivo `index.html`.
2. Abra no navegador (duplo clique).
3. Pronto — não precisa de servidor.

### Incorporar no Notion

1. Digite `/embed` em qualquer página do Notion.
2. Cole a URL do GitHub Pages.
3. Pronto — o mapa interativo carrega dentro do Notion.

---

## Estrutura do projeto

```
trilhas-vida/
├── index.html # Mapa interativo completo (HTML + CSS + JS + D3.js)
└── README.md # Este arquivo
```


Tudo é **auto-contido** em um único arquivo HTML. Não há dependências locais além do D3.js (carregado via CDN).

---

## Como contribuir

Sugestões são bem-vindas! Algumas formas de contribuir:

1. **Reportar problemas** — abra uma *issue* descrevendo o problema ou sugestão.
2. **Propor novos nós** — descreva a habilidade, o nível, o pré-requisito e como ela se conecta à trilha.
3. **Enviar pull requests** — correções de texto, ajustes de balanceamento, melhorias visuais.

Antes de propor mudanças, considere a **filosofia do sistema**:

- Cada nó deve ter **uso em combate E fora de combate**.
- A trilha como um todo deve pesar aproximadamente 1/3 no poder de combate do personagem.
- Nomes devem ser **evocativos**, não descritivos de classe.
- Pré-requisitos devem ser **mínimos** — apenas o nó anterior da mesma trilha.

---

## Licença

Este projeto é livre para uso pessoal e adaptação em mesas de RPG.
Se quiser redistribuir, credite os autores originais do sistema.

---

## Créditos

- **Sistema e design das trilhas:** João Calado
- **Visualização interativa:** construída em colaboração com IA (Claude, Anthropic)
- **Inspiração mecânica:** D&D 5e (Wizards of the Coast)

---

*Feito para mesas onde ninguém é uma coisa só.*
