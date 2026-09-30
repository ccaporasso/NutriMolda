// Regressões dos achados da revisão automática (R02 a R11, N9-03), adaptadas de review/codex/regressoes-base.cjs.
// Só dados fictícios e Google simulado. Auditorias estáticas (R08) não provam nada sobre o Google de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarAmbiente } = require('./apoio/simulacao.js');
const { criarDriveSimulado } = require('./apoio/drive.js');

const raiz = path.resolve(__dirname, '..');
const cfg = {
  nome_profissional: 'Profissional Ficticio', crn: 'CRN-0 00000',
  valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000,
  regra_retorno_dias: 30, chave_pix: 'pix@exemplo.invalid', nome_recebedor_pix: 'TESTE',
  cidade_recebedor_pix: 'SAO PAULO', calendario_id: 'agenda-ficticia@group.calendar.google.com',
  prefixo_evento_consulta: 'Consulta', email_alertas: 'alerta@exemplo.invalid',
  id_modelo_recibo: '', id_pasta_recibos: '',
};

function ambiente(extra = {}) {
  const amb = criarAmbiente({ configuracoes: Object.entries(cfg), ...extra });
  amb.carregar(...fs.readdirSync(path.join(raiz, 'src')).filter((n) => n.endsWith('.js')).sort());
  return amb;
}

// ---------- R07: cabeçalho conferido antes de ler ou gravar ----------

test('R07: leitor recusa cabeçalho trocado e nenhuma operação grava', () => {
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] } });
  const aba = amb.abas.get('Pagamentos');
  [aba.linhas[0][5], aba.linhas[0][7]] = [aba.linhas[0][7], aba.linhas[0][5]];
  aba.linhas.push(['PG000001', 'evento1', 'P0001', '', '', 'pago', 'pix', 15000, '2026-09-30', '']);
  const antes = JSON.stringify(aba.linhas);
  assert.throws(() => amb.rodar("lerAbaComoObjetos('Pagamentos')"), /cabeçalho diferente/);
  assert.throws(() => amb.rodar("gravarCelula('Pagamentos', 2, 'status', 'a_receber')"), /cabeçalho diferente/);
  amb.rodar('marcarPagoPix()'); // pelo menu: mensagem na tela, planilha intacta
  assert.match(amb.alertas.at(-1), /cabeçalho diferente/);
  assert.equal(JSON.stringify(aba.linhas), antes);
});

test('R07: sincronização, a receber e relatório também recusam cabeçalho trocado', () => {
  for (const [aba, chamada] of [['Consultas', 'sincronizarAgenda()'], ['Consultas', 'gerarAReceber()'], ['Pagamentos', 'gerarRelatorioMensal("2026-09")'], ['Pacientes', 'sincronizarAgenda()']]) {
    const amb = ambiente();
    amb.abas.get(aba).linhas[0][1] = 'coluna_trocada';
    const antes = JSON.stringify([...amb.abas.values()].map((a) => a.linhas));
    assert.throws(() => amb.rodar(chamada), /cabeçalho diferente/, `${aba}: ${chamada}`);
    assert.equal(JSON.stringify([...amb.abas.values()].map((a) => a.linhas)), antes);
  }
});

// ---------- R04 na camada do Google ----------

function ambienteAgenda(eventos) {
  const amb = ambiente({ eventos });
  amb.abas.get('Pacientes').linhas.push(['P0001', 'Pessoa', 'F.', '', 'paciente@exemplo.invalid', 'leve', '', true]);
  return amb;
}
const ev = (id, data) => ({ id, summary: 'Consulta', status: 'confirmed', start: { dateTime: `${data}T09:00:00-03:00` }, description: 'paciente@exemplo.invalid' });

test('R04: evento remarcado para depois da janela é achado pelo id e só muda de data', () => {
  const eventos = [ev('remarcado', '2026-10-10')];
  const amb = ambienteAgenda(eventos);
  amb.rodar('sincronizarAgenda()');
  eventos[0] = ev('remarcado', '2027-02-01'); // fora da janela de leitura, mas o evento existe
  eventos.push(ev('outro', '2026-10-02'));
  const lista = eventos.slice();
  amb.contexto.Calendar.Events.list = () => ({ items: lista.filter((e) => e.id !== 'remarcado') });
  amb.rodar('sincronizarAgenda()');
  const linha = amb.abas.get('Consultas').linhas.find((l) => l[0] === 'remarcado');
  assert.deepEqual([linha[1], linha[5]], ['2027-02-01', 'marcada']);
});

test('R04: evento que a agenda não devolve (erro ou não achado) continua marcado, com aviso', () => {
  const eventos = [ev('a', '2026-10-10'), ev('b', '2026-10-12')];
  const amb = ambienteAgenda(eventos);
  amb.rodar('sincronizarAgenda()');
  eventos.shift();
  amb.contexto.Calendar.Events.get = () => { throw new Error('falha de rede ficticia'); };
  const plano = amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas.find((l) => l[0] === 'a')[5], 'marcada');
  assert.match(plano.avisos.join('\n'), /não foi possível confirmar/);
});

test('R04: trocar o calendario_id não cancela consultas da agenda anterior, nem na segunda sincronização', () => {
  const eventos = [ev('a', '2026-10-10')];
  const amb = ambienteAgenda(eventos);
  amb.rodar('sincronizarAgenda()');
  amb.abas.get('Configurações').linhas.find((l) => l[0] === 'calendario_id')[1] = 'outra@group.calendar.google.com';
  eventos.length = 0;
  eventos.push(ev('novo', '2026-10-15'));
  amb.apagados.add('a'); // mesmo que a agenda nova respondesse "apagado", a troca de agenda protege
  const plano = amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas.find((l) => l[0] === 'a')[5], 'marcada');
  assert.match(plano.avisos.join('\n'), /calendario_id/);
  amb.rodar('sincronizarAgenda()'); // a origem ficou gravada na linha: a segunda rodada também não cancela
  assert.equal(amb.abas.get('Consultas').linhas.find((l) => l[0] === 'a')[5], 'marcada');
});

// ---------- R09: modelo de recibo sem campos obrigatórios ----------

function ambienteRecibo(textoModelo, linhasPagamento) {
  const drive = criarDriveSimulado();
  drive.arquivos.get('modelo123').texto = textoModelo;
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] }, google: { Drive: drive.Drive, DocumentApp: drive.DocumentApp } });
  const c = amb.abas.get('Configurações').linhas;
  c.find((l) => l[0] === 'id_modelo_recibo')[1] = 'modelo123';
  c.find((l) => l[0] === 'id_pasta_recibos')[1] = 'pasta123';
  amb.abas.get('Pacientes').linhas.push(['P0001', 'Pessoa', 'F.', '', 'paciente@exemplo.invalid', 'leve', '', true]);
  amb.abas.get('Consultas').linhas.push(['e1', '2026-09-29', '09:00', 'primeira', 'P0001', 'realizada', '']);
  amb.abas.get('Pagamentos').linhas.push(linhasPagamento || ['PG000001', 'e1', 'P0001', 'Pagador Ficticio', '', 15000, 'pix', 'pago', '2026-09-30', '']);
  return { amb, drive };
}

test('R09: modelo só com "RECIBO" não gera PDF, não grava link e não deixa cópia', () => {
  const { amb, drive } = ambienteRecibo('RECIBO');
  amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.equal(drive.pdfsNaPasta().length, 0);
  assert.equal(amb.abas.get('Pagamentos').linhas[1][9], '');
  assert.match(amb.alertas.at(-1), /campo\(s\) obrigatório\(s\)/);
  assert.ok([...drive.arquivos.values()].filter((a) => a.nome.startsWith('rascunho')).every((a) => a.lixeira));
});

test('R09: modelo sem o campo do valor é recusado; campo condicional exigido quando há CPF', () => {
  const semValor = ambienteRecibo('RECIBO {{numero_recibo}} {{pagador}} {{descricao}} {{forma}} {{data}} {{profissional}} {{crn}} {{linha_cpf}} {{linha_paciente}}');
  semValor.amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.match(semValor.amb.alertas.at(-1), /\{\{valor\}\}/);
  assert.equal(semValor.drive.pdfsNaPasta().length, 0);

  const semCpf = ambienteRecibo('{{numero_recibo}} {{pagador}} {{valor}} {{descricao}} {{forma}} {{data}} {{profissional}} {{crn}}',
    ['PG000001', 'e1', 'P0001', 'Pagador Ficticio', '52998224725', 15000, 'pix', 'pago', '2026-09-30', '']);
  semCpf.amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.match(semCpf.amb.alertas.at(-1), /\{\{linha_cpf\}\}/);
  assert.equal(semCpf.drive.pdfsNaPasta().length, 0);
});

test('R09: modelo completo continua gerando o recibo', () => {
  const { amb, drive } = ambienteRecibo('{{numero_recibo}} {{pagador}} {{valor}} {{descricao}} {{forma}} {{data}} {{profissional}} {{crn}} {{linha_cpf}} {{linha_paciente}}');
  amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.equal(drive.pdfsNaPasta().length, 1);
  assert.match(amb.abas.get('Pagamentos').linhas[1][9], /^https:/);
});

// ---------- R11: pacote ----------

function ambientePacote(usadas = 0, total = 2) {
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] } });
  amb.abas.get('Pagamentos').linhas.push(['PG000001', 'e1', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  amb.abas.get('Pacotes').linhas.push(['P0001', total, usadas, 25000, '2026-09-01']);
  return amb;
}

test('R11: falha ao gravar o pagamento não consome consulta; repetir consome uma só', () => {
  const amb = ambientePacote();
  const aba = amb.abas.get('Pagamentos');
  const original = aba.getRange;
  let falharUmaVez = true;
  aba.getRange = (...args) => {
    const range = original(...args); const gravar = range.setValues;
    range.setValues = (v) => { if (falharUmaVez) { falharUmaVez = false; throw new Error('Falha ficticia de gravacao'); } return gravar(v); };
    return range;
  };
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(amb.abas.get('Pacotes').linhas[1][2], 0);
  amb.rodar('marcarConsultaDePacote()');
  amb.rodar('marcarConsultaDePacote()'); // já pago: recusado
  assert.equal(amb.abas.get('Pacotes').linhas[1][2], 1);
  assert.equal(amb.abas.get('Pagamentos').linhas[1][7], 'pago');
});

test('R11: falha só ao gravar "usadas" é reconciliada na ação seguinte e o pacote não estoura', () => {
  const amb = ambientePacote(0, 2);
  amb.abas.get('Pagamentos').linhas.push(['PG000002', 'e2', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  amb.abas.get('Pagamentos').linhas.push(['PG000003', 'e3', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  const pacotes = amb.abas.get('Pacotes');
  const original = pacotes.getRange;
  let falharUmaVez = true;
  pacotes.getRange = (...args) => {
    const range = original(...args); const gravar = range.setValues;
    range.setValues = (v) => { if (falharUmaVez) { falharUmaVez = false; throw new Error('Falha ficticia de gravacao'); } return gravar(v); };
    return range;
  };
  amb.rodar('marcarConsultaDePacote()'); // pagamento gravado, "usadas" falhou
  assert.equal(amb.abas.get('Pagamentos').linhas[1][7], 'pago');
  assert.equal(pacotes.linhas[1][2], 0);
  amb.selecao.linhas = [3];
  amb.rodar('marcarConsultaDePacote()'); // reconcilia (0 -> 1) e consome a segunda
  assert.equal(pacotes.linhas[1][2], 2);
  amb.selecao.linhas = [4];
  amb.rodar('marcarConsultaDePacote()'); // esgotado
  assert.equal(amb.abas.get('Pagamentos').linhas[3][7], 'a_receber');
  assert.match(amb.alertas.at(-1), /sem pacote|não tem pacote/);
});

test('R11b: o saldo do pacote é lido depois de adquirir a trava', () => {
  const amb = ambientePacote(0, 1);
  let primeiraTrava = true;
  amb.contexto.LockService.getScriptLock = () => ({
    tryLock() {
      // Outra execução terminou de consumir o pacote enquanto esta esperava a trava.
      if (primeiraTrava) { primeiraTrava = false; amb.abas.get('Pacotes').linhas[1][2] = 1; }
      return true;
    },
    releaseLock() {},
  });
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(amb.abas.get('Pagamentos').linhas[1][7], 'a_receber');
});

// ---------- R02 e R08: pacotes de teste e produção, sem DriveApp nem escopo amplo ----------

test('R02: saída efetiva de produção exclui gerador e escrita na agenda', () => {
  const E = require(path.join(raiz, 'scripts/empacotar-producao.js'));
  const pacote = E.montarPacoteProducao();
  assert.deepEqual(E.verificarPacoteProducao(pacote), []);
  assert.ok(pacote.manifesto.oauthScopes.includes('https://www.googleapis.com/auth/calendar.events.readonly'));
  assert.ok(!pacote.manifesto.oauthScopes.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.ok(!pacote.arquivos.some((a) => ['DadosTeste.js', 'GeradorTeste.js'].includes(a.nome)));
});

test('R08: nenhum DriveApp no código e nenhum escopo drive amplo (auditoria estática)', () => {
  const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, 'src/appsscript.json'), 'utf8'));
  assert.ok(!manifesto.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
  assert.ok(manifesto.oauthScopes.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(manifesto.dependencies.enabledAdvancedServices.some((s) => s.userSymbol === 'Drive' && s.version === 'v3'));
  for (const nome of fs.readdirSync(path.join(raiz, 'src')).filter((n) => n.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(raiz, 'src', nome), 'utf8'), /\bDriveApp\.[A-Za-z]/, nome);
  }
});

test('R04c: mesmo id cancelado na agenda nova não cancela linha da agenda antiga (linha sem marca, agenda trocada)', () => {
  const amb = ambienteAgenda([]);
  amb.abas.get('Consultas').linhas.push(['mesmoid', '2026-10-10', '09:00', 'primeira', 'P0001', 'marcada', '']);
  amb.propriedades.set('calendario_da_ultima_sincronizacao', 'agenda-antiga@group.calendar.google.com');
  amb.contexto.Calendar.Events.list = () => ({ items: [{ id: 'mesmoid', status: 'cancelled' }, ev('outro', '2026-10-02')] });
  amb.contexto.Calendar.Events.get = (cal, id) => ({ id, status: 'cancelled' });
  amb.rodar('sincronizarAgenda()');
  amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas[1][5], 'marcada');
});

test('R07: cabeçalho de Configurações trocado ou com coluna a mais é recusado, na leitura e na escrita', () => {
  const invertido = ambiente();
  invertido.abas.get('Configurações').linhas[0] = ['valor', 'chave'];
  assert.throws(() => invertido.rodar('lerConfiguracoes()'), /cabeçalho diferente/);
  const antes = JSON.stringify(invertido.abas.get('Configurações').linhas);
  assert.throws(() => invertido.rodar("atualizarConfiguracao_('valor_retorno_centavos', 20000)"), /cabeçalho diferente/);
  assert.equal(JSON.stringify(invertido.abas.get('Configurações').linhas), antes);
  const extra = ambiente();
  extra.abas.get('Configurações').linhas[0].push('coluna_extra');
  assert.throws(() => extra.rodar('lerConfiguracoes()'), /coluna a mais/);
  const pagamentos = ambiente();
  pagamentos.abas.get('Pagamentos').linhas[0].push('coluna_extra');
  assert.throws(() => pagamentos.rodar("lerAbaComoObjetos('Pagamentos')"), /coluna a mais/);
});

test('R11c: renovar o pacote não faz duas consultas consumirem três unidades', () => {
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] } });
  amb.abas.get('Pagamentos').linhas.push(['PG000001', 'e1', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  amb.abas.get('Pagamentos').linhas.push(['PG000002', 'e2', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  amb.abas.get('Pacotes').linhas.push(['P0001', 2, 0, 25000, '2026-09-01']);
  amb.abas.get('Pacotes').linhas.push(['P0001', 2, 0, 25000, '2026-09-15']);
  amb.rodar('marcarConsultaDePacote()');
  amb.selecao.linhas = [3];
  amb.rodar('marcarConsultaDePacote()');
  const pacotes = amb.abas.get('Pacotes').linhas.slice(1);
  assert.equal(amb.abas.get('Pagamentos').linhas.filter((l) => l[7] === 'pago' && l[6] === 'pacote').length, 2);
  assert.deepEqual(pacotes.map((l) => l[2]), [0, 2]); // tudo no pacote vigente (15/09); o antigo fica intacto
});

test('R11c: dois pacotes com o mesmo início: recusa e não escreve nada', () => {
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] } });
  amb.abas.get('Pagamentos').linhas.push(['PG000001', 'e1', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  amb.abas.get('Pacotes').linhas.push(['P0001', 2, 0, 25000, '2026-09-01']);
  amb.abas.get('Pacotes').linhas.push(['P0001', 2, 0, 25000, '2026-09-01']);
  const antes = JSON.stringify([amb.abas.get('Pagamentos').linhas, amb.abas.get('Pacotes').linhas]);
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(JSON.stringify([amb.abas.get('Pagamentos').linhas, amb.abas.get('Pacotes').linhas]), antes);
  assert.match(amb.alertas.at(-1), /mesmo início/);
});
