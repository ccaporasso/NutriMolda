// Extensões independentes de R03/R04/R07/R11. Só dados fictícios, Google em memória.
// Execute na raiz do snapshot: node --test --test-isolation=none --test-reporter=spec <este-arquivo>
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const raiz = path.resolve(process.env.NUTRIMOLDA_REVIEW_ROOT || process.cwd());
const D = require(path.join(raiz, 'src/DadosTeste.js'));
const A = require(path.join(raiz, 'src/Acoes.js'));
const { criarAmbiente } = require(path.join(raiz, 'tests/apoio/simulacao.js'));
const { CONFIG_COMPLETA } = require(path.join(raiz, 'tests/apoio/fluxo.js'));
function ambiente(extra = {}) {
  const cfg = CONFIG_COMPLETA.map(l => l.slice());
  cfg.find(l => l[0] === 'calendario_id')[1] = 'agenda-teste@group.calendar.google.com';
  const amb = criarAmbiente({ configuracoes:cfg, ...extra });
  amb.carregar(...fs.readdirSync(path.join(raiz, 'src')).filter(n => n.endsWith('.js')).sort());
  return amb;
}
function pagamento(id, evento) { return [id,evento,'P0001','','',15000,'','a_receber','','']; }
test('R11d: renovar após uma consulta no mesmo dia não reatribui consumo antigo ao pacote novo', () => {
  const amb = ambiente({selecao:{aba:'Pagamentos',linhas:[2]}});
  amb.abas.get('Pagamentos').linhas.push(pagamento('PG000001','e1'),pagamento('PG000002','e2'));
  amb.abas.get('Pacotes').linhas.push(['P0001',1,0,15000,'2026-09-01']);
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(amb.abas.get('Pacotes').linhas[1][2],1);
  // Renovação legítima de um pacote esgotado, depois da primeira ação, sem alterar a data do pagamento.
  amb.abas.get('Pacotes').linhas.push(['P0001',2,0,25000,'2026-09-30']);
  amb.selecao.linhas=[3];
  amb.rodar('marcarConsultaDePacote()');
  const unidades = amb.abas.get('Pacotes').linhas.slice(1).reduce((s,l)=>s+l[2],0);
  assert.equal(unidades,2,JSON.stringify(amb.abas.get('Pacotes').linhas));
  assert.equal(amb.abas.get('Pacotes').linhas[2][2],1);
});
test('R11e: início impossível não pode produzir consumo de pacote', () => {
  const r=A.aplicarPacote({id:'PG000001',codigo_paciente:'P0001',status:'a_receber'},
    [{linha:2,codigo_paciente:'P0001',total_consultas:2,usadas:0,inicio:'2026-02-31'}],'2026-09-30');
  assert.equal(r.ok,false,'Data impossível foi aceita como identidade do pacote vigente');
});
test('R03f: limpeza preserva evento com id exato de teste vindo de outra agenda', () => {
  const amb=ambiente();
  const origem=amb.rodar("marcaDaAgenda('agenda-alheia@group.calendar.google.com')");
  amb.abas.get('Consultas').linhas.push([D.idEventoTeste(0),'2026-09-30','09:00','primeira','P0001','marcada','',origem]);
  amb.contexto.Calendar.Events.list=()=>({items:[]});
  amb.contexto.Calendar.Events.remove=()=>{};
  amb.rodar('apagarDadosDeTeste()');
  assert.equal(amb.abas.get('Consultas').linhas.length,2,'Linha de agenda alheia foi apagada por id_evento isolado');
});
test('R03g: pacote sem comprovação de geração é preservado mesmo com paciente fictício exato', () => {
  const p=D.PACIENTES_TESTE[0];
  const plano=D.planejarLimpezaDeTeste({pacientes:[{linha:2,codigo:p.codigo,email:p.email}],consultas:[],pagamentos:[],
    pacotes:[{linha:2,codigo_paciente:p.codigo,total_consultas:99,usadas:3,valor_centavos:99000,inicio:'2026-09-01'}]});
  assert.deepEqual(plano.Pacotes,[],'Gerador não cria pacotes nem mantém prova de origem deste pacote');
});
test('R03h: criar dados recusa colisão com evento cancelado sem marca do gerador antes de escrever', () => {
  const amb=ambiente(); const escritos=[];
  amb.contexto.Calendar.Events.get=(cal,id)=>{
    if(id===D.idEventoTeste(0)) return {id,status:'cancelled'};
    throw new Error('Not Found ficticio');
  };
  amb.contexto.Calendar.Events.update=(...args)=>escritos.push(args);
  amb.contexto.Calendar.Events.insert=(...args)=>escritos.push(args);
  try { amb.rodar('criarDadosDeTeste()'); } catch (e) { /* recusa conservadora é esperada */ }
  assert.equal(escritos.length,0,'Evento cancelado alheio foi reativado pela identidade incompleta');
  assert.equal(amb.abas.get('Pacientes').linhas.length,1,'Pacientes foram gravados antes de conferir colisões de eventos');
});
test('R07e: instalador recusa Configurações com coluna extra antes de acrescentar chaves', () => {
  const amb=ambiente(); const folha=amb.abas.get('Configurações');
  folha.linhas[0].push('coluna_alheia');
  folha.linhas.splice(folha.linhas.findIndex(l=>l[0]==='valor_retorno_centavos'),1);
  for(const f of amb.abas.values()) f.getProtections=()=>[];
  amb.rodar('instalarPlanilha()');
  assert.ok(!folha.linhas.some(l=>l[0]==='valor_retorno_centavos'),'Instalador acrescentou chave em estrutura incompatível');
});
test('R04d/R06b: mesmo id confirmado em outra agenda não gera vínculo ambíguo em Consultas', () => {
  const amb=ambiente();
  const origemAntiga=amb.rodar("marcaDaAgenda('agenda-antiga@group.calendar.google.com')");
  amb.abas.get('Consultas').linhas.push(['idigual','2026-10-01','09:00','primeira','P0001','marcada','',origemAntiga]);
  amb.contexto.Calendar.Events.list=()=>({items:[{id:'idigual',summary:'Consulta',status:'confirmed',
    start:{dateTime:'2026-10-02T09:00:00-03:00'},description:'novo@exemplo.invalid'}]});
  amb.abas.get('Pacientes').linhas.push(['P0002','Pessoa','F.','','novo@exemplo.invalid','leve','',true]);
  amb.rodar('sincronizarAgenda()');
  // Enquanto Pagamentos só guarda id_evento, uma colisão entre agendas deve falhar conservadoramente sem duplicar.
  assert.equal(amb.abas.get('Consultas').linhas.filter(l=>l[0]==='idigual').length,1,
    'Duas consultas distintas compartilham a única chave usada por cobrança/recibo');
});
