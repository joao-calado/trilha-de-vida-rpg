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

  document.getElementById("btnReset").addEventListener("click", () => {
    ATRIBUTOS.forEach((atributo) => {
      estado.valores[atributo.id] = PONTOS_MIN;
    });
    atualizar();
  });
}

document.addEventListener("DOMContentLoaded", iniciar);
