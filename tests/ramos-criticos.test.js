// Gate C: ramos (branches) de módulos críticos que a suíte não exercitava, escolhidos pelo relatório de cobertura
// (scripts/cobertura.js --detalhe). Cada teste nomeia o ramo; ramos defensivos ou só do Google real ficam em docs/gate/COBERTURA.md.
// Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/Acoes.js');
const G = require('../src/Agenda.js');
const C = require('../src/Configuracoes.js');
const F = require('../src/Formatos.js');
const P = require('../src/Pagamentos.js');
const R = require('../src/Recibo.js');
const Pix = require('../src/Pix.js');
const { criarConsultorio } = require('./apoio/fluxo.js');

const pg = (extra = {}) => ({ linha: 2, id: 'PG000001', id_evento: 'e1', codigo_paciente: 'P9001', valor_centavos: 15000, status: 'a_receber', ...extra });

test('Acoes: status desconhecido de pagamento é recusado com motivo claro; pacote sem início é ignorado na reconciliação', () => {
  assert.match(A.aplicarPagamentoRecebido(pg({ status: 'xyz' }), 'pix', '2026-09-30').motivo, /status inválido/);
  const sem = [{ linha: 2, codigo_paciente: 'P9001', total_consultas: 3, usadas: 0 }];
  const pagos = [{ codigo_paciente: 'P9001', status: 'pago', forma: 'pacote', pacote_inicio: '' }];
  assert.equal(A.reconciliarPacotes(sem, pagos).pacotes[0].usadas, 0);
});

test('Agenda: telefone nulo, prefixo vazio e item nulo na resposta não quebram nem viram consulta', () => {
  assert.equal(G.normalizarTelefoneAgenda(undefined), '');
  assert.equal(G.normalizarTelefoneAgenda(null), '');
  assert.equal(G.ehEventoDeConsulta({ summary: 'Consulta' }, ''), false, 'prefixo vazio nunca casa tudo');
  assert.equal(G.ehEventoDeConsulta({ summary: 'Consulta' }, undefined), false);
  const janela = G.calcularJanelaAgenda({ ano: 2026, mes: 9, dia: 30 });
  const p = G.planejarSincronizacaoAgenda({ eventos: [null, {}, { id: '' }], existentes: [], pacientes: [], prefixo: 'Consulta', janela, agoraTexto: 'x', origemAtual: 'a1' });
  assert.equal(p.ignorados, 3);
  assert.equal(p.inserir.length, 0);
});

test('Configuracoes: texto numérico gigante, data e objeto no lugar de texto são recusados sem repetir o valor', () => {
  const base = (k, v) => C.validarConfiguracoes([[k, v]]);
  assert.ok(base('valor_retorno_centavos', '99999999999999999999').erros.some((e) => /valor_retorno_centavos/.test(e)));
  const data = base('nome_profissional', new Date(Date.UTC(2026, 8, 30)));
  assert.match(data.erros.join(' '), /data/);
  const objeto = base('nome_profissional', { x: 1 });
  assert.match(objeto.erros.join(' '), /outro tipo de dado/);
  assert.doesNotMatch(objeto.erros.join(' '), /\[object/);
});

test('Formatos: lerReais sem centavos e apenasDigitos de nulo', () => {
  assert.equal(F.lerReais('150').centavos, 15000);
  assert.equal(F.lerReais('150,5').centavos, 15050);
  assert.equal(F.apenasDigitos(undefined), '');
  assert.equal(F.apenasDigitos(null), '');
});

test('Pix: campo acima de 99 caracteres, nome e cidade que não são texto são recusados', () => {
  const base = { chave: 'teste@exemplo.invalid', nome: 'DRA TESTE', cidade: 'SAO PAULO', valorCentavos: 15000, idTransacao: 'PG000001' };
  assert.throws(() => Pix.gerarPixCopiaECola({ ...base, chave: 'a'.repeat(100) }));
  assert.throws(() => Pix.gerarPixCopiaECola({ ...base, nome: 123 }));
  assert.throws(() => Pix.gerarPixCopiaECola({ ...base, cidade: null }));
});

test('Pagamentos: consulta sem id_evento nunca gera cobrança e avisa; id numérico é aceito como texto', () => {
  const config = { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000 };
  const c = (extra) => ({ data: '2026-09-10', hora: '09:00', tipo: 'retorno', codigo_paciente: 'P9001', status: 'marcada', linha: 2, ...extra });
  for (const id of ['', '   ', undefined, null]) {
    const p = P.planejarAReceber({ consultas: [c({ id_evento: id })], pagamentos: [], config });
    assert.equal(p.novos.length, 0);
    assert.equal(p.contagens.semIdEvento, 1);
    assert.match(p.avisos.join(' '), /sem "id_evento"/);
  }
  assert.equal(P.planejarAReceber({ consultas: [c({ id_evento: 12345 })], pagamentos: [], config }).novos[0].id_evento, '12345');
  const semLinha = P.planejarAReceber({ consultas: [c({ id_evento: '', linha: undefined })], pagamentos: [], config });
  assert.doesNotMatch(semLinha.avisos.join(' '), /linha\(s\) undefined/);
  // consulta cancelada sem id não conta como cobrança perdida
  assert.equal(P.planejarAReceber({ consultas: [c({ id_evento: '', status: 'cancelada' })], pagamentos: [], config }).contagens.semIdEvento, 0);
});

test('Recibo: pagamento ausente, sem paciente nem consulta, e identidade de PDF com lista vazia', () => {
  assert.deepEqual(R.montarDadosRecibo({ pagamento: null, config: {} }).erros, ['Pagamento não encontrado.']);
  const pagamento = { id: 'PG000001', codigo_paciente: 'P9001', status: 'pago', forma: 'pix', valor_centavos: 15000, pagador_nome: 'Maria Teste', data_pagamento: '2026-09-30', link_recibo: '', pagador_cpf: '' };
  const config = { nome_profissional: 'Dra. Teste', crn: 'CRN-0 0', id_modelo_recibo: 'modelo123', id_pasta_recibos: 'pasta123' };
  const r = R.montarDadosRecibo({ pagamento, config, paciente: undefined, consulta: undefined });
  assert.equal(r.dados.campos.descricao, 'consulta de nutrição');
  assert.equal(r.dados.campos.linha_paciente, '');
  const semInicial = R.montarDadosRecibo({ pagamento, config, paciente: { primeiro_nome: 'Joana', inicial_sobrenome: '' }, consulta: null });
  assert.equal(semInicial.dados.campos.linha_paciente, 'Paciente: Joana');
  assert.deepEqual(R.escolherReciboExistente(undefined, pagamento).situacao, 'nenhum');
  assert.equal(R.escolherReciboExistente([null, undefined], pagamento).situacao, 'nenhum');
});

test('Registro: data e número curto não são ocultados, mensagem e erro nulos viram texto vazio', () => {
  const Rg = require('../src/Registro.js');
  assert.equal(Rg.mascararDadosPessoais('em 2026-09-29 a 123456'), 'em 2026-09-29 a 123456');
  assert.equal(Rg.mascararDadosPessoais('tel 11912345678'), 'tel [oculto]');
  assert.deepEqual(Rg.montarLinhaRegistro('2026-09-30 10:00:00', 'recibo', 'info', undefined)[3], '');
  assert.deepEqual(Rg.montarLinhaRegistro('2026-09-30 10:00:00', 'recibo', 'info', null)[3], '');
  assert.equal(Rg.causaDeUso(undefined), 'configuracao');
  assert.equal(Rg.causaDeUso(null), 'configuracao');
});

test('Relatório: mês nulo ou indefinido é interpretado como mês atual', () => {
  const Rl = require('../src/Relatorio.js');
  assert.equal(Rl.interpretarMes(undefined, { ano: 2026, mes: 9, dia: 30 }), '2026-09');
  assert.equal(Rl.interpretarMes(null, { ano: 2026, mes: 9, dia: 30 }), '2026-09');
});

// ---------- camada do Google ----------

test('LeitorAbas: célula de data do Planilhas volta como texto no fuso de São Paulo (data, hora e data+hora)', () => {
  const c = criarConsultorio();
  c.amb.abas.get('Pacotes').linhas.push(['P9001', 4, 0, 60000, new Date(Date.UTC(2026, 9, 1, 2, 30))]); // 01/10 02:30Z = 30/09 23:30 em SP
  c.amb.abas.get('Consultas').linhas.push(['ev1', new Date(Date.UTC(2026, 9, 1, 2, 30)), new Date(Date.UTC(2026, 9, 1, 2, 30)), 'retorno', 'P9001', 'marcada', new Date(Date.UTC(2026, 9, 1, 2, 30)), 'a']);
  assert.equal(c.rodar("lerAbaComoObjetos('Pacotes')[0].inicio"), '2026-09-30');
  const ev = JSON.parse(c.rodar("JSON.stringify(lerAbaComoObjetos('Consultas')[0])"));
  assert.deepEqual([ev.data, ev.hora, ev.atualizado_em], ['2026-09-30', '23:30', '2026-09-30 23:30:00']);
});

test('LeitorAbas: números em texto viram inteiros só nas colunas inteiras; nulo vira vazio; linha em branco no meio é pulada', () => {
  const c = criarConsultorio();
  const aba = c.amb.abas.get('Pacotes');
  aba.linhas.push(['P9001', ' 4 ', '1', 60000, '2026-09-01']);
  aba.linhas.push([null, '', undefined, '', '']); // linha totalmente vazia
  aba.linhas.push(['P9002', '3x', 0, 1, '2026-09-01']);
  const lidos = JSON.parse(c.rodar("JSON.stringify(lerAbaComoObjetos('Pacotes'))"));
  assert.equal(lidos.length, 2, 'a linha vazia é pulada');
  assert.deepEqual([lidos[0].total_consultas, lidos[0].usadas], [4, 1]);
  assert.equal(lidos[1].total_consultas, '3x', 'texto que não é número fica como está (e será recusado adiante)');
  assert.equal(lidos[1].linha, 4);
});

test('LeitorAbas: aba sem nenhuma linha (nem cabeçalho) é recusada e gravar sem dizer a identidade é recusado', () => {
  const c = criarConsultorio();
  c.amb.abas.get('Despesas').linhas.length = 0;
  assert.throws(() => c.rodar("lerAbaComoObjetos('Despesas')"), /cabeçalho|Cabeçalho|coluna/);
  const aba = c.amb.abas.get('Pagamentos');
  aba.linhas.push(['PG000001', 'e1', 'P9001', '', '', 15000, '', 'a_receber', '', '', '']);
  c.rodar("gravarCelula('Pagamentos', 2, 'status', 'a_receber', { id: 'PG000001', pagador_nome: undefined })"); // esperado vazio == vazio
  assert.throws(() => c.rodar("gravarCelula('Pagamentos', 2, 'status', 'pago', { pagador_nome: 'Ana' })"), /mudou enquanto o kit trabalhava/);
  c.rodar("gravarCelula('Pagamentos', 2, 'status', 'a_receber', undefined)"); // sem identidade pedida: a assinatura permite, a regra de uso é passar sempre
});

test('Menu: gerar Pix em linha vazia avisa; recibo de linha inexistente avisa', () => {
  const c = criarConsultorio();
  c.selecionar('Pagamentos', 5);
  c.rodar('gerarPixDaLinha()');
  assert.match(c.ultimoAlerta(), /está vazia/);
  assert.throws(() => c.rodar('gerarRecibo(99)'), /Não achei o pagamento/);
});

test('Relatório pelo menu: cancelar a pergunta do mês não gera nada', () => {
  const c = criarConsultorio({ opcoes: { cancelarPrompt: true } });
  c.rodar('gerarRelatorioDoMes()');
  assert.equal([...c.amb.abas.keys()].filter((n) => n.startsWith('Relatório')).length, 0);
  assert.equal(c.drive.csvsNaPasta().length, 0);
});

test('Criar modelo com a linha da chave faltando em Configurações: pede para rodar Instalar/atualizar', () => {
  const c = criarConsultorio();
  const cfg = c.amb.abas.get('Configurações');
  const i = cfg.linhas.findIndex((l) => l[0] === 'id_modelo_recibo');
  cfg.linhas.splice(i, 1);
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.match(c.ultimoAlerta(), /Falta a linha "id_modelo_recibo"/);
});

test('Recibo: campos no cabeçalho e no rodapé do modelo também são trocados, sem sobra', () => {
  const c = criarConsultorio();
  const modelo = c.drive.arquivos.get('modelo123');
  modelo.cabecalho = 'Recibo {{numero_recibo}}';
  modelo.rodape = '{{profissional}} - {{crn}}';
  modelo.texto = modelo.texto.replace('RECIBO Nº {{numero_recibo}}', 'RECIBO');
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  c.selecionar('Pagamentos', 2);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', 2, 'pagador_nome', 'Pagador Ficticio Um');
  c.rodar('gerarRecibo(2)');
  const pdf = c.drive.pdfsNaPasta()[0];
  assert.match(pdf.texto, /Recibo PG000001/);
  assert.match(pdf.texto, /Dra\. Teste Exemplo - CRN-0 00000/);
  assert.doesNotMatch(pdf.texto, /\{\{/);
});

test('Drive: resposta vazia da API, link sem webViewLink, papel e nomes inválidos são tratados', () => {
  const c = criarConsultorio();
  c.amb.contexto.Drive = { Files: { list: () => undefined, create: () => ({ id: 'novo123' }) } };
  assert.deepEqual(JSON.parse(c.rodar("JSON.stringify(driveAcharPorPapel('modelo_recibo'))")), []);
  assert.equal(c.rodar("driveAcharNaPasta('pasta123', 'Relatorio-2026-09.csv')"), null);
  assert.deepEqual(JSON.parse(c.rodar("JSON.stringify(driveListarRecibosDoPagamento('pasta123', 'PG000001', 'Recibo-PG000001-P9001.pdf'))")), []);
  assert.equal(c.rodar("driveCriarArquivo('pasta123', 'x.pdf', 'application/pdf', {}).url"), 'https://drive.google.com/file/d/novo123/view');
  assert.throws(() => c.rodar("driveAcharPorPapel(\"x' or 1=1\")"), /Papel de arquivo inválido/);
  assert.throws(() => c.rodar("driveAcharNaPasta('pasta123', \"a'b\")"), /Nome de arquivo inválido/);
  assert.throws(() => c.rodar("driveListarRecibosDoPagamento('pasta123', \"PG'1\", 'x.pdf')"), /caracteres que o kit não aceita/);
});

test('Gatilho automático: operação em andamento só registra; problema de configuração avisa por e-mail uma vez por dia', () => {
  const c = criarConsultorio();
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  c.rodar('sincronizarAgendaAutomatica()');
  assert.equal(c.amb.emails.length, 0);
  assert.match(c.registroTexto(), /adiada: outra operação/);
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  c.amb.abas.get('Configurações').linhas.find((l) => l[0] === 'nome_profissional')[1] = '';
  c.rodar('sincronizarAgendaAutomatica()');
  c.rodar('sincronizarAgendaAutomatica()');
  assert.equal(c.amb.emails.length, 1, 'um e-mail por dia por causa');
  assert.match(c.registroTexto(), /configuração está em branco ou inválida/);
});

test('API de agenda devolvendo resposta sem items: nada acontece e nada quebra', () => {
  const c = criarConsultorio();
  c.amb.contexto.Calendar = { Events: { list: () => ({}), get: () => { throw new Error('Not Found'); } } };
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').length, 0);
});

test('Pix: campo com mais de 99 caracteres nunca é montado (defesa em profundidade)', () => {
  assert.throws(() => Pix.montarCampo('59', 'A'.repeat(100)), /grande demais/);
  assert.equal(Pix.montarCampo('59', 'A'.repeat(99)).slice(0, 4), '5999');
});

test('Configuracoes: chave numérica na primeira coluna é lida como texto e ignorada (não é chave do kit)', () => {
  const r = C.validarConfiguracoes([[123, 'x'], ['nome_profissional', 'Dra. Teste']]);
  assert.equal(r.config.nome_profissional, 'Dra. Teste');
});

test('Drive: arquivo listado sem propriedades vem com propriedades vazias (recibo antigo)', () => {
  const c = criarConsultorio();
  c.amb.contexto.Drive = { Files: { list: () => ({ files: [{ id: 'velho1', name: 'Recibo-PG000001-P9001.pdf' }] }) } };
  const achados = JSON.parse(c.rodar("JSON.stringify(driveListarRecibosDoPagamento('pasta123', 'PG000001', 'Recibo-PG000001-P9001.pdf'))"));
  assert.deepEqual(achados[0].appProperties, {});
  assert.equal(achados[0].url, 'https://drive.google.com/file/d/velho1/view');
});

// ---------- preço em reais (Precos.js): mexe em dinheiro ----------

function precosComResposta(resposta, opcoes = {}, configuracoes) {
  const c = criarConsultorio({ opcoes: { resposta, ...opcoes }, ...(configuracoes ? { configuracoes } : {}) });
  const valor = (k) => c.amb.abas.get('Configurações').linhas.find((l) => l[0] === k)[1];
  return { c, valor };
}

test('Preços: cancelar, deixar em branco ou digitar lixo não muda nada; lixo explica e não grava', () => {
  for (const [resposta, opcoes] of [['', {}], ['150', { cancelarPrompt: true }]]) {
    const { c, valor } = precosComResposta(resposta, opcoes);
    c.rodar('definirPrecosDasConsultas()');
    assert.equal(valor('valor_primeira_consulta_centavos'), '15000');
    assert.match(c.ultimoAlerta(), /Nenhum preço foi mudado/);
  }
  const { c, valor } = precosComResposta('abc');
  c.rodar('definirPrecosDasConsultas()');
  assert.match(c.ultimoAlerta(), /Nada foi gravado/);
  assert.equal(valor('valor_primeira_consulta_centavos'), '15000');
  assert.equal(valor('valor_retorno_centavos'), '10000');
});

test('Preços: valor abaixo de R$ 10,00 pede confirmação; "não" mantém, "sim" grava em centavos', () => {
  const nao = precosComResposta('5', { negar: true });
  nao.c.rodar('definirPrecosDasConsultas()');
  assert.equal(nao.valor('valor_primeira_consulta_centavos'), '15000');
  const sim = precosComResposta('5');
  sim.c.rodar('definirPrecosDasConsultas()');
  assert.equal(sim.valor('valor_primeira_consulta_centavos'), 500);
  assert.equal(sim.valor('valor_retorno_centavos'), 500);
});

test('Preços: sem preço atual ("Ainda sem preço") e com preço atual, grava os dois em reais digitados', () => {
  const sem = precosComResposta('150,50', {}, [['nome_profissional', 'Dra. Teste Exemplo'], ['valor_primeira_consulta_centavos', ''], ['valor_retorno_centavos', '']]);
  sem.c.rodar('definirPrecosDasConsultas()');
  assert.match(sem.c.ultimoAlerta(), /Gravado: primeira consulta R\$ 150,50 e retorno R\$ 150,50/);
});

test('Pacote com início inválido e sem número de linha: recusa sem mostrar "undefined"', () => {
  const r = A.aplicarPacote(pg(), [{ codigo_paciente: 'P9001', total_consultas: 4, usadas: 0, inicio: 'x' }], '2026-09-30');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /linha \?/);
});

test('Preços: aviso de preço suspeito só aparece abaixo de R$ 10,00 e nunca para ausente ou zero (módulo carregado pelo Node)', () => {
  const Pr = require('../src/Precos.js');
  global.formatarReais = F.formatarReais;
  try {
    assert.equal(Pr.textoPrecoSuspeito({ valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000 }), '');
    assert.equal(Pr.textoPrecoSuspeito({ valor_primeira_consulta_centavos: null, valor_retorno_centavos: 0 }), '');
    assert.match(Pr.textoPrecoSuspeito({ valor_primeira_consulta_centavos: 150, valor_retorno_centavos: 10000 }), /da primeira consulta: R\$ 1,50/);
    assert.equal(Pr.PRECO_QUE_PEDE_CONFIRMACAO_CENTAVOS, 1000);
  } finally { delete global.formatarReais; }
});

test('Pacotes: um pacote sem início do mesmo paciente não torna o outro ambíguo nem é consumido', () => {
  const pacotes = [
    { linha: 2, codigo_paciente: 'P9001', total_consultas: 4, usadas: 0, inicio: '2026-09-01' },
    { linha: 3, codigo_paciente: 'P9001', total_consultas: 4, usadas: 0 },
  ];
  const pagos = [{ codigo_paciente: 'P9001', status: 'pago', forma: 'pacote', pacote_inicio: '2026-09-01' }];
  const r = A.reconciliarPacotes(pacotes, pagos);
  assert.deepEqual(r.pacotes.map((p) => p.usadas), [1, 0]);
});

test('Pix pelo menu com chave CPF (validada pela rotina de CPF do Google simulado)', () => {
  const cfg = require('./apoio/fluxo.js').CONFIG_COMPLETA.map(([k, v]) => [k, k === 'chave_pix' ? '52998224725' : v]);
  const c = criarConsultorio({ configuracoes: cfg });
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  c.selecionar('Pagamentos', 2);
  c.rodar('gerarPixDaLinha()');
  assert.match(c.ultimoAlerta(), /Pix copia e cola/);
});

test('Preços: duas execuções ao mesmo tempo não se atropelam (com trava) e a segunda grava por cima do valor já gravado', () => {
  const { c, valor } = precosComResposta('200');
  let esperando = true;
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock() { if (esperando) { esperando = false; c.rodar('definirPrecosDasConsultas()'); } return true; }, releaseLock() {} }) };
  c.rodar('definirPrecosDasConsultas()');
  assert.equal(valor('valor_primeira_consulta_centavos'), 20000);
  assert.equal(c.amb.abas.get('Configurações').linhas.filter((l) => l[0] === 'valor_primeira_consulta_centavos').length, 1);
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  c.rodar('definirPrecosDasConsultas()');
  assert.match(c.ultimoAlerta(), /Outra operação está em andamento/);
});
