// T10: relatório mensal e CSV. Só dados inventados; os totais são conferidos com contas feitas à mão.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/Relatorio.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

const pg = (id, nome, cpf, valor, forma, data, status = 'pago') => ({
  id, pagador_nome: nome, pagador_cpf: cpf, valor_centavos: valor, forma, data_pagamento: data, status,
});
const dados = [
  pg('PG000001', 'Maria Souza Teste', '52998224725', 15000, 'pix', '2026-09-05'),
  pg('PG000002', 'maria souza teste', '', 10000, 'cartao', '2026-09-20'), // mesmo nome sem CPF: junta com a Maria
  pg('PG000003', 'João Teste', '', 15000, 'dinheiro', '2026-09-30'),
  pg('PG000004', '=SOMA(1)', '', 5000, 'pix', '2026-09-01'),
  pg('PG000005', 'Ana Teste', '', 0, 'pacote', '2026-09-10'),
  pg('PG000006', 'Cortesia Teste', '', 0, 'cortesia', '2026-09-11', 'cortesia'),
  pg('PG000007', 'Pendente Teste', '', 15000, '', '', 'a_receber'),
  pg('PG000008', 'Agosto Teste', '', 20000, 'pix', '2026-08-30'),
  pg('PG000009', 'Sem Data Teste', '', 9900, 'pix', ''),
];

test('interpretarMes aceita AAAA-MM, MM/AAAA e vazio; recusa o resto', () => {
  const hoje = { ano: 2026, mes: 9, dia: 30 };
  assert.equal(R.interpretarMes('2026-08', hoje), '2026-08');
  assert.equal(R.interpretarMes('8/2026', hoje), '2026-08');
  assert.equal(R.interpretarMes('', hoje), '2026-09');
  assert.equal(R.interpretarMes('2026-13', hoje), null);
  assert.equal(R.interpretarMes('setembro', hoje), null);
});

test('totais batem com a soma feita à mão (R$ 450,00 em 4 recebimentos, 3 pagadores)', () => {
  const r = R.consolidarRecebimentos(dados, '2026-09');
  assert.equal(r.totalCentavos, 15000 + 10000 + 15000 + 5000);
  assert.equal(r.quantidade, 4);
  assert.deepEqual(r.pagadores.map((g) => [g.nome, g.quantidade, g.totalCentavos]).sort(),
    [['=SOMA(1)', 1, 5000], ['João Teste', 1, 15000], ['Maria Souza Teste', 2, 25000]].sort());
  assert.deepEqual(r.porForma, { pix: 20000, cartao: 10000, dinheiro: 15000 });
  assert.equal(R.verificarTotais(r), true);
});

test('fica de fora: cortesia, pacote, a receber, outro mês e sem data válida (com aviso para a data)', () => {
  const r = R.consolidarRecebimentos(dados, '2026-09');
  assert.deepEqual(r.fora, { cortesia: 1, pacote: 1, semDataValida: 1, outroMes: 1, aReceber: 1 });
  assert.match(r.avisos.join('\n'), /PG000009/);
  assert.match(r.avisos.join('\n'), /pacote/);
});

test('outro mês soma só o que é dele', () => {
  const r = R.consolidarRecebimentos(dados, '2026-08');
  assert.equal(r.totalCentavos, 20000);
  assert.equal(r.pagadores.length, 1);
});

test('mês sem recebimentos dá total zero, sem erro', () => {
  const r = R.consolidarRecebimentos(dados, '2025-01');
  assert.equal(r.totalCentavos, 0);
  assert.deepEqual(r.pagadores, []);
});

test('verificarTotais barra número adulterado', () => {
  const r = R.consolidarRecebimentos(dados, '2026-09');
  assert.throws(() => R.verificarTotais({ ...r, totalCentavos: r.totalCentavos + 1 }), /não batem/);
  assert.throws(() => R.verificarTotais({ ...r, pagadores: r.pagadores.map((g, i) => (i === 0 ? { ...g, totalCentavos: g.totalCentavos + 1 } : g)) }), /não batem/);
});

test('CPF inválido é tratado como sem CPF e o número digitado nunca aparece em aviso', () => {
  const r = R.consolidarRecebimentos([pg('PG000001', 'Teste Um', '52998224724', 10000, 'pix', '2026-09-05')], '2026-09');
  assert.equal(r.pagadores[0].cpf, '');
  assert.match(r.avisos.join('\n'), /CPF inválido/);
  assert.doesNotMatch(JSON.stringify(r.avisos), /52998224724/);
});

test('CSV: separador ponto e vírgula, vírgula decimal, CPF formatado, fórmula neutralizada', () => {
  const csv = R.montarCsvRelatorio(R.consolidarRecebimentos(dados, '2026-09'));
  assert.ok(csv.startsWith('﻿pagador;cpf;quantidade;total_reais\r\n'));
  assert.match(csv, /Maria Souza Teste;529\.982\.247-25;2;250,00\r\n/);
  assert.match(csv, /João Teste;;1;150,00\r\n/);
  assert.match(csv, /\r\n =SOMA\(1\);;1;50,00\r\n/);
  assert.match(csv, /TOTAL;;4;450,00\r\n$/);
});

test('CSV: nome com ponto e vírgula ou aspas vai entre aspas', () => {
  const csv = R.montarCsvRelatorio(R.consolidarRecebimentos([pg('PG000001', 'Silva; "Teste"', '', 10000, 'pix', '2026-09-05')], '2026-09'));
  assert.match(csv, /"Silva; ""Teste"""/);
});

test('nome do arquivo leva só o mês', () => {
  assert.equal(R.nomeArquivoRelatorio('2026-09'), 'Relatorio-2026-09.csv');
  assert.throws(() => R.nomeArquivoRelatorio('Maria'));
});

test('aba: título, cabeçalho, total e por forma, retangular', () => {
  const linhas = R.linhasAbaRelatorio(R.consolidarRecebimentos(dados, '2026-09'));
  assert.equal(new Set(linhas.map((l) => l.length)).size, 1);
  assert.deepEqual(linhas[2], ['pagador', 'cpf', 'quantidade', 'total']);
  assert.ok(linhas.some((l) => l[0] === 'TOTAL' && l[3] === 'R$ 450,00'));
  assert.ok(linhas.some((l) => l[0] === 'Pix' && l[3] === 'R$ 200,00'));
});

// ---------- Google simulado ----------

function ambienteRelatorio({ pasta = true, resposta = '2026-09' } = {}) {
  const arquivos = [];
  const pastaSim = {
    getFilesByName: (n) => { const achados = arquivos.filter((a) => a.nome === n); let i = 0; return { hasNext: () => i < achados.length, next: () => achados[i++] }; },
    createFile: (nome, conteudo, tipo) => { const a = { nome, conteudo, tipo, setContent(c) { a.conteudo = c; } }; arquivos.push(a); return a; },
  };
  const amb = criarAmbiente({
    resposta,
    configuracoes: [
      ['nome_profissional', 'Dra. Teste'], ['crn', 'CRN-0 00000'], ['valor_primeira_consulta_centavos', '15000'], ['valor_retorno_centavos', '10000'],
      ['regra_retorno_dias', '30'], ['chave_pix', 'teste@exemplo.invalid'], ['nome_recebedor_pix', 'DRA TESTE'], ['cidade_recebedor_pix', 'SAO PAULO'],
      ['calendario_id', 'primary'], ['prefixo_evento_consulta', 'Consulta'], ['email_alertas', 'alerta@exemplo.invalid'],
      ['id_modelo_recibo', ''], ['id_pasta_recibos', pasta ? 'pasta123' : ''],
    ],
    google: { DriveApp: { getFolderById: () => pastaSim } },
  });
  dados.forEach((p, i) => amb.abas.get('Pagamentos').linhas.push([p.id, `e${i}`, 'P9001', p.pagador_nome, p.pagador_cpf, p.valor_centavos, p.forma, p.status, p.data_pagamento, '']));
  amb.carregar('Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js', 'Execucao.js', 'LeitorAbas.js', 'SincronizarAgenda.js', 'Relatorio.js', 'GerarRelatorio.js');
  return { amb, arquivos };
}

test('Google simulado: gera a aba e o CSV; repetir refaz a aba e atualiza o mesmo CSV', () => {
  const { amb, arquivos } = ambienteRelatorio();
  amb.rodar('gerarRelatorioDoMes()');
  const aba = amb.abas.get('Relatório 2026-09');
  assert.ok(aba);
  assert.ok(aba.linhas.some((l) => l[0] === 'TOTAL' && l[3] === 'R$ 450,00'));
  assert.equal(arquivos.length, 1);
  assert.equal(arquivos[0].nome, 'Relatorio-2026-09.csv');
  amb.rodar('gerarRelatorioDoMes()');
  assert.equal(arquivos.length, 1); // atualizou, não duplicou
  assert.equal(amb.abas.get('Relatório 2026-09').linhas.filter((l) => l[0] === 'TOTAL').length, 1);
  const registro = amb.abas.get('Registro').linhas.slice(1).map((l) => l[3]).join('\n');
  assert.doesNotMatch(registro, /Maria|João|529/);
});

test('Google simulado: sem pasta configurada a aba sai e o CSV não, com aviso', () => {
  const { amb, arquivos } = ambienteRelatorio({ pasta: false });
  amb.rodar('gerarRelatorioDoMes()');
  assert.equal(arquivos.length, 0);
  assert.match(amb.alertas.at(-1), /CSV não salvo/);
});

test('Google simulado: mês inválido mostra mensagem e não gera nada', () => {
  const { amb } = ambienteRelatorio({ resposta: 'setembro' });
  amb.rodar('gerarRelatorioDoMes()');
  assert.match(amb.alertas.at(-1), /Mês inválido/);
  assert.equal(amb.abas.has('Relatório 2026-09'), false);
});
