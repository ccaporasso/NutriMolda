// Crescimento da aba Registro (Gate, item 37). A sincronização automática roda de hora em hora: 24 x 365 = 8.760 execuções por ano.
// Este teste mede quantas linhas cada execução grava, que o e-mail de falha sai no máximo uma vez por dia por causa e que um Registro
// enorme não torna nenhuma operação mais lenta (o Registro só recebe linhas no fim: nunca é lido). A política está em docs/gate/RETENCAO-REGISTRO.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarCenario } = require('./apoio/escala.js');
const { criarConsultorio } = require('./apoio/fluxo.js');

const linhasDoRegistro = (c) => c.amb.abas.get('Registro').linhas.length - 1;
const esvaziarConfiguracao = (c, chave) => {
  const aba = c.amb.abas.get('Configurações');
  const linha = aba.linhas.find((l) => l[0] === chave);
  linha[1] = '';
};

test('sincronização automática com tudo certo: exatamente 1 linha por execução (24 por dia, 8.760 por ano)', () => {
  const c = criarConsultorio();
  for (let hora = 0; hora < 48; hora++) { c.amb.relogio.agora += 3600 * 1000; c.rodar('sincronizarAgendaAutomatica()'); }
  assert.equal(linhasDoRegistro(c), 48);
  assert.ok(c.amb.abas.get('Registro').linhas.slice(1).every((l) => l[1] === 'sincronizacao' && l[2] === 'info'));
  assert.equal(c.amb.emails.length, 0);
});

test('sincronização automática com problema que ela mesma corrige (cabeçalho alterado): 1 linha por execução e no máximo 1 e-mail por dia', () => {
  const c = criarConsultorio();
  c.amb.abas.get('Consultas').linhas[0][2] = 'hora_alterada';
  c.amb.relogio.agora = Date.UTC(2026, 9, 1, 3, 0, 0); // 00:00 em São Paulo: as 24 execuções cabem no mesmo dia
  for (let hora = 0; hora < 24; hora++) { c.rodar('sincronizarAgendaAutomatica()'); c.amb.relogio.agora += 3600 * 1000; }
  assert.equal(linhasDoRegistro(c), 24);
  assert.equal(c.amb.emails.length, 1, 'um e-mail no dia');
  // no dia seguinte, com o problema ainda lá, sai o segundo
  c.rodar('sincronizarAgendaAutomatica()'); // agora são 00:00 do dia 2
  assert.equal(c.amb.emails.length, 2);
  assert.equal(linhasDoRegistro(c), 25);
});

test('pior caso por execução: erro inesperado com e-mail de alerta impossível grava no máximo 2 linhas', () => {
  const c = criarConsultorio();
  esvaziarConfiguracao(c, 'email_alertas');
  c.amb.contexto.Calendar.Events.list = () => { throw new Error('Falha ficticia da agenda'); };
  const antes = linhasDoRegistro(c);
  c.rodar('sincronizarAgendaAutomatica()');
  assert.equal(linhasDoRegistro(c) - antes, 2, 'a falha e o aviso de que o e-mail não saiu');
});

test('A-17 (aberto, decisão do Caio): erro inesperado repetido manda 1 e-mail por execução; hoje não há limite diário para ele', () => {
  const c = criarConsultorio();
  c.amb.contexto.Calendar.Events.list = () => { throw new Error('Falha ficticia da agenda'); };
  for (let i = 0; i < 3; i++) c.rodar('sincronizarAgendaAutomatica()');
  assert.equal(c.amb.emails.length, 3, 'se este teste passar a falhar porque o limite diário foi adotado, atualize A-17 em docs/gate/ACHADOS.md');
  assert.equal(linhasDoRegistro(c), 3);
});

test('Registro com 100.000 linhas não muda nenhuma chamada da operação: ele só recebe linhas no fim e nunca é lido', () => {
  const medir = (linhasNoRegistro) => {
    const c = criarCenario({ pacientes: 50, consultas: 200 });
    const registro = c.amb.abas.get('Registro');
    for (let i = 0; i < linhasNoRegistro; i++) registro.linhas.push(['2026-01-01 00:00:00', 'sincronizacao', 'info', 'Sincronização: 0 nova(s), 0 atualizada(s), 0 cancelada(s), 0 a identificar.']);
    let leiturasDoRegistro = 0;
    const getRange = registro.getRange.bind(registro);
    registro.getRange = (...a) => { const r = getRange(...a); const gv = r.getValues; r.getValues = () => { leiturasDoRegistro++; return gv(); }; return r; };
    c.zerar();
    c.rodar('sincronizarAgendaAutomatica()');
    c.rodar("gerarRelatorioMensal('2026-09')");
    return { ...c.contador, drive: c.chamadasDrive(), leiturasDoRegistro, linhasNovas: registro.linhas.length - 1 - linhasNoRegistro };
  };
  const vazio = medir(0);
  const enorme = medir(100000);
  assert.equal(enorme.leiturasDoRegistro, 0, 'ninguém lê o Registro');
  assert.equal(enorme.leituras, vazio.leituras);
  assert.equal(enorme.escritas, vazio.escritas);
  assert.equal(enorme.drive, vazio.drive);
  assert.equal(enorme.linhasNovas, vazio.linhasNovas, 'cada execução soma só as suas linhas, sem apagar nenhuma');
  assert.equal(vazio.linhasNovas, 2, 'sincronização e relatório: uma linha cada');
});

test('nenhum código apaga ou reescreve linhas do Registro (nada de rotação silenciosa): só appendRow', () => {
  const codigo = fs.readdirSync(path.join(__dirname, '..', 'src')).filter((a) => a.endsWith('.js')).map((a) => fs.readFileSync(path.join(__dirname, '..', 'src', a), 'utf8')).join('\n');
  const trechos = [...codigo.matchAll(/.*Registro.*/g)].map((m) => m[0]).join('\n');
  assert.doesNotMatch(trechos, /deleteRows?|clearContent|\.clear\(\)|removeRows?/);
  // o Registro é referenciado em Alertas.js (appendRow) e no esquema/instalador; relatório limpa a SUA aba, não a do Registro
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'src', 'Alertas.js'), 'utf8'), /getSheetByName\('Registro'\)[\s\S]*appendRow\(linha\)/);
});

test('a política de retenção existe, é explícita e traz as contas', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'gate', 'RETENCAO-REGISTRO.md'), 'utf8');
  for (const trecho of [/8\.760/, /17\.520/, /Nada é apagado/i, /decisão do Caio/i, /10\.000\.000/]) assert.match(doc, trecho);
});
