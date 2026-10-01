// Gate B (item 33): falha em uma funcionalidade opcional não derruba funcionalidade independente. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/Configuracoes.js');
const { criarConsultorio, CONFIG_COMPLETA } = require('./apoio/fluxo.js');

const sem = (...chaves) => CONFIG_COMPLETA.map(([k, v]) => [k, chaves.includes(k) ? '' : v]);
const comValor = (k2, v2) => CONFIG_COMPLETA.map(([k, v]) => [k, k === k2 ? v2 : v]);

test('validarConfiguracoes atribui cada erro à sua chave e errosDosDominios filtra sem duplicar regra', () => {
  const r = C.validarConfiguracoes(sem('chave_pix', 'nome_profissional'));
  assert.deepEqual(Object.keys(r.errosPorChave).sort(), ['chave_pix', 'nome_profissional']);
  assert.equal(C.errosDosDominios(r, ['agenda']).length, 0);
  assert.equal(C.errosDosDominios(r, ['pix']).length, 1);
  assert.equal(C.errosDosDominios(r, ['recibo']).length, 1);
  assert.equal(C.errosDosDominios(r, ['pix', 'recibo']).length, 2);
  assert.throws(() => C.errosDosDominios(r, ['inexistente']), /Domínio de configuração desconhecido/);
});

test('todas as chaves de configuração pertencem a algum domínio (nenhuma fica sem dono)', () => {
  const donas = new Set(Object.values(C.DOMINIOS_CONFIGURACAO).flat());
  for (const chave of C.CHAVES_CONFIGURACAO) assert.ok(donas.has(chave), chave);
  for (const chave of donas) assert.ok(C.CHAVES_CONFIGURACAO.includes(chave), `domínio cita chave inexistente: ${chave}`);
});

test('Pix, nome ou e-mail em branco não derrubam a sincronização da agenda nem a geração de valores a receber', () => {
  const c = criarConsultorio({ configuracoes: sem('chave_pix', 'nome_recebedor_pix', 'cidade_recebedor_pix', 'nome_profissional', 'crn', 'email_alertas', 'id_modelo_recibo', 'id_pasta_recibos') });
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.ok(c.linhas('Consultas').length > 0, 'a agenda sincronizou');
  c.rodar('gerarAReceberPeloMenu()');
  assert.ok(c.linhas('Pagamentos').length > 0, 'as cobranças nasceram');
});

test('Pix em branco só trava o Pix; o recibo e o relatório seguem funcionando', () => {
  const c = criarConsultorio({ configuracoes: sem('chave_pix', 'nome_recebedor_pix', 'cidade_recebedor_pix') });
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  c.selecionar('Pagamentos', 2);
  c.rodar('gerarPixDaLinha()');
  assert.match(c.ultimoAlerta(), /"chave_pix"/);
  c.rodar('marcarPagoDinheiro()');
  c.definir('Pagamentos', 2, 'pagador_nome', 'Pagador Ficticio Um');
  c.rodar('gerarRecibo(2)');
  assert.equal(c.drive.pdfsNaPasta().length, 1);
  c.rodar('gerarRelatorioDoMes()');
  assert.ok(c.amb.abas.get('Relatório 2026-09'));
});

test('nome da profissional em branco trava o recibo (que usa) e não a agenda nem o Pix', () => {
  const c = criarConsultorio({ configuracoes: sem('nome_profissional') });
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  assert.ok(c.linhas('Pagamentos').length > 0);
  c.selecionar('Pagamentos', 2);
  c.rodar('gerarPixDaLinha()');
  assert.match(c.ultimoAlerta(), /Pix copia e cola/);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', 2, 'pagador_nome', 'Pagador Ficticio Um');
  c.rodar('gerarReciboDaLinhaSelecionada()');
  assert.match(c.ultimoAlerta(), /"nome_profissional"/);
  assert.equal(c.drive.pdfsNaPasta().length, 0);
});

test('o que cada funcionalidade usa continua sendo validado: calendário inválido trava a agenda, preço inválido trava as cobranças, pasta inválida trava o relatório', () => {
  const agenda = criarConsultorio({ configuracoes: comValor('calendario_id', 777) });
  agenda.rodar('sincronizarAgendaPeloMenu()');
  assert.match(agenda.ultimoAlerta(), /"calendario_id"/);
  assert.equal(agenda.linhas('Consultas').length, 0);
  const preco = criarConsultorio({ configuracoes: comValor('valor_retorno_centavos', '10,5') });
  preco.rodar('sincronizarAgenda()');
  preco.rodar('gerarAReceberPeloMenu()');
  assert.match(preco.ultimoAlerta(), /"valor_retorno_centavos"/);
  assert.equal(preco.linhas('Pagamentos').length, 0);
  const pasta = criarConsultorio({ configuracoes: comValor('id_pasta_recibos', 4567) });
  pasta.rodar('gerarRelatorioDoMes()');
  assert.match(pasta.ultimoAlerta(), /"id_pasta_recibos"/);
});

test('sem informar domínio, lerConfiguracoes continua estrito (qualquer erro interrompe)', () => {
  const c = criarConsultorio({ configuracoes: sem('chave_pix') });
  assert.throws(() => c.rodar('lerConfiguracoes()'), /"chave_pix"/);
  assert.doesNotThrow(() => c.rodar("lerConfiguracoes(['agenda'])"));
});
