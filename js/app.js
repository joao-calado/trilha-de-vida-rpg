// ===================================================================
// TRILHAS DE VIDA · MAPA INTERATIVO
// Fonte de dados: assets/trilhas.json
// ===================================================================

const FONTE_DADOS = "assets/trilhas.json";

// -------------------------------------------------------------------
// ESTADO
// -------------------------------------------------------------------
let trilhasData = [];
let intermediariosData = [];
let pontosPorNivel = [];
let custoPorNivel = [];
let custoAcumuladoNivel = [];
let custoIntermediario = 0;

let nosComprados = new Set();
let origemAtual = null;
let nivelPersonagem = 1;

// -------------------------------------------------------------------
// GEOMETRIA DO MAPA
// -------------------------------------------------------------------
const RAIO_BASE = 180;
const RAIO_STEP = 140;
const CENTRO_X = 1000;
const CENTRO_Y = 1000;
const LARGURA = 2000;
const ALTURA = 2000;

let anguloStep = 0;
let nodePositions = {};
let intermediariosPos = [];
let todosNos = [];

// -------------------------------------------------------------------
// REFERÊNCIAS
// -------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const modal = $("modal");
const modalClose = $("modalClose");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");
const modalPacoteSection = $("modalPacoteSection");
const pacotePericia = $("pacotePericia");
const pacoteFerramenta = $("pacoteFerramenta");
const pacoteItem = $("pacoteItem");
const modalCombate = $("modalCombate");
const modalFora = $("modalFora");
const modalPrereq = $("modalPrereq");
const modalTrilhaDesc = $("modalTrilhaDesc");
const modalMsg = $("modalMsg");
const custoNo = $("custoNo");
const custoAcum = $("custoAcum");
const custoAcumBox = $("custoAcumBox");
const btnComprar = $("btnComprar");
const btnOrigem = $("btnOrigem");
const nivelSelect = $("nivelSelect");
const statusEl = $("status");
const legendDiv = $("legend");

let svg = null;
let g = null;
let nodeGroups = null;
let noAtualModal = null;

// ===================================================================
// CARREGAMENTO E VALIDAÇÃO DOS DADOS
// ===================================================================
async function carregarDados() {
  const resposta = await fetch(FONTE_DADOS, { cache: "no-store" });
  if (!resposta.ok) {
    throw new Error(`Falha ao ler ${FONTE_DADOS} (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}

function validarDados(dados) {
  if (!dados || !Array.isArray(dados.trilhas) || dados.trilhas.length === 0) {
    throw new Error("O JSON não contém uma lista de trilhas.");
  }
  if (!Array.isArray(dados.intermediarios)) {
    dados.intermediarios = [];
  }

  const sistema = dados.sistema || {};
  if (!Array.isArray(sistema.pontosPorNivel) || sistema.pontosPorNivel.length < 2) {
    throw new Error("O JSON não contém a tabela de pontos por nível.");
  }
  if (!Array.isArray(sistema.custoPorNivel) || sistema.custoPorNivel.length < 6) {
    throw new Error("O JSON não contém a tabela de custo dos nós.");
  }
  if (!Array.isArray(sistema.custoAcumuladoNivel) || sistema.custoAcumuladoNivel.length < 6) {
    throw new Error("O JSON não contém a tabela de custo acumulado.");
  }

  const ids = new Set();
  for (const trilha of dados.trilhas) {
    if (!trilha.id || !trilha.nome || !trilha.cor) {
      throw new Error("Há uma trilha sem id, nome ou cor.");
    }
    if (ids.has(trilha.id)) {
      throw new Error(`Id de trilha duplicado: ${trilha.id}.`);
    }
    ids.add(trilha.id);
    if (!Array.isArray(trilha.nos) || trilha.nos.length === 0) {
      throw new Error(`A trilha "${trilha.nome}" não possui nós.`);
    }
  }

  for (const inter of dados.intermediarios) {
    if (!ids.has(inter.trilhaA) || !ids.has(inter.trilhaB)) {
      throw new Error(
        `O nó intermediário "${inter.nome}" aponta para uma trilha inexistente.`
      );
    }
  }
}

function aplicarDados(dados) {
  validarDados(dados);

  trilhasData = dados.trilhas;
  intermediariosData = dados.intermediarios;

  const sistema = dados.sistema;
  pontosPorNivel = sistema.pontosPorNivel;
  custoPorNivel = sistema.custoPorNivel;
  custoAcumuladoNivel = sistema.custoAcumuladoNivel;
  custoIntermediario = Number(sistema.custoIntermediario ?? 7);

  nosComprados = new Set();
  origemAtual = null;
  nivelPersonagem = 1;
}

// ===================================================================
// POSICIONAMENTO
// ===================================================================
function construirPosicoes() {
  anguloStep = (2 * Math.PI) / trilhasData.length;
  nodePositions = {};
  intermediariosPos = [];
  todosNos = [];

  trilhasData.forEach((trilha, idx) => {
    const angulo = idx * anguloStep - Math.PI / 2;
    trilha.nos.forEach((_, nivelIdx) => {
      const nivel = nivelIdx + 1;
      const raio = RAIO_BASE + (nivel - 1) * RAIO_STEP;
      nodePositions[`${trilha.id}-${nivel}`] = {
        x: CENTRO_X + raio * Math.cos(angulo),
        y: CENTRO_Y + raio * Math.sin(angulo),
      };
    });
  });

  intermediariosData.forEach((inter) => {
    const i = trilhasData.findIndex((t) => t.id === inter.trilhaA);
    const j = trilhasData.findIndex((t) => t.id === inter.trilhaB);

    let angA = i * anguloStep - Math.PI / 2;
    let angB = j * anguloStep - Math.PI / 2;

    if (Math.abs(angA - angB) > Math.PI) {
      if (angA > angB) angA -= 2 * Math.PI;
      else angB -= 2 * Math.PI;
    }

    const anguloMedio = (angA + angB) / 2;
    const raio = RAIO_BASE + 2 * RAIO_STEP;

    intermediariosPos.push({
      ...inter,
      x: CENTRO_X + raio * Math.cos(anguloMedio),
      y: CENTRO_Y + raio * Math.sin(anguloMedio),
    });
  });
}

// ===================================================================
// RENDERIZAÇÃO
// ===================================================================
function montarMapa() {
  svg = d3
    .select("#viz")
    .append("svg")
    .attr("viewBox", `0 0 ${LARGURA} ${ALTURA}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  g = svg.append("g");

  g.append("rect")
    .attr("width", LARGURA)
    .attr("height", ALTURA)
    .attr("fill", "#141414")
    .attr("rx", 18);

  // Conexões internas de cada trilha
  trilhasData.forEach((trilha) => {
    for (let i = 0; i < trilha.nos.length - 1; i++) {
      const from = nodePositions[`${trilha.id}-${i + 1}`];
      const to = nodePositions[`${trilha.id}-${i + 2}`];
      if (from && to) {
        g.append("line")
          .attr("x1", from.x)
          .attr("y1", from.y)
          .attr("x2", to.x)
          .attr("y2", to.y)
          .attr("stroke", trilha.cor)
          .attr("opacity", 0.5)
          .attr("stroke-width", 2.5)
          .attr("stroke-linecap", "round");
      }
    }
  });

  // Conexões dos nós intermediários
  intermediariosPos.forEach((inter) => {
    [
      nodePositions[`${inter.trilhaA}-3`],
      nodePositions[`${inter.trilhaB}-3`],
    ].forEach((pos) => {
      if (pos) {
        g.append("line")
          .attr("x1", inter.x)
          .attr("y1", inter.y)
          .attr("x2", pos.x)
          .attr("y2", pos.y)
          .attr("stroke", "#777")
          .attr("opacity", 0.4)
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "5,5");
      }
    });
  });

  // Nomes das trilhas
  trilhasData.forEach((trilha, idx) => {
    const angulo = idx * anguloStep - Math.PI / 2;
    const raioLabel = RAIO_BASE + 5 * RAIO_STEP + 60;
    g.append("text")
      .attr("x", CENTRO_X + raioLabel * Math.cos(angulo))
      .attr("y", CENTRO_Y + raioLabel * Math.sin(angulo))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("fill", trilha.cor)
      .style("font-size", "14px")
      .style("font-weight", "700")
      .style("letter-spacing", "0.3px")
      .style("opacity", 0.95)
      .style("text-shadow", "0 2px 8px rgba(0,0,0,0.8)")
      .text(trilha.nome);
  });

  // Lista unificada de nós (habilidades + intermediários)
  trilhasData.forEach((trilha) => {
    trilha.nos.forEach((no, nivelIdx) => {
      const nivel = nivelIdx + 1;
      const pos = nodePositions[`${trilha.id}-${nivel}`];
      todosNos.push({
        _id: `${trilha.id}-nv${nivel}`,
        tipo: "habilidade",
        trilhaId: trilha.id,
        trilhaNome: trilha.nome,
        trilhaCor: trilha.cor,
        trilhaDescricao: trilha.descricao,
        pacoteOrigem: trilha.pacoteOrigem,
        nome: no.nome,
        nivel,
        x: pos.x,
        y: pos.y,
        combate: no.combate,
        foraCombate: no.foraCombate,
        custo: custoPorNivel[nivel],
        custoAcumulado: custoAcumuladoNivel[nivel],
      });
    });
  });

  intermediariosPos.forEach((inter) => {
    const tA = trilhasData.find((t) => t.id === inter.trilhaA);
    const tB = trilhasData.find((t) => t.id === inter.trilhaB);
    todosNos.push({
      _id: `inter-${inter.id}`,
      tipo: "intermediario",
      nome: inter.nome,
      nivel: 3,
      x: inter.x,
      y: inter.y,
      trilhaA: tA.nome,
      trilhaB: tB.nome,
      trilhaAId: tA.id,
      trilhaBId: tB.id,
      combate: inter.combate,
      foraCombate: inter.foraCombate,
      descricao: inter.descricao,
      custo: custoIntermediario,
      custoAcumulado: null,
    });
  });

  nodeGroups = g
    .selectAll("g.node-group")
    .data(todosNos)
    .enter()
    .append("g")
    .attr("class", "node-group")
    .attr("data-id", (d) => d._id)
    .on("click", (event, d) => abrirModal(d));

  nodeGroups
    .filter((d) => d.tipo === "habilidade" && d.nivel === 1)
    .append("circle")
    .attr("class", "origem-ring")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => 22 + d.nivel * 2 + 6)
    .attr("stroke", (d) => d.trilhaCor);

  nodeGroups
    .filter((d) => d.tipo === "habilidade")
    .append("circle")
    .attr("class", "node-circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => 22 + d.nivel * 2)
    .attr("fill", (d) => d.trilhaCor);

  nodeGroups
    .filter((d) => d.tipo === "intermediario")
    .append("polygon")
    .attr("class", "intersection-node")
    .attr("points", (d) => {
      const r = 26;
      return `${d.x},${d.y - r} ${d.x + r},${d.y} ${d.x},${d.y + r} ${d.x - r},${d.y}`;
    })
    .attr("fill", "#bbb");

  nodeGroups
    .append("text")
    .attr("class", "node-text")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y + (d.tipo === "intermediario" ? 40 : 0))
    .text((d) => {
      let label = d.nome;
      if (label.length > 18) label = label.slice(0, 16) + "…";
      return label;
    })
    .style("font-size", "10px")
    .style("font-weight", (d) => (d.tipo === "intermediario" ? "600" : "500"));
}

function montarLegenda() {
  legendDiv.innerHTML = "";

  trilhasData.forEach((t) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const dot = document.createElement("span");
    dot.className = "legend-color";
    dot.style.background = t.cor;

    const lbl = document.createElement("span");
    lbl.textContent = t.nome;

    item.append(dot, lbl);
    legendDiv.appendChild(item);
  });

  [
    { cls: "legend-origem", label: "Possível Origem" },
    { cls: "legend-comprado", label: "Comprado" },
    { cls: "legend-diamond", label: "Nó intermediário" },
  ].forEach(({ cls, label }) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const dot = document.createElement("span");
    dot.className = cls;

    const lbl = document.createElement("span");
    lbl.textContent = label;

    item.append(dot, lbl);
    legendDiv.appendChild(item);
  });
}

// ===================================================================
// HELPERS
// ===================================================================
function getAnteriorNode(node) {
  if (node.tipo !== "habilidade" || node.nivel === 1) return null;
  const id = `${node.trilhaId}-nv${node.nivel - 1}`;
  return todosNos.find((n) => n._id === id);
}

// ===================================================================
// LÓGICA DE PONTOS
// ===================================================================
function pontosDisponiveis() {
  return pontosPorNivel[nivelPersonagem] ?? 0;
}

function pontosGastos() {
  let total = 0;
  nosComprados.forEach((id) => {
    if (id === origemAtual) return;
    const node = todosNos.find((n) => n._id === id);
    if (node) total += node.custo;
  });
  return total;
}

function temPreRequisito(node) {
  if (node.tipo === "habilidade") {
    if (node.nivel === 1) return true;
    const anterior = getAnteriorNode(node);
    return anterior ? nosComprados.has(anterior._id) : false;
  }

  const naA = [...nosComprados].some((id) => id.startsWith(node.trilhaAId + "-nv"));
  const naB = [...nosComprados].some((id) => id.startsWith(node.trilhaBId + "-nv"));
  return naA || naB;
}

function podeComprar(node) {
  if (nosComprados.has(node._id)) return { ok: false, motivo: "Já comprado." };

  if (!temPreRequisito(node)) {
    if (node.tipo === "habilidade") {
      const anterior = getAnteriorNode(node);
      if (anterior) {
        return {
          ok: false,
          motivo: `Precisa ter comprado ${anterior.nome} · ${node.trilhaNome} Nível ${node.nivel - 1}.`,
        };
      }
      return { ok: false, motivo: "Precisa do nó anterior desta trilha." };
    }
    return {
      ok: false,
      motivo: `Precisa de 1 nó em ${node.trilhaA} ou ${node.trilhaB}.`,
    };
  }

  const disponivel = pontosDisponiveis() - pontosGastos();
  if (node.custo > disponivel) {
    return {
      ok: false,
      motivo: `Pontos insuficientes (faltam ${node.custo - disponivel}).`,
    };
  }

  return { ok: true };
}

function podeReembolsar(node) {
  if (!nosComprados.has(node._id)) return { ok: false, motivo: "Não foi comprado." };
  if (node.tipo === "intermediario") return { ok: true };
  if (node.nivel < 5 && nosComprados.has(`${node.trilhaId}-nv${node.nivel + 1}`)) {
    return {
      ok: false,
      motivo: `Bloqueado: Nível ${node.nivel + 1} depende deste nó.`,
    };
  }
  return { ok: true };
}

function comprarNo(node) {
  const check = podeComprar(node);
  if (!check.ok) return check;
  nosComprados.add(node._id);
  atualizarTudo();
  return { ok: true, msg: `Comprado: ${node.nome}` };
}

function reembolsarNo(node) {
  const check = podeReembolsar(node);
  if (!check.ok) return check;
  nosComprados.delete(node._id);
  if (origemAtual === node._id) origemAtual = null;
  atualizarTudo();
  return { ok: true, msg: `Reembolsado: ${node.nome}` };
}

function definirOrigem(node) {
  if (node.tipo !== "habilidade" || node.nivel !== 1) {
    return { ok: false, motivo: "Só nós de nível 1 podem ser Origem." };
  }
  if (!nosComprados.has(node._id)) nosComprados.add(node._id);
  origemAtual = node._id;
  atualizarTudo();
  return { ok: true, msg: `${node.nome} definido como Trilha de Origem.` };
}

function resetar() {
  if (!confirm("Tem certeza que deseja resetar todos os nós comprados?")) return;
  nosComprados.clear();
  origemAtual = null;
  atualizarTudo();
}

// ===================================================================
// ATUALIZAÇÃO DA INTERFACE
// ===================================================================
function atualizarTudo() {
  atualizarBarra();
  atualizarVisual();
  if (modal.classList.contains("active") && noAtualModal) {
    atualizarBotoesModal(noAtualModal);
  }
}

function atualizarBarra() {
  const disp = pontosDisponiveis();
  const gasto = pontosGastos();
  const rest = disp - gasto;

  $("ptDisponivel").textContent = disp;
  $("ptGasto").textContent = gasto;
  $("ptRestante").textContent = rest;
  $("ptRestanteBox").classList.toggle("negativo", rest < 0);

  const origemEl = $("origemNome");
  if (origemAtual) {
    const node = todosNos.find((n) => n._id === origemAtual);
    if (node) {
      origemEl.textContent = node.trilhaNome;
      origemEl.classList.remove("vazio");
    }
  } else {
    origemEl.textContent = "— nenhuma —";
    origemEl.classList.add("vazio");
  }
}

function atualizarVisual() {
  if (!nodeGroups) return;
  nodeGroups.each(function (d) {
    const el = d3.select(this);
    el.classed("comprado", nosComprados.has(d._id));
    el.classed("origem", origemAtual === d._id);
  });
}

// ===================================================================
// SELETOR DE NÍVEL
// ===================================================================
function configurarSeletorNivel() {
  nivelSelect.innerHTML = "";
  for (let i = 1; i < pontosPorNivel.length; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${i} (${pontosPorNivel[i]} pts)`;
    nivelSelect.appendChild(opt);
  }
  nivelSelect.value = 1;

  nivelSelect.addEventListener("change", (e) => {
    nivelPersonagem = Number(e.target.value);
    atualizarTudo();
  });
}

// ===================================================================
// CONTROLES GERAIS
// ===================================================================
function configurarControles() {
  $("btnReset").addEventListener("click", resetar);
}

// ===================================================================
// MODAL
// ===================================================================
function abrirModal(d) {
  noAtualModal = d;
  modalMsg.textContent = "";
  modalMsg.className = "modal-msg";

  if (d.tipo === "habilidade") {
    modalTitle.textContent = d.nome;
    modalSub.textContent = `${d.trilhaNome} · Nível ${d.nivel}`;
    modalSub.style.background = d.trilhaCor;
    modalSub.style.color = "#111";

    if (d.nivel === 1 && d.pacoteOrigem) {
      modalPacoteSection.style.display = "block";
      pacotePericia.textContent = d.pacoteOrigem.pericia;
      pacoteFerramenta.textContent = d.pacoteOrigem.ferramenta;
      pacoteItem.textContent = d.pacoteOrigem.item;
    } else {
      modalPacoteSection.style.display = "none";
    }

    custoNo.textContent = `${d.custo} pts`;
    custoAcumBox.style.display = "flex";
    custoAcum.innerHTML = `${d.custoAcumulado} pts <span class="acum-sub">(total na trilha)</span>`;

    if (d.nivel === 1) {
      modalPrereq.innerHTML =
        "<strong>Pré-requisito:</strong> nenhum. <br><em>Se esta for sua <strong>Trilha de Origem</strong>, o nó é gratuito e você também recebe o Pacote de Origem.</em>";
    } else {
      const anterior = getAnteriorNode(d);
      const nomeAnterior = anterior ? anterior.nome : "nó anterior";
      modalPrereq.innerHTML = `<strong>Pré-requisito:</strong> ter comprado <em>${nomeAnterior} · ${d.trilhaNome} Nível ${d.nivel - 1}</em>.`;
    }
  } else {
    modalTitle.textContent = d.nome;
    modalSub.textContent = `Nó intermediário · Custo ${custoIntermediario} pts`;
    modalSub.style.background = "#444";
    modalSub.style.color = "#eee";
    modalPacoteSection.style.display = "none";
    custoNo.textContent = `${custoIntermediario} pts`;
    custoAcumBox.style.display = "none";
    modalPrereq.innerHTML = `<strong>Acesso:</strong> ter pelo menos <em>1 nó</em> em <em>${d.trilhaA}</em> <strong>ou</strong> <em>${d.trilhaB}</em>.`;
  }

  modalCombate.textContent = d.combate;
  modalFora.textContent = d.foraCombate;
  modalTrilhaDesc.textContent =
    d.tipo === "habilidade" ? d.trilhaDescricao : d.descricao;
  modalTrilhaDesc.style.borderLeftColor =
    d.tipo === "habilidade" ? d.trilhaCor : "#888";

  atualizarBotoesModal(d);
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function atualizarBotoesModal(d) {
  const comprado = nosComprados.has(d._id);
  const isOrigem = origemAtual === d._id;

  if (comprado) {
    btnComprar.textContent = isOrigem
      ? "Remover Origem"
      : `Reembolsar (+${d.custo} pts)`;
    btnComprar.className = "btn-reembolsar";
    btnComprar.disabled = false;
    btnComprar.dataset.acao = "reembolsar";
  } else {
    const check = podeComprar(d);
    btnComprar.textContent = `Comprar (${d.custo} pts)`;
    btnComprar.className = "btn-comprar";
    btnComprar.disabled = !check.ok;
    btnComprar.dataset.acao = "comprar";
    if (!check.ok && modalMsg.textContent === "") {
      modalMsg.textContent = check.motivo;
    }
  }

  if (d.tipo === "habilidade" && d.nivel === 1) {
    btnOrigem.style.display = "block";
    if (isOrigem) {
      btnOrigem.textContent = "★ É sua Origem";
      btnOrigem.disabled = true;
    } else {
      btnOrigem.textContent = "Definir como Origem (grátis)";
      btnOrigem.disabled = false;
    }
  } else {
    btnOrigem.style.display = "none";
  }
}

function fecharModal() {
  modal.classList.remove("active");
  document.body.style.overflow = "";
  noAtualModal = null;
}

function configurarModal() {
  btnComprar.addEventListener("click", () => {
    if (!noAtualModal) return;
    modalMsg.className = "modal-msg";
    const acao = btnComprar.dataset.acao;
    const res =
      acao === "reembolsar"
        ? reembolsarNo(noAtualModal)
        : comprarNo(noAtualModal);
    modalMsg.textContent = res.ok ? res.msg : res.motivo;
    if (res.ok) modalMsg.classList.add("ok");
  });

  btnOrigem.addEventListener("click", () => {
    if (!noAtualModal) return;
    const res = definirOrigem(noAtualModal);
    modalMsg.textContent = res.ok ? res.msg : res.motivo;
    modalMsg.className = res.ok ? "modal-msg ok" : "modal-msg";
  });

  modalClose.addEventListener("click", fecharModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModal();
  });
}

// ===================================================================
// ZOOM E ARRASTE
// ===================================================================
function configurarZoom() {
  const zoom = d3
    .zoom()
    .scaleExtent([0.25, 3.5])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);
}

// ===================================================================
// ERROS DE CARREGAMENTO
// ===================================================================
function escaparHTML(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function mostrarErro(erro) {
  const detalhe =
    erro && erro.message
      ? `<br><br><span>Detalhe: ${escaparHTML(erro.message)}</span>`
      : "";

  const dica =
    location.protocol === "file:"
      ? "Esta página lê os dados de <code>assets/trilhas.json</code> e, aberta direto do disco, o navegador bloqueia essa leitura.<br>Inicie um servidor local na pasta do projeto:<br><code>python3 -m http.server 8000</code><br>e acesse <code>http://localhost:8000</code>."
      : "Verifique se o arquivo <code>assets/trilhas.json</code> existe e contém um JSON válido.";

  statusEl.hidden = false;
  statusEl.innerHTML = `<strong>Não foi possível carregar as trilhas.</strong><span>${dica}${detalhe}</span>`;
}

// ===================================================================
// INICIALIZAÇÃO
// ===================================================================
async function iniciar() {
  try {
    if (typeof d3 === "undefined") {
      throw new Error("A biblioteca D3.js não foi carregada (verifique a conexão).");
    }

    const dados = await carregarDados();
    aplicarDados(dados);
    construirPosicoes();
    montarMapa();
    montarLegenda();
    configurarSeletorNivel();
    configurarControles();
    configurarModal();
    configurarZoom();

    statusEl.hidden = true;
    atualizarTudo();

    console.log(
      `✅ Trilhas carregadas: ${trilhasData.length} trilhas, ${intermediariosData.length} nós intermediários.`
    );
  } catch (erro) {
    console.error("Erro ao inicializar o mapa:", erro);
    mostrarErro(erro);
  }
}

iniciar();
