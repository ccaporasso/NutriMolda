// Monta o consultório inteiro num Google simulado, só com dados inventados: config, pacientes P9xxx,
// agenda com os eventos de DadosTeste.js, Drive e Docs. Serve aos testes de integração e de falhas.
const D = require('../../src/DadosTeste.js');
const { criarAmbiente } = require('./simulacao.js');
const { criarDriveSimulado } = require('./drive.js');

const CONFIG_COMPLETA = [
  ['nome_profissional', 'Dra. Teste Exemplo'], ['crn', 'CRN-0 00000'], ['valor_primeira_consulta_centavos', '15000'],
  ['valor_retorno_centavos', '10000'], ['regra_retorno_dias', '30'], ['chave_pix', 'teste@exemplo.invalid'],
  ['nome_recebedor_pix', 'DRA TESTE'], ['cidade_recebedor_pix', 'SAO PAULO'], ['calendario_id', 'primary'],
  ['prefixo_evento_consulta', 'Consulta'], ['email_alertas', 'alerta@exemplo.invalid'],
  ['id_modelo_recibo', 'modelo123'], ['id_pasta_recibos', 'pasta123'],
];

const ARQUIVOS_SRC = ['Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js', 'Execucao.js',
  'LeitorAbas.js', 'Agenda.js', 'SincronizarAgenda.js', 'Pagamentos.js', 'GerarAReceber.js', 'Pix.js', 'Acoes.js', 'Recibo.js',
  'DriveAvancado.js', 'GeradorRecibo.js', 'Relatorio.js', 'GerarRelatorio.js', 'Instalador.js', 'Menu.js'];

const HOJE = { ano: 2026, mes: 9, dia: 30 };

// Evento no formato da API do Google Agenda (v3), a partir do evento de teste.
function eventoDaAgenda(e) {
  return {
    id: e.id, status: 'confirmed', summary: e.titulo, description: e.descricao,
    start: { dateTime: `${e.inicio}-03:00` }, end: { dateTime: `${e.fim}-03:00` },
  };
}

function criarConsultorio({ configuracoes = CONFIG_COMPLETA, comDrive = true, opcoes = {} } = {}) {
  const drive = criarDriveSimulado();
  const eventos = D.montarEventosTeste(HOJE).map(eventoDaAgenda);
  const amb = criarAmbiente({
    configuracoes, eventos, resposta: '2026-09', selecao: { aba: 'Consultas', linhas: [] },
    google: comDrive ? { Drive: drive.Drive, DocumentApp: drive.DocumentApp } : {}, ...opcoes,
  });
  for (const p of D.PACIENTES_TESTE) amb.abas.get('Pacientes').linhas.push(D.linhaPaciente(p));
  amb.carregar(...ARQUIVOS_SRC);
  const api = {
    amb, drive, eventos,
    linhas: (aba) => amb.abas.get(aba).linhas.slice(1),
    selecionar: (aba, ...linhas) => { amb.selecao.aba = aba; amb.selecao.linhas = linhas; },
    // Número da linha (1 = cabeçalho) da primeira linha cuja coluna tem o valor.
    linhaOnde: (aba, coluna, valor) => {
      const cab = amb.abas.get(aba).linhas[0];
      const i = amb.abas.get(aba).linhas.findIndex((l, n) => n > 0 && l[cab.indexOf(coluna)] === valor);
      return i < 0 ? null : i + 1;
    },
    celula: (aba, numeroLinha, coluna) => amb.abas.get(aba).linhas[numeroLinha - 1][amb.abas.get(aba).linhas[0].indexOf(coluna)],
    definir: (aba, numeroLinha, coluna, valor) => { amb.abas.get(aba).linhas[numeroLinha - 1][amb.abas.get(aba).linhas[0].indexOf(coluna)] = valor; },
    rodar: (codigo) => amb.rodar(codigo),
    registroTexto: () => amb.abas.get('Registro').linhas.slice(1).map((l) => l.join(' ')).join('\n'),
    ultimoAlerta: () => amb.alertas.at(-1),
  };
  return api;
}

// Tudo o que poderia vazar dado de paciente: Registro, assunto e corpo dos e-mails de alerta (o destinatário é
// a própria nutricionista, então não conta) e nomes de arquivo.
function textoQuePodeVazar(c) {
  const nomes = [...c.drive.arquivos.values()].map((a) => a.nome).join('\n');
  const emails = c.amb.emails.map(([, assunto, corpo]) => `${assunto}\n${corpo}`).join('\n');
  return [c.registroTexto(), emails, nomes].join('\n');
}

module.exports = { CONFIG_COMPLETA, HOJE, criarConsultorio, textoQuePodeVazar, eventoDaAgenda };
