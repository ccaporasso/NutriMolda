// T09: lógica pura do recibo e a camada do Google contra Drive/Docs simulados. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/Recibo.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

const config = { nome_profissional: 'Dra. Teste', crn: 'CRN-0 00000' };
const pagamento = {
  id: 'PG1', id_evento: 'ev1', codigo_paciente: 'P9001', pagador_nome: 'Ana Souza', pagador_cpf: '',
  valor_centavos: 15000, forma: 'pix', status: 'pago', data_pagamento: '2026-09-30',
};
const ana = { primeiro_nome: 'Ana', inicial_sobrenome: 'S' };
const montar = (extra = {}) => R.montarDadosRecibo({
  config, pagamento: { ...pagamento, ...extra.pagamento }, paciente: 'paciente' in extra ? extra.paciente : ana,
  consulta: { data: '2026-09-29' }, hoje: '2026-09-30',
});

test('recibo traz todos os campos obrigatórios', () => {
  const r = montar();
  assert.equal(r.erros, undefined);
  assert.equal(r.campos.nome_profissional, 'Dra. Teste');
  assert.equal(r.campos.crn, 'CRN-0 00000');
  assert.equal(r.campos.pagador_nome, 'Ana Souza');
  assert.equal(r.campos.valor, 'R$ 150,00');
  assert.equal(r.campos.data_pagamento, '30/09/2026');
  assert.equal(r.campos.descricao, 'Consulta de nutrição realizada em 29/09/2026');
  assert.equal(r.campos.data_emissao, '30/09/2026');
});

test('linha do paciente só aparece se pagador e paciente forem pessoas diferentes', () => {
  assert.equal(montar().campos.paciente_linha, '');
  assert.equal(montar({ pagamento: { pagador_nome: 'Carlos Souza' } }).campos.paciente_linha, 'Paciente: Ana S');
});

test('CPF opcional: em branco some; válido é formatado; inválido dá erro', () => {
  assert.equal(montar().campos.pagador_cpf_linha, '');
  assert.equal(montar({ pagamento: { pagador_cpf: '52998224725' } }).campos.pagador_cpf_linha, 'CPF: 529.982.247-25');
  assert.match(montar({ pagamento: { pagador_cpf: '11111111111' } }).erros.join(' '), /CPF/);
});

test('recusa pagamento não pago, sem nome, sem valor, sem data e config incompleta', () => {
  assert.match(montar({ pagamento: { status: 'a_receber' } }).erros[0], /pago/);
  assert.match(montar({ pagamento: { status: 'cortesia' } }).erros[0], /pago/);
  assert.match(montar({ pagamento: { pagador_nome: '  ' } }).erros[0], /pagador_nome/);
  assert.match(montar({ pagamento: { valor_centavos: 0 } }).erros[0], /valor/);
  assert.match(montar({ pagamento: { valor_centavos: NaN } }).erros[0], /valor/);
  assert.match(montar({ pagamento: { data_pagamento: '' } }).erros[0], /data/);
  const semCrn = R.montarDadosRecibo({ config: { nome_profissional: 'X', crn: '' }, pagamento, paciente: ana, consulta: null, hoje: '2026-09-30' });
  assert.match(semCrn.erros[0], /crn/);
});

test('nome do arquivo tem só código, data e id: nunca nome nem CPF', () => {
  const r = montar({ pagamento: { pagador_cpf: '52998224725' } });
  assert.equal(r.nomeArquivo, 'Recibo_P9001_2026-09-30_PG1.pdf');
  assert.doesNotMatch(r.nomeArquivo, /Ana|Souza|529/);
});

test('modelo sem marcadores obrigatórios é detectado', () => {
  assert.deepEqual(R.marcadoresFaltandoNoModelo('{{nome_profissional}} {{crn}}'),
    ['pagador_nome', 'valor', 'data_pagamento', 'descricao']);
  assert.deepEqual(R.marcadoresFaltandoNoModelo(R.MARCADORES_OBRIGATORIOS_RECIBO.map((m) => `{{${m}}}`).join(' ')), []);
});

// ---- Google simulado ----
const CONFIG = [
  ['nome_profissional', 'Dra. Teste'], ['crn', 'CRN-0 00000'], ['valor_primeira_consulta_centavos', '15000'],
  ['valor_retorno_centavos', '10000'], ['regra_retorno_dias', '30'], ['chave_pix', 'teste@exemplo.invalid'],
  ['nome_recebedor_pix', 'DRA TESTE'], ['cidade_recebedor_pix', 'SAO PAULO'], ['calendario_id', 'primary'],
  ['prefixo_evento_consulta', 'Consulta'], ['email_alertas', 'alerta@exemplo.invalid'],
  ['id_modelo_recibo', 'MODELO1'], ['id_pasta_recibos', 'PASTA1'],
];
const TEXTO_MODELO = 'Recibo {{numero}} {{nome_profissional}} {{crn}} {{pagador_nome}} {{pagador_cpf_linha}} {{paciente_linha}} {{valor}} {{data_pagamento}} {{descricao}} {{data_emissao}}';

function ambiente({ textoModelo = TEXTO_MODELO, semModelo = false, semPasta = false } = {}) {
  const docs = new Map(); // id -> texto
  const arquivos = []; // { id, nome, lixeira }
  let seq = 0;
  const arquivoDrive = (id, nome) => {
    const a = { id, nome, lixeira: false };
    arquivos.push(a);
    return {
      getId: () => id, getUrl: () => `https://drive.exemplo.invalid/${id}`, getName: () => nome,
      setTrashed: (v) => { a.lixeira = v; },
      getAs: (tipo) => ({ tipo, setName(n) { this.nome = n; return this; }, texto: docs.get(id) }),
    };
  };
  const google = {
    DriveApp: {
      getFolderById: (id) => {
        if (semPasta) throw new Error('Exception: Access denied: DriveApp');
        return { createFile: (blob) => arquivoDrive(`pdf${++seq}`, blob.nome), id };
      },
      getFileById: (id) => {
        if (semModelo) throw new Error('Exception: Access denied: DriveApp');
        return { makeCopy: (nome) => { const f = arquivoDrive(`copia${++seq}`, nome); docs.set(f.getId(), textoModelo); return f; } };
      },
    },
    DocumentApp: {
      openById: (id) => ({
        getBody: () => ({
          getText: () => docs.get(id),
          replaceText(padrao, novo) { docs.set(id, docs.get(id).replace(new RegExp(padrao, 'g'), () => novo)); },
        }),
        saveAndClose() {},
      }),
    },
  };
  const amb = criarAmbiente({ configuracoes: CONFIG, google });
  amb.abas.get('Pacientes').linhas.push(['P9001', 'Ana', 'S', '', '', 'leve', '', true]);
  amb.abas.get('Consultas').linhas.push(['ev1', '2026-09-29', '09:00', 'primeira', 'P9001', 'realizada', '']);
  amb.abas.get('Pagamentos').linhas.push(['PG1', 'ev1', 'P9001', 'Ana Souza', '', 15000, 'pix', 'pago', '2026-09-30', '']);
  amb.carregar('Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js',
    'SincronizarAgenda.js', 'Recibo.js', 'ReciboPdf.js');
  return { amb, docs, arquivos };
}

test('Google simulado: gera o PDF na pasta, grava o link e apaga a cópia temporária', () => {
  const { amb, docs, arquivos } = ambiente();
  const r = amb.rodar('gerarReciboDaLinha_(2)');
  assert.equal(r.nomeArquivo, 'Recibo_P9001_2026-09-30_PG1.pdf');
  const pdf = arquivos.find((a) => a.nome === r.nomeArquivo);
  assert.ok(pdf && !pdf.lixeira);
  assert.equal(amb.abas.get('Pagamentos').linhas[1][9], r.link);
  const copia = arquivos.find((a) => a.nome.startsWith('TEMP_'));
  assert.equal(copia.lixeira, true);
  const texto = docs.get(copia.id);
  assert.match(texto, /Dra\. Teste CRN-0 00000 Ana Souza/);
  assert.match(texto, /R\$ 150,00 30\/09\/2026/);
  assert.doesNotMatch(texto, /\{\{/);
  const registro = amb.abas.get('Registro').linhas.slice(1).map((l) => l[3]).join('\n');
  assert.doesNotMatch(registro, /Ana|Souza/);
});

test('Google simulado: recibo já gerado não é gerado de novo', () => {
  const { amb, arquivos } = ambiente();
  amb.rodar('gerarReciboDaLinha_(2)');
  const antes = arquivos.length;
  assert.throws(() => amb.rodar('gerarReciboDaLinha_(2)'), /já tem recibo/);
  assert.equal(arquivos.length, antes);
});

test('Google simulado: erros claros (linha do cabeçalho, não pago, sem modelo, sem acesso, marcador faltando)', () => {
  assert.throws(() => ambiente().amb.rodar('gerarReciboDaLinha_(1)'), /Selecione uma linha/);
  const naoPago = ambiente();
  naoPago.amb.abas.get('Pagamentos').linhas[1][7] = 'a_receber';
  assert.throws(() => naoPago.amb.rodar('gerarReciboDaLinha_(2)'), /marcado como "pago"/);
  assert.throws(() => ambiente({ semModelo: true }).amb.rodar('gerarReciboDaLinha_(2)'), /Não consegui abrir o modelo/);
  assert.throws(() => ambiente({ semPasta: true }).amb.rodar('gerarReciboDaLinha_(2)'), /Não consegui abrir a pasta/);
  const incompleto = ambiente({ textoModelo: 'Recibo {{valor}}' });
  assert.throws(() => incompleto.amb.rodar('gerarReciboDaLinha_(2)'), /não tem estes marcadores/);
  assert.equal(incompleto.amb.abas.get('Pagamentos').linhas[1][9], '');
  assert.equal(incompleto.arquivos.filter((a) => a.nome.startsWith('TEMP_') && !a.lixeira).length, 0);
});
