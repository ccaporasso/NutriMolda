// Google simulado em memória para os testes (não é dado real): planilha, Utilities, LockService, Calendar, Drive e Docs.
// Serve para rodar o código de src/ de verdade, do jeito que o Apps Script o carregaria (arquivos soltos, mesmo escopo).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..', '..', 'src');
const FIXO = Date.UTC(2026, 8, 30, 15, 0, 0); // 30/09/2026 12:00 em São Paulo

function criarAba(nome, cabecalho) {
  const linhas = [cabecalho.slice()];
  const aba = {
    nome, linhas, formatos: [],
    getName: () => nome,
    getLastRow: () => linhas.length,
    getLastColumn: () => linhas.reduce((m, l) => Math.max(m, l.length), 0),
    maxLinhas: 1000,
    getMaxRows: () => aba.maxLinhas,
    insertRowsAfter(depois, quantas) { aba.maxLinhas += quantas; },
    getMaxColumns: () => 26,
    setFrozenRows() {},
    appendRow(l) { linhas.push(l.slice()); },
    deleteRow(n) { linhas.splice(n - 1, 1); },
    getRange(linha, coluna, nl = 1, nc = 1) {
      const r = {
        getValues: () => Array.from({ length: nl }, (_, i) => Array.from({ length: nc },
          (__, j) => (linhas[linha - 1 + i] && linhas[linha - 1 + i][coluna - 1 + j] !== undefined ? linhas[linha - 1 + i][coluna - 1 + j] : ''))),
        setValues(v) {
          if (linha + nl - 1 > aba.maxLinhas) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
          v.forEach((l, i) => l.forEach((x, j) => {
            while (linhas.length < linha + i) linhas.push([]);
            linhas[linha - 1 + i][coluna - 1 + j] = x;
          }));
          return r;
        },
        setValue(x) { return r.setValues([[x]]); },
        setNumberFormat(f) { aba.formatos.push({ linha, coluna, f }); return r; },
        setFontWeight: () => r,
        setDataValidation: () => r,
        clearContent() { for (let i = 0; i < nl; i++) if (linhas[linha - 1 + i]) for (let j = 0; j < nc; j++) linhas[linha - 1 + i][coluna - 1 + j] = ''; return r; },
        clear() { return r.clearContent(); },
        protect: () => ({ setDescription() { return this; }, setWarningOnly() { return this; }, getDescription: () => '' }),
      };
      return r;
    },
    clear() { linhas.length = 0; return aba; },
    setName(n) { aba.nome = n; return aba; },
    activate() {}, getRangeList: () => ({}),
  };
  return aba;
}

function formatar(data, padrao) {
  const d = new Date(data.getTime() - 3 * 3600 * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  const t = { yyyy: d.getUTCFullYear(), MM: p2(d.getUTCMonth() + 1), dd: p2(d.getUTCDate()), HH: p2(d.getUTCHours()), mm: p2(d.getUTCMinutes()), ss: p2(d.getUTCSeconds()), M: d.getUTCMonth() + 1, d: d.getUTCDate() };
  return padrao.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, (k) => t[k]);
}

// opcoes: { abas: { Nome: cabecalho[] }, eventos: [], configuracoes: [[chave, valor]], selecao: { aba, linhas } }
function criarAmbiente(opcoes = {}) {
  const abas = new Map();
  const { ABAS } = require('../../src/Esquema.js');
  for (const a of ABAS) abas.set(a.nome, criarAba(a.nome, a.cabecalho));
  for (const [chave, valor] of opcoes.configuracoes || []) abas.get('Configurações').linhas.push([chave, valor]);

  const alertas = [];
  const emails = [];
  const arquivos = new Map(); // id -> { nome, tipo, conteudo, lixeira, pasta }
  let seq = 0;
  const ui = {
    alert: (...a) => { alertas.push(a.slice(0, 2).join(' | ')); return a[2] === 'YES_NO' ? (opcoes.negar ? 'NO' : 'YES') : 'OK'; },
    prompt: (...a) => { alertas.push(`PROMPT ${a[0]}`); return { getSelectedButton: () => 'OK', getResponseText: () => (opcoes.resposta || '') }; },
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
    Button: { OK: 'OK', YES: 'YES', NO: 'NO' },
    createMenu(nome) {
      const menu = { nome, itens: [] };
      const b = { addItem(t, f) { menu.itens.push([t, f]); return b; }, addSeparator() { menu.itens.push(['---']); return b; }, addSubMenu(s) { menu.itens.push(['>', s.nome, s.itens]); return b; }, addToUi() { ambiente.menu = menu; return b; }, nome, itens: menu.itens };
      return b;
    },
  };
  const selecao = opcoes.selecao || { aba: null, linhas: [] };
  const planilha = {
    fuso: opcoes.fuso || 'America/Sao_Paulo',
    getSpreadsheetTimeZone: () => planilha.fuso,
    setSpreadsheetTimeZone(f) { planilha.fuso = f; },
    getSheetByName: (n) => abas.get(n) || null,
    getActiveSheet: () => abas.get(selecao.aba),
    getActiveRangeList: () => ({ getRanges: () => selecao.linhas.map((l) => ({ getRow: () => l, getNumRows: () => 1 })) }),
    getActiveRange: () => ({ getRow: () => selecao.linhas[0], getNumRows: () => selecao.linhas.length }),
    insertSheet: (n) => { const a = criarAba(n, []); a.linhas.length = 0; abas.set(n, a); return a; },
    getSheets: () => [...abas.values()],
    deleteSheet: (a) => abas.delete(a.nome),
    setActiveSheet() {},
  };
  const propriedades = new Map();
  const apagados = new Set(); // ids de eventos apagados que a agenda ainda devolve como cancelados
  const relogio = { agora: FIXO };
  class DataFixa extends Date {
    constructor(...a) { if (a.length === 0) super(relogio.agora); else super(...a); }
    static now() { return relogio.agora; }
  }
  const contexto = {
    Date: DataFixa, console, Math, JSON, Object, Array, Set, Map, Number, String, Error, RegExp, Promise,
    Logger: { log: () => {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha, getUi: () => ui, ProtectionType: { RANGE: 'RANGE' }, newDataValidation: () => { const c = { requireValueInList: () => c, setAllowInvalid: () => c, build: () => ({}) }; return c; } },
    Utilities: {
      formatDate: (d, tz, padrao) => formatar(d, padrao),
      newBlob: (c, t, n) => ({ conteudo: c, tipo: t, nome: n }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    MailApp: { sendEmail: (...a) => emails.push(a) },
    ScriptApp: { triggers: [], getProjectTriggers() { return this.triggers; }, newTrigger(f) { const t = { f, getHandlerFunction: () => f }; const b = { timeBased: () => b, everyHours: () => b, create: () => { this.triggers.push(t); return t; } }; return b; } },
    Calendar: {
      Events: {
        list: () => ({ items: opcoes.eventos || [] }),
        // Evento apagado e já sumido da agenda: a API responde "Not Found".
        get: (cal, id) => {
          const e = (opcoes.eventos || []).find((x) => x.id === id);
          if (!e && apagados.has(id)) return { id, status: 'cancelled' }; // a agenda ainda guarda o evento apagado
          if (!e) throw new Error('API call to calendar.events.get failed with error: Not Found');
          return e;
        },
      },
    },
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (k) => (propriedades.has(k) ? propriedades.get(k) : null), setProperty: (k, v) => { propriedades.set(k, String(v)); } }) },
    ...(opcoes.google || {}),
  };
  const ambiente = { planilha, propriedades, apagados, selecao, abas, alertas, emails, arquivos, contexto, ui, relogio, menu: null, sequencia: () => ++seq };
  vm.createContext(contexto);
  ambiente.carregar = (...nomes) => {
    for (const n of nomes) vm.runInContext(fs.readFileSync(path.join(raiz, n), 'utf8'), contexto, { filename: n });
    return ambiente;
  };
  // Carrega arquivos que não vêm de src/ (por exemplo, o pacote de produção montado em memória).
  ambiente.carregarTexto = (nome, texto) => { vm.runInContext(texto, contexto, { filename: nome }); return ambiente; };
  ambiente.rodar = (codigo) => vm.runInContext(codigo, contexto);
  return ambiente;
}

module.exports = { criarAmbiente, FIXO, formatar };
