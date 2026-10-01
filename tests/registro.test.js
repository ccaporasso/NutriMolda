// Testes da T03: lógica pura do Registro (Registro.js) e o fluxo de alerta (Alertas.js)
// rodando contra Google simulado. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  MAX_MENSAGEM, mascararDadosPessoais, montarLinhaRegistro, montarEmailAlerta, descreverFalha, moduloConhecido, tipoDeErro,
} = require('../src/Registro.js');
const { ABAS, colunasDeTexto } = require('../src/Esquema.js');

const DATA = '2026-09-29 14:05:00';

// --- lógica pura ---

test('linha do Registro segue as colunas: data_hora, modulo, nivel, mensagem', () => {
  const abaRegistro = ABAS.find((a) => a.nome === 'Registro');
  assert.deepEqual(abaRegistro.cabecalho, ['data_hora', 'modulo', 'nivel', 'mensagem']);
  assert.deepEqual(montarLinhaRegistro(DATA, 'sincronizacao', 'info', 'Consulta P0001 atualizada'),
    [DATA, 'sincronizacao', 'info', 'Consulta P0001 atualizada']);
});

test('nível inválido é recusado', () => {
  assert.throws(() => montarLinhaRegistro(DATA, 'x', 'critico', 'a'), /Nível de registro inválido/);
  assert.throws(() => montarLinhaRegistro(DATA, 'x', undefined, 'a'), /Nível de registro inválido/);
});

test('mensagem longa é cortada', () => {
  const linha = montarLinhaRegistro(DATA, 'x', 'aviso', 'a'.repeat(MAX_MENSAGEM + 200));
  assert.equal(Array.from(linha[3]).length, MAX_MENSAGEM + 1);
  assert.ok(linha[3].endsWith('…'));
});

test('mascara e-mail, telefone e CPF, mas deixa código de paciente', () => {
  assert.equal(mascararDadosPessoais('falha ao avisar ana@exemplo.com'), 'falha ao avisar [oculto]');
  assert.equal(mascararDadosPessoais('tel (11) 91234-5678 e +55 11 91234-5678'), 'tel [oculto] e [oculto]');
  assert.equal(mascararDadosPessoais('cpf 123.456.789-09 ou 12345678909'), 'cpf [oculto] ou [oculto]');
  assert.equal(mascararDadosPessoais('Paciente P0001, linha 12, 2026-09-29'), 'Paciente P0001, linha 12, 2026-09-29');
  assert.equal(mascararDadosPessoais('em 2026-09-29 14:05 falhou'), 'em 2026-09-29 14:05 falhou');
});

test('mensagem que começa como fórmula não vira fórmula na planilha', () => {
  for (const inicio of ['=1+1', '+1', '-1', '@soma']) {
    const texto = montarLinhaRegistro(DATA, 'x', 'erro', inicio)[3];
    assert.ok(texto.startsWith(' '), `sem proteção: ${inicio}`);
  }
});

test('módulo inválido vira "desconhecido" (nunca texto livre)', () => {
  assert.equal(montarLinhaRegistro(DATA, 'Ana Souza, 45 anos', 'erro', 'a')[1], 'desconhecido');
  assert.equal(montarLinhaRegistro(DATA, undefined, 'erro', 'a')[1], 'desconhecido');
});

test('R01: texto simples sem espaço fora da lista fechada também vira "desconhecido", no Registro e no e-mail', () => {
  assert.equal(montarLinhaRegistro(DATA, 'PessoaFicticia', 'erro', 'a')[1], 'desconhecido');
  assert.doesNotMatch(JSON.stringify(montarEmailAlerta('PessoaFicticia', DATA)), /PessoaFicticia/);
  assert.equal(montarLinhaRegistro(DATA, 'sincronizacao', 'erro', 'a')[1], 'sincronizacao');
});

test('e-mail de alerta traz módulo e horário, nunca a mensagem do erro', () => {
  const email = montarEmailAlerta('sincronizacao', DATA);
  assert.match(email.assunto, /sincronizacao/);
  assert.match(email.corpo, /aba Registro/);
  assert.ok(email.corpo.includes(DATA));
  // A função nem recebe a mensagem: o corpo não tem como conter dado do erro.
  assert.equal(montarEmailAlerta.length, 2);
});

test('descreverFalha grava só módulo e tipo de listas fechadas', () => {
  assert.equal(descreverFalha('teste', new Error('deu ruim')), 'Falha no módulo teste (tipo Error)');
  assert.equal(descreverFalha('sincronizacao', new TypeError('x')), 'Falha no módulo sincronizacao (tipo TypeError)');
  assert.equal(descreverFalha('Ana Souza', 'texto solto'), 'Falha no módulo desconhecido (tipo desconhecido)');
  assert.equal(moduloConhecido(undefined), 'desconhecido');
  const falso = new Error('x');
  falso.name = 'Paciente Ana Souza';
  assert.equal(tipoDeErro(falso), 'desconhecido');
});

test('a coluna data_hora do Registro é texto (horário não muda de fuso)', () => {
  const abaRegistro = ABAS.find((a) => a.nome === 'Registro');
  assert.ok(colunasDeTexto(abaRegistro).includes(1));
});

// --- fluxo com Google simulado ---

function criarAmbiente({ comAbaRegistro = true, emailAlertas = 'alertas@exemplo.com', falhaEmail = false } = {}) {
  const linhasRegistro = [];
  const emails = [];
  const logger = [];
  const fusos = [];
  const linhasConfig = [['email_alertas', emailAlertas]]; // resto ausente de propósito
  const abas = {
    Configurações: {
      getLastRow: () => linhasConfig.length + 1,
      getRange: () => ({ getValues: () => linhasConfig }),
    },
  };
  if (comAbaRegistro) abas.Registro = { appendRow: (l) => linhasRegistro.push(l) };
  const alertas = [];
  const contexto = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => abas[n] || null }),
      getUi: () => ({ alert: (m) => alertas.push(m) }),
    },
    Utilities: { formatDate: (_d, fuso) => { fusos.push(fuso); return DATA; } },
    MailApp: {
      sendEmail: (para, assunto, corpo) => {
        if (falhaEmail) throw new Error('cota de e-mails esgotada');
        emails.push({ para, assunto, corpo });
      },
    },
    Logger: { log: (m) => logger.push(m) },
  });
  for (const arq of ['Esquema.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', arq), 'utf8'), contexto, { filename: require('node:url').pathToFileURL(path.join(__dirname, '..', 'src', arq)).href });
  }
  return { contexto, linhasRegistro, emails, logger, fusos, alertas };
}

test('erro forçado aparece no Registro e gera e-mail sem detalhes', () => {
  const a = criarAmbiente();
  vm.runInContext('testarAlertaDeFalha()', a.contexto);
  assert.equal(a.linhasRegistro.length, 1);
  assert.deepEqual(Array.from(a.linhasRegistro[0]).slice(0, 3), [DATA, 'teste', 'erro']);
  assert.equal(a.linhasRegistro[0][3], 'Falha no módulo teste (tipo Error)');
  assert.equal(a.emails.length, 1);
  assert.equal(a.emails[0].para, 'alertas@exemplo.com');
  assert.ok(!a.emails[0].corpo.includes('Erro de teste forçado'));
  assert.ok(a.fusos.length > 0 && a.fusos.every((f) => f === 'America/Sao_Paulo'));
  assert.match(a.alertas[0], /Registrado na aba Registro: sim/);
});

test('sem aba Registro: não lança erro, usa o Logger e ainda envia o e-mail', () => {
  const a = criarAmbiente({ comAbaRegistro: false });
  const r = vm.runInContext("registrarErro('sincronizacao', new Error('falha'))", a.contexto);
  assert.equal(r.registrado, false);
  assert.equal(r.emailEnviado, true);
  assert.ok(a.logger.length >= 1);
});

test('e-mail de alerta ausente ou inválido: registra aviso e não envia', () => {
  for (const vazio of ['', 'isto-nao-e-email']) {
    const a = criarAmbiente({ emailAlertas: vazio });
    const r = vm.runInContext("registrarErro('sincronizacao', new Error('falha'))", a.contexto);
    assert.equal(r.registrado, true);
    assert.equal(r.emailEnviado, false);
    assert.equal(a.emails.length, 0);
    assert.ok(a.linhasRegistro.some((l) => l[1] === 'alertas' && l[2] === 'aviso'));
  }
});

test('falha ao enviar e-mail vira aviso no Registro, sem novo erro', () => {
  const a = criarAmbiente({ falhaEmail: true });
  const r = vm.runInContext("registrarErro('sincronizacao', new Error('falha'))", a.contexto);
  assert.equal(r.emailEnviado, false);
  assert.ok(a.linhasRegistro.some((l) => l[1] === 'alertas' && /não enviado/.test(l[3])));
});

const SENSIVEIS = ['Ana Souza', 'ana@exemplo.com', 'diabetes', 'tipo 2', '11912345678'];

function nenhumSensivel(textos) {
  const tudo = JSON.stringify(textos);
  for (const s of SENSIVEIS) assert.ok(!tudo.includes(s), `vazou: ${s}`);
}

test('regressão: mensagem de exceção com nome, e-mail e saúde fictícios não vai ao Registro, e-mail nem Logger', () => {
  const a = criarAmbiente();
  a.contexto.textoErro = 'Paciente Ana Souza, ana@exemplo.com, 11912345678: diabetes tipo 2';
  const r = vm.runInContext("registrarErro('sincronizacao', new Error(textoErro))", a.contexto);
  assert.equal(r.registrado, true);
  assert.equal(a.linhasRegistro[0][3], 'Falha no módulo sincronizacao (tipo Error)');
  nenhumSensivel([a.linhasRegistro, a.emails, a.logger]);
});

test('regressão: falha de gravação com texto sensível não vai ao Logger', () => {
  const a = criarAmbiente();
  a.contexto.textoErro = 'Paciente Ana Souza, ana@exemplo.com: diabetes tipo 2';
  a.contexto.SpreadsheetApp.getActiveSpreadsheet = () => ({
    getSheetByName: (n) => (n === 'Registro'
      ? { appendRow: () => { throw new Error(a.contexto.textoErro); } }
      : { getLastRow: () => 2, getRange: () => ({ getValues: () => [['email_alertas', 'alertas@exemplo.com']] }) }),
  });
  const r = vm.runInContext("registrarErro('sincronizacao', new Error(textoErro))", a.contexto);
  assert.equal(r.registrado, false);
  assert.equal(r.emailEnviado, true);
  assert.equal(a.logger[0], 'Kit do Consultório: não consegui gravar no Registro (módulo sincronizacao, tipo Error).');
  nenhumSensivel([a.logger, a.emails]);
});

test('regressão: módulo livre e nome de tipo livre viram "desconhecido"', () => {
  const a = criarAmbiente({ comAbaRegistro: false });
  vm.runInContext("registrarErro('Ana Souza', Object.assign(new Error('x'), { name: 'Ana Souza' }))", a.contexto);
  assert.equal(a.logger[0], 'Kit do Consultório: não consegui gravar no Registro (módulo desconhecido, tipo Error).');
  const b = criarAmbiente();
  vm.runInContext("registrarErro('Ana Souza', Object.assign(new Error('x'), { name: 'Ana Souza' }))", b.contexto);
  assert.equal(b.linhasRegistro[0][3], 'Falha no módulo desconhecido (tipo desconhecido)');
});

test('regressão: falha do envio de e-mail com texto sensível não vai ao Registro', () => {
  const a = criarAmbiente({ falhaEmail: true });
  a.contexto.MailApp.sendEmail = () => { throw new Error('Paciente Ana Souza: diabetes tipo 2'); };
  vm.runInContext("registrarErro('sincronizacao', new Error('x'))", a.contexto);
  nenhumSensivel([a.linhasRegistro, a.logger]);
  assert.ok(a.linhasRegistro.some((l) => l[3] === 'E-mail de alerta não enviado (tipo Error).'));
});

test('registrar com nível inválido não lança erro e não grava', () => {
  const a = criarAmbiente();
  assert.equal(vm.runInContext("registrar('x', 'critico', 'a')", a.contexto), false);
  assert.equal(a.linhasRegistro.length, 0);
});
