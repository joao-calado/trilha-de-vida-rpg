// ===================================================================
// Testes da exportação (Issue #2)
//
// Sem dependências: usa apenas o node:test, que já vem no Node.js.
//   npm test        (ou: node --test tests/)
//
// js/exportar.js e js/atributos.js rodam em contextos `vm` isolados com
// um DOM mínimo falso, para testar exatamente os arquivos do navegador:
//   · helpers puros (data local, slug, escape XML, download)
//   · números do card SVG (valor, bônus, total, modificador e custo)
//   · fluxo de exportação (canvas 2×, nome do arquivo e erros)
// ===================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import vm from "node:vm";

const CAMINHO_EXPORTAR = fileURLToPath(new URL("../js/exportar.js", import.meta.url));
const CAMINHO_ATRIBUTOS = fileURLToPath(new URL("../js/atributos.js", import.meta.url));
const FONTE_EXPORTAR = readFileSync(CAMINHO_EXPORTAR, "utf8");
const FONTE_ATRIBUTOS = readFileSync(CAMINHO_ATRIBUTOS, "utf8");

// -------------------------------------------------------------------
// AMBIENTE FALSO (navegador mínimo)
// -------------------------------------------------------------------
function criarElementoFalso() {
  return {
    hidden: true,
    textContent: "",
    className: "",
    disabled: false,
    atributos: {},
    setAttribute(nome, valor) {
      this.atributos[nome] = String(valor);
    },
    removeAttribute(nome) {
      delete this.atributos[nome];
    },
  };
}

function criarAmbiente(opcoes = {}) {
  const estado = {
    cliques: [],
    canvas: [],
    draws: [],
    urls: [],
    revogadas: [],
    links: [],
    timeouts: [],
    toBlob: opcoes.toBlob || (() => new Blob(["png"], { type: "image/png" })),
  };

  const elementos = {
    btnExportar: criarElementoFalso(),
    statusExport: criarElementoFalso(),
  };

  function criarCanvas() {
    const canvas = {
      width: 0,
      height: 0,
      getContext() {
        const contexto = {
          fillStyle: null,
          fillRect() {},
          drawImage(img, x, y, largura, altura) {
            estado.draws.push({
              img,
              x,
              y,
              largura,
              altura,
              fillStyle: contexto.fillStyle,
            });
          },
        };
        return contexto;
      },
      toBlob(callback) {
        callback(estado.toBlob());
      },
    };
    estado.canvas.push(canvas);
    return canvas;
  }

  const documento = {
    fonts: { ready: Promise.resolve() },
    body: {
      appendChild(node) {
        node.conectado = true;
      },
    },
    getElementById(id) {
      return elementos[id] || null;
    },
    addEventListener() {},
    createElement(tag) {
      if (tag === "canvas") return criarCanvas();
      if (tag === "a") {
        const link = {
          href: "",
          download: "",
          rel: "",
          style: {},
          clicado: 0,
          removido: false,
          click() {
            this.clicado += 1;
            estado.cliques.push(this);
          },
          remove() {
            this.removido = true;
          },
        };
        estado.links.push(link);
        return link;
      }
      return criarElementoFalso();
    },
  };

  let contadorUrl = 0;
  const URLFalsa = {
    createObjectURL(blob) {
      const url = `blob:teste-${++contadorUrl}`;
      estado.urls.push({ url, blob, tipo: blob && blob.type });
      return url;
    },
    revokeObjectURL(url) {
      estado.revogadas.push(url);
    },
  };

  class ImagemFalsa {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.naturalWidth = 900;
      this.complete = false;
    }

    set src(valor) {
      this._src = valor;
      this.complete = true;
      Promise.resolve().then(() => {
        if (this.onload) this.onload();
      });
    }

    get src() {
      return this._src;
    }

    decode() {
      return Promise.resolve();
    }
  }

  const janela = {
    document: documento,
    URL: URLFalsa,
    setTimeout(fn, ms) {
      estado.timeouts.push({ fn, ms });
      return estado.timeouts.length;
    },
  };

  const contexto = vm.createContext({
    window: janela,
    document: documento,
    location: { protocol: opcoes.protocolo || "http:" },
    URL: URLFalsa,
    Blob,
    Image: ImagemFalsa,
    setTimeout(fn, ms) {
      estado.timeouts.push({ fn, ms });
      return estado.timeouts.length;
    },
    clearTimeout() {},
    console: { warn() {}, info() {}, error() {}, log() {} },
  });

  vm.runInContext(FONTE_EXPORTAR, contexto, { filename: CAMINHO_EXPORTAR });
  contexto.Exportar = janela.Exportar;
  vm.runInContext(FONTE_ATRIBUTOS, contexto, { filename: CAMINHO_ATRIBUTOS });

  return { contexto, janela, documento, elementos, estado };
}

function svgAtual(ambiente) {
  return vm.runInContext("montarCardAtributosSVG()", ambiente.contexto);
}

function celula(svg, atributo, classe) {
  const bloco = svg.match(new RegExp(`<g data-attr="${atributo}">([\\s\\S]*?)</g>`));
  assert.ok(bloco, `linha do atributo ${atributo} não encontrada no SVG`);
  const valor = bloco[1].match(new RegExp(`class="${classe}"[^>]*>([^<]*)<`));
  assert.ok(valor, `célula ${classe} de ${atributo} não encontrada`);
  return valor[1];
}

function textoNoCard(svg, x, y) {
  const achado = svg.match(new RegExp(`x="${x}" y="${y}"[^>]*>([^<]*)<`));
  assert.ok(achado, `texto em (${x}, ${y}) não encontrado`);
  return achado[1];
}

function dataLocalEsperada(data = new Date()) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getFullYear()}`;
}

function dataISOEsperada(data = new Date()) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

// ===================================================================
// HELPERS DE js/exportar.js
// ===================================================================
test("Exportar expõe os helpers puros no window", () => {
  const { janela } = criarAmbiente();
  // Requeridos pela Issue #2; a Issue #3 acrescenta outros helpers ao mesmo
  // objeto, então o teste não deve fixar a lista completa de chaves.
  for (const nome of ["baixarArquivo", "dataLocalISO", "slugArquivo", "escaparXML"]) {
    assert.equal(typeof janela.Exportar[nome], "function", nome);
  }
  for (const nome of Object.keys(janela.Exportar)) {
    assert.equal(typeof janela.Exportar[nome], "function", nome);
  }
});

test("dataLocalISO usa o dia local e sempre com dois dígitos", () => {
  const { janela } = criarAmbiente();
  const { dataLocalISO } = janela.Exportar;

  // Objeto no formato Date: o componente local é a fonte da verdade.
  const quaseMeiaNoite = {
    getFullYear: () => 2026,
    getMonth: () => 10,
    getDate: () => 1,
  };
  assert.equal(dataLocalISO(quaseMeiaNoite), "2026-11-01");
  assert.equal(dataLocalISO(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  assert.equal(dataLocalISO(new Date(2026, 11, 31, 23, 59, 59)), "2026-12-31");
});

test("slugArquivo remove acentos, pontuação e caixa", () => {
  const { janela } = criarAmbiente();
  const { slugArquivo } = janela.Exportar;

  assert.equal(slugArquivo("Anão da Colina"), "anao-da-colina");
  assert.equal(slugArquivo("Meio-Elfo"), "meio-elfo");
  assert.equal(slugArquivo("Pés-Leves"), "pes-leves");
  assert.equal(slugArquivo("Constituição"), "constituicao");
  assert.equal(slugArquivo("  Ação & Reação!!  "), "acao-reacao");
  assert.equal(slugArquivo("Já—está"), "ja-esta");
  assert.equal(slugArquivo(""), "");
  assert.equal(slugArquivo(null), "");
  assert.equal(slugArquivo(undefined), "");
});

test("escaparXML cobre &, <, >, aspas e apóstrofo sem escapar duas vezes", () => {
  const { janela } = criarAmbiente();
  const { escaparXML } = janela.Exportar;

  assert.equal(
    escaparXML(`<tag attr="a" outra='b'>&</tag>`),
    "&lt;tag attr=&quot;a&quot; outra=&apos;b&apos;&gt;&amp;&lt;/tag&gt;"
  );
  assert.equal(escaparXML("&lt;"), "&amp;lt;");
  assert.equal(escaparXML("Força"), "Força");
  assert.equal(escaparXML(42), "42");
});

test("baixarArquivo cria link temporário e revoga a URL depois do clique", () => {
  const ambiente = criarAmbiente();
  const { janela, estado } = ambiente;
  const blob = new Blob(["conteúdo"], { type: "image/png" });

  janela.Exportar.baixarArquivo("ficha.png", blob);

  assert.equal(estado.links.length, 1);
  const link = estado.links[0];
  assert.equal(link.download, "ficha.png");
  assert.equal(link.href, estado.urls[0].url);
  assert.equal(link.clicado, 1);
  assert.equal(link.removido, true);
  assert.deepEqual(estado.revogadas, []);

  const limpeza = estado.timeouts.find((t) => t.ms >= 1000);
  assert.ok(limpeza, "revogação da URL deveria ser diferida");
  limpeza.fn();
  assert.deepEqual(estado.revogadas, [estado.urls[0].url]);
});

// ===================================================================
// CARD SVG (números e conteúdo)
// ===================================================================
test("card SVG tem dimensões, xmlns, fonte inline e o tema escuro", () => {
  const ambiente = criarAmbiente();
  const svg = svgAtual(ambiente);

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="900"/);
  assert.match(svg, /height="720"/);
  assert.match(svg, /viewBox="0 0 900 720"/);
  assert.match(svg, /font-family="/);
  assert.match(svg, /fill="#0f0f0f"/);
  assert.match(svg, /fill="#1a1a1a"/);
  assert.match(svg, /Trilhas de Vida/);
  assert.match(svg, /Exportado em /);
});

test("card tudo em 8 (Humano +1 em tudo): valores, bônus, total, mod e custo", () => {
  const ambiente = criarAmbiente();
  const svg = svgAtual(ambiente);

  assert.match(svg, /Humano/);
  for (const atributo of ["str", "dex", "con", "int", "wis", "cha"]) {
    assert.equal(celula(svg, atributo, "celula-valor"), "8");
    assert.equal(celula(svg, atributo, "celula-bonus"), "+1");
    assert.equal(celula(svg, atributo, "celula-total"), "9");
    assert.equal(celula(svg, atributo, "celula-mod"), "−1");
    assert.equal(celula(svg, atributo, "celula-custo"), "0");
  }

  // Orçamento / gasto / restante e barra vazia.
  assert.equal(textoNoCard(svg, 170, 602), "27");
  assert.equal(textoNoCard(svg, 450, 602), "0");
  assert.equal(textoNoCard(svg, 730, 602), "27");
  assert.match(svg, /y="620" width="0"/);
});

test("card de uma distribuição qualquer bate com as regras da tela", () => {
  const ambiente = criarAmbiente();
  vm.runInContext(
    `estado.racaId = "anao";
     estado.subracaId = "colina";
     Object.assign(estado.valores, { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });`,
    ambiente.contexto
  );

  const svg = svgAtual(ambiente);
  assert.match(svg, /Anão da Colina/);

  const esperado = {
    str: { valor: "15", bonus: "+0", total: "15", mod: "+2", custo: "9" },
    dex: { valor: "14", bonus: "+0", total: "14", mod: "+2", custo: "7" },
    con: { valor: "13", bonus: "+2", total: "15", mod: "+2", custo: "5" },
    int: { valor: "12", bonus: "+0", total: "12", mod: "+1", custo: "4" },
    wis: { valor: "10", bonus: "+1", total: "11", mod: "+0", custo: "2" },
    cha: { valor: "8", bonus: "+0", total: "8", mod: "−1", custo: "0" },
  };
  for (const [atributo, valores] of Object.entries(esperado)) {
    assert.equal(celula(svg, atributo, "celula-valor"), valores.valor, atributo);
    assert.equal(celula(svg, atributo, "celula-bonus"), valores.bonus, atributo);
    assert.equal(celula(svg, atributo, "celula-total"), valores.total, atributo);
    assert.equal(celula(svg, atributo, "celula-mod"), valores.mod, atributo);
    assert.equal(celula(svg, atributo, "celula-custo"), valores.custo, atributo);
  }

  // 27 pontos gastos: restante 0 e barra cheia.
  assert.equal(textoNoCard(svg, 450, 602), "27");
  assert.equal(textoNoCard(svg, 730, 602), "0");
  assert.match(svg, /y="620" width="772"/);
  assert.equal(textoNoCard(svg, 836, 664), `Exportado em ${dataLocalEsperada()}`);
});

test("card do Meio-Elfo mostra os dois bônus flexíveis escolhidos", () => {
  const ambiente = criarAmbiente();
  vm.runInContext(
    `estado.racaId = "meio-elfo";
     estado.subracaId = null;
     estado.flex = ["str", "dex"];`,
    ambiente.contexto
  );

  const svg = svgAtual(ambiente);
  assert.match(svg, /Meio-Elfo/);
  assert.match(svg, /BÔNUS FLEXÍVEIS/);
  assert.match(svg, /Força · Destreza/);
  assert.equal(celula(svg, "str", "celula-bonus"), "+1");
  assert.equal(celula(svg, "dex", "celula-bonus"), "+1");
  assert.equal(celula(svg, "cha", "celula-bonus"), "+2");
  assert.equal(celula(svg, "con", "celula-bonus"), "+0");

  // Nome usado no arquivo: a raça/sub-raça, sem flexíveis.
  assert.equal(vm.runInContext("nomeRacaParaExportacao()", ambiente.contexto), "Meio-Elfo");
  vm.runInContext(`estado.racaId = "anao"; estado.subracaId = "colina";`, ambiente.contexto);
  assert.equal(
    vm.runInContext("nomeRacaParaExportacao()", ambiente.contexto),
    "Anão da Colina"
  );
});

test("card combina raça e sub-raça e aceita a data capturada no clique", () => {
  const ambiente = criarAmbiente();
  vm.runInContext(`estado.racaId = "elfo"; estado.subracaId = "drow";`, ambiente.contexto);
  const svg = svgAtual(ambiente);
  assert.match(svg, /Elfo · Drow/);
  assert.match(svg, /RAÇA \/ SUB-RAÇA/);

  const comData = vm.runInContext(
    "montarCardAtributosSVG(new Date(2026, 10, 1, 23, 30))",
    ambiente.contexto
  );
  assert.match(comData, /Exportado em 01\/11\/2026/);

  // Sub-raça que já carrega a raça base não vira "Anão · Anão da Colina".
  vm.runInContext(`estado.racaId = "anao"; estado.subracaId = "colina";`, ambiente.contexto);
  const svgAnao = svgAtual(ambiente);
  assert.match(svgAnao, /Anão da Colina/);
  assert.doesNotMatch(svgAnao, /Anão · Anão da Colina/);

  // Sub-raça sem a raça base ganha o prefixo para não perder contexto.
  vm.runInContext(`estado.racaId = "halfling"; estado.subracaId = "pes-leves";`, ambiente.contexto);
  assert.match(svgAtual(ambiente), /Halfling · Pés-Leves/);
});

// ===================================================================
// FLUXO DE EXPORTAÇÃO
// ===================================================================
test("exportação renderiza em 2× com fundo opaco e baixa o PNG nomeado", async () => {
  const ambiente = criarAmbiente();
  const { contexto, estado, elementos } = ambiente;
  vm.runInContext(
    `estado.racaId = "anao";
     estado.subracaId = "colina";
     Object.assign(estado.valores, { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });`,
    contexto
  );

  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  // Canvas 1800 × 1440 (card 900 × 720 em 2×), fundo #0f0f0f e drawImage
  // coerente com o viewBox.
  assert.equal(estado.canvas.length, 1);
  assert.equal(estado.canvas[0].width, 1800);
  assert.equal(estado.canvas[0].height, 1440);
  assert.equal(estado.draws.length, 1);
  assert.equal(estado.draws[0].fillStyle, "#0f0f0f");
  assert.equal(estado.draws[0].x, 0);
  assert.equal(estado.draws[0].y, 0);
  assert.equal(estado.draws[0].largura, 1800);
  assert.equal(estado.draws[0].altura, 1440);

  // Blobs: SVG para rasterizar e PNG para baixar.
  assert.deepEqual(
    estado.urls.map((u) => u.tipo),
    ["image/svg+xml;charset=utf-8", "image/png"]
  );

  const nomeEsperado = `trilhas-atributos-anao-da-colina-${dataISOEsperada(new Date())}.png`;
  assert.equal(estado.links.length, 1);
  assert.equal(estado.links[0].download, nomeEsperado);
  assert.equal(estado.links[0].clicado, 1);
  assert.equal(estado.links[0].removido, true);

  // A URL do SVG é revogada logo após o drawImage; a do PNG, de forma diferida.
  assert.ok(estado.revogadas.includes(estado.urls[0].url));
  const limpeza = estado.timeouts.find(
    (t) => t.ms >= 1000 && typeof t.fn === "function"
  );
  assert.ok(limpeza, "URL do download deveria ser revogada depois");
  limpeza.fn();
  assert.ok(estado.revogadas.includes(estado.urls[1].url));

  // Feedback e restauração do botão.
  assert.match(elementos.statusExport.textContent, /Imagem exportada: trilhas-atributos/);
  assert.equal(elementos.statusExport.hidden, false);
  assert.equal(elementos.btnExportar.disabled, false);
  assert.equal(elementos.btnExportar.atributos["aria-busy"], undefined);
});

test("durante a geração o botão fica desabilitado com aria-busy e é restaurado", async () => {
  const ambiente = criarAmbiente();
  const { contexto, elementos, janela } = ambiente;
  let observado = null;

  janela.Exportar.baixarArquivo = () => {
    observado = {
      desabilitado: elementos.btnExportar.disabled,
      ariaBusy: elementos.btnExportar.atributos["aria-busy"],
    };
  };

  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  assert.deepEqual(observado, { desabilitado: true, ariaBusy: "true" });
  assert.equal(elementos.btnExportar.disabled, false);
  assert.equal(elementos.btnExportar.atributos["aria-busy"], undefined);
});

test("exportação é somente leitura: não altera o estado da ficha", async () => {
  const ambiente = criarAmbiente();
  const { contexto } = ambiente;
  vm.runInContext(
    `estado.racaId = "meio-elfo"; estado.subracaId = null; estado.flex = ["str", "dex"];
     Object.assign(estado.valores, { str: 13, dex: 13, con: 14, int: 10, wis: 12, cha: 10 });`,
    contexto
  );
  const antes = vm.runInContext("JSON.stringify(estado)", contexto);

  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  const depois = vm.runInContext("JSON.stringify(estado)", contexto);
  assert.equal(depois, antes);
});

test("exportar pelo teclado devolve o foco ao botão ao terminar", async () => {
  const ambiente = criarAmbiente();
  const { contexto, documento, elementos } = ambiente;
  elementos.btnExportar.focado = false;
  elementos.btnExportar.focus = function () {
    this.focado = true;
    documento.activeElement = this;
  };
  documento.activeElement = elementos.btnExportar;

  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  assert.equal(elementos.btnExportar.focado, true);
  assert.equal(documento.activeElement, elementos.btnExportar);
});

test("após uma falha de toBlob, a tentativa seguinte volta a funcionar", async () => {
  const ambiente = criarAmbiente({ toBlob: () => null });
  const { contexto, estado, elementos } = ambiente;

  await vm.runInContext("exportarAtributosComoImagem()", contexto);
  assert.equal(estado.links.length, 0);
  assert.equal(elementos.btnExportar.disabled, false);
  assert.match(elementos.statusExport.textContent, /Não foi possível gerar a imagem/);

  estado.toBlob = () => new Blob(["png"], { type: "image/png" });
  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  assert.equal(estado.links.length, 1);
  assert.match(elementos.statusExport.textContent, /Imagem exportada:/);
  assert.equal(elementos.btnExportar.disabled, false);
});

test("nome do arquivo e data são fixados no clique, antes do await", async () => {
  const ambiente = criarAmbiente();
  const { contexto, estado } = ambiente;
  vm.runInContext(`estado.racaId = "meio-elfo"; estado.subracaId = null;`, contexto);

  const promessa = vm.runInContext("exportarAtributosComoImagem()", contexto);
  // Estado muda enquanto a imagem é rasterizada.
  vm.runInContext(`estado.racaId = "anao"; estado.subracaId = "colina";`, contexto);
  await promessa;

  assert.equal(estado.links.length, 1);
  assert.match(estado.links[0].download, /^trilhas-atributos-meio-elfo-/);
});

test("em file:// não baixa arquivo e orienta a usar um servidor local", async () => {
  const ambiente = criarAmbiente({ protocolo: "file:" });
  const { contexto, estado, elementos } = ambiente;

  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  assert.equal(estado.links.length, 0);
  assert.equal(estado.canvas.length, 0);
  assert.match(elementos.statusExport.textContent, /http\.server 8000/);
  assert.equal(elementos.statusExport.hidden, false);
  assert.equal(elementos.btnExportar.disabled, false);
});

test("falha do toBlob mostra mensagem amigável e restaura o botão", async () => {
  const ambiente = criarAmbiente({ toBlob: () => null });
  const { contexto, estado, elementos } = ambiente;

  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  assert.equal(estado.links.length, 0);
  assert.match(elementos.statusExport.textContent, /Não foi possível gerar a imagem/);
  assert.equal(elementos.statusExport.hidden, false);
  assert.equal(elementos.btnExportar.disabled, false);
  assert.equal(elementos.btnExportar.atributos["aria-busy"], undefined);
  // O Blob SVG ainda é criado, mas a URL é liberada no finally.
  assert.equal(estado.urls.length, 1);
  assert.ok(estado.revogadas.includes(estado.urls[0].url));
});

test("sem js/exportar.js a exportação avisa em vez de quebrar", async () => {
  const ambiente = criarAmbiente();
  const { contexto, estado, elementos } = ambiente;
  contexto.Exportar = undefined;

  await vm.runInContext("exportarAtributosComoImagem()", contexto);

  assert.equal(estado.links.length, 0);
  assert.match(elementos.statusExport.textContent, /js\/exportar\.js/);
  assert.equal(elementos.btnExportar.disabled, false);
});

test("card não depende de estado global exposto em window", () => {
  const ambiente = criarAmbiente();
  assert.equal(ambiente.janela.TrilhasAtributos, undefined);
  assert.equal(ambiente.janela.estado, undefined);
});
