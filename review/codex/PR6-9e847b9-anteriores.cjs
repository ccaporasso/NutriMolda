// Revisão independente. Execute no diretório do repositório:
// node scripts/empacotar-producao.js
// node --test --test-isolation=none --test-reporter=spec /caminho/PR6-b12b35e.cjs
// Só dados fictícios e serviços Google simulados; nenhuma operação externa.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const raiz = path.resolve(process.env.NUTRIMOLDA_REVIEW_ROOT || process.cwd());
const A = require(path.join(raiz, 'src/Agenda.js'));
const P = require(path.join(raiz, 'src/Pagamentos.js'));
const D = require(path.join(raiz, 'src/DadosTeste.js'));
const R = require(path.join(raiz, 'src/Registro.js'));
const { criarAmbiente } = require(path.join(raiz, 'tests/apoio/simulacao.js'));
const cfg = {
  nome_profissional: 'Profissional Ficticio', crn: 'CRN-0 00000',
  valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000,
  regra_retorno_dias: 30, chave_pix: 'pix@exemplo.invalid', nome_recebedor_pix: 'TESTE',
  cidade_recebedor_pix: 'SAO PAULO', calendario_id: 'agenda-ficticia@group.calendar.google.com',
  prefixo_evento_consulta: 'Consulta', email_alertas: 'alerta@exemplo.invalid',
  id_modelo_recibo: '', id_pasta_recibos: '',
};
const janela = A.calcularJanelaAgenda({ ano: 2026, mes: 9, dia: 30 });
const pacientes = [{ codigo: 'P0001', email: 'paciente@exemplo.invalid', telefone: '', ativo: true }];
function evento(id, data, extra = {}) {
  return { id, summary: 'Consulta', status: 'confirmed', start: { dateTime: `${data}T09:00:00-03:00` },
    description: 'paciente@exemplo.invalid', ...extra };
}
function consulta(id, data, extra = {}) {
  return { linha: 2, id_evento: id, data, hora: '09:00', tipo: 'primeira', codigo_paciente: 'P0001',
    status: 'marcada', atualizado_em: '', ...extra };
}
function plano(eventos, existentes) {
  return A.planejarSincronizacaoAgenda({ eventos, existentes, pacientes, prefixo: 'Consulta', janela,
    agoraTexto: '2026-09-30 12:00:00' });
}
function ambiente(extra = {}) {
  const amb = criarAmbiente({ configuracoes: Object.entries(cfg), ...extra });
  amb.carregar(...fs.readdirSync(path.join(raiz, 'src')).filter(n => n.endsWith('.js')).sort());
  return amb;
}
test('CONTROLE: erro.message fictício não aparece no Registro nem no e-mail', () => {
  const amb = ambiente();
  amb.contexto.erroFicticio = new Error('Pessoa Ficticia; condicao clinica ficticia; contato@exemplo.invalid');
  amb.rodar("registrarErro('teste', erroFicticio)");
  const saida = JSON.stringify([amb.abas.get('Registro').linhas, amb.emails]);
  assert.doesNotMatch(saida, /Pessoa Ficticia|clinica ficticia|contato@/);
  assert.equal(amb.emails.length, 1);
});
test('CONTROLE: fallback do Logger não inclui a mensagem sensível da falha de gravação', () => {
  const amb = ambiente(); const logs = [];
  amb.contexto.Logger.log = s => logs.push(s);
  amb.abas.get('Registro').appendRow = () => { throw new Error('Pessoa Ficticia; clinica ficticia'); };
  amb.rodar("registrar('teste', 'info', 'Operacao de teste')");
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs.join(' '), /Pessoa Ficticia|clinica ficticia/);
});
test('R01: módulo fora da lista fechada deve ser desconhecido em todos os destinos', () => {
  assert.equal(R.montarLinhaRegistro('2026-09-30', 'PessoaFicticia', 'erro', 'Falha operacional')[1], 'desconhecido');
  assert.doesNotMatch(JSON.stringify(R.montarEmailAlerta('PessoaFicticia', '2026-09-30')), /PessoaFicticia/);
});
test('R02: saída efetiva de produção exclui gerador e escrita na agenda', () => {
  const script = path.join(raiz, 'scripts/empacotar-producao.js');
  assert.ok(fs.existsSync(script), 'Falta o empacotamento separado de produção');
  const E = require(script);
  const pacote = E.montarPacoteProducao();
  assert.deepEqual(E.verificarPacoteProducao(pacote), []);
  assert.ok(pacote.manifesto.oauthScopes.includes('https://www.googleapis.com/auth/calendar.events.readonly'));
  assert.ok(!pacote.manifesto.oauthScopes.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.ok(!pacote.arquivos.some(a => ['DadosTeste.js', 'GeradorTeste.js'].includes(a.nome)));
});
test('R03: apagador deve preservar P9500, que não foi criado pelo gerador', () => {
  const amb = ambiente({ google: { Calendar: { Events: { list: () => ({ items: [] }), remove() {} } } } });
  amb.abas.get('Pacientes').linhas.push(['P9500', 'Pessoa', 'F.', '', 'outra@exemplo.invalid', 'leve', '', true]);
  amb.rodar('apagarDadosDeTeste()');
  assert.ok(amb.abas.get('Pacientes').linhas.some(l => l[0] === 'P9500'), 'O apagador removeu uma linha alheia ao conjunto gerado');
});
test('R04: ausência na janela, sem prova de exclusão, não deve cancelar uma remarcação distante', () => {
  // O evento antigo foi remarcado para 2027-02-01, fora de timeMax (2027-01-28).
  // A listagem é completa para a janela, mas contém apenas um outro compromisso.
  const p = plano([evento('outro', '2026-10-02', { summary: 'Compromisso ficticio' })], [consulta('remarcado', '2026-10-10')]);
  assert.equal(p.canceladas, 0, 'Evento ausente da janela foi tratado como apagado');
});
test('R03b: apagador deve remover a consulta fictícia ainda sem paciente identificado', () => {
  const amb = ambiente({ google: { Calendar: { Events: { list: () => ({ items: [] }), remove() {} } } } });
  const id = D.idEventoTeste(8);
  // Refatoração R03i: origem explicitamente comprovada; código do paciente continua vazio.
  const origem = amb.rodar(`marcaDaAgenda(${JSON.stringify(cfg.calendario_id)})`);
  amb.abas.get('Consultas').linhas.push([id, '2026-10-05', '13:00', 'primeira', '', 'marcada', '', origem]);
  amb.rodar('apagarDadosDeTeste()');
  assert.ok(!amb.abas.get('Consultas').linhas.some(l => l[0] === id), 'Consulta gerada ficou na planilha porque seu código está vazio');
});
test('R05a: consulta cancelada nesta execução não deve converter a primeira em retorno', () => {
  const p = plano([{ id: 'antigo', status: 'cancelled' }, evento('novo', '2026-10-20')], [consulta('antigo', '2026-10-10')]);
  assert.equal(p.inserir[0][3], 'primeira');
});
test('R05b: histórico deve usar a data remarcada nesta execução, não a data antiga', () => {
  const p = plano([evento('antigo', '2026-11-10'), evento('novo', '2026-10-20')], [consulta('antigo', '2026-10-10')]);
  assert.equal(p.inserir[0][3], 'primeira');
});
test('R06: linha de consulta sem id_evento não deve criar cobrança repetidamente', () => {
  const consultas = [consulta('', '2026-10-10')];
  const p = P.planejarAReceber({ consultas, pagamentos: [], config: cfg });
  assert.equal(p.novos.length, 0, 'Foi criada cobrança sem vínculo com evento');
  const segunda = P.planejarAReceber({ consultas, pagamentos: p.novos, config: cfg });
  assert.equal(segunda.novos.length, 0, 'Cobrança repetida na segunda execução');
});
test('R07: leitor deve recusar cabeçalho diferente antes de interpretar/gravar dados', () => {
  const amb = ambiente();
  const aba = amb.abas.get('Pagamentos');
  [aba.linhas[0][5], aba.linhas[0][7]] = [aba.linhas[0][7], aba.linhas[0][5]];
  aba.linhas.push(['PG000001', 'evento1', 'P0001', '', '', 'pago', 'pix', 15000, '2026-09-30', '']);
  assert.throws(() => amb.rodar("lerAbaComoObjetos('Pagamentos')"), /cabe|coluna|estrutura/i);
});
test('R08: DriveApp de escrita exige drive, ausente do manifesto atual', () => {
  // Auditoria estática de compatibilidade, não uma chamada real ao Google.
  // Referência: developers.google.com/apps-script/reference/drive/file (makeCopy).
  // Para manter drive.file, trocar essas chamadas pelo serviço avançado/API Drive.
  const m = JSON.parse(fs.readFileSync(path.join(raiz, 'src/appsscript.json'), 'utf8'));
  const fontes = ['GeradorRecibo.js', 'GerarRelatorio.js'].map(n => fs.readFileSync(path.join(raiz, 'src', n), 'utf8')).join('\n');
  assert.ok(!m.oauthScopes.includes('https://www.googleapis.com/auth/drive'), 'Escopo amplo drive não autorizado');
  assert.ok(!/DriveApp\.|\.makeCopy\(|\.setTrashed\(/.test(fontes),
    'Métodos DriveApp usados exigem drive; drive.file não satisfaz seus escopos documentados');
});
test('R09: modelo sem os campos obrigatórios não deve gerar recibo incompleto', () => {
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] } });
  const configLinhas = amb.abas.get('Configurações').linhas;
  configLinhas.find(l => l[0] === 'id_modelo_recibo')[1] = 'modelo-ficticio';
  configLinhas.find(l => l[0] === 'id_pasta_recibos')[1] = 'pasta-ficticia';
  amb.abas.get('Pacientes').linhas.push(['P0001', 'Pessoa', 'F.', '', 'paciente@exemplo.invalid', 'leve', '', true]);
  amb.abas.get('Consultas').linhas.push(['e1', '2026-09-29', '09:00', 'primeira', 'P0001', 'realizada', '']);
  amb.abas.get('Pagamentos').linhas.push(['PG000001', 'e1', 'P0001', 'Pagador Ficticio', '', 15000, 'pix', 'pago', '2026-09-30', '']);
  const { criarDriveSimulado } = require(path.join(raiz, 'tests/apoio/drive.js'));
  const drive = criarDriveSimulado({ idModelo:'modelo-ficticio', idPasta:'pasta-ficticia' });
  drive.arquivos.get('modelo-ficticio').texto = 'RECIBO';
  amb.contexto.Drive = drive.Drive;
  amb.contexto.DocumentApp = drive.DocumentApp;
  amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.equal(drive.pdfsNaPasta().length, 0, 'Modelo incompleto produziu PDF');
  assert.equal(amb.abas.get('Pagamentos').linhas[1][9], '');
});
test('R10: relatório não deve atribuir CPF a outro pagamento só por igualdade de nome', () => {
  const Rel = require(path.join(raiz, 'src/Relatorio.js'));
  // CPF é o vetor sintético de teste já usado no repositório. Nenhuma pessoa real.
  const base = { status: 'pago', forma: 'pix', data_pagamento: '2026-09-30', pagador_nome: 'Pagador Ficticio' };
  const r = Rel.consolidarRecebimentos([
    { ...base, id: 'PG000001', codigo_paciente: 'P0001', pagador_cpf: '52998224725', valor_centavos: 15000 },
    { ...base, id: 'PG000002', codigo_paciente: 'P0002', pagador_cpf: '', valor_centavos: 10000 },
  ], '2026-09');
  assert.equal(r.pagadores.find(g => g.cpf === '52998224725').totalCentavos, 15000,
    'Pagamento sem CPF de pessoa homônima foi atribuído ao CPF da outra');
  assert.ok(r.pagadores.some(g => !g.cpf));
});
test('R11: falha ao gravar pagamento não deve consumir duas consultas de pacote ao repetir', () => {
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] } });
  amb.abas.get('Pagamentos').linhas.push(['PG000001', 'e1', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  amb.abas.get('Pacotes').linhas.push(['P0001', 2, 0, 25000, '2026-09-01']);
  const aba = amb.abas.get('Pagamentos');
  const original = aba.getRange;
  let falharUmaVez = true;
  aba.getRange = (...args) => {
    const range = original(...args); const gravar = range.setValues;
    range.setValues = v => { if (falharUmaVez) { falharUmaVez = false; throw new Error('Falha ficticia de gravacao'); } return gravar(v); };
    return range;
  };
  amb.rodar('marcarConsultaDePacote()');
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(amb.abas.get('Pacotes').linhas[1][2], 1, 'Uma consulta consumiu duas unidades após repetição');
  assert.equal(amb.abas.get('Pagamentos').linhas[1][7], 'pago');
});
test('R11b: leitura do pacote deve ocorrer depois de adquirir a trava', () => {
  const amb = ambiente({ selecao: { aba: 'Pagamentos', linhas: [2] } });
  amb.abas.get('Pagamentos').linhas.push(['PG000001', 'e1', 'P0001', '', '', 15000, '', 'a_receber', '', '']);
  amb.abas.get('Pacotes').linhas.push(['P0001', 1, 0, 15000, '2026-09-01']);
  let primeiraTrava = true;
  amb.contexto.LockService.getScriptLock = () => ({ tryLock() {
    // Outra execução terminou de consumir o pacote enquanto esta esperava a trava.
    if (primeiraTrava) { primeiraTrava = false; amb.abas.get('Pacotes').linhas[1][2] = 1; }
    return true;
  }, releaseLock() {} });
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(amb.abas.get('Pagamentos').linhas[1][7], 'a_receber', 'Consulta recebeu pacote já esgotado devido à leitura anterior à trava');
});

// Ampliações dos contratos já revistos: os resultados esperados continuam conservadores.
test('R03c: código reservado sem prova de origem não autoriza apagar linhas', () => {
  const p=D.planejarLimpezaDeTeste({ pacientes:[],
    consultas:[{linha:2,id_evento:'eventoalheio',codigo_paciente:'P9001'}],
    pagamentos:[{linha:2,id_evento:'eventoalheio',codigo_paciente:'P9001'}],
    pacotes:[{linha:2,codigo_paciente:'P9001'}] });
  assert.deepEqual(p,{Pacientes:[],Consultas:[],Pagamentos:[],Pacotes:[]});
});
test('R03d: prefixo não comprova pertencer aos nove eventos gerados', () => {
  assert.equal(D.idEventoEhDeTeste('kittestealheio'),false);
});
test('R03e: consulta alheia do mesmo paciente fictício deve ser preservada', () => {
  const p=D.planejarLimpezaDeTeste({ pacientes:[{linha:2,codigo:'P9001',email:'ana.teste@exemplo.invalid'}],
    consultas:[{linha:2,id_evento:'eventoalheio',codigo_paciente:'P9001'}],pagamentos:[],pacotes:[] });
  assert.deepEqual(p.Consultas,[]);
});
test('R04b: troca de agenda não deve perder a origem na segunda sincronização', () => {
  const amb=ambiente();
  amb.abas.get('Consultas').linhas.push(['mesmoid','2026-10-10','09:00','primeira','P0001','marcada','']);
  amb.propriedades.set('calendario_da_ultima_sincronizacao','agenda-antiga@group.calendar.google.com');
  amb.contexto.Calendar.Events.list=()=>({items:[evento('outro','2026-10-02',{summary:'Compromisso ficticio'})]});
  const consultados=[];
  amb.contexto.Calendar.Events.get=(cal,id)=>{consultados.push([cal,id]);return {id,status:'cancelled'};};
  amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas[1][5],'marcada');
  amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas[1][5],'marcada',JSON.stringify(consultados));
});
test('R04c: ID igual em agenda nova não autoriza cancelar consulta da agenda antiga', () => {
  const amb=ambiente();
  amb.abas.get('Consultas').linhas.push(['mesmoid','2026-10-10','09:00','primeira','P0001','marcada','']);
  amb.propriedades.set('calendario_da_ultima_sincronizacao','agenda-antiga@group.calendar.google.com');
  amb.contexto.Calendar.Events.list=()=>({items:[{id:'mesmoid',status:'cancelled'}]});
  amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas[1][5],'marcada');
});
test('R11c: duas consultas não devem consumir três unidades ao renovar um pacote', () => {
  const amb=ambiente({selecao:{aba:'Pagamentos',linhas:[2]}});
  amb.abas.get('Pagamentos').linhas.push(['PG000001','e1','P0001','','',15000,'','a_receber','','']);
  amb.abas.get('Pagamentos').linhas.push(['PG000002','e2','P0001','','',15000,'','a_receber','','']);
  amb.abas.get('Pacotes').linhas.push(['P0001',2,0,25000,'2026-09-01']);
  amb.abas.get('Pacotes').linhas.push(['P0001',2,0,25000,'2026-09-15']);
  amb.rodar('marcarConsultaDePacote()');
  amb.selecao.linhas=[3];
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(amb.abas.get('Pagamentos').linhas.filter(l=>l[7]==='pago'&&l[6]==='pacote').length,2);
  assert.equal(amb.abas.get('Pacotes').linhas.slice(1).reduce((s,l)=>s+l[2],0),2,
    JSON.stringify(amb.abas.get('Pacotes').linhas));
});
test('R07b: leitor de Configurações deve recusar cabeçalho invertido', () => {
  const amb=ambiente();
  amb.abas.get('Configurações').linhas[0]=['valor','chave'];
  assert.throws(()=>amb.rodar('lerConfiguracoes()'),/cabe|coluna|estrutura/i);
});
test('R07c: gravador de Configurações deve recusar cabeçalho invertido sem escrita', () => {
  const amb=ambiente();
  amb.abas.get('Configurações').linhas[0]=['valor','chave'];
  assert.throws(()=>amb.rodar("atualizarConfiguracao_('valor_retorno_centavos',20000)"),/cabe|coluna|estrutura/i);
});
test('R07d: cabeçalho com coluna extra deve ser recusado antes da leitura', () => {
  const amb=ambiente();
  const aba=amb.abas.get('Pagamentos');
  aba.linhas[0].push('coluna_extra');
  aba.getLastColumn=()=>aba.linhas[0].length;
  assert.throws(()=>amb.rodar("lerAbaComoObjetos('Pagamentos')"),/cabe|coluna|estrutura/i);
});
test('CONTROLE: menu e manifesto reais do pacote de produção preservam R02 e D17', () => {
  const pacote=require(path.join(raiz,'scripts/empacotar-producao.js')).montarPacoteProducao();
  const amb=criarAmbiente();
  const pasta=path.join(raiz,'dist/producao');
  const nomes=fs.readdirSync(pasta).sort();
  assert.deepEqual(nomes,[...pacote.arquivos.map(a=>a.nome),'appsscript.json'].sort());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pasta,'appsscript.json'),'utf8')),pacote.manifesto);
  for(const arquivo of pacote.arquivos) {
    const texto=fs.readFileSync(path.join(pasta,arquivo.nome),'utf8');
    assert.equal(texto,arquivo.conteudo);
    amb.carregarTexto(arquivo.nome,texto);
  }
  amb.rodar('onOpen()');
  assert.doesNotMatch(JSON.stringify(amb.menu),/criarDadosDeTeste|apagarDadosDeTeste/);
  assert.match(JSON.stringify(amb.menu),/Definir preços das consultas \(em reais\)/);
  assert.ok(pacote.manifesto.dependencies.enabledAdvancedServices.some(s=>s.userSymbol==='Drive'&&s.version==='v3'));
  assert.ok(!pacote.manifesto.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
});
