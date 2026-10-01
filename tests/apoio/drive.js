// Drive (serviço avançado v3) e Docs simulados para os testes de integração (não é dado real).
// Reproduz só o que o kit usa: copiar o modelo, trocar campos, exportar o PDF pelo Docs, gravar na pasta,
// mandar para a lixeira, criar e atualizar o CSV. `falhas` liga erros à vontade para testar o que acontece
// quando o Google recusa. A criação pelo Docs não dá acesso automático ao Drive simulado com drive.file:
// esse limite reproduz a falha observada no Google, mas não substitui validar a correção lá.
// O kit não pode usar DriveApp: ele nem existe neste simulador (ver DriveAvancado.js).
const { linhasModeloRecibo } = require('../../src/Recibo.js');

function criarDriveSimulado({ idModelo = 'modelo123', idPasta = 'pasta123' } = {}) {
  const arquivos = new Map();
  const falhas = {
    copiar: false, exportarPdf: false, criarArquivo: false, abrirDocumento: false,
    trocarCampo: false, salvarDocumento: false, lixeira: false,
    // O Drive CRIA o PDF e a resposta se perde (a chamada lança erro depois de o arquivo existir): a janela do achado do recibo.
    criarArquivoRespostaPerdida: false,
    criarPapel: false, // criar modelo ou pasta (menu) recusado
  };
  const chamadas = []; // "Drive.Files.copy", "Drive.Files.create"... para conferir o que o kit realmente chama
  let seq = 0;

  function novo(nome, extra = {}) {
    const a = { id: `arq${String(++seq).padStart(5, '0')}`, nome, lixeira: false, conteudo: '', tipo: '', texto: '', acessoDrive: true, ...extra };
    arquivos.set(a.id, a);
    return a;
  }
  const modelo = novo('modelo', { texto: linhasModeloRecibo().join('\n') });
  arquivos.delete(modelo.id);
  modelo.id = idModelo;
  arquivos.set(idModelo, modelo);
  arquivos.set(idPasta, { id: idPasta, nome: 'pasta', ehPasta: true });

  const existente = (id) => {
    if (!arquivos.has(id)) throw new Error('Arquivo não encontrado.');
    return arquivos.get(id);
  };

  const Drive = {
    Files: {
      copy(recurso, id) {
        chamadas.push('Drive.Files.copy');
        if (falhas.copiar) throw new Error('Arquivo não encontrado: EXCECAO_FICTICIA_COPIA_001');
        const origem = existente(id);
        if (!origem.acessoDrive) throw new Error('Arquivo não encontrado.');
        return { id: novo(recurso.name, { texto: origem.texto, cabecalho: origem.cabecalho, rodape: origem.rodape, pasta: (recurso.parents || [])[0] }).id };
      },
      create(recurso, blob) {
        chamadas.push('Drive.Files.create');
        const props = { appProperties: { ...(recurso.appProperties || {}) } };
        const ehPapel = recurso.mimeType === 'application/vnd.google-apps.folder' || recurso.mimeType === 'application/vnd.google-apps.document';
        if (ehPapel && falhas.criarPapel) throw new Error('Falha ao criar: EXCECAO_FICTICIA_PAPEL_001');
        if (recurso.mimeType === 'application/vnd.google-apps.folder') return { id: novo(recurso.name, { ehPasta: true, ...props }).id };
        if (recurso.mimeType === 'application/vnd.google-apps.document') return { id: novo(recurso.name, { tipo: recurso.mimeType, ...props }).id };
        if (falhas.criarArquivo) throw new Error('Sem espaço no Drive');
        const pai = (recurso.parents || [])[0];
        if (!pai || !arquivos.get(pai) || !arquivos.get(pai).ehPasta) throw new Error('Pasta não encontrada.');
        const a = novo(recurso.name, { tipo: recurso.mimeType, pasta: pai, conteudo: blob.conteudo || '', texto: blob.texto || '', appProperties: { ...(recurso.appProperties || {}) } });
        if (falhas.criarArquivoRespostaPerdida) throw new Error('Tempo esgotado: EXCECAO_FICTICIA_RESPOSTA_PERDIDA_001');
        return { id: a.id, webViewLink: `https://exemplo.invalid/${a.id}` };
      },
      // Entende só as formas de consulta que o kit monta: pasta, lixeira, nome exato e/ou propriedade (nome OU propriedade).
      list({ q }) {
        chamadas.push('Drive.Files.list');
        const pasta = /'([^']+)' in parents/.exec(q);
        const nome = /name = '([^']+)'/.exec(q);
        const prop = /appProperties has \{ key='([^']+)' and value='([^']+)' \}/.exec(q);
        if (!/trashed = false/.test(q) || (!pasta && !prop)) throw new Error('Consulta inválida.');
        const bate = (a) => {
          const porNome = nome && a.nome === nome[1];
          const porProp = prop && a.appProperties && a.appProperties[prop[1]] === prop[2];
          return nome || prop ? Boolean(porNome || porProp) : true;
        };
        const achados = [...arquivos.values()].filter((a) => (!pasta || a.pasta === pasta[1]) && !a.lixeira && bate(a));
        return { files: achados.map((a) => ({ id: a.id, name: a.nome, appProperties: a.appProperties || {}, webViewLink: `https://exemplo.invalid/${a.id}` })) };
      },
      update(recurso, id, blob) {
        chamadas.push('Drive.Files.update');
        const a = existente(id);
        if (recurso && recurso.trashed && falhas.lixeira) throw new Error('Lixeira indisponível: EXCECAO_FICTICIA_LIXEIRA_001');
        if (recurso && recurso.trashed) a.lixeira = true;
        if (blob) a.conteudo = blob.conteudo;
        return { id };
      },
    },
  };

  const DocumentApp = {
    openById: (id) => {
      if (falhas.abrirDocumento) throw new Error('Documento indisponível');
      const arq = existente(id);
      // Como o Docs: findText acha o campo; deleteText/insertText mexem no texto de forma literal (M2).
      // replaceText trata o texto novo como troca por expressão regular ("$" especial): o kit não pode usá-lo.
      const textoDoArquivo = {
        deleteText(ini, fim) { if (falhas.trocarCampo) throw new Error('Falha ao editar: EXCECAO_FICTICIA_CAMPO_001'); arq.texto = arq.texto.slice(0, ini) + arq.texto.slice(fim + 1); return textoDoArquivo; },
        insertText(ini, t) { arq.texto = arq.texto.slice(0, ini) + t + arq.texto.slice(ini); return textoDoArquivo; },
      };
      const corpo = {
        clear() { arq.texto = ''; },
        appendParagraph(t) { arq.texto += `${t}\n`; },
        replaceText() { throw new Error('replaceText não deve ser usado: o valor "R$" viraria referência de grupo.'); },
        findText(padrao) {
          const m = new RegExp(padrao).exec(arq.texto);
          if (!m) return null;
          return { getElement: () => ({ asText: () => textoDoArquivo }), getStartOffset: () => m.index, getEndOffsetInclusive: () => m.index + m[0].length - 1 };
        },
        getText: () => arq.texto,
      };
      // Cabeçalho e rodapé (opcionais): seção com texto próprio, no mesmo formato do corpo.
      const secaoExtra = (chave) => {
        if (arq[chave] === undefined) return null;
        const t = { deleteText(ini, fim) { arq[chave] = arq[chave].slice(0, ini) + arq[chave].slice(fim + 1); return t; }, insertText(ini, x) { arq[chave] = arq[chave].slice(0, ini) + x + arq[chave].slice(ini); return t; } };
        return {
          findText(padrao) {
            const m = new RegExp(padrao).exec(arq[chave]);
            if (!m) return null;
            return { getElement: () => ({ asText: () => t }), getStartOffset: () => m.index, getEndOffsetInclusive: () => m.index + m[0].length - 1 };
          },
          getText: () => arq[chave],
        };
      };
      return {
        getId: () => arq.id, getBody: () => corpo, getHeader: () => secaoExtra('cabecalho'), getFooter: () => secaoExtra('rodape'),
        saveAndClose() { if (falhas.salvarDocumento) throw new Error('Falha ao salvar: EXCECAO_FICTICIA_SALVAR_001'); },
        getAs: (tipo) => {
          if (falhas.exportarPdf) throw new Error('Falha ao exportar: EXCECAO_FICTICIA_PDF_001');
          const blob = { tipo, nome: arq.nome, texto: [arq.texto, arq.cabecalho, arq.rodape].filter((x) => x !== undefined).join('\n'), setName(n) { blob.nome = n; return blob; } };
          return blob;
        },
      };
    },
    create: (nome) => {
      chamadas.push('DocumentApp.create');
      const arq = novo(nome, { acessoDrive: false });
      return { getBody: () => ({ clear() {}, appendParagraph(t) { arq.texto += `${t}\n`; } }), saveAndClose() {}, getId: () => arq.id };
    },
  };
  const pdfsNaPasta = () => [...arquivos.values()].filter((a) => a.pasta === idPasta && a.nome.endsWith('.pdf') && !a.lixeira);
  const csvsNaPasta = () => [...arquivos.values()].filter((a) => a.pasta === idPasta && a.nome.endsWith('.csv'));
  return { Drive, DocumentApp, arquivos, falhas, chamadas, pdfsNaPasta, csvsNaPasta };
}

module.exports = { criarDriveSimulado };
