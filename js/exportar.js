// ===================================================================
// TRILHAS DE VIDA · EXPORTAÇÃO DE ARQUIVOS
// Helpers puros e sem estado, compartilhados pelas páginas que
// baixam arquivos (PNG dos atributos, JSON do perfil, ...).
//
// Este módulo NÃO conhece o estado do jogo: só cria os Blobs/URLs de
// download (com um <a> temporário), formata nomes/datas e escapa XML.
//
// Uso no navegador:
//   Exportar.baixarArquivo("sistema.png", blob)
//   Exportar.dataLocalISO()        // "2026-11-01" (dia local)
//   Exportar.slugArquivo("Anão da Colina") // "anao-da-colina"
//   Exportar.escaparXML("<texto & texto>")
// ===================================================================

(function (global) {
  "use strict";

  // Tempo de vida da URL do Blob. Revogar no mesmo tick do clique pode
  // cancelar o download em alguns navegadores, então a limpeza é adiada.
  const ATRASO_REVOGAR_MS = 10000;

  const documentRef = global.document;

  // -----------------------------------------------------------------
  // DOWNLOAD
  // -----------------------------------------------------------------
  function baixarArquivo(nome, blob) {
    if (!blob) throw new Error("baixarArquivo precisa de um Blob.");

    const url = global.URL.createObjectURL(blob);
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = String(nome);
    link.rel = "noopener";
    link.style.display = "none";

    documentRef.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      // Revogação diferida para não interromper o download em andamento.
      global.setTimeout(() => global.URL.revokeObjectURL(url), ATRASO_REVOGAR_MS);
    }
  }

  // -----------------------------------------------------------------
  // DATAS E NOMES DE ARQUIVO
  // -----------------------------------------------------------------
  // "2026-11-01" no fuso LOCAL. Não usar toISOString(): em
  // America/Sao_Paulo (UTC−3) a noite já pertence ao dia seguinte em UTC,
  // e o arquivo sairia com a data errada.
  function dataLocalISO(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  // Slug seguro para nome de arquivo: sem acentos, minúsculo e separado
  // por hífens. Devolve "" quando não sobra nenhum caractere utilizável;
  // quem chama decide o fallback.
  function slugArquivo(texto) {
    return String(texto == null ? "" : texto)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // -----------------------------------------------------------------
  // XML (SVG)
  // -----------------------------------------------------------------
  // Escapa texto que será interpolado em XML/SVG. O "&" precisa vir
  // primeiro para não escapar os "&" das entidades geradas depois.
  function escaparXML(valor) {
    return String(valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // -----------------------------------------------------------------
  // API PÚBLICA
  // -----------------------------------------------------------------
  global.Exportar = {
    baixarArquivo,
    dataLocalISO,
    slugArquivo,
    escaparXML,
  };
})(typeof window !== "undefined" ? window : globalThis);
