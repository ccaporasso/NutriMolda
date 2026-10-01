// Mede o crescimento da lógica local e as chamadas externas por operação, em bases sintéticas (Gate, item 36).
// Só dados inventados. Não envia nada ao Google. Os TEMPOS mudam de máquina para máquina e são só ilustração; o que a suíte confere
// (tests/desempenho.test.js) são CONTAGENS: leituras de dados por elemento e chamadas à planilha, à Agenda e ao Drive.
// Uso: node scripts/desempenho.js [--escrever docs/gate/DESEMPENHO.md]
const fs = require('node:fs');
const path = require('node:path');
const A = require('../src/Agenda.js');
const P = require('../src/Pagamentos.js');
const Rel = require('../src/Relatorio.js');
const Ac = require('../src/Acoes.js');
const { criarCenario, cod } = require('../tests/apoio/escala.js');

const RAIZ = path.join(__dirname, '..');
const cfg = { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000, regra_retorno_dias: 30 };
const d2 = (n) => String(n).padStart(2, '0');
const dia = (i) => { const d = new Date(Date.UTC(2026, 0, 1 + (i % 365))); return `${d.getUTCFullYear()}-${d2(d.getUTCMonth() + 1)}-${d2(d.getUTCDate())}`; };

const consultas = (n, pacientes = 100) => Array.from({ length: n }, (_, i) => ({
  linha: i + 2, id_evento: `ev${i}`, data: dia(i), hora: `${d2(8 + (i % 10))}:00`, tipo: 'primeira', codigo_paciente: cod(i % pacientes), status: 'marcada', atualizado_em: '',
}));
const pagamentos = (n) => Array.from({ length: n }, (_, i) => ({
  linha: i + 2, id: `PG${String(i + 1).padStart(6, '0')}`, id_evento: `ev${i}`, codigo_paciente: cod(i % 100), pagador_nome: `Pagador ${i % 200}`, pagador_cpf: '52998224725',
  valor_centavos: 15000, forma: 'pix', status: 'pago', data_pagamento: `2026-09-${d2(1 + (i % 28))}`, link_recibo: '', pacote_inicio: '',
}));

function melhorTempo(f, vezes = 3) {
  let melhor = Infinity;
  for (let i = 0; i < vezes; i++) { const t = process.hrtime.bigint(); f(); melhor = Math.min(melhor, Number(process.hrtime.bigint() - t) / 1e6); }
  return melhor;
}

function logicaLocal() {
  const janela = A.calcularJanelaAgenda({ ano: 2026, mes: 9, dia: 30 });
  const eventosDe = (n, pac) => Array.from({ length: n }, (_, i) => ({ id: `ev${i}`, status: 'confirmed', summary: 'Consulta', start: { dateTime: `2026-10-${d2(1 + (i % 28))}T${d2(8 + (i % 10))}:00:00-03:00` }, attendees: [{ email: `p${i % pac}@exemplo.invalid` }] }));
  const pacientesDe = (m) => Array.from({ length: m }, (_, i) => ({ codigo: cod(i), ativo: true, email: `p${i}@exemplo.invalid`, telefone: `5511${900000000 + i}` }));
  const casos = [
    ['sincronização: 1.000 eventos novos, 100 pacientes', () => A.planejarSincronizacaoAgenda({ eventos: eventosDe(1000, 100), existentes: [], pacientes: pacientesDe(100), prefixo: 'Consulta', janela, agoraTexto: 'x', origemAtual: 'a1' })],
    ['sincronização: 5.000 eventos novos, 100 pacientes', () => A.planejarSincronizacaoAgenda({ eventos: eventosDe(5000, 100), existentes: [], pacientes: pacientesDe(100), prefixo: 'Consulta', janela, agoraTexto: 'x', origemAtual: 'a1' })],
    ['sincronização: 5.000 eventos novos, 1.000 pacientes', () => A.planejarSincronizacaoAgenda({ eventos: eventosDe(5000, 1000), existentes: [], pacientes: pacientesDe(1000), prefixo: 'Consulta', janela, agoraTexto: 'x', origemAtual: 'a1' })],
    ['a receber: 1.000 consultas "primeira", 1.000 pacientes distintos', () => P.planejarAReceber({ consultas: consultas(1000, 1000), pagamentos: [], config: cfg })],
    ['a receber: 5.000 consultas "primeira", 5.000 pacientes distintos', () => P.planejarAReceber({ consultas: consultas(5000, 5000), pagamentos: [], config: cfg })],
    ['a receber: 5.000 consultas, 5.000 pagamentos (reexecução)', () => P.planejarAReceber({ consultas: consultas(5000), pagamentos: pagamentos(5000), config: cfg })],
    ['relatório do mês: 1.000 pagamentos', () => Rel.consolidarRecebimentos(pagamentos(1000), '2026-09')],
    ['relatório do mês: 5.000 pagamentos', () => Rel.consolidarRecebimentos(pagamentos(5000), '2026-09')],
    ['pacotes: reconciliar 500 pacotes contra 5.000 pagamentos', () => Ac.reconciliarPacotes(Array.from({ length: 500 }, (_, i) => ({ linha: i + 2, codigo_paciente: cod(i), total_consultas: 10, usadas: 0, valor_centavos: 100000, inicio: '2026-01-01' })), pagamentos(5000).map((g, i) => ({ ...g, forma: 'pacote', pacote_inicio: '2026-01-01', codigo_paciente: cod(i % 500) })))],
  ];
  return casos.map(([nome, f]) => ({ nome, ms: melhorTempo(f) }));
}

function chamadasExternas() {
  const linhas = [];
  const medir = (nome, montar, executar) => {
    for (const n of [100, 1000, 5000]) {
      const c = montar(n);
      c.zerar();
      executar(c);
      linhas.push({ nome, n, ...c.contador, drive: c.chamadasDrive() });
    }
  };
  medir('sincronizar, base estável', (n) => criarCenario({ pacientes: 100, consultas: n }), (c) => c.rodar('sincronizarAgenda()'));
  medir('sincronizar, todas as linhas sem marca de agenda', (n) => criarCenario({ pacientes: 100, consultas: n, semMarca: true }), (c) => c.rodar('sincronizarAgenda()'));
  medir('sincronizar, consultas novas na agenda', (n) => criarCenario({ pacientes: 100, consultas: 0, eventosNovos: n }), (c) => c.rodar('sincronizarAgenda()'));
  medir('gerar a receber (consultas sem cobrança)', (n) => criarCenario({ pacientes: 100, consultas: n }), (c) => c.rodar('gerarAReceber()'));
  medir('gerar a receber (reexecução)', (n) => criarCenario({ pacientes: 100, consultas: n, pagamentos: n }), (c) => c.rodar('gerarAReceber()'));
  medir('gerar recibo em PDF (1 pagamento, n na base)', (n) => {
    const c = criarCenario({ pacientes: 100, consultas: n, pagamentos: n });
    c.definir('Pagamentos', 3, 'pagador_nome', 'Maria Souza Teste');
    c.definir('Pagamentos', 3, 'pagador_cpf', '52998224725');
    return c;
  }, (c) => c.rodar('gerarRecibo(3)'));
  medir('marcar 1 pagamento como pago no Pix (n na base)', (n) => { const c = criarCenario({ pacientes: 100, consultas: n, pagamentos: n }); c.selecionar('Pagamentos', 2); return c; }, (c) => c.rodar('marcarPagoPix()'));
  medir('relatório do mês (n pagamentos)', (n) => criarCenario({ pacientes: 100, consultas: 10, pagamentos: n }), (c) => c.rodar("gerarRelatorioMensal('2026-09')"));
  return linhas;
}

function relatorio() {
  const local = logicaLocal();
  const ext = chamadasExternas();
  return [
    '### Lógica local (melhor de 3 execuções, em milissegundos, neste computador; só ilustra a forma do crescimento)',
    '| Cenário | ms |', '|---|---|',
    ...local.map((l) => `| ${l.nome} | ${l.ms.toFixed(0)} |`),
    '',
    '### Chamadas externas por operação (Google simulado; planilha conta por CHAMADA, não por linha)',
    '| Operação | Linhas na base | Leituras da planilha | Escritas na planilha | Agenda: list | Agenda: get | Drive |', '|---|---|---|---|---|---|---|',
    ...ext.map((e) => `| ${e.nome} | ${e.n} | ${e.leituras} | ${e.escritas} | ${e.agendaLista} | ${e.agendaGet} | ${e.drive} |`),
  ].join('\n');
}

if (require.main === module) {
  const saida = relatorio();
  console.log(saida);
  const i = process.argv.indexOf('--escrever');
  if (i >= 0) fs.writeFileSync(path.resolve(RAIZ, process.argv[i + 1]), `${saida}\n`);
}

module.exports = { logicaLocal, chamadasExternas, relatorio };
