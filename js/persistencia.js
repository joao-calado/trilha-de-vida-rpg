// ===================================================================
// TRILHAS DE VIDA · PERSISTÊNCIA LOCAL (localStorage)
// Salva o estado do jogo no navegador para que ele sobreviva a um
// recarregamento ou fechamento da aba (Issue #1).
//
// O que é salvo (nada sensível: sem senhas, tokens ou dados pessoais):
//   · perfil da trilha  → nível do personagem, Origem e nós comprados
//   · calculadora       → valores comprados, raça, sub-raça e flexíveis
//
// Este módulo NÃO toca no DOM: ele apenas lê/escreve o localStorage e
// devolve avisos. Cada página decide como mostrar esses avisos.
//
// Uso no navegador:
//   Persistencia.salvarPerfil({ nivelPersonagem, origem, nosComprados })
//   Persistencia.lerPerfil()
//   Persistencia.normalizarPerfil(dados, { idsValidos, idsOrigem, maxNivel })
// ===================================================================

(function (global) {
  "use strict";

  const PREFIXO = "trilhas-vida";
  const VERSAO_ESQUEMA = 1;
  // O projeto grava poucos bytes; 64 KiB é apenas uma proteção contra
  // payloads corrompidos ou escritos à mão no console.
  const TAMANHO_MAXIMO_BYTES = 64 * 1024;
  // Evita uma enxurrada de avisos quando a gravação falha a cada clique.
  const INTERVALO_ENTRE_AVISOS_MS = 5000;

  const CHAVES = Object.freeze({
    perfil: `${PREFIXO}:perfil`,
    atributos: `${PREFIXO}:atributos`,
    teste: `${PREFIXO}:__teste__`,
  });

  // Atributos do PHB usados pela calculadora (fonte: js/atributos.js).
  // Lista fechada para que nenhuma chave extra chegue ao localStorage.
  // A página passa a lista explicitamente; este padrão é só um fallback.
  const IDS_ATRIBUTOS_PADRAO = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

  const MENSAGENS = Object.freeze({
    indisponivel:
      "Não foi possível acessar o armazenamento local deste navegador; o progresso não será salvo.",
    falhaAoSalvar:
      "O progresso não pôde ser salvo neste navegador (armazenamento cheio ou bloqueado).",
    falhaAoRestaurar:
      "O progresso salvo não pôde ser restaurado; o site continua funcionando com os valores padrão.",
    falhaAoRemover:
      "Não foi possível apagar o progresso salvo deste navegador.",
    grandeDemais:
      "O progresso é grande demais para ser salvo neste navegador; os últimos dados não foram gravados.",
    versaoMaisNova:
      "Este navegador tem um progresso salvo por uma versão mais nova do site. Ele não será sobrescrito — atualize o site para voltar a salvar.",
  });

  // -----------------------------------------------------------------
  // ACESSO AO localStorage
  // -----------------------------------------------------------------
  let statusCache = null;
  let ouvintesFalha = [];
  let ultimoAvisoEm = 0;
  // Chaves com registro de versão de esquema desconhecida (provavelmente
  // gravado por uma versão mais nova do site). Não devem ser sobrescritas
  // por esta versão, para não destruir dados que não sabemos migrar.
  const chavesBloqueadas = new Set();

  function obterArmazenamento() {
    // Em alguns navegadores/modos (privado, cookies desativados) o simples
    // acesso a window.localStorage lança SecurityError.
    try {
      const armazenamento = global.localStorage;
      if (
        armazenamento &&
        typeof armazenamento.getItem === "function" &&
        typeof armazenamento.setItem === "function" &&
        typeof armazenamento.removeItem === "function"
      ) {
        return armazenamento;
      }
      return null;
    } catch (erro) {
      return null;
    }
  }

  // A cota pode estourar com nomes/códigos diferentes conforme o navegador
  // (Chrome: QuotaExceededError; Firefox: NS_ERROR_DOM_QUOTA_REACHED/1014).
  function ehErroDeCota(erro) {
    if (!erro) return false;
    return (
      erro.name === "QuotaExceededError" ||
      erro.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      erro.code === 22 ||
      erro.code === 1014
    );
  }

  function sondar() {
    const armazenamento = obterArmazenamento();
    if (!armazenamento) {
      return { ok: false, semEspaco: false };
    }

    let lido = null;
    try {
      armazenamento.setItem(CHAVES.teste, "1");
      lido = armazenamento.getItem(CHAVES.teste);
      return { ok: lido === "1", semEspaco: false };
    } catch (erro) {
      // Armazenamento cheio: dá para ler o que existe, mas escritas vão falhar.
      if (ehErroDeCota(erro)) {
        return { ok: true, semEspaco: true };
      }
      return { ok: false, semEspaco: false };
    } finally {
      try {
        armazenamento.removeItem(CHAVES.teste);
      } catch (erro) {
        // Chave de sondagem residual não tem impacto prático.
      }
    }
  }

  function status() {
    if (!statusCache) statusCache = sondar();
    return statusCache;
  }

  function disponivel() {
    return status().ok;
  }

  // Registro de esquema desconhecido (versão mais nova do site) na chave?
  function estaBloqueada(chave) {
    return chavesBloqueadas.has(chave);
  }

  // -----------------------------------------------------------------
  // AVISOS
  // -----------------------------------------------------------------
  function aoFalhar(callback) {
    if (typeof callback !== "function") return function () {};
    ouvintesFalha.push(callback);
    return function cancelar() {
      ouvintesFalha = ouvintesFalha.filter((ouvinte) => ouvinte !== callback);
    };
  }

  // `mensagem` é o texto amigável mostrado na página; `detalhe`, quando
  // existir, vai apenas para o console (ex.: nome do erro do navegador).
  function avisarFalha(mensagem, detalhe) {
    const linha = detalhe ? `${mensagem} (${detalhe})` : mensagem;
    console.warn(`[Persistência] ${linha}`);

    const agora = Date.now();
    if (agora - ultimoAvisoEm < INTERVALO_ENTRE_AVISOS_MS) return;
    ultimoAvisoEm = agora;

    ouvintesFalha.forEach((ouvinte) => {
      try {
        ouvinte(mensagem);
      } catch (erro) {
        console.error("[Persistência] Ouvinte de falha lançou erro:", erro);
      }
    });
  }

  // -----------------------------------------------------------------
  // ENVELOPE: { versao, salvoEm, dados }
  // -----------------------------------------------------------------
  function serializar(dados) {
    return JSON.stringify({
      versao: VERSAO_ESQUEMA,
      salvoEm: new Date().toISOString(),
      dados,
    });
  }

  function tamanhoEmBytes(texto) {
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(texto).length;
    }
    return texto.length * 2; // aproximação conservadora
  }

  function gravar(chave, dados) {
    if (chavesBloqueadas.has(chave)) {
      // O registro existente veio de uma versão mais nova: não sobrescreve.
      avisarFalha(MENSAGENS.versaoMaisNova, `chave ${chave} bloqueada`);
      return false;
    }

    if (!disponivel()) {
      // A indisponibilidade já é mostrada pela página; não repete o aviso.
      console.warn("[Persistência] Armazenamento local indisponível; gravação ignorada.");
      return false;
    }

    const armazenamento = obterArmazenamento();
    if (!armazenamento) return false;

    let texto;
    try {
      texto = serializar(dados);
    } catch (erro) {
      avisarFalha(MENSAGENS.falhaAoSalvar, "dados não convertíveis para JSON");
      return false;
    }

    if (tamanhoEmBytes(texto) > TAMANHO_MAXIMO_BYTES) {
      avisarFalha(MENSAGENS.grandeDemais, `${tamanhoEmBytes(texto)} bytes`);
      return false;
    }

    try {
      armazenamento.setItem(chave, texto);
      return true;
    } catch (erro) {
      if (!ehErroDeCota(erro)) {
        avisarFalha(MENSAGENS.falhaAoSalvar, erro && erro.name);
        return false;
      }

      // Cota estourada: tenta liberar apenas a própria chave e gravar de novo.
      // O registro antigo é preservado e restaurado se a nova gravação falhar,
      // para não perder o progresso anterior à toa.
      let anterior = null;
      try {
        anterior = armazenamento.getItem(chave);
      } catch (erroLeitura) {
        anterior = null;
      }

      try {
        armazenamento.removeItem(chave);
        armazenamento.setItem(chave, texto);
        return true;
      } catch (erroFinal) {
        if (anterior !== null) {
          try {
            armazenamento.setItem(chave, anterior);
          } catch (erroRestauro) {
            console.error("[Persistência] Registro anterior não pôde ser restaurado após falha de cota.");
          }
        }
        avisarFalha(MENSAGENS.falhaAoSalvar, erroFinal && erroFinal.name);
        return false;
      }
    }
  }

  function ler(chave) {
    if (!disponivel()) return null;

    const armazenamento = obterArmazenamento();
    if (!armazenamento) return null;

    let texto;
    try {
      texto = armazenamento.getItem(chave);
    } catch (erro) {
      avisarFalha(MENSAGENS.falhaAoRestaurar, erro && erro.name);
      return null;
    }

    if (texto === null || texto === undefined) return null;

    if (tamanhoEmBytes(texto) > TAMANHO_MAXIMO_BYTES) {
      avisarFalha(MENSAGENS.falhaAoRestaurar, "registro maior que o tamanho máximo");
      remover(chave);
      return null;
    }

    let envelope;
    try {
      envelope = JSON.parse(texto);
    } catch (erro) {
      avisarFalha(MENSAGENS.falhaAoRestaurar, "JSON inválido");
      remover(chave);
      return null;
    }

    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      avisarFalha(MENSAGENS.falhaAoRestaurar, "registro não é um objeto");
      remover(chave);
      return null;
    }

    const versao = envelope.versao;
    if (versao !== VERSAO_ESQUEMA) {
      if (Number.isInteger(versao) && versao > VERSAO_ESQUEMA) {
        // Gravado por uma versão mais nova do site. Preserva o registro e
        // bloqueia gravações nesta chave, para não sobrescrever dados que
        // esta versão não sabe migrar.
        chavesBloqueadas.add(chave);
        console.info(
          `[Persistência] Registro com versão ${versao} não é desta versão do site; preservado e protegido contra sobrescrita.`
        );
        return null;
      }
      // Esquema antigo, ausente ou inválido: não há como migrar com segurança.
      avisarFalha(MENSAGENS.falhaAoRestaurar, `registro com versão ${String(versao)}`);
      remover(chave);
      return null;
    }

    const dados = envelope.dados;
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
      avisarFalha(MENSAGENS.falhaAoRestaurar, "registro sem dados utilizáveis");
      remover(chave);
      return null;
    }

    return dados;
  }

  function remover(chave) {
    if (!disponivel()) return false;
    const armazenamento = obterArmazenamento();
    if (!armazenamento) return false;
    try {
      armazenamento.removeItem(chave);
      chavesBloqueadas.delete(chave);
      return true;
    } catch (erro) {
      avisarFalha(MENSAGENS.falhaAoRemover, erro && erro.name);
      return false;
    }
  }

  // Remove todas as chaves do projeto (inclusive de versões anteriores),
  // sem tocar em outros sites do mesmo domínio.
  function limparTudo() {
    if (!disponivel()) return false;
    const armazenamento = obterArmazenamento();
    if (!armazenamento) return false;

    try {
      const alvo = `${PREFIXO}:`;
      const chaves = [];
      for (let i = 0; i < armazenamento.length; i += 1) {
        const chave = armazenamento.key(i);
        if (typeof chave === "string" && chave.indexOf(alvo) === 0) chaves.push(chave);
      }
      chaves.forEach((chave) => armazenamento.removeItem(chave));
      chavesBloqueadas.clear();
      return true;
    } catch (erro) {
      avisarFalha(MENSAGENS.falhaAoRemover, erro && erro.name);
      return false;
    }
  }

  // -----------------------------------------------------------------
  // PERFIL DA TRILHA (index.html)
  // Só estes campos são gravados: é uma lista fechada, para garantir que
  // nenhum dado extra (ou sensível) chegue ao localStorage.
  // -----------------------------------------------------------------
  function salvarPerfil(dados) {
    if (!dados || typeof dados !== "object") return false;
    return gravar(CHAVES.perfil, {
      nivelPersonagem: Number.isInteger(dados.nivelPersonagem) ? dados.nivelPersonagem : 1,
      origem: typeof dados.origem === "string" ? dados.origem : null,
      nosComprados: Array.isArray(dados.nosComprados)
        ? dados.nosComprados.filter((id) => typeof id === "string")
        : [],
    });
  }

  function lerPerfil() {
    return ler(CHAVES.perfil);
  }

  function removerPerfil() {
    return remover(CHAVES.perfil);
  }

  // -----------------------------------------------------------------
  // CALCULADORA DE ATRIBUTOS (atributos.html)
  // -----------------------------------------------------------------
  function salvarAtributos(dados, idsAtributos) {
    if (!dados || typeof dados !== "object") return false;

    const ids =
      Array.isArray(idsAtributos) && idsAtributos.length ? idsAtributos : IDS_ATRIBUTOS_PADRAO;
    const valores = {};
    if (dados.valores && typeof dados.valores === "object" && !Array.isArray(dados.valores)) {
      ids.forEach((id) => {
        if (Number.isInteger(dados.valores[id])) valores[id] = dados.valores[id];
      });
    }

    return gravar(CHAVES.atributos, {
      valores,
      racaId: typeof dados.racaId === "string" ? dados.racaId : null,
      subracaId: typeof dados.subracaId === "string" ? dados.subracaId : null,
      flex: Array.isArray(dados.flex) ? dados.flex.filter((id) => typeof id === "string") : [],
    });
  }

  function lerAtributos() {
    return ler(CHAVES.atributos);
  }

  function removerAtributos() {
    return remover(CHAVES.atributos);
  }

  // -----------------------------------------------------------------
  // NORMALIZAÇÃO DOS DADOS SALVOS
  // Funções puras (não leem nem gravam nada) usadas ao restaurar o estado.
  // Nunca confiam no conteúdo do localStorage: ele pode estar corrompido,
  // ter sido editado no console ou pertencer a uma versão anterior do site.
  // -----------------------------------------------------------------
  function paraLista(valor) {
    return Array.isArray(valor) ? valor : [];
  }

  function paraSet(valor) {
    if (Array.isArray(valor)) return new Set(valor);
    if (valor && typeof valor === "object" && typeof valor.has === "function") return valor;
    return new Set();
  }

  function normalizarPerfil(salvo, contexto) {
    if (!salvo || typeof salvo !== "object" || Array.isArray(salvo)) return null;

    const ctx = contexto || {};
    const idsValidos = paraSet(ctx.idsValidos);
    const idsOrigem = paraSet(ctx.idsOrigem);
    const maxNivel =
      Number.isInteger(ctx.maxNivel) && ctx.maxNivel > 0 ? ctx.maxNivel : 20;

    const ajustes = [];
    const nosComprados = [];
    const vistos = new Set();

    if (!Array.isArray(salvo.nosComprados)) {
      if (salvo.nosComprados !== undefined) {
        ajustes.push("Lista de nós comprados inválida; o perfil começa vazio.");
      }
    }

    paraLista(salvo.nosComprados).forEach((item) => {
      const id =
        typeof item === "string"
          ? item
          : item && typeof item === "object" && typeof item.id === "string"
            ? item.id
            : null;

      if (!id) return;
      if (!idsValidos.has(id)) {
        ajustes.push(`Nó desconhecido ignorado: ${id}.`);
        return;
      }
      if (vistos.has(id)) return;
      vistos.add(id);
      nosComprados.push(id);
    });

    let nivelPersonagem = 1;
    if (
      Number.isInteger(salvo.nivelPersonagem) &&
      salvo.nivelPersonagem >= 1 &&
      salvo.nivelPersonagem <= maxNivel
    ) {
      nivelPersonagem = salvo.nivelPersonagem;
    } else if (salvo.nivelPersonagem !== undefined) {
      ajustes.push(`Nível inválido (${String(salvo.nivelPersonagem)}); ajustado para 1.`);
    }

    let origem = null;
    if (typeof salvo.origem === "string") {
      if (idsOrigem.has(salvo.origem) && vistos.has(salvo.origem)) {
        origem = salvo.origem;
      } else {
        ajustes.push(`Trilha de Origem inválida ignorada: ${salvo.origem}.`);
      }
    } else if (salvo.origem !== undefined && salvo.origem !== null) {
      ajustes.push("Trilha de Origem inválida ignorada.");
    }

    return { nivelPersonagem, origem, nosComprados, ajustes };
  }

  function normalizarAtributos(salvo, contexto) {
    if (!salvo || typeof salvo !== "object" || Array.isArray(salvo)) return null;

    const ctx = contexto || {};
    const ids = Array.isArray(ctx.idsAtributos) ? ctx.idsAtributos : [];
    const minimo = Number.isInteger(ctx.minimo) ? ctx.minimo : 8;
    const maximo = Number.isInteger(ctx.maximo) ? ctx.maximo : 15;
    const orcamento = Number.isFinite(ctx.orcamento) ? ctx.orcamento : 27;
    const custoDe = typeof ctx.custoDe === "function" ? ctx.custoDe : function () { return 0; };
    const racas = Array.isArray(ctx.racas) ? ctx.racas : [];

    const ajustes = [];

    // Valores comprados
    const valores = {};
    let valoresInvalidos = false;
    ids.forEach((id) => {
      const bruto = salvo.valores && typeof salvo.valores === "object" ? salvo.valores[id] : undefined;
      if (Number.isInteger(bruto) && bruto >= minimo && bruto <= maximo) {
        valores[id] = bruto;
      } else {
        valores[id] = minimo;
        if (bruto !== undefined) valoresInvalidos = true;
      }
    });
    if (valoresInvalidos) ajustes.push("Valores de atributo inválidos ajustados.");

    // Raça
    const idsRacas = racas.map((raca) => raca && raca.id).filter(Boolean);
    let racaId = null;
    if (typeof salvo.racaId === "string" && idsRacas.indexOf(salvo.racaId) !== -1) {
      racaId = salvo.racaId;
    } else if (idsRacas.length) {
      racaId = idsRacas[0];
      if (salvo.racaId !== undefined && salvo.racaId !== null) {
        ajustes.push("Raça inválida; usando a primeira da lista.");
      }
    }
    const raca = racas.find((item) => item && item.id === racaId) || null;

    // Sub-raça
    let subracaId = null;
    const subracas = raca && Array.isArray(raca.subracas) ? raca.subracas : [];
    if (subracas.length) {
      if (typeof salvo.subracaId === "string" && subracas.indexOf(salvo.subracaId) !== -1) {
        subracaId = salvo.subracaId;
      } else {
        subracaId = subracas[0];
        if (salvo.subracaId !== undefined && salvo.subracaId !== null) {
          ajustes.push("Sub-raça inválida; usando a primeira da raça.");
        }
      }
    }

    // Bônus flexíveis (ex.: Meio-Elfo: dois +1 distintos, exceto Carisma)
    const flexiveis = raca && Number.isInteger(raca.flexiveis) ? raca.flexiveis : 0;
    const proibidos = raca && Array.isArray(raca.flexProibidos) ? raca.flexProibidos : [];
    const candidatos = ids.filter((id) => proibidos.indexOf(id) === -1);

    let flex = [];
    if (flexiveis > 0) {
      const entrada = Array.isArray(salvo.flex) ? salvo.flex : [];
      const usados = new Set();
      let houveAjuste = false;

      for (let i = 0; i < flexiveis; i += 1) {
        let escolha = entrada[i];
        if (typeof escolha !== "string" || candidatos.indexOf(escolha) === -1 || usados.has(escolha)) {
          escolha = null;
        }
        if (!escolha) {
          escolha = candidatos.find((id) => !usados.has(id)) || null;
          houveAjuste = true;
        }
        if (!escolha) break;
        usados.add(escolha);
        flex.push(escolha);
      }

      if (houveAjuste) ajustes.push("Bônus flexíveis normalizados.");
    }

    // Orçamento de pontos (se o registro foi editado à mão, volta ao padrão)
    const gasto = ids.reduce((total, id) => total + (custoDe(valores[id]) || 0), 0);
    if (gasto > orcamento) {
      ids.forEach((id) => {
        valores[id] = minimo;
      });
      ajustes.push("Pontos acima do orçamento; valores reiniciados.");
    }

    return { valores, racaId, subracaId, flex, ajustes };
  }

  // -----------------------------------------------------------------
  // API PÚBLICA
  // -----------------------------------------------------------------
  global.Persistencia = Object.freeze({
    VERSAO_ESQUEMA,
    CHAVES,
    MENSAGENS,

    disponivel,
    status,
    aoFalhar,
    estaBloqueada,

    salvarPerfil,
    lerPerfil,
    removerPerfil,
    salvarAtributos,
    lerAtributos,
    removerAtributos,
    limparTudo,

    normalizarPerfil,
    normalizarAtributos,
  });
})(typeof window !== "undefined" ? window : globalThis);
