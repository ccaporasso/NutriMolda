// Roda o instalador de verdade (Instalador.js) contra uma planilha simulada em memória.
// Confere que a coluna de valores das Configurações vira texto ANTES de receber dados
// e que rodar duas vezes não duplica nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = (arquivo) => fs.readFileSync(path.join(__dirname, '..', 'src', arquivo), 'utf8');

function criarPlanilhaSimulada() {
  const log = []; // { op, aba, linha, coluna, formato }
  const abas = new Map();

  function novaAba(nome) {
    const celulas = new Map();
    const protecoes = [];
    let ultimaLinha = 0;
    const aba = {
      nome, celulas, protecoes,
      getName: () => nome,
      setFrozenRows: () => {},
      getMaxRows: () => 1000,
      getMaxColumns: () => 26,
      getLastRow: () => ultimaLinha,
      getProtections: () => protecoes,
      getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
        const intervalo = {
          getValues() {
            return Array.from({ length: nLinhas }, (_, i) => Array.from({ length: nColunas },
              (__, j) => (celulas.has(`${linha + i},${coluna + j}`) ? celulas.get(`${linha + i},${coluna + j}`) : '')));
          },
          setValues(valores) {
            log.push({ op: 'valores', aba: nome, linha, coluna });
            valores.forEach((l, i) => l.forEach((v, j) => celulas.set(`${linha + i},${coluna + j}`, v)));
            ultimaLinha = Math.max(ultimaLinha, linha + valores.length - 1);
          },
          setNumberFormat(formato) { log.push({ op: 'formato', aba: nome, linha, coluna, formato }); return intervalo; },
          setFontWeight: () => intervalo,
          setDataValidation: () => intervalo,
          protect() {
            const p = { descricao: '', getDescription: () => p.descricao };
            p.setDescription = (d) => { p.descricao = d; return p; };
            p.setWarningOnly = () => p;
            protecoes.push(p);
            return p;
          },
        };
        return intervalo;
      },
    };
    abas.set(nome, aba);
    return aba;
  }

  novaAba('Página1'); // aba padrão vazia que o Google cria

  const planilha = {
    fuso: 'America/Sao_Paulo',
    getSpreadsheetTimeZone: () => planilha.fuso,
    setSpreadsheetTimeZone(f) { planilha.fuso = f; },
    getSheetByName: (n) => abas.get(n) || null,
    insertSheet: (n) => novaAba(n),
    getSheets: () => [...abas.values()],
    deleteSheet: (aba) => abas.delete(aba.nome),
  };
  const construtor = {
    requireValueInList: () => construtor, setAllowInvalid: () => construtor, build: () => ({}),
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => planilha,
    getUi: () => ({ alert: () => {} }),
    newDataValidation: () => construtor,
    ProtectionType: { RANGE: 'RANGE' },
  };
  return { log, abas, SpreadsheetApp, planilha };
}

function instalar(simulada) {
  const contexto = vm.createContext({ SpreadsheetApp: simulada.SpreadsheetApp });
  vm.runInContext(src('Esquema.js'), contexto);
  vm.runInContext(src('Execucao.js'), contexto);
  vm.runInContext(src('Instalador.js'), contexto);
  vm.runInContext('instalarPlanilha()', contexto);
}

test('coluna de valores das Configurações vira texto antes de receber os dados', () => {
  const s = criarPlanilhaSimulada();
  instalar(s);
  const formato = s.log.findIndex((e) => e.op === 'formato' && e.aba === 'Configurações'
    && e.coluna === 2 && e.formato === '@');
  const primeiraGravacao = s.log.findIndex((e) => e.op === 'valores' && e.aba === 'Configurações' && e.linha >= 2);
  assert.ok(formato >= 0, 'formato de texto não foi aplicado na coluna B');
  assert.ok(primeiraGravacao >= 0, 'as chaves não foram gravadas');
  assert.ok(formato < primeiraGravacao, 'o formato de texto precisa vir antes dos valores');
});

test('rodar o instalador duas vezes não duplica chaves e reaplica o formato de texto', () => {
  const s = criarPlanilhaSimulada();
  instalar(s);
  const linhasDepoisDa1 = s.abas.get('Configurações').getLastRow();
  const protecoesDepoisDa1 = s.abas.get('Consultas').protecoes.length;
  s.log.length = 0;
  instalar(s);
  assert.equal(s.abas.get('Configurações').getLastRow(), linhasDepoisDa1);
  assert.equal(s.abas.get('Consultas').protecoes.length, protecoesDepoisDa1);
  assert.ok(s.log.some((e) => e.op === 'formato' && e.aba === 'Configurações' && e.coluna === 2 && e.formato === '@'));
  assert.equal(s.abas.has('Página1'), false);
});

test('B2: planilha em outro fuso passa para São Paulo; a segunda instalação não mexe de novo', () => {
  const s = criarPlanilhaSimulada();
  s.planilha.fuso = 'Europe/Lisbon';
  const avisos = [];
  s.SpreadsheetApp.getUi = () => ({ alert: (t) => avisos.push(t) });
  instalar(s);
  assert.equal(s.planilha.fuso, 'America/Sao_Paulo');
  assert.match(avisos[0], /fuso horário da planilha foi ajustado/);
  instalar(s);
  assert.doesNotMatch(avisos[1], /fuso/);
});
