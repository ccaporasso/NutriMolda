// Drive (serviço avançado v3) e Docs simulados para os testes de integração (não é dado real).
// Reproduz só o que o kit usa: copiar o modelo, trocar campos, exportar o PDF pelo Docs, gravar na pasta,
// mandar para a lixeira, criar e atualizar o CSV. `falhas` liga erros à vontade para testar o que acontece
// quando o Google recusa. O kit não pode usar DriveApp: ele nem existe neste simulador (ver DriveAvancado.js).
const { linhasModeloRecibo } = require('../../src/Recibo.js');

function criarDriveSimulado({ idModelo = 'modelo123', idPasta = 'pasta123' } = {}) {
  const arquivos = new Map();
  const falhas = { copiar: false, exportarPdf: false, criarArquivo: false, abrirDocumento: false };
  const chamadas = []; // "Drive.Files.copy", "Drive.Files.create"... para conferir o que o kit realmente chama
  let seq = 0;

  function novo(nome, extra = {}) {
    const a = { id: `arq${++seq}`, nome, lixeira: false, conteudo: '', tipo: '', texto: '', ...extra };
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
        if (falhas.copiar) throw new Error('Arquivo não encontrado: Ana S. tem diabetes');
        const origem = existente(id);
        return { id: novo(recurso.name, { texto: origem.texto, pasta: (recurso.parents || [])[0] }).id };
      },
      create(recurso, blob) {
        chamadas.push('Drive.Files.create');
        if (recurso.mimeType === 'application/vnd.google-apps.folder') return { id: novo(recurso.name, { ehPasta: true }).id };
        if (falhas.criarArquivo) throw new Error('Sem espaço no Drive');
        const pai = (recurso.parents || [])[0];
        if (!pai || !arquivos.get(pai) || !arquivos.get(pai).ehPasta) throw new Error('Pasta não encontrada.');
        const a = novo(recurso.name, { tipo: recurso.mimeType, pasta: pai, conteudo: blob.conteudo || '', texto: blob.texto || '' });
        return { id: a.id, webViewLink: `https://exemplo.invalid/${a.id}` };
      },
      list({ q }) {
        chamadas.push('Drive.Files.list');
        const m = /name = '([^']+)' and '([^']+)' in parents and trashed = false/.exec(q);
        if (!m) throw new Error('Consulta inválida.');
        return { files: [...arquivos.values()].filter((a) => a.pasta === m[2] && a.nome === m[1] && !a.lixeira).map((a) => ({ id: a.id })) };
      },
      update(recurso, id, blob) {
        chamadas.push('Drive.Files.update');
        const a = existente(id);
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
      const corpo = {
        replaceText(padrao, valor) { arq.texto = arq.texto.replace(new RegExp(padrao, 'g'), valor); return corpo; },
        getText: () => arq.texto,
      };
      return {
        getBody: () => corpo, getHeader: () => null, getFooter: () => null, saveAndClose() {},
        getAs: (tipo) => {
          if (falhas.exportarPdf) throw new Error('Falha ao exportar: Maria Souza Teste');
          const blob = { tipo, nome: arq.nome, texto: arq.texto, setName(n) { blob.nome = n; return blob; } };
          return blob;
        },
      };
    },
    create: (nome) => {
      const arq = novo(nome);
      return { getBody: () => ({ clear() {}, appendParagraph(t) { arq.texto += `${t}\n`; } }), saveAndClose() {}, getId: () => arq.id };
    },
  };
  const pdfsNaPasta = () => [...arquivos.values()].filter((a) => a.pasta === idPasta && a.nome.endsWith('.pdf') && !a.lixeira);
  const csvsNaPasta = () => [...arquivos.values()].filter((a) => a.pasta === idPasta && a.nome.endsWith('.csv'));
  return { Drive, DocumentApp, arquivos, falhas, chamadas, pdfsNaPasta, csvsNaPasta };
}

module.exports = { criarDriveSimulado };
