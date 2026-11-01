// ===================================================================
// Testes da persistência local (Issue #1)
//
// Sem dependências: usa apenas o node:test, que já vem no Node.js.
//   npm test        (ou: node --test tests/)
//
// O módulo js/persistencia.js é carregado em um contexto `vm` isolado,
// com um window/localStorage falsos, para testar exatamente o arquivo
// que roda no navegador.
// ===================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import vm from "node:vm";

const CAMINHO_MODULO = fileURLToPath(new URL("../js/persistencia.js", import.meta.url));
const FONTE = readFileSync(CAMINHO_MODULO, "utf8");

const CHAVE_PERFIL = "trilhas-vida:perfil";
const CHAVE_ATRIBUTOS = "trilhas-vida:atributos";

// -------------------------------------------------------------------
// AMBIENTE FALSO (navegador mínimo)
// -------------------------------------------------------------------
function erroDeCota(nome = "QuotaExceededError") {
  const erro = new Error("cota de armazenamento estourada");
  erro.name = nome;
  return erro;
}

function criarArmazenamento(inicial = {}, opcoes = {}) {
  const dados = new Map(Object.entries(inicial));
  const falharAoGravar = Boolean(opcoes.falharAoGravar);
  const falharSondagem = Boolean(opcoes.falharSondagem);
  const nomeDoErroDeCota = opcoes.nomeDoErroDeCota || "QuotaExceededError";

  return {
    dados,
    get length() {
      return dados.size;
    },
    key(indice) {
      return [...dados.keys()][indice] ?? null;
    },
    getItem(chave) {
      const chaveTexto = String(chave);
      return dados.has(chaveTexto) ? dados.get(chaveTexto) : null;
    },
    setItem(chave, valor) {
      const chaveTexto = String(chave);
      const ehSondagem = chaveTexto.endsWith("__teste__");
      if ((ehSondagem && falharSondagem) || (!ehSondagem && falharAoGravar)) {
        throw erroDeCota(ehSondagem ? nomeDoErroDeCota : undefined);
      }
      dados.set(chaveTexto, String(valor));
    },
    removeItem(chave) {
      dados.delete(String(chave));
    },
  };
}

// Armazenamento com limite de bytes: reproduz a cota estourada de verdade,
// inclusive o caso em que liberar a própria chave ainda não é suficiente.
function criarArmazenamentoComLimite(limiteBytes, inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  const total = () => {
    let soma = 0;
    dados.forEach((valor, chave) => {
      soma += chave.length + valor.length;
    });
    return soma;
  };

  return {
    dados,
    get length() {
      return dados.size;
    },
    key(indice) {
      return [...dados.keys()][indice] ?? null;
    },
    getItem(chave) {
      const chaveTexto = String(chave);
      return dados.has(chaveTexto) ? dados.get(chaveTexto) : null;
    },
    setItem(chave, valor) {
      const chaveTexto = String(chave);
      const valorTexto = String(valor);
      const atual = dados.has(chaveTexto) ? chaveTexto.length + dados.get(chaveTexto).length : 0;
      if (total() - atual + chaveTexto.length + valorTexto.length > limiteBytes) {
        throw erroDeCota();
      }
      dados.set(chaveTexto, valorTexto);
    },
    removeItem(chave) {
      dados.delete(String(chave));
    },
  };
}

// Primeira gravação real falha por cota; depois de liberar a chave, funciona.
function criarArmazenamentoCotaTransitoria() {
  const base = criarArmazenamento();
  let falhasRestantes = 1;
  return {
    get length() {
      return base.length;
    },
    key: (indice) => base.key(indice),
    getItem: (chave) => base.getItem(chave),
    removeItem: (chave) => base.removeItem(chave),
    setItem(chave, valor) {
      if (!String(chave).endsWith("__teste__") && falhasRestantes > 0) {
        falhasRestantes -= 1;
        throw erroDeCota();
      }
      base.setItem(chave, valor);
    },
  };
}

function carregarModulo(opcoes = {}) {
  const armazenamento = opcoes.armazenamento || criarArmazenamento();
  const avisos = [];
  const janela = {};

  if (opcoes.semLocalStorage) {
    Object.defineProperty(janela, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError simulado");
      },
    });
  } else {
    janela.localStorage = armazenamento;
  }

  const consoleFalso = {
    warn: (...args) => avisos.push({ tipo: "warn", args }),
    info: (...args) => avisos.push({ tipo: "info", args }),
    error: (...args) => avisos.push({ tipo: "error", args }),
  };

  const contexto = vm.createContext({
    window: janela,
    console: consoleFalso,
    TextEncoder,
  });
  vm.runInContext(FONTE, contexto, { filename: CAMINHO_MODULO });

  return { Persistencia: janela.Persistencia, armazenamento, avisos };
}

// Objetos criados dentro do contexto `vm` têm outro protótipo; converter
// para o realm atual deixa o deepStrictEqual comparável.
function plano(valor) {
  return JSON.parse(JSON.stringify(valor));
}

function lerEnvelope(armazenamento, chave) {
  return JSON.parse(armazenamento.getItem(chave));
}

const CONTEXTO_ATRIBUTOS = {
  idsAtributos: ["str", "dex", "con", "int", "wis", "cha"],
  minimo: 8,
  maximo: 15,
  orcamento: 27,
  custoDe: (valor) => ({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 })[valor] || 0,
  racas: [
    { id: "humano", subracas: [], flexiveis: 0, flexProibidos: [] },
    { id: "anao", subracas: ["colina", "montanha"], flexiveis: 0, flexProibidos: [] },
    { id: "meio-elfo", subracas: [], flexiveis: 2, flexProibidos: ["cha"] },
  ],
};

// ===================================================================
// GRAVAÇÃO / LEITURA / REMOÇÃO
// ===================================================================
test("salva e lê o perfil em round-trip", () => {
  const { Persistencia, armazenamento } = carregarModulo();
  const perfil = {
    nivelPersonagem: 5,
    origem: "altar-nv1",
    nosComprados: ["altar-nv1", "altar-nv2", "inter-reliquia-viva"],
  };

  assert.equal(Persistencia.salvarPerfil(perfil), true);
  assert.deepEqual(plano(Persistencia.lerPerfil()), perfil);

  const envelope = lerEnvelope(armazenamento, CHAVE_PERFIL);
  assert.deepEqual(Object.keys(envelope).sort(), ["dados", "salvoEm", "versao"]);
  assert.equal(envelope.versao, 1);
  assert.equal(Number.isNaN(Date.parse(envelope.salvoEm)), false);
});

test("salvarPerfil grava apenas os campos do contrato (nada sensível)", () => {
  const { Persistencia, armazenamento } = carregarModulo();

  Persistencia.salvarPerfil({
    nivelPersonagem: 3,
    origem: null,
    nosComprados: ["altar-nv1"],
    senha: "super-secreta",
    token: "abc123",
    email: "jogador@example.com",
  });

  const envelope = lerEnvelope(armazenamento, CHAVE_PERFIL);
  assert.deepEqual(Object.keys(envelope.dados).sort(), ["nivelPersonagem", "nosComprados", "origem"]);
  assert.equal(envelope.dados.nivelPersonagem, 3);
});

test("salva e lê os atributos em round-trip", () => {
  const { Persistencia } = carregarModulo();
  const estado = {
    valores: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 13 },
    racaId: "anao",
    subracaId: "colina",
    flex: [],
  };

  assert.equal(Persistencia.salvarAtributos(estado), true);
  assert.deepEqual(plano(Persistencia.lerAtributos()), estado);
});

test("salvarAtributos grava só os atributos conhecidos (lista fechada)", () => {
  const { Persistencia, armazenamento } = carregarModulo();

  Persistencia.salvarAtributos({
    valores: { str: 10, dex: 11, hacker: 12, senha: 123 },
    racaId: "humano",
    subracaId: null,
    flex: [],
  });

  let dados = JSON.parse(armazenamento.getItem(CHAVE_ATRIBUTOS)).dados;
  assert.deepEqual(Object.keys(dados.valores), ["str", "dex"]);

  // A página pode passar a própria lista (fonte: ATRIBUTOS em js/atributos.js).
  Persistencia.salvarAtributos({ valores: { str: 10, dex: 11, hacker: 12 } }, ["dex"]);
  dados = JSON.parse(armazenamento.getItem(CHAVE_ATRIBUTOS)).dados;
  assert.deepEqual(Object.keys(dados.valores), ["dex"]);
});

test("remove o perfil e os atributos separadamente", () => {
  const { Persistencia, armazenamento } = carregarModulo();

  Persistencia.salvarPerfil({ nivelPersonagem: 2, origem: null, nosComprados: [] });
  Persistencia.salvarAtributos({ valores: {}, racaId: "humano", subracaId: null, flex: [] });

  assert.equal(Persistencia.removerPerfil(), true);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
  assert.notEqual(armazenamento.getItem(CHAVE_ATRIBUTOS), null);

  assert.equal(Persistencia.removerAtributos(), true);
  assert.equal(armazenamento.getItem(CHAVE_ATRIBUTOS), null);
});

test("limparTudo apaga só as chaves do projeto", () => {
  const { Persistencia, armazenamento } = carregarModulo({
    armazenamento: criarArmazenamento({ "outro-app:preferencias": "x" }),
  });

  Persistencia.salvarPerfil({ nivelPersonagem: 1, origem: null, nosComprados: [] });
  Persistencia.salvarAtributos({ valores: {}, racaId: "humano", subracaId: null, flex: [] });

  assert.equal(Persistencia.limparTudo(), true);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
  assert.equal(armazenamento.getItem(CHAVE_ATRIBUTOS), null);
  assert.equal(armazenamento.getItem("outro-app:preferencias"), "x");
});

test("o progresso continua disponível em uma nova 'carga da página'", () => {
  const armazenamento = criarArmazenamento();
  const primeiraVisita = carregarModulo({ armazenamento });

  primeiraVisita.Persistencia.salvarPerfil({
    nivelPersonagem: 12,
    origem: "estrada-nv1",
    nosComprados: ["estrada-nv1", "estrada-nv2"],
  });

  // Simula recarregar a página: mesmo localStorage, novo contexto/script.
  const segundaVisita = carregarModulo({ armazenamento });
  assert.deepEqual(plano(segundaVisita.Persistencia.lerPerfil()), {
    nivelPersonagem: 12,
    origem: "estrada-nv1",
    nosComprados: ["estrada-nv1", "estrada-nv2"],
  });
});

// ===================================================================
// DADOS CORROMPIDOS / VERSÕES
// ===================================================================
test("registro com JSON inválido é descartado sem quebrar a página", () => {
  const armazenamento = criarArmazenamento({ [CHAVE_PERFIL]: "{isso não é json" });
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
});

test("registro com raiz que não é objeto é descartado", () => {
  const armazenamento = criarArmazenamento({
    [CHAVE_PERFIL]: JSON.stringify([1, 2, 3]),
  });
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
});

test("versão de esquema desconhecida é preservada, protegida e não é sobrescrita", () => {
  const futuro = JSON.stringify({ versao: 99, salvoEm: "2030-01-01T00:00:00.000Z", dados: { x: 1 } });
  const armazenamento = criarArmazenamento({ [CHAVE_PERFIL]: futuro });
  const { Persistencia, avisos } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), futuro);
  assert.equal(Persistencia.estaBloqueada(CHAVE_PERFIL), true);
  assert.ok(avisos.some((aviso) => aviso.tipo === "info"));

  // A gravação desta versão do site não pode destruir dados mais novos.
  assert.equal(Persistencia.salvarPerfil({ nivelPersonagem: 2, origem: null, nosComprados: [] }), false);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), futuro);

  // O bloqueio é por chave: a calculadora continua livre.
  assert.equal(Persistencia.estaBloqueada(CHAVE_ATRIBUTOS), false);
  assert.equal(
    Persistencia.salvarAtributos({ valores: {}, racaId: "humano", subracaId: null, flex: [] }),
    true
  );
});

test("registro de esquema antigo, ausente ou inválido é descartado e permite gravar", () => {
  const casos = [0, -1, "1", null, undefined];
  casos.forEach((versao) => {
    const envelope = { salvoEm: "2020-01-01T00:00:00.000Z", dados: { nivelPersonagem: 3 } };
    if (versao !== undefined) envelope.versao = versao;
    const armazenamento = criarArmazenamento({ [CHAVE_PERFIL]: JSON.stringify(envelope) });
    const { Persistencia } = carregarModulo({ armazenamento });

    assert.equal(Persistencia.lerPerfil(), null, `versão ${String(versao)}`);
    assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
    assert.equal(Persistencia.estaBloqueada(CHAVE_PERFIL), false);
    assert.equal(
      Persistencia.salvarPerfil({ nivelPersonagem: 1, origem: null, nosComprados: [] }),
      true
    );
  });
});

test("registro de esquema antigo avisa a página com mensagem amigável", () => {
  const envelope = JSON.stringify({
    versao: 0,
    salvoEm: "2020-01-01T00:00:00.000Z",
    dados: { nivelPersonagem: 3 },
  });
  const armazenamento = criarArmazenamento({ [CHAVE_PERFIL]: envelope });
  const { Persistencia } = carregarModulo({ armazenamento });

  const mensagens = [];
  Persistencia.aoFalhar((mensagem) => mensagens.push(mensagem));

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0], Persistencia.MENSAGENS.falhaAoRestaurar);
});

test("remover ou limpar a chave bloqueada libera as gravações novamente", () => {
  const futuro = JSON.stringify({ versao: 99, salvoEm: "2030-01-01T00:00:00.000Z", dados: {} });
  const armazenamento = criarArmazenamento({
    [CHAVE_PERFIL]: futuro,
    [CHAVE_ATRIBUTOS]: futuro,
  });
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(Persistencia.lerAtributos(), null);
  assert.equal(Persistencia.estaBloqueada(CHAVE_PERFIL), true);
  assert.equal(Persistencia.estaBloqueada(CHAVE_ATRIBUTOS), true);

  // remover só uma chave libera só ela
  assert.equal(Persistencia.removerPerfil(), true);
  assert.equal(Persistencia.estaBloqueada(CHAVE_PERFIL), false);
  assert.equal(Persistencia.estaBloqueada(CHAVE_ATRIBUTOS), true);
  assert.equal(Persistencia.salvarPerfil({ nivelPersonagem: 1, origem: null, nosComprados: [] }), true);

  // limparTudo libera todas
  assert.equal(Persistencia.limparTudo(), true);
  assert.equal(Persistencia.estaBloqueada(CHAVE_ATRIBUTOS), false);
  assert.equal(
    Persistencia.salvarAtributos({ valores: {}, racaId: "humano", subracaId: null, flex: [] }),
    true
  );
});

test("envelope sem dados utilizáveis é descartado", () => {
  const armazenamento = criarArmazenamento({
    [CHAVE_PERFIL]: JSON.stringify({ versao: 1, salvoEm: "2026-01-01T00:00:00.000Z", dados: "texto" }),
  });
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
});

test("registro absurdamente grande é descartado", () => {
  const enorme = JSON.stringify({
    versao: 1,
    salvoEm: "2026-01-01T00:00:00.000Z",
    dados: { nivelPersonagem: 1, origem: null, nosComprados: ["x".repeat(70 * 1024)] },
  });
  const armazenamento = criarArmazenamento({ [CHAVE_PERFIL]: enorme });
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
});

test("gravação acima do limite é recusada", () => {
  const { Persistencia, armazenamento } = carregarModulo();
  const grande = Array.from({ length: 500 }, (_, i) => `${String(i).padStart(4, "0")}-${"x".repeat(200)}`);
  assert.equal(Persistencia.salvarPerfil({ nivelPersonagem: 1, origem: null, nosComprados: grande }), false);
  // A gravação falhou antes de tocar no armazenamento.
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), null);
});

// ===================================================================
// ARMAZENAMENTO INDISPONÍVEL / CHEIO
// ===================================================================
test("sem localStorage a página continua funcionando (sem exceções)", () => {
  const { Persistencia, avisos } = carregarModulo({ semLocalStorage: true });

  assert.equal(Persistencia.status().ok, false);
  assert.equal(Persistencia.disponivel(), false);
  assert.equal(Persistencia.salvarPerfil({ nivelPersonagem: 1, origem: null, nosComprados: [] }), false);
  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(Persistencia.removerPerfil(), false);
  assert.equal(Persistencia.limparTudo(), false);
  assert.ok(avisos.some((aviso) => aviso.tipo === "warn"));
});

test("falha de cota na gravação avisa a página e não lança erro", () => {
  const armazenamento = criarArmazenamento({}, { falharAoGravar: true });
  const { Persistencia } = carregarModulo({ armazenamento });

  let chamadas = 0;
  Persistencia.aoFalhar(() => {
    chamadas += 1;
  });

  assert.equal(Persistencia.salvarPerfil({ nivelPersonagem: 2, origem: null, nosComprados: [] }), false);
  assert.equal(chamadas, 1);
});

test("armazenamento cheio na sondagem aparece como sem espaço", () => {
  const armazenamento = criarArmazenamento({}, { falharSondagem: true });
  const { Persistencia } = carregarModulo({ armazenamento });

  const status = Persistencia.status();
  assert.equal(status.ok, true);
  assert.equal(status.semEspaco, true);
});

test("aoFalhar pode ser cancelado", () => {
  const armazenamento = criarArmazenamento({}, { falharAoGravar: true });
  const { Persistencia } = carregarModulo({ armazenamento });

  let chamadas = 0;
  const cancelar = Persistencia.aoFalhar(() => {
    chamadas += 1;
  });

  cancelar();
  Persistencia.salvarPerfil({ nivelPersonagem: 2, origem: null, nosComprados: [] });
  assert.equal(chamadas, 0);
});

test("falha de cota preserva o registro anterior (não perde o progresso)", () => {
  const antigo = JSON.stringify({
    versao: 1,
    salvoEm: "2026-01-01T00:00:00.000Z",
    dados: { nivelPersonagem: 5, origem: "altar-nv1", nosComprados: ["altar-nv1"] },
  });
  // Espaço suficiente para o registro antigo (e para a sondagem), mas não
  // para o novo perfil — nem depois de liberar a própria chave.
  const armazenamento = criarArmazenamentoComLimite(antigo.length + 256, {
    [CHAVE_PERFIL]: antigo,
  });
  const { Persistencia } = carregarModulo({ armazenamento });

  const comprados = Array.from({ length: 30 }, (_, indice) => `altar-nv${indice}`);
  assert.equal(
    Persistencia.salvarPerfil({ nivelPersonagem: 5, origem: null, nosComprados: comprados }),
    false
  );
  // O progresso anterior continua lá (o retry não pode apagar sem restaurar).
  assert.equal(armazenamento.getItem(CHAVE_PERFIL), antigo);
  assert.equal(Persistencia.estaBloqueada(CHAVE_PERFIL), false);
});

test("falha de cota transitória é recuperada liberando a própria chave", () => {
  const armazenamento = criarArmazenamentoCotaTransitoria();
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(
    Persistencia.salvarPerfil({ nivelPersonagem: 3, origem: null, nosComprados: ["altar-nv1"] }),
    true
  );
  assert.deepEqual(plano(Persistencia.lerPerfil()), {
    nivelPersonagem: 3,
    origem: null,
    nosComprados: ["altar-nv1"],
  });
});

test("cota do Firefox (NS_ERROR_DOM_QUOTA_REACHED) é reconhecida", () => {
  const armazenamento = criarArmazenamento({}, {
    falharSondagem: true,
    nomeDoErroDeCota: "NS_ERROR_DOM_QUOTA_REACHED",
  });
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.status().ok, true);
  assert.equal(Persistencia.status().semEspaco, true);
});

test("cota reconhecida pelo código do erro (22/1014)", () => {
  const dados = new Map();
  const armazenamento = {
    get length() {
      return dados.size;
    },
    key: (indice) => [...dados.keys()][indice] ?? null,
    getItem: (chave) => (dados.has(String(chave)) ? dados.get(String(chave)) : null),
    setItem(chave) {
      if (String(chave).endsWith("__teste__")) {
        const erro = new Error("cota estourada");
        erro.code = 1014;
        throw erro;
      }
      dados.set(String(chave), "x");
    },
    removeItem: (chave) => dados.delete(String(chave)),
  };
  const { Persistencia } = carregarModulo({ armazenamento });

  assert.equal(Persistencia.status().ok, true);
  assert.equal(Persistencia.status().semEspaco, true);
});

test("registro corrompido avisa a página com mensagem amigável", () => {
  const armazenamento = criarArmazenamento({ [CHAVE_PERFIL]: "{lixo" });
  const { Persistencia } = carregarModulo({ armazenamento });

  const mensagens = [];
  Persistencia.aoFalhar((mensagem) => mensagens.push(mensagem));

  assert.equal(Persistencia.lerPerfil(), null);
  assert.equal(mensagens.length, 1);
  assert.match(mensagens[0], /restaurado/);
});

// ===================================================================
// NORMALIZAÇÃO DO PERFIL
// ===================================================================
const CONTEXTO_PERFIL = {
  idsValidos: ["altar-nv1", "altar-nv2", "inter-reliquia-viva"],
  idsOrigem: ["altar-nv1"],
  maxNivel: 20,
};

test("normalizarPerfil mantém um perfil válido intacto", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarPerfil(
    {
      nivelPersonagem: 7,
      origem: "altar-nv1",
      nosComprados: ["altar-nv2", "altar-nv1", "inter-reliquia-viva"],
    },
    CONTEXTO_PERFIL
  );

  assert.deepEqual(plano(resultado), {
    nivelPersonagem: 7,
    origem: "altar-nv1",
    nosComprados: ["altar-nv2", "altar-nv1", "inter-reliquia-viva"],
    ajustes: [],
  });
});

test("normalizarPerfil descarta nós desconhecidos, deduplica e valida nível/origem", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarPerfil(
    {
      nivelPersonagem: 99,
      origem: "sumiu-nv1",
      nosComprados: ["altar-nv1", "altar-nv1", "fantasma-nv9", "altar-nv2", 42, null],
    },
    CONTEXTO_PERFIL
  );

  assert.deepEqual(plano(resultado), {
    nivelPersonagem: 1,
    origem: null,
    nosComprados: ["altar-nv1", "altar-nv2"],
    ajustes: [
      "Nó desconhecido ignorado: fantasma-nv9.",
      "Nível inválido (99); ajustado para 1.",
      "Trilha de Origem inválida ignorada: sumiu-nv1.",
    ],
  });
});

test("normalizarPerfil rejeita origem que não foi comprada", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarPerfil(
    { nivelPersonagem: 3, origem: "altar-nv1", nosComprados: ["altar-nv2"] },
    CONTEXTO_PERFIL
  );

  assert.equal(resultado.origem, null);
  assert.deepEqual(plano(resultado.nosComprados), ["altar-nv2"]);
  assert.equal(resultado.ajustes.length, 1);
});

test("normalizarPerfil devolve null para entrada que não é objeto", () => {
  const { Persistencia } = carregarModulo();
  assert.equal(Persistencia.normalizarPerfil(null, CONTEXTO_PERFIL), null);
  assert.equal(Persistencia.normalizarPerfil("texto", CONTEXTO_PERFIL), null);
  assert.equal(Persistencia.normalizarPerfil([], CONTEXTO_PERFIL), null);
});

// ===================================================================
// NORMALIZAÇÃO DOS ATRIBUTOS
// ===================================================================
test("normalizarAtributos mantém um estado válido intacto", () => {
  const { Persistencia } = carregarModulo();
  const estado = {
    valores: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 13 },
    racaId: "anao",
    subracaId: "colina",
    flex: [],
  };
  const resultado = Persistencia.normalizarAtributos(estado, CONTEXTO_ATRIBUTOS);

  assert.deepEqual(plano(resultado), { ...estado, ajustes: [] });
});

test("normalizarAtributos corrige valores, raça e sub-raça inválidos", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarAtributos(
    {
      valores: { str: 99, dex: 15.5, con: 8, int: 10, wis: 12, cha: 13 },
      racaId: "inexistente",
      subracaId: "inexistente",
      flex: [],
    },
    CONTEXTO_ATRIBUTOS
  );

  assert.deepEqual(plano(resultado.valores), {
    str: 8,
    dex: 8,
    con: 8,
    int: 10,
    wis: 12,
    cha: 13,
  });
  assert.equal(resultado.racaId, "humano");
  assert.equal(resultado.subracaId, null);
  assert.deepEqual(plano(resultado.flex), []);
  // dois ajustes: valores inválidos + raça inválida (a raça escolhida não tem sub-raça)
  assert.equal(resultado.ajustes.length, 2);
});

test("normalizarAtributos aplica a primeira sub-raça válida", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarAtributos(
    { valores: {}, racaId: "anao", subracaId: "inexistente", flex: [] },
    CONTEXTO_ATRIBUTOS
  );

  assert.equal(resultado.racaId, "anao");
  assert.equal(resultado.subracaId, "colina");
  assert.ok(resultado.ajustes.some((ajuste) => ajuste.includes("Sub-raça")));
});

test("normalizarAtributos normaliza os bônus flexíveis do Meio-Elfo", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarAtributos(
    { valores: {}, racaId: "meio-elfo", subracaId: null, flex: ["str", "str"] },
    CONTEXTO_ATRIBUTOS
  );

  assert.deepEqual(plano(resultado.flex), ["str", "dex"]);
  assert.ok(resultado.ajustes.some((ajuste) => ajuste.includes("flexíveis")));
});

test("normalizarAtributos nunca escolhe um flexível proibido", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarAtributos(
    { valores: {}, racaId: "meio-elfo", subracaId: null, flex: ["cha", "cha"] },
    CONTEXTO_ATRIBUTOS
  );

  assert.deepEqual(plano(resultado.flex), ["str", "dex"]);
});

test("normalizarAtributos zera bônus flexíveis de uma raça sem flexíveis", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarAtributos(
    { valores: {}, racaId: "anao", subracaId: "colina", flex: ["str", "dex"] },
    CONTEXTO_ATRIBUTOS
  );

  assert.deepEqual(plano(resultado.flex), []);
});

test("normalizarAtributos reinicia valores acima do orçamento", () => {
  const { Persistencia } = carregarModulo();
  const resultado = Persistencia.normalizarAtributos(
    {
      valores: { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 },
      racaId: "humano",
      subracaId: null,
      flex: [],
    },
    CONTEXTO_ATRIBUTOS
  );

  assert.deepEqual(plano(resultado.valores), {
    str: 8,
    dex: 8,
    con: 8,
    int: 8,
    wis: 8,
    cha: 8,
  });
  assert.ok(resultado.ajustes.some((ajuste) => ajuste.includes("orçamento")));
});

test("normalizarAtributos devolve null para entrada que não é objeto", () => {
  const { Persistencia } = carregarModulo();
  assert.equal(Persistencia.normalizarAtributos(null, CONTEXTO_ATRIBUTOS), null);
  assert.equal(Persistencia.normalizarAtributos("texto", CONTEXTO_ATRIBUTOS), null);
});
