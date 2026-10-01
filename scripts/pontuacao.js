// Aplica a régua do Gate de Continuidade de Engenharia v1.0 às entradas de docs/gate/CRITERIOS.md. Sem dependências.
// Uso: node scripts/pontuacao.js [--json]
// A régua (pesos, limiares de zona, faixas finais e eliminatórios) está escrita aqui como constantes e NÃO muda: o que muda é o que o
// repositório prova. Duas bases de evidência (ver CRITERIOS.md): "e2" (suíte) e "conservadora" (exige observação real do Google).
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');

// Dimensão -> peso e limiares (APROVA a partir de `aprova`, ALERTA a partir de `alerta`, senão REPROVA).
const REGUA = {
  correcao: { nome: 'Correção funcional', peso: 25, aprova: 95, alerta: 85 },
  testabilidade: { nome: 'Testabilidade / regressão', peso: 20, aprova: 90, alerta: 75 },
  arquitetura: { nome: 'Arquitetura / manutenibilidade', peso: 15, aprova: 80, alerta: 65 },
  integridade: { nome: 'Integridade e confiabilidade', peso: 15, aprova: 90, alerta: 75 },
  seguranca: { nome: 'Segurança / privacidade', peso: 15 },
  eficiencia: { nome: 'Eficiência técnica', peso: 5 },
  disciplina: { nome: 'Disciplina de engenharia', peso: 5, aprova: 80, alerta: 60 },
};
// Dimensões descritas só por zona: zona -> pontos (limite inferior da faixa final correspondente; conversão minha, ver CRITERIOS.md).
const PONTOS_DA_ZONA = { APROVA: 85, ALERTA: 70, REPROVA: 55 };
// Faixas finais da régua.
const FAIXAS = [[85, 'PASSA'], [70, 'PASSA COM RESSALVAS'], [55, 'NÃO PASSA']];
const REPROVA_ESTRUTURALMENTE = 'REPROVA ESTRUTURALMENTE';

function zonaNumerica(valor, limiares) {
  if (valor >= limiares.aprova) return 'APROVA';
  if (valor >= limiares.alerta) return 'ALERTA';
  return 'REPROVA';
}

function classificar(nota) {
  for (const [minimo, nome] of FAIXAS) if (nota >= minimo) return nome;
  return REPROVA_ESTRUTURALMENTE;
}

// Linhas de tabela Markdown cuja primeira coluna começa com o prefixo (F01, T01...) -> arrays de células sem as barras.
function lerTabela(texto, prefixo) {
  return texto.split('\n').filter((l) => new RegExp(`^\\| ${prefixo}\\d+ \\|`).test(l)).map((l) => l.slice(1, l.lastIndexOf('|')).split('|').map((c) => c.trim()));
}

const ehSim = (c) => c.toLowerCase() === 'sim';
const arquivosCitados = (celula) => [...celula.matchAll(/`(tests\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]);
const preenchida = (celula) => celula.toLowerCase() === 'n/a' || arquivosCitados(celula).length > 0;

// Correção funcional: [id, critério, teste, dependeDoGoogle, e1Antes, caminhoMudou, atendido].
function pontuarCorrecao(linhas) {
  const total = linhas.length;
  const e2 = linhas.filter((l) => ehSim(l[6])).length;
  const conservadora = linhas.filter((l) => ehSim(l[6]) && (!ehSim(l[3]) || (ehSim(l[4]) && !ehSim(l[5])))).length;
  return { total, e2, conservadora, pctE2: (100 * e2) / total, pctConservadora: (100 * conservadora) / total };
}

// Testabilidade: [id, fluxo, normal, negativo, falhaParcial, concorrencia]; coberto = as quatro células preenchidas (teste ou n/a).
function pontuarTestabilidade(linhas) {
  const total = linhas.length;
  const cobertos = linhas.filter((l) => l.slice(2, 6).every(preenchida)).length;
  const pct = (100 * cobertos) / total;
  return { total, e2: cobertos, conservadora: cobertos, pctE2: pct, pctConservadora: pct };
}

// Integridade: [id, operação, repetição, retry, falhaParcial, concorrência, naoObservado]. Cenário = célula preenchida e que não é n/a.
const NOMES_DOS_CENARIOS = ['repetição', 'retry', 'falha parcial', 'concorrência'];
function pontuarIntegridade(linhas) {
  let aplicaveis = 0;
  let protegidosE2 = 0;
  let protegidosConservadora = 0;
  for (const l of linhas) {
    const naoObservado = l[6].toLowerCase().split(',').map((s) => s.trim());
    NOMES_DOS_CENARIOS.forEach((nome, i) => {
      const celula = l[2 + i];
      if (celula.toLowerCase() === 'n/a') return;
      aplicaveis++;
      if (arquivosCitados(celula).length > 0) {
        protegidosE2++;
        if (!naoObservado.includes(nome)) protegidosConservadora++;
      }
    });
  }
  return { total: aplicaveis, e2: protegidosE2, conservadora: protegidosConservadora, pctE2: (100 * protegidosE2) / aplicaveis, pctConservadora: (100 * protegidosConservadora) / aplicaveis };
}

// Arquitetura: [id, subcritério, máximo, nota, evidência].
function pontuarArquitetura(linhas) {
  const maximo = linhas.reduce((s, l) => s + Number(l[2]), 0);
  const nota = linhas.reduce((s, l) => s + Number(l[3]), 0);
  const pct = (100 * nota) / maximo;
  return { total: maximo, e2: nota, conservadora: nota, pctE2: pct, pctConservadora: pct };
}

// Disciplina: [id, item, atendido].
function pontuarDisciplina(linhas) {
  const total = linhas.length;
  const ok = linhas.filter((l) => ehSim(l[2])).length;
  const pct = (100 * ok) / total;
  return { total, e2: ok, conservadora: ok, pctE2: pct, pctConservadora: pct };
}

// Segurança e eficiência: linha "| Dimensão | zona E2 | zona conservadora | justificativa |".
function lerZonas(texto, nomeDaDimensao) {
  const linha = texto.split('\n').find((l) => l.startsWith(`| ${nomeDaDimensao} |`));
  if (!linha) throw new Error(`Falta a linha de zona de "${nomeDaDimensao}" em CRITERIOS.md.`);
  const c = linha.slice(1, linha.lastIndexOf('|')).split('|').map((x) => x.trim());
  for (const z of [c[1], c[2]]) if (!PONTOS_DA_ZONA[z]) throw new Error(`Zona inválida para "${nomeDaDimensao}": ${z}`);
  return { e2: c[1], conservadora: c[2] };
}

function lerEliminatorios(texto) {
  return lerTabela(texto, 'E').map((l) => ({ id: l[0], texto: l[1], resposta: l[2].toUpperCase() })).filter((e) => /^E0\d$/.test(e.id));
}

function notaDaBase(dim, base) {
  return dim[base === 'e2' ? 'pctE2' : 'pctConservadora'];
}

// Devolve a pontuação das duas bases e a sensibilidade das duas dimensões descritas só por zona.
function calcular(texto) {
  const numericas = {
    correcao: pontuarCorrecao(lerTabela(texto, 'F')),
    testabilidade: pontuarTestabilidade(lerTabela(texto, 'T')),
    arquitetura: pontuarArquitetura(lerTabela(texto, 'A')),
    integridade: pontuarIntegridade(lerTabela(texto, 'I')),
    disciplina: pontuarDisciplina(lerTabela(texto, 'D')),
  };
  const zonas = { seguranca: lerZonas(texto, 'Segurança e privacidade'), eficiencia: lerZonas(texto, 'Eficiência técnica') };
  const eliminatorios = lerEliminatorios(texto);
  const bases = {};
  for (const base of ['e2', 'conservadora']) {
    const dimensoes = {};
    let soma = 0;
    for (const [chave, regua] of Object.entries(REGUA)) {
      let nota;
      let zona;
      if (numericas[chave]) {
        nota = notaDaBase(numericas[chave], base);
        zona = zonaNumerica(nota, regua);
      } else {
        zona = zonas[chave][base];
        nota = PONTOS_DA_ZONA[zona];
      }
      dimensoes[chave] = { nome: regua.nome, peso: regua.peso, nota, zona, ...(numericas[chave] ? { itens: numericas[chave][base], total: numericas[chave].total } : {}) };
      soma += (regua.peso * nota) / 100;
    }
    const algumEliminatorio = eliminatorios.some((e) => e.resposta === 'SIM');
    bases[base] = { dimensoes, nota: soma, faixa: classificar(soma), resultado: algumEliminatorio ? 'NÃO PASSA (eliminatório)' : classificar(soma) };
  }
  // Sensibilidade: se a conversão de zona em pontos que adotei fosse outra, a faixa mudaria?
  const sensibilidade = {};
  for (const base of ['e2', 'conservadora']) {
    const d = bases[base].dimensoes;
    const sem = bases[base].nota - (REGUA.seguranca.peso * d.seguranca.nota) / 100 - (REGUA.eficiencia.peso * d.eficiencia.nota) / 100;
    sensibilidade[base] = Object.fromEntries([55, 70, 85].map((p) => [p, sem + ((REGUA.seguranca.peso + REGUA.eficiencia.peso) * p) / 100]));
  }
  return { bases, sensibilidade, eliminatorios, numericas };
}

function formatar(r) {
  const f = (n) => n.toFixed(1).replace('.', ',');
  const linhas = [];
  for (const [base, titulo] of [['e2', 'BASE E2 (suíte)'], ['conservadora', 'BASE CONSERVADORA (exige observação real do Google)']]) {
    const b = r.bases[base];
    linhas.push(titulo);
    for (const d of Object.values(b.dimensoes)) {
      const itens = d.itens !== undefined ? ` (${d.itens} de ${d.total})` : '';
      linhas.push(`  ${d.nome.padEnd(34)} peso ${String(d.peso).padStart(2)}%  nota ${f(d.nota).padStart(5)}${itens}  ${d.zona}`);
    }
    linhas.push(`  NOTA FINAL ${f(b.nota)}  ->  ${b.resultado}`);
    const s = r.sensibilidade[base];
    linhas.push(`  Segurança e eficiência em 55 / 70 / 85: ${f(s[55])} / ${f(s[70])} / ${f(s[85])} -> ${classificar(s[55])} / ${classificar(s[70])} / ${classificar(s[85])}`);
    linhas.push('');
  }
  linhas.push(`Eliminatórios: ${r.eliminatorios.map((e) => `${e.id} ${e.resposta}`).join(', ')}`);
  return linhas.join('\n');
}

function principal() {
  const texto = fs.readFileSync(path.join(RAIZ, 'docs', 'gate', 'CRITERIOS.md'), 'utf8');
  const r = calcular(texto);
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 2) : formatar(r));
}

if (require.main === module) principal();
module.exports = { REGUA, PONTOS_DA_ZONA, FAIXAS, calcular, classificar, zonaNumerica, lerTabela, arquivosCitados, formatar, pontuarCorrecao, pontuarIntegridade, pontuarTestabilidade, pontuarArquitetura, pontuarDisciplina };
