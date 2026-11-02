// ===================================================================
// TRILHAS DE VIDA · CALCULADORA DE ATRIBUTOS
// Compra de pontos · Livro do Jogador de D&D 5e, p. 13
// ===================================================================

// -------------------------------------------------------------------
// REGRAS
// -------------------------------------------------------------------
const PONTOS_MIN = 8;   // valor mínimo antes dos ajustes raciais
const PONTOS_MAX = 15;  // valor máximo antes dos ajustes raciais
const ORCAMENTO = 27;   // pontos para distribuir entre os seis atributos

// Custo em pontos de cada valor de atributo
const CUSTO_PONTOS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

const ATRIBUTOS = [
  { id: "str", abrev: "FOR", nome: "Força" },
  { id: "dex", abrev: "DES", nome: "Destreza" },
  { id: "con", abrev: "CON", nome: "Constituição" },
  { id: "int", abrev: "INT", nome: "Inteligência" },
  { id: "wis", abrev: "SAB", nome: "Sabedoria" },
  { id: "cha", abrev: "CAR", nome: "Carisma" },
];

// Raças do PHB. `bonus` é o ajuste base; cada subraça soma sobre ele.
const RACAS = [
  {
    id: "humano", nome: "Humano",
    bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  },
  {
    id: "anao", nome: "Anão",
    bonus: { con: 2 },
    subracas: [
      { id: "colina", nome: "Anão da Colina", bonus: { wis: 1 } },
      { id: "montanha", nome: "Anão da Montanha", bonus: { str: 2 } },
    ],
  },
  {
    id: "elfo", nome: "Elfo",
    bonus: { dex: 2 },
    subracas: [
      { id: "alto", nome: "Alto Elfo", bonus: { int: 1 } },
      { id: "floresta", nome: "Elfo da Floresta", bonus: { wis: 1 } },
      { id: "drow", nome: "Drow", bonus: { cha: 1 } },
    ],
  },
  {
    id: "halfling", nome: "Halfling",
    bonus: { dex: 2 },
    subracas: [
      { id: "pes-leves", nome: "Pés-Leves", bonus: { cha: 1 } },
      { id: "robusto", nome: "Robusto", bonus: { con: 1 } },
    ],
  },
  {
    id: "draconato", nome: "Draconato",
    bonus: { str: 2, cha: 1 },
  },
  {
    id: "gnomo", nome: "Gnomo",
    bonus: { int: 2 },
    subracas: [
      { id: "floresta", nome: "Gnomo da Floresta", bonus: { dex: 1 } },
      { id: "rochas", nome: "Gnomo das Rochas", bonus: { con: 1 } },
    ],
  },
  {
    id: "meio-elfo", nome: "Meio-Elfo",
    bonus: { cha: 2 },
    flexiveis: 2,               // +1 em dois atributos diferentes...
    flexProibidos: ["cha"],     // ...que não Carisma (que já recebe +2)
  },
  {
    id: "meio-orc", nome: "Meio-Orc",
    bonus: { str: 2, con: 1 },
  },
  {
    id: "tiefling", nome: "Tiefling",
    bonus: { cha: 2, int: 1 },
  },
];

// -------------------------------------------------------------------
// ESTADO
// -------------------------------------------------------------------
const estado = {
  valores: {},
  racaId: RACAS[0].id,
  subracaId: null,
  flex: [],
};

ATRIBUTOS.forEach((a) => { estado.valores[a.id] = PONTOS_MIN; });

const refs = {};

// -------------------------------------------------------------------
// CÁLCULOS
// -------------------------------------------------------------------
function racaAtual() {
  return RACAS.find((r) => r.id === estado.racaId) || RACAS[0];
}

function subracaAtual() {
  const raca = racaAtual();
  if (!raca.subracas) return null;
  return raca.subracas.find((s) => s.id === estado.subracaId) || raca.subracas[0];
}

function custoDe(valor) {
  return CUSTO_PONTOS[valor] || 0;
}

function custoTotal() {
  return ATRIBUTOS.reduce((soma, a) => soma + custoDe(estado.valores[a.id]), 0);
}

function bonusRaciais() {
  const bonus = {};
  ATRIBUTOS.forEach((a) => { bonus[a.id] = 0; });

  const raca = racaAtual();
  Object.entries(raca.bonus || {}).forEach(([id, valor]) => {
    if (bonus[id] !== undefined) bonus[id] += valor;
  });

  const sub = subracaAtual();
  if (sub) {
    Object.entries(sub.bonus || {}).forEach(([id, valor]) => {
      if (bonus[id] !== undefined) bonus[id] += valor;
    });
  }

  if (raca.flexiveis) {
    estado.flex.forEach((id) => {
      if (bonus[id] !== undefined) bonus[id] += 1;
    });
  }

  return bonus;
}

function modificador(total) {
  return Math.floor((total - 10) / 2);
}

function sinal(valor) {
  return (valor >= 0 ? "+" : "−") + Math.abs(valor);
}

function podeAumentar(id) {
  const atual = estado.valores[id];
  if (atual >= PONTOS_MAX) return false;
  const delta = custoDe(atual + 1) - custoDe(atual);
  return custoTotal() + delta <= ORCAMENTO;
}

function podeDiminuir(id) {
  return estado.valores[id] > PONTOS_MIN;
}

// -------------------------------------------------------------------
// PERSISTÊNCIA LOCAL (Issue #1)
// js/persistencia.js cuida do localStorage; aqui traduzimos `estado`
// para o formato salvo e validamos o que é restaurado.
// -------------------------------------------------------------------
function temPersistencia() {
  return typeof Persistencia !== "undefined";
}

function mostrarAvisoPersistencia(texto) {
  const aviso = document.getElementById("avisoPersistencia");
  if (!aviso) return;
  // Mostra antes de escrever para leitores de tela anunciarem a mensagem.
  aviso.hidden = false;
  aviso.textContent = texto;
}

function configurarAvisoPersistencia() {
  const aviso = document.getElementById("avisoPersistencia");
  if (!aviso) return;

  if (!temPersistencia()) {
    mostrarAvisoPersistencia(
      "Não foi possível carregar js/persistencia.js; os atributos não serão salvos."
    );
    return;
  }

  Persistencia.aoFalhar((motivo) =>
    mostrarAvisoPersistencia(motivo || Persistencia.MENSAGENS.falhaAoSalvar)
  );

  const status = Persistencia.status();
  if (!status.ok) {
    mostrarAvisoPersistencia(Persistencia.MENSAGENS.indisponivel);
  } else if (status.semEspaco) {
    mostrarAvisoPersistencia(Persistencia.MENSAGENS.falhaAoSalvar);
  }
}

function contextoPersistencia() {
  return {
    idsAtributos: ATRIBUTOS.map((atributo) => atributo.id),
    minimo: PONTOS_MIN,
    maximo: PONTOS_MAX,
    orcamento: ORCAMENTO,
    custoDe,
    racas: RACAS.map((raca) => ({
      id: raca.id,
      subracas: Array.isArray(raca.subracas) ? raca.subracas.map((sub) => sub.id) : [],
      flexiveis: Number.isInteger(raca.flexiveis) ? raca.flexiveis : 0,
      flexProibidos: Array.isArray(raca.flexProibidos) ? raca.flexProibidos : [],
    })),
  };
}

function montarEstadoPersistivel() {
  return {
    valores: { ...estado.valores },
    racaId: estado.racaId,
    subracaId: estado.subracaId,
    flex: [...estado.flex],
  };
}

// Última versão enviada ao localStorage. Evita regravar no carregamento
// (quando nada mudou) e dá ao campo `salvoEm` o sentido de "última alteração".
let ultimoAtributosSalvo = null;

function marcarAtributosComoSalvos() {
  ultimoAtributosSalvo = JSON.stringify(montarEstadoPersistivel());
}

function persistirAtributos() {
  if (!temPersistencia()) return;
  const estadoSalvo = montarEstadoPersistivel();
  const serializado = JSON.stringify(estadoSalvo);
  if (serializado === ultimoAtributosSalvo) return;
  if (
    Persistencia.salvarAtributos(
      estadoSalvo,
      ATRIBUTOS.map((atributo) => atributo.id)
    )
  ) {
    ultimoAtributosSalvo = serializado;
  }
}

function carregarEstadoSalvo() {
  if (!temPersistencia()) {
    marcarAtributosComoSalvos();
    return;
  }

  const salvo = Persistencia.lerAtributos();
  if (!salvo) {
    if (Persistencia.estaBloqueada(Persistencia.CHAVES.atributos)) {
      mostrarAvisoPersistencia(Persistencia.MENSAGENS.versaoMaisNova);
    }
    marcarAtributosComoSalvos();
    return;
  }

  const normalizado = Persistencia.normalizarAtributos(salvo, contextoPersistencia());
  if (!normalizado) {
    marcarAtributosComoSalvos();
    return;
  }

  ATRIBUTOS.forEach((atributo) => {
    estado.valores[atributo.id] = normalizado.valores[atributo.id];
  });
  if (normalizado.racaId) estado.racaId = normalizado.racaId;
  estado.subracaId = normalizado.subracaId;
  estado.flex = normalizado.flex;

  if (normalizado.ajustes.length) {
    console.warn("[Persistência] Atributos salvos restaurados com ajustes:", normalizado.ajustes);
    mostrarAvisoPersistencia(
      "Os atributos salvos foram restaurados, mas alguns dados foram ignorados (valores, raça ou flexíveis inválidos). Detalhes no console."
    );
    // Não marca como salvo: o estado normalizado será regravado no próximo atualizar().
    return;
  }

  marcarAtributosComoSalvos();
}

// -------------------------------------------------------------------
// EXPORTAÇÃO DA FICHA (PNG) · Issue #2
// O card é um SVG montado a partir de `estado` (sem fotografar o DOM) e
// rasterizado em um <canvas> 2×. js/exportar.js fornece os helpers de
// download/nome/escape; nenhuma regra de cálculo é repetida aqui.
// -------------------------------------------------------------------
const LARGURA_CARD = 900;
const ALTURA_CARD = 720;
const ESCALA_EXPORTACAO = 2;
const MARGEM_CARD = 24;
const PADDING_CARD = 40;

// SVG não herda o CSS da página: as cores do tema são literais.
const CORES_EXPORTACAO = Object.freeze({
  fundo: "#0f0f0f",
  cartao: "#1a1a1a",
  borda: "#2a2a2a",
  texto: "#eaeaea",
  dourado: "#e0b84a",
  verde: "#7bc47f",
  laranja: "#e07b5a",
  cinza: "#777",
  negativo: "#e05555",
});

const MSG_SERVIDOR_NECESSARIO =
  "Para exportar a imagem, abra o site por um servidor local — por exemplo, " +
  "python3 -m http.server 8000 — em vez de abrir o arquivo direto do disco.";
const MSG_FALHA_EXPORTACAO =
  "Não foi possível gerar a imagem da ficha. Tente de novo; se o problema " +
  "continuar, recarregue a página.";
const MSG_EXPORTAR_INDISPONIVEL =
  "Não foi possível carregar js/exportar.js; recarregue a página para tentar novamente.";

let timerStatusExport = null;

function nomeRacaParaExportacao() {
  const sub = subracaAtual();
  return sub ? sub.nome : racaAtual().nome;
}

// Nome exibido no card: usa o nome da sub-raça quando ele já traz a raça
// base ("Anão da Colina"); senão combina os dois ("Elfo · Drow").
function nomeRacaParaCard() {
  const raca = racaAtual();
  const sub = subracaAtual();
  if (!sub) return raca.nome;
  return sub.nome.toLowerCase().includes(raca.nome.toLowerCase())
    ? sub.nome
    : `${raca.nome} · ${sub.nome}`;
}

function dataLocalBR(data) {
  const [ano, mes, dia] = Exportar.dataLocalISO(data).split("-");
  return `${dia}/${mes}/${ano}`;
}

function mostrarStatusExport(mensagem, tipo = "info") {
  const status = document.getElementById("statusExport");
  if (!status) return;

  if (timerStatusExport) {
    clearTimeout(timerStatusExport);
    timerStatusExport = null;
  }

  status.className = `status-export ${tipo}`;
  // Desocultar antes de escrever: leitores de tela anunciam a mudança.
  status.hidden = false;
  status.textContent = mensagem;

  timerStatusExport = setTimeout(() => {
    status.hidden = true;
    timerStatusExport = null;
  }, tipo === "erro" ? 9000 : 6000);
}

function celulaAtributoSVG(atributo, y) {
  const esc = Exportar.escaparXML;
  return (
    `<text x="84" y="${y}">` +
    `<tspan fill="${CORES_EXPORTACAO.dourado}" font-size="12" font-weight="700" letter-spacing="0.6">${esc(atributo.abrev)}</tspan>` +
    `<tspan fill="${CORES_EXPORTACAO.texto}" font-size="16" dx="8">${esc(atributo.nome)}</tspan>` +
    `</text>`
  );
}

function montarCardAtributosSVG(data = new Date()) {
  const esc = Exportar.escaparXML;
  const bonus = bonusRaciais();
  const gasto = custoTotal();
  const restante = ORCAMENTO - gasto;
  const dataBR = dataLocalBR(data);

  // O arquivo usa a sub-raça (ex.: "Anão da Colina"); o card mostra a raça
  // base quando o nome da sub-raça não a deixa explícita (ex.: Drow).
  const subraca = subracaAtual();
  const nomeRaca = nomeRacaParaCard();
  const rotuloRaca = subraca ? "RAÇA / SUB-RAÇA" : "RAÇA";
  const nomesFlex = estado.flex
    .map((id) => ATRIBUTOS.find((atributo) => atributo.id === id))
    .filter(Boolean)
    .map((atributo) => atributo.nome);

  const xInicio = MARGEM_CARD + PADDING_CARD;
  const xFim = LARGURA_CARD - MARGEM_CARD - PADDING_CARD;
  const larguraConteudo = xFim - xInicio; // 772

  const tabelaTopo = 232;
  const alturaCabecalho = 36;
  const alturaLinha = 42;
  const tabelaFim = tabelaTopo + alturaCabecalho + ATRIBUTOS.length * alturaLinha; // 520
  const colunas = [420, 512, 604, 696, 788];
  const rotulos = ["Valor", "Bônus racial", "Total", "Modificador", "Custo"];

  const cabecalho =
    `<text x="84" y="${tabelaTopo + 22}" fill="${CORES_EXPORTACAO.cinza}" font-size="10" font-weight="700" letter-spacing="0.8">ATRIBUTO</text>` +
    rotulos
      .map(
        (rotulo, indice) =>
          `<text x="${colunas[indice]}" y="${tabelaTopo + 22}" text-anchor="middle" fill="${CORES_EXPORTACAO.cinza}" font-size="10" font-weight="700" letter-spacing="0.8">${esc(rotulo.toUpperCase())}</text>`
      )
      .join("");

  const linhas = ATRIBUTOS.map((atributo, indice) => {
    const valor = estado.valores[atributo.id];
    const ajuste = bonus[atributo.id];
    const total = valor + ajuste;
    const mod = modificador(total);
    const custo = custoDe(valor);
    const topo = tabelaTopo + alturaCabecalho + indice * alturaLinha;
    const base = topo + alturaLinha / 2 + 6;

    const fundo =
      indice % 2 === 1
        ? `<rect x="${xInicio}" y="${topo}" width="${larguraConteudo}" height="${alturaLinha}" fill="#1e1e1e"/>`
        : "";

    return (
      `<g data-attr="${atributo.id}">` +
      fundo +
      celulaAtributoSVG(atributo, base) +
      `<text class="celula-valor" x="${colunas[0]}" y="${base}" text-anchor="middle" fill="${CORES_EXPORTACAO.texto}" font-size="19" font-weight="700">${valor}</text>` +
      `<text class="celula-bonus" x="${colunas[1]}" y="${base}" text-anchor="middle" fill="${ajuste > 0 ? CORES_EXPORTACAO.verde : CORES_EXPORTACAO.cinza}" font-size="16" font-weight="600">${esc(sinal(ajuste))}</text>` +
      `<text class="celula-total" x="${colunas[2]}" y="${base}" text-anchor="middle" fill="#ffffff" font-size="19" font-weight="700">${total}</text>` +
      `<text class="celula-mod" x="${colunas[3]}" y="${base}" text-anchor="middle" fill="${CORES_EXPORTACAO.texto}" font-size="16" font-weight="600">${esc(sinal(mod))}</text>` +
      `<text class="celula-custo" x="${colunas[4]}" y="${base}" text-anchor="middle" fill="${custo > 0 ? CORES_EXPORTACAO.laranja : CORES_EXPORTACAO.cinza}" font-size="16" font-weight="600">${custo}</text>` +
      `</g>`
    );
  }).join("");

  const separadores = Array.from({ length: ATRIBUTOS.length - 1 }, (_, indice) => {
    const y = tabelaTopo + alturaCabecalho + (indice + 1) * alturaLinha;
    return `<line x1="${xInicio}" y1="${y}" x2="${xFim}" y2="${y}" stroke="#232323" stroke-width="1"/>`;
  }).join("");

  const flexivel = nomesFlex.length
    ? `<text x="${xFim}" y="168" text-anchor="end" fill="${CORES_EXPORTACAO.cinza}" font-size="10" font-weight="700" letter-spacing="0.8">BÔNUS FLEXÍVEIS</text>` +
      `<text x="${xFim}" y="192" text-anchor="end" fill="${CORES_EXPORTACAO.dourado}" font-size="14" font-weight="600">${esc(nomesFlex.join(" · "))}</text>`
    : "";

  const fracaoGasta = ORCAMENTO > 0 ? Math.min(Math.max(gasto / ORCAMENTO, 0), 1) : 0;
  const larguraGasta = Math.round(larguraConteudo * fracaoGasta * 100) / 100;
  const corRestante = restante < 0 ? CORES_EXPORTACAO.negativo : CORES_EXPORTACAO.verde;
  const corBarra = restante < 0 ? CORES_EXPORTACAO.negativo : CORES_EXPORTACAO.dourado;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA_CARD}" height="${ALTURA_CARD}" viewBox="0 0 ${LARGURA_CARD} ${ALTURA_CARD}" font-family="'Segoe UI', system-ui, sans-serif" role="img" aria-label="${esc(`Ficha de atributos de ${nomeRaca}`)}">` +
    // Fundo opaco + cartão
    `<rect width="${LARGURA_CARD}" height="${ALTURA_CARD}" fill="${CORES_EXPORTACAO.fundo}"/>` +
    `<rect x="${MARGEM_CARD}" y="${MARGEM_CARD}" width="${LARGURA_CARD - 2 * MARGEM_CARD}" height="${ALTURA_CARD - 2 * MARGEM_CARD}" rx="22" fill="${CORES_EXPORTACAO.cartao}" stroke="${CORES_EXPORTACAO.borda}" stroke-width="1"/>` +
    // Título
    `<rect x="${xInicio}" y="70" width="4" height="38" rx="2" fill="${CORES_EXPORTACAO.dourado}"/>` +
    `<text x="${xInicio + 16}" y="100" fill="${CORES_EXPORTACAO.texto}" font-size="32" font-weight="700" letter-spacing="-0.4">Trilhas de Vida</text>` +
    `<text x="${xInicio + 16}" y="124" fill="${CORES_EXPORTACAO.cinza}" font-size="12" letter-spacing="0.4">Ficha de atributos · compra de pontos (D&amp;D 5e)</text>` +
    // Raça / sub-raça (+ flexíveis)
    `<rect x="${xInicio}" y="146" width="${larguraConteudo}" height="64" rx="12" fill="#202020" stroke="${CORES_EXPORTACAO.borda}" stroke-width="1"/>` +
    `<text x="84" y="168" fill="${CORES_EXPORTACAO.cinza}" font-size="10" font-weight="700" letter-spacing="0.8">${rotuloRaca}</text>` +
    `<text x="84" y="192" fill="${CORES_EXPORTACAO.texto}" font-size="18" font-weight="700">${esc(nomeRaca)}</text>` +
    flexivel +
    // Tabela
    `<line x1="${xInicio}" y1="${tabelaTopo}" x2="${xFim}" y2="${tabelaTopo}" stroke="${CORES_EXPORTACAO.borda}" stroke-width="1"/>` +
    cabecalho +
    `<line x1="${xInicio}" y1="${tabelaTopo + alturaCabecalho}" x2="${xFim}" y2="${tabelaTopo + alturaCabecalho}" stroke="${CORES_EXPORTACAO.borda}" stroke-width="1"/>` +
    linhas +
    separadores +
    `<line x1="${xInicio}" y1="${tabelaFim}" x2="${xFim}" y2="${tabelaFim}" stroke="${CORES_EXPORTACAO.borda}" stroke-width="1"/>` +
    // Orçamento / gasto / restante + barra
    `<text x="170" y="570" text-anchor="middle" fill="${CORES_EXPORTACAO.cinza}" font-size="10" font-weight="700" letter-spacing="1">ORÇAMENTO</text>` +
    `<text x="170" y="602" text-anchor="middle" fill="${CORES_EXPORTACAO.texto}" font-size="26" font-weight="700">${ORCAMENTO}</text>` +
    `<text x="450" y="570" text-anchor="middle" fill="${CORES_EXPORTACAO.cinza}" font-size="10" font-weight="700" letter-spacing="1">GASTO</text>` +
    `<text x="450" y="602" text-anchor="middle" fill="${CORES_EXPORTACAO.laranja}" font-size="26" font-weight="700">${gasto}</text>` +
    `<text x="730" y="570" text-anchor="middle" fill="${CORES_EXPORTACAO.cinza}" font-size="10" font-weight="700" letter-spacing="1">RESTANTE</text>` +
    `<text x="730" y="602" text-anchor="middle" fill="${corRestante}" font-size="26" font-weight="700">${restante}</text>` +
    `<rect x="${xInicio}" y="620" width="${larguraConteudo}" height="10" rx="5" fill="${CORES_EXPORTACAO.borda}"/>` +
    `<rect x="${xInicio}" y="620" width="${larguraGasta}" height="10" rx="5" fill="${corBarra}"/>` +
    // Rodapé
    `<text x="${xInicio}" y="664" fill="${CORES_EXPORTACAO.cinza}" font-size="11">Trilhas de Vida · D&amp;D 5e</text>` +
    `<text x="${xFim}" y="664" text-anchor="end" fill="${CORES_EXPORTACAO.cinza}" font-size="12">Exportado em ${dataBR}</text>` +
    `</svg>`
  );
}

function prepararImagemSVG(url) {
  const img = new Image();
  const carregada = new Promise((resolver, rejeitar) => {
    img.onload = () => resolver(img);
    img.onerror = () => rejeitar(new Error("Não foi possível carregar o SVG do card."));
  });
  img.src = url;

  // `img.decode()` garante que os pixels estão prontos antes do drawImage.
  // Fallbacks: navegadores sem decode() e navegadores que rejeitam decode()
  // para SVG mesmo com a imagem carregada (o `carregada` já resolveu).
  const decodificada =
    typeof img.decode === "function"
      ? img.decode().then(
          () => img,
          () => carregada
        )
      : carregada;

  const fontesProntas =
    document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

  return Promise.all([carregada, decodificada, fontesProntas]).then(() => img);
}

function blobDeCanvas(canvas) {
  return new Promise((resolver) => {
    canvas.toBlob((blob) => resolver(blob), "image/png");
  });
}

async function exportarAtributosComoImagem() {
  const botao = document.getElementById("btnExportar");
  // Guardar o protocolo antes de gerar: em file:// o canvas/download do
  // Blob não é confiável em todos os navegadores.
  const protocoloArquivo = typeof location !== "undefined" && location.protocol === "file:";

  if (protocoloArquivo) {
    mostrarStatusExport(MSG_SERVIDOR_NECESSARIO, "erro");
    return;
  }

  if (typeof Exportar === "undefined" || typeof Exportar.baixarArquivo !== "function") {
    mostrarStatusExport(MSG_EXPORTAR_INDISPONIVEL, "erro");
    return;
  }

  // Data e raça são fixadas no clique: o card e o nome do arquivo precisam
  // concordar mesmo que o estado mude durante a rasterização.
  const agora = new Date();
  const nomeRaca = nomeRacaParaExportacao();
  const tinhaFoco = typeof document.activeElement !== "undefined" && document.activeElement === botao;

  if (botao) {
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
  }

  try {
    const blobSvg = new Blob([montarCardAtributosSVG(agora)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const urlSvg = URL.createObjectURL(blobSvg);

    try {
      const img = await prepararImagemSVG(urlSvg);
      const canvas = document.createElement("canvas");
      canvas.width = LARGURA_CARD * ESCALA_EXPORTACAO;
      canvas.height = ALTURA_CARD * ESCALA_EXPORTACAO;

      const contexto = canvas.getContext("2d");
      if (!contexto) throw new Error("Canvas 2D indisponível.");

      contexto.fillStyle = CORES_EXPORTACAO.fundo;
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(img, 0, 0, canvas.width, canvas.height);

      const blob = await blobDeCanvas(canvas);
      if (!blob) throw new Error("canvas.toBlob devolveu null.");

      const slug = Exportar.slugArquivo(nomeRaca) || "ficha";
      const nome = `trilhas-atributos-${slug}-${Exportar.dataLocalISO(agora)}.png`;
      Exportar.baixarArquivo(nome, blob);
      mostrarStatusExport(`Imagem exportada: ${nome}`, "sucesso");
    } finally {
      URL.revokeObjectURL(urlSvg);
    }
  } catch (erro) {
    console.error("[Exportar] Falha ao gerar a imagem da ficha:", erro);
    mostrarStatusExport(MSG_FALHA_EXPORTACAO, "erro");
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.removeAttribute("aria-busy");
      // Reabilitar um botão focado o faz perder o foco; devolva-o ao usuário
      // de teclado para que o Tab continue de onde parou.
      if (tinhaFoco) botao.focus();
    }
  }
}

// -------------------------------------------------------------------
// RENDERIZAÇÃO
// -------------------------------------------------------------------
function montarLinhas() {
  const destino = document.getElementById("linhasAtributos");

  ATRIBUTOS.forEach((atributo) => {
    const linha = document.createElement("div");
    linha.className = "atributo-linha";
    linha.dataset.attr = atributo.id;

    const nome = document.createElement("div");
    nome.className = "attr-nome";
    const abrev = document.createElement("span");
    abrev.className = "attr-abrev";
    abrev.textContent = atributo.abrev;
    const label = document.createElement("span");
    label.className = "attr-label";
    label.textContent = atributo.nome;
    nome.append(abrev, label);

    const controle = document.createElement("div");
    controle.className = "attr-controle";

    const menos = document.createElement("button");
    menos.type = "button";
    menos.className = "btn-step";
    menos.dataset.attr = atributo.id;
    menos.dataset.delta = "-1";
    menos.textContent = "−";
    menos.setAttribute("aria-label", "Diminuir " + atributo.nome);

    const valor = document.createElement("span");
    valor.className = "attr-valor";
    valor.setAttribute("aria-live", "polite");

    const mais = document.createElement("button");
    mais.type = "button";
    mais.className = "btn-step";
    mais.dataset.attr = atributo.id;
    mais.dataset.delta = "1";
    mais.textContent = "+";
    mais.setAttribute("aria-label", "Aumentar " + atributo.nome);

    controle.append(menos, valor, mais);

    const bonus = document.createElement("div");
    bonus.className = "attr-bonus";
    const total = document.createElement("div");
    total.className = "attr-total";
    const mod = document.createElement("div");
    mod.className = "attr-mod";
    const custo = document.createElement("div");
    custo.className = "attr-custo";

    linha.append(nome, controle, bonus, total, mod, custo);
    destino.appendChild(linha);

    refs[atributo.id] = { valor, bonus, total, mod, custo, menos, mais };
  });
}

function preencherRacas() {
  const select = document.getElementById("racaSelect");
  select.innerHTML = "";
  RACAS.forEach((raca) => {
    const opcao = document.createElement("option");
    opcao.value = raca.id;
    opcao.textContent = raca.nome;
    select.appendChild(opcao);
  });
  select.value = estado.racaId;
}

function preencherSubracas() {
  const box = document.getElementById("subracaBox");
  const select = document.getElementById("subracaSelect");
  const raca = racaAtual();

  if (!raca.subracas) {
    box.hidden = true;
    estado.subracaId = null;
    return;
  }

  box.hidden = false;
  select.innerHTML = "";
  raca.subracas.forEach((sub) => {
    const opcao = document.createElement("option");
    opcao.value = sub.id;
    opcao.textContent = sub.nome;
    select.appendChild(opcao);
  });

  if (!raca.subracas.some((s) => s.id === estado.subracaId)) {
    estado.subracaId = raca.subracas[0].id;
  }
  select.value = estado.subracaId;
}

function preencherFlex() {
  const box = document.getElementById("flexBox");
  const raca = racaAtual();

  if (!raca.flexiveis) {
    box.hidden = true;
    estado.flex = [];
    return;
  }

  box.hidden = false;
  const proibidos = raca.flexProibidos || [];
  const opcoes = ATRIBUTOS.filter((a) => !proibidos.includes(a.id));

  if (estado.flex.length !== raca.flexiveis) {
    estado.flex = opcoes.slice(0, raca.flexiveis).map((a) => a.id);
  }

  // normaliza: escolhas válidas e distintas
  const usados = new Set();
  estado.flex = estado.flex.map((id) => {
    let escolha = opcoes.some((o) => o.id === id) && !usados.has(id) ? id : null;
    if (!escolha) {
      const livre = opcoes.find((o) => !usados.has(o.id));
      escolha = livre ? livre.id : opcoes[0].id;
    }
    usados.add(escolha);
    return escolha;
  });

  ["flex1", "flex2"].forEach((idCampo, indice) => {
    const select = document.getElementById(idCampo);
    select.innerHTML = "";
    opcoes.forEach((atributo) => {
      const opcao = document.createElement("option");
      opcao.value = atributo.id;
      opcao.textContent = `${atributo.nome} (${atributo.abrev})`;
      select.appendChild(opcao);
    });
    select.value = estado.flex[indice];
  });
}

function montarReferenciaCustos() {
  const destino = document.getElementById("custoRef");
  Object.keys(CUSTO_PONTOS).forEach((valor) => {
    const chip = document.createElement("span");
    chip.className = "custo-chip";
    const negrito = document.createElement("b");
    negrito.textContent = CUSTO_PONTOS[valor];
    chip.append(`${valor} = `, negrito, " pt");
    destino.appendChild(chip);
  });
}

function atualizar() {
  const bonus = bonusRaciais();
  const gasto = custoTotal();
  const restante = ORCAMENTO - gasto;

  ATRIBUTOS.forEach((atributo) => {
    const valor = estado.valores[atributo.id];
    const ajuste = bonus[atributo.id];
    const totalAtributo = valor + ajuste;
    const ref = refs[atributo.id];

    ref.valor.textContent = valor;
    ref.bonus.textContent = sinal(ajuste);
    ref.bonus.classList.toggle("positivo", ajuste > 0);
    ref.total.textContent = totalAtributo;
    ref.mod.textContent = sinal(modificador(totalAtributo));
    ref.custo.textContent = custoDe(valor);
    ref.custo.classList.toggle("positivo", custoDe(valor) > 0);

    ref.menos.disabled = !podeDiminuir(atributo.id);
    ref.mais.disabled = !podeAumentar(atributo.id);
  });

  document.getElementById("ptGasto").textContent = gasto;
  document.getElementById("ptRestante").textContent = restante;
  document.getElementById("ptRestanteBox").classList.toggle("negativo", restante < 0);

  // Toda alteração de atributos, raça, sub-raça ou flexíveis passa por aqui.
  persistirAtributos();
}

// -------------------------------------------------------------------
// EVENTOS
// -------------------------------------------------------------------
function ajustar(id, delta) {
  const atual = estado.valores[id];
  const novo = atual + delta;

  if (novo < PONTOS_MIN || novo > PONTOS_MAX) return;

  const deltaCusto = custoDe(novo) - custoDe(atual);
  if (deltaCusto > 0 && custoTotal() + deltaCusto > ORCAMENTO) return;

  estado.valores[id] = novo;
  atualizar();
}

function iniciar() {
  configurarAvisoPersistencia();
  carregarEstadoSalvo();
  montarLinhas();
  preencherRacas();
  preencherSubracas();
  preencherFlex();
  montarReferenciaCustos();
  atualizar();

  document.getElementById("racaSelect").addEventListener("change", (evento) => {
    estado.racaId = evento.target.value;
    estado.subracaId = null;
    estado.flex = [];
    preencherSubracas();
    preencherFlex();
    atualizar();
  });

  document.getElementById("subracaSelect").addEventListener("change", (evento) => {
    estado.subracaId = evento.target.value;
    atualizar();
  });

  ["flex1", "flex2"].forEach((idCampo, indice) => {
    document.getElementById(idCampo).addEventListener("change", (evento) => {
      estado.flex[indice] = evento.target.value;
      preencherFlex();
      atualizar();
    });
  });

  document.getElementById("linhasAtributos").addEventListener("click", (evento) => {
    const botao = evento.target.closest(".btn-step");
    if (!botao) return;
    ajustar(botao.dataset.attr, Number(botao.dataset.delta));
  });

  const botaoExportar = document.getElementById("btnExportar");
  if (botaoExportar) {
    botaoExportar.addEventListener("click", exportarAtributosComoImagem);
  }

  document.getElementById("btnReset").addEventListener("click", () => {
    ATRIBUTOS.forEach((atributo) => {
      estado.valores[atributo.id] = PONTOS_MIN;
    });
    atualizar();
  });
}

document.addEventListener("DOMContentLoaded", iniciar);
