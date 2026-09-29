// Confere o esquema da planilha (T01) contra docs/ESPECIFICACAO.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  colunasDeTexto, LISTAS, CONFIGURACOES_INICIAIS, ABAS, planejarInstalacao, colunasComValidacao,
} = require('../src/Esquema.js');

const espec = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ESPECIFICACAO.md'), 'utf8');

// Simula a planilha aplicando o plano, como o instalador faz.
function aplicar(estado, plano) {
  const novo = JSON.parse(JSON.stringify(estado));
  for (const nome of plano.criarAbas) novo[nome] = { cabecalho: [], chaves: [] };
  for (const nome of plano.escreverCabecalho) {
    novo[nome].cabecalho = ABAS.find((a) => a.nome === nome).cabecalho.slice();
  }
  for (const [chave] of plano.chavesNovas) novo['Configurações'].chaves.push(chave);
  return novo;
}

test('as sete abas da especificação existem, com os nomes esperados', () => {
  assert.deepEqual(ABAS.map((a) => a.nome),
    ['Configurações', 'Pacientes', 'Consultas', 'Pagamentos', 'Pacotes', 'Despesas', 'Registro']);
});

test('todo cabeçalho aparece na especificação e não há coluna repetida', () => {
  for (const aba of ABAS) {
    assert.equal(new Set(aba.cabecalho).size, aba.cabecalho.length, `repetida em ${aba.nome}`);
    for (const coluna of aba.cabecalho) {
      assert.ok(espec.includes(`\`${coluna}\``) || aba.nome === 'Configurações',
        `coluna fora da especificação: ${coluna}`);
    }
  }
});

test('todas as chaves de Configurações da especificação estão no instalador', () => {
  const nasChaves = [...espec.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
  const chaves = CONFIGURACOES_INICIAIS.map(([c]) => c);
  assert.deepEqual(chaves.slice().sort(), nasChaves.slice().sort());
});

test('valores de exemplo em centavos são inteiros', () => {
  for (const [chave, valor] of CONFIGURACOES_INICIAIS) {
    if (chave.endsWith('_centavos')) assert.ok(Number.isInteger(valor), chave);
  }
});

test('listas de validação batem com a especificação', () => {
  assert.deepEqual(LISTAS.status_consulta, ['marcada', 'realizada', 'faltou', 'cancelada']);
  assert.deepEqual(LISTAS.forma_pagamento, ['pix', 'cartao', 'dinheiro', 'pacote', 'cortesia']);
  assert.deepEqual(LISTAS.status_pagamento, ['a_receber', 'pago', 'cortesia']);
  assert.deepEqual(LISTAS.modo_acompanhamento, ['porta_aberta', 'leve', 'proximo']);
  assert.deepEqual(LISTAS.tipo_consulta, ['primeira', 'retorno']);
  assert.deepEqual(LISTAS.nivel_registro, ['info', 'aviso', 'erro']);
});

test('validações apontam para colunas que existem, nas posições certas', () => {
  const pagamentos = ABAS.find((a) => a.nome === 'Pagamentos');
  const cols = colunasComValidacao(pagamentos);
  assert.deepEqual(cols.map((c) => c.coluna), [7, 8]);
  for (const aba of ABAS) {
    for (const nome of Object.keys(aba.validacoes)) {
      assert.ok(aba.cabecalho.includes(nome), `${aba.nome}: ${nome}`);
    }
  }
});

test('planilha vazia: cria tudo', () => {
  const plano = planejarInstalacao({});
  assert.equal(plano.criarAbas.length, 7);
  assert.equal(plano.escreverCabecalho.length, 7);
  assert.equal(plano.chavesNovas.length, CONFIGURACOES_INICIAIS.length);
});

test('rodar duas vezes não duplica nada', () => {
  const primeira = aplicar({}, planejarInstalacao({}));
  const plano2 = planejarInstalacao(primeira);
  assert.deepEqual(plano2, { criarAbas: [], escreverCabecalho: [], chavesNovas: [], avisos: [] });
});

test('não sobrescreve configuração já preenchida e só acrescenta chave faltante', () => {
  const estado = aplicar({}, planejarInstalacao({}));
  estado['Configurações'].chaves = estado['Configurações'].chaves.filter((c) => c !== 'crn');
  const plano = planejarInstalacao(estado);
  assert.deepEqual(plano.chavesNovas, [['crn', '']]);
});

test('cabeçalho diferente gera aviso e não é reescrito', () => {
  const estado = aplicar({}, planejarInstalacao({}));
  estado.Consultas.cabecalho = ['coluna', 'estranha'];
  const plano = planejarInstalacao(estado);
  assert.equal(plano.avisos.length, 1);
  assert.match(plano.avisos[0], /Consultas/);
  assert.deepEqual(plano.escreverCabecalho, []);
});

test('aba existente com cabeçalho vazio recebe o cabeçalho', () => {
  const estado = aplicar({}, planejarInstalacao({}));
  estado.Pacotes.cabecalho = ['', '', '', '', ''];
  assert.deepEqual(planejarInstalacao(estado).escreverCabecalho, ['Pacotes']);
});

test('cabeçalho estranho em Configurações: não acrescenta chaves', () => {
  const estado = aplicar({}, planejarInstalacao({}));
  estado['Configurações'].cabecalho = ['x', 'y'];
  estado['Configurações'].chaves = [];
  const plano = planejarInstalacao(estado);
  assert.deepEqual(plano.chavesNovas, []);
  assert.equal(plano.avisos.length, 1);
});

test('CPF, telefone e códigos ficam como texto', () => {
  const pag = ABAS.find((a) => a.nome === 'Pagamentos');
  assert.deepEqual(colunasDeTexto(pag), [1, 2, 3, 5]);
  const pac = ABAS.find((a) => a.nome === 'Pacientes');
  assert.deepEqual(colunasDeTexto(pac), [1, 4]);
});
