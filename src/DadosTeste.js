// Dados FICTÍCIOS para a planilha e a agenda de TESTE (lógica pura, sem chamadas ao Google).
// Nada aqui é dado real: nomes, telefones e e-mails são inventados
// (e-mails no domínio reservado .invalid, telefones no formato de exemplo 55 11 90000-xxxx).
// Só os códigos dos pacientes gerados aqui (P9001 a P9006) e os eventos de id `kitteste..` contam como dado do gerador:
// o apagador não toca em nenhuma outra linha, mesmo que o código comece com P9 (R03).

const MARCA_TESTE = 'kit_teste'; // propriedade privada gravada nos eventos de teste
const PREFIXO_ID_EVENTO = 'kitteste'; // ids de evento: só letras a-v e algarismos
const ID_AGENDA_SECUNDARIA = /@group\.calendar\.google\.com$/;

const PACIENTES_TESTE = [
  { codigo: 'P9001', primeiro_nome: 'Ana', inicial_sobrenome: 'S.', telefone: '5511900000001', email: 'ana.teste@exemplo.invalid', modo_acompanhamento: 'porta_aberta' },
  { codigo: 'P9002', primeiro_nome: 'Bruno', inicial_sobrenome: 'M.', telefone: '5511900000002', email: 'bruno.teste@exemplo.invalid', modo_acompanhamento: 'leve' },
  { codigo: 'P9003', primeiro_nome: 'Carla', inicial_sobrenome: 'P.', telefone: '5511900000003', email: 'carla.teste@exemplo.invalid', modo_acompanhamento: 'proximo' },
  { codigo: 'P9004', primeiro_nome: 'Diego', inicial_sobrenome: 'R.', telefone: '5511900000004', email: 'diego.teste@exemplo.invalid', modo_acompanhamento: 'leve' },
  { codigo: 'P9005', primeiro_nome: 'Elisa', inicial_sobrenome: 'T.', telefone: '5511900000005', email: 'elisa.teste@exemplo.invalid', modo_acompanhamento: 'porta_aberta' },
  { codigo: 'P9006', primeiro_nome: 'Fábio', inicial_sobrenome: 'L.', telefone: '5511900000006', email: 'fabio.teste@exemplo.invalid', modo_acompanhamento: 'leve' },
];

// deslocamentoDias: relativo a "hoje" (negativo = passado). codigo null = paciente desconhecido
// (vai para "a identificar" na T05).
const EVENTOS_TESTE = [
  { codigo: 'P9001', deslocamentoDias: -21, hora: '09:00', tipo: 'primeira' },
  { codigo: 'P9001', deslocamentoDias: 7, hora: '09:00', tipo: 'retorno' },
  { codigo: 'P9002', deslocamentoDias: -14, hora: '10:00', tipo: 'primeira' },
  { codigo: 'P9003', deslocamentoDias: -7, hora: '14:00', tipo: 'primeira' },
  { codigo: 'P9003', deslocamentoDias: 14, hora: '14:00', tipo: 'retorno' },
  { codigo: 'P9004', deslocamentoDias: 1, hora: '11:00', tipo: 'primeira' },
  { codigo: 'P9005', deslocamentoDias: 3, hora: '15:30', tipo: 'primeira' },
  { codigo: 'P9006', deslocamentoDias: 10, hora: '16:00', tipo: 'retorno' },
  { codigo: null, deslocamentoDias: 5, hora: '13:00', tipo: 'primeira' },
];

const CONTATO_DESCONHECIDO = 'desconhecido.teste@exemplo.invalid';
const DURACAO_MINUTOS = 50;

function doisDigitos_(n) {
  return String(n).padStart(2, '0');
}

// hoje = { ano, mes, dia } (mes 1-12). Soma dias sem depender do fuso do computador.
function somarDias_(hoje, dias) {
  const d = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + dias));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

function textoData_(d) {
  return `${d.ano}-${doisDigitos_(d.mes)}-${doisDigitos_(d.dia)}`;
}

function somarMinutos_(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  return `${doisDigitos_(Math.floor(total / 60) % 24)}:${doisDigitos_(total % 60)}`;
}

// Só aceita agenda secundária (termina em @group.calendar.google.com).
// 'primary' e o e-mail da própria conta são recusados: dados de teste nunca vão para a agenda real.
function validarAgendaDeTeste(calendarioId) {
  const id = typeof calendarioId === 'string' ? calendarioId.trim() : '';
  if (id === '' || id === 'primary' || !ID_AGENDA_SECUNDARIA.test(id)) {
    return {
      ok: false,
      erro: 'Os dados de teste só podem ir para uma agenda separada, criada só para teste. '
        + 'Crie uma agenda nova no Google Agenda (por exemplo, "Kit TESTE") e cole o ID dela '
        + 'em "calendario_id" na aba Configurações. O ID termina em @group.calendar.google.com. '
        + 'A agenda principal nunca é usada.',
    };
  }
  return { ok: true };
}

// Ids válidos para o Google Agenda (a-v, 0-9). Fixos: rodar duas vezes não duplica.
function idEventoTeste(indice) {
  return `${PREFIXO_ID_EVENTO}${doisDigitos_(indice + 1)}`;
}

function idEventoEhDeTeste(id) {
  return typeof id === 'string' && id.startsWith(PREFIXO_ID_EVENTO);
}

// Monta os eventos com datas relativas a "hoje". Título só com o mínimo ("Consulta — Ana S.").
function montarEventosTeste(hoje, prefixo = 'Consulta') {
  return EVENTOS_TESTE.map((e, i) => {
    const paciente = PACIENTES_TESTE.find((p) => p.codigo === e.codigo);
    const nome = paciente ? `${paciente.primeiro_nome} ${paciente.inicial_sobrenome}` : 'Fulano D.';
    const contato = paciente ? paciente.email : CONTATO_DESCONHECIDO;
    const data = textoData_(somarDias_(hoje, e.deslocamentoDias));
    return {
      id: idEventoTeste(i),
      titulo: `${prefixo} — ${nome}`,
      descricao: `DADO DE TESTE. Contato: ${contato}`,
      inicio: `${data}T${e.hora}:00`,
      fim: `${data}T${somarMinutos_(e.hora, DURACAO_MINUTOS)}:00`,
      fuso: 'America/Sao_Paulo',
      marca: { [MARCA_TESTE]: '1' },
      tipo: e.tipo,
      codigo: e.codigo,
    };
  });
}

// Linha de Pacientes na ordem do cabeçalho; `ativo` verdadeiro.
function linhaPaciente(p) {
  return [p.codigo, p.primeiro_nome, p.inicial_sobrenome, p.telefone, p.email,
    p.modo_acompanhamento, '', true];
}

// Recebe os códigos que já estão na planilha e devolve só as linhas que faltam.
function pacientesQueFaltam(codigosExistentes) {
  const jaTem = new Set(codigosExistentes.map(String));
  return PACIENTES_TESTE.filter((p) => !jaTem.has(p.codigo)).map(linhaPaciente);
}

const CODIGOS_TESTE = new Set(PACIENTES_TESTE.map((p) => p.codigo));

// A linha de Pacientes é a que o gerador cria? Mesmo código e mesmo e-mail fictício.
function ehPacienteGerado(linha) {
  const c = String(linha.codigo);
  const modelo = PACIENTES_TESTE.find((p) => p.codigo === c);
  return !!modelo && String(linha.email).trim().toLowerCase() === modelo.email;
}

// Códigos de teste que já existem na planilha com dados que NÃO são os do gerador (colisão).
// Nesse caso o gerador se recusa a criar e o apagador não toca nas linhas desse código.
function codigosEmColisao(pacientes) {
  return pacientes.filter((p) => CODIGOS_TESTE.has(String(p.codigo)) && !ehPacienteGerado(p)).map((p) => String(p.codigo));
}

// Recebe as linhas atuais (objetos com `linha`) de cada aba e devolve, por aba, os números das linhas a apagar
// (de baixo para cima, para apagar uma não deslocar as outras). Só entra o que o gerador cria:
// pacientes gerados; consultas com id de evento de teste ou de paciente gerado; pagamentos e pacotes ligados a eles.
function planejarLimpezaDeTeste({ pacientes, consultas, pagamentos, pacotes }) {
  const emColisao = new Set(codigosEmColisao(pacientes));
  const nosso = (codigo) => CODIGOS_TESTE.has(String(codigo)) && !emColisao.has(String(codigo));
  const consultasNossas = consultas.filter((c) => idEventoEhDeTeste(String(c.id_evento)) || nosso(c.codigo_paciente));
  const idsNossos = new Set(consultasNossas.map((c) => String(c.id_evento)));
  const descendente = (lista) => lista.map((o) => o.linha).sort((a, b) => b - a);
  return {
    Pacientes: descendente(pacientes.filter(ehPacienteGerado)),
    Consultas: descendente(consultasNossas),
    Pagamentos: descendente(pagamentos.filter((p) => nosso(p.codigo_paciente) || (String(p.id_evento) !== '' && idsNossos.has(String(p.id_evento))))),
    Pacotes: descendente(pacotes.filter((p) => nosso(p.codigo_paciente))),
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    MARCA_TESTE, PACIENTES_TESTE, EVENTOS_TESTE, validarAgendaDeTeste, montarEventosTeste,
    idEventoTeste, idEventoEhDeTeste, linhaPaciente, pacientesQueFaltam, planejarLimpezaDeTeste,
    codigosEmColisao, ehPacienteGerado,
  };
}
