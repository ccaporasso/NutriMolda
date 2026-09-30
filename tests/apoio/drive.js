// Drive e Docs simulados para os testes de integração (não é dado real).
// Reproduz só o que o kit usa: copiar o modelo, trocar campos, exportar PDF na pasta, mandar para a lixeira,
// criar e atualizar o CSV. `falhas` liga erros à vontade para testar o que acontece quando o Google recusa.
const { linhasModeloRecibo } = require('../../src/Recibo.js');

function criarDriveSimulado({ idModelo = 'modelo123', idPasta = 'pasta123' } = {}) {
  const arquivos = new Map();
  const falhas = { copiar: false, exportarPdf: false, criarArquivo: false, abrirDocumento: false };
  let seq = 0;

  function novoArquivo(nome, extra = {}) {
    const a = { id: `arq${++seq}`, nome, lixeira: false, conteudo: '', tipo: '', texto: '', ...extra };
    a.getId = () => a.id;
    a.getName = () => a.nome;
    a.getUrl = () => `https://exemplo.invalid/${a.id}`;
    a.setTrashed = (v) => { a.lixeira = v; return a; };
    a.setContent = (c) => { a.conteudo = c; return a; };
    a.makeCopy = (n) => {
      if (falhas.copiar) throw new Error('Arquivo não encontrado: Ana S. tem diabetes');
      return novoArquivo(n, { texto: a.texto });
    };
    a.getAs = (tipo) => {
      if (falhas.exportarPdf) throw new Error('Falha ao exportar: Maria Souza Teste');
      const blob = { tipo, nome: a.nome, texto: a.texto, setName(n) { blob.nome = n; return blob; } };
      return blob;
    };
    arquivos.set(a.id, a);
    return a;
  }

  const modelo = novoArquivo('modelo', { texto: linhasModeloRecibo().join('\n') });
  arquivos.delete(modelo.id);
  modelo.id = idModelo;
  arquivos.set(idModelo, modelo);

  const pasta = {
    id: idPasta,
    getFilesByName: (nome) => {
      const achados = [...arquivos.values()].filter((a) => a.pasta === idPasta && !a.lixeira && a.nome === nome);
      let i = 0;
      return { hasNext: () => i < achados.length, next: () => achados[i++] };
    },
    // createFile(blob) para o PDF; createFile(nome, conteudo, tipo) para o CSV.
    createFile(a, conteudo, tipo) {
      if (falhas.criarArquivo) throw new Error('Sem espaço no Drive');
      const arquivo = typeof a === 'string'
        ? novoArquivo(a, { conteudo, tipo, pasta: idPasta })
        : novoArquivo(a.nome, { tipo: a.tipo, texto: a.texto, pasta: idPasta });
      return arquivo;
    },
  };

  const DriveApp = {
    getFileById: (id) => {
      if (!arquivos.has(id)) throw new Error('Arquivo não encontrado.');
      return arquivos.get(id);
    },
    getFolderById: (id) => {
      if (id !== idPasta) throw new Error('Pasta não encontrada.');
      return pasta;
    },
    createFolder: () => ({ getId: () => idPasta }),
  };
  const DocumentApp = {
    openById: (id) => {
      if (falhas.abrirDocumento) throw new Error('Documento indisponível');
      const arq = arquivos.get(id);
      const corpo = {
        replaceText(padrao, valor) { arq.texto = arq.texto.replace(new RegExp(padrao, 'g'), valor); return corpo; },
        getText: () => arq.texto,
      };
      return { getBody: () => corpo, getHeader: () => null, getFooter: () => null, saveAndClose() {} };
    },
  };
  const pdfsNaPasta = () => [...arquivos.values()].filter((a) => a.pasta === idPasta && a.nome.endsWith('.pdf') && !a.lixeira);
  const csvsNaPasta = () => [...arquivos.values()].filter((a) => a.pasta === idPasta && a.nome.endsWith('.csv'));
  return { DriveApp, DocumentApp, arquivos, falhas, pdfsNaPasta, csvsNaPasta };
}

module.exports = { criarDriveSimulado };
