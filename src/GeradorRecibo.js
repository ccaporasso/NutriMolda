// Recibo em PDF (chamadas ao Google). A lógica está em Recibo.js.
// Escopos: documents (preencher o modelo e gerar o PDF) e drive.file (copiar o modelo e salvar o PDF, pelo serviço avançado Drive, ver DriveAvancado.js). Com drive.file o script só enxerga arquivos
// que ele mesmo criou: por isso o menu "Criar modelo e pasta de recibos" cria os dois e grava os ids em Configurações.
// Fluxo: (com a trava) relê o pagamento -> se já há PDF dele na pasta, religa o link -> senão copia o modelo -> troca os campos ->
// exporta o PDF na pasta (com a identidade do pagamento nas propriedades) -> grava o link -> apaga a cópia.

function escaparPadrao_(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Troca literal de um campo (M2): acha o campo e apaga/insere o texto, sem passar o valor pela troca por expressão
// regular do Docs (replaceText), em que "$" e "\" do texto novo poderiam ter significado especial ("R$ 150,00").
// `limite` evita laço sem fim se o valor trouxer o próprio campo (os valores já saem sem chaves; ver textoSeguroParaDocs).
function trocarCampoLiteral_(secao, padrao, valor, limite = 50) {
  for (let i = 0, achado = secao.findText(padrao); achado && i < limite; i++, achado = secao.findText(padrao)) {
    const texto = achado.getElement().asText();
    const inicio = achado.getStartOffset();
    texto.deleteText(inicio, achado.getEndOffsetInclusive());
    if (String(valor) !== '') texto.insertText(inicio, String(valor));
  }
}

// Manda a cópia de trabalho para a lixeira sem nunca lançar erro por cima do resultado (B4). Devolve true se conseguiu.
function descartarCopiaDoRecibo_(idCopia) {
  try {
    driveMandarParaLixeira(idCopia);
    return true;
  } catch (e) {
    registrar('recibo', 'aviso', `A cópia de trabalho do recibo não foi para a lixeira (tipo ${tipoDeErro(e)}). Apague à mão o arquivo "rascunho-" da pasta de recibos.`);
    return false;
  }
}

function textoDoDocumento_(documento) {
  const partes = [documento.getBody().getText()];
  for (const parte of [documento.getHeader(), documento.getFooter()]) if (parte) partes.push(parte.getText());
  return partes.join('\n');
}

// Gera o recibo do pagamento na linha indicada. Devolve { link } ou { jaTinha: true }; `rascunhoFicou` avisa que a cópia
// de trabalho (com nome e CPF) não foi para a lixeira.
function gerarRecibo(numeroLinha) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw erroDeUso_('Outra operação está em andamento. Tente de novo em um minuto.');
  let copia = null;
  let resultado = null;
  try {
    const config = lerConfiguracoes().config;
    const pagamento = lerAbaComoObjetos('Pagamentos').find((p) => p.linha === numeroLinha);
    if (!pagamento) throw erroDeUso_('Não achei o pagamento nessa linha.');
    const paciente = lerAbaComoObjetos('Pacientes').find((p) => String(p.codigo) === String(pagamento.codigo_paciente));
    const consulta = lerAbaComoObjetos('Consultas').find((c) => String(c.id_evento) === String(pagamento.id_evento));

    const { erros, dados, jaTem } = montarDadosRecibo({ pagamento, config, paciente, consulta });
    if (jaTem) return { jaTinha: true };
    if (erros.length > 0) throw erroDeUso_(erros.join('\n'));

    const idPasta = validarIdDrive_(config.id_pasta_recibos, 'id_pasta_recibos');
    const idModelo = validarIdDrive_(config.id_modelo_recibo, 'id_modelo_recibo');

    // Reconciliar antes de criar (R3/R4): se uma execução anterior criou o PDF e caiu antes de gravar o link, o PDF já está
    // na pasta. Religa o link em vez de gerar um segundo recibo. Isto roda já com a trava e depois de reler a planilha.
    const achados = escolherReciboExistente(driveListarRecibosDoPagamento(idPasta, pagamento.id, dados.nomeArquivo), pagamento);
    if (achados.situacao === 'varios') {
      throw erroDeUso_(`Já existem ${achados.quantos} PDFs de recibo para o pagamento ${pagamento.id} na pasta de recibos. `
        + 'Nada foi gerado nem ligado ao pagamento. Mande para a lixeira os que sobram, deixando um só, e tente de novo.');
    }
    if (achados.situacao === 'um') {
      gravarCelula('Pagamentos', numeroLinha, 'link_recibo', achados.arquivo.url, { id: pagamento.id, codigo_paciente: pagamento.codigo_paciente });
      registrar('recibo', 'info', `Recibo do pagamento ${pagamento.id} já existia no Drive; o link foi religado, sem gerar outro PDF.`);
      return { link: achados.arquivo.url, reconciliado: true };
    }

    copia = driveCopiar(idModelo, `rascunho-${nomeArquivoRecibo(pagamento).replace('.pdf', '')}`, idPasta);
    const documento = DocumentApp.openById(copia);
    const faltando = camposFaltandoNoModelo(textoDoDocumento_(documento), dados.campos);
    if (faltando.length > 0) {
      throw erroDeUso_(`O modelo do recibo não tem o(s) campo(s) obrigatório(s): ${faltando.map((c) => `{{${c}}}`).join(', ')}. `
        + 'Nada foi gerado. Corrija o modelo (ou mande o modelo antigo para a lixeira, apague o id em Configurações e use Configuração > Criar modelo e pasta de recibos) e tente de novo.');
    }
    for (const [campo, valor] of Object.entries(dados.campos)) {
      const padrao = escaparPadrao_(`{{${campo}}}`);
      for (const secao of [documento.getBody(), documento.getHeader(), documento.getFooter()]) {
        if (secao) trocarCampoLiteral_(secao, padrao, valor);
      }
    }
    const sobrando = camposSobrando(textoDoDocumento_(documento));
    if (sobrando.length > 0) {
      throw erroDeUso_(`O modelo do recibo tem campo(s) que o kit não conhece: ${sobrando.join(', ')}. Corrija o modelo e tente de novo.`);
    }
    documento.saveAndClose();

    // O PDF sai do próprio Docs (escopo documents); só a gravação na pasta passa pelo Drive.
    const pdf = DocumentApp.openById(copia).getAs('application/pdf').setName(dados.nomeArquivo);
    const link = driveCriarArquivo(idPasta, dados.nomeArquivo, 'application/pdf', pdf, propriedadesDoRecibo(pagamento)).url;
    gravarCelula('Pagamentos', numeroLinha, 'link_recibo', link, { id: pagamento.id, codigo_paciente: pagamento.codigo_paciente });
    registrar('recibo', 'info', `Recibo gerado para o pagamento ${pagamento.id}.`);
    resultado = { link };
    return resultado;
  } finally {
    // A cópia de trabalho nunca fica no Drive. Falha ao descartá-la não apaga o sucesso nem prende a trava (B4).
    if (copia && !descartarCopiaDoRecibo_(copia) && resultado) resultado.rascunhoFicou = true;
    trava.releaseLock();
  }
}

// Item do menu.
function gerarReciboDaLinhaSelecionada() {
  executarNoMenu_('recibo', () => {
    const [linha] = linhasSelecionadas('Pagamentos', 1);
    const r = gerarRecibo(linha);
    SpreadsheetApp.getUi().alert(r.jaTinha
      ? 'Este pagamento já tem recibo (veja a coluna link_recibo). Nada foi gerado de novo.'
      : r.reconciliado
        ? `Este pagamento já tinha um PDF de recibo na pasta (uma tentativa anterior parou antes de gravar o link). O link foi religado, sem gerar outro PDF:\n${r.link}`
        : `Recibo gerado. O link está na coluna link_recibo:\n${r.link}`
        + (r.rascunhoFicou ? '\n\nA cópia de trabalho ("rascunho-...") não foi para a lixeira: ela tem nome e CPF. Apague à mão na pasta de recibos.' : ''));
  });
}

// Grava um valor em Configurações (coluna B) na linha da chave indicada.
function atualizarConfiguracao_(chave, valor) {
  const { folha } = abrirFolhaConferida_('Configurações');
  const chaves = folha.getRange(2, 1, Math.max(folha.getLastRow() - 1, 1), 1).getValues().map((l) => String(l[0]).trim());
  const i = chaves.indexOf(chave);
  if (i < 0) throw erroDeUso_(`Falta a linha "${chave}" em Configurações. Rode Instalar/atualizar planilha.`);
  folha.getRange(i + 2, 2, 1, 1).setValues([[valor]]);
}

// Id de modelo/pasta já guardado, se houver. Linha repetida ou valor que o Planilhas transformou (número, data) NÃO conta como
// "em branco": criar outro e sobrescrever esconderia o problema. Devolve '' só quando a célula está de fato vazia.
function idJaConfigurado_(resultado, chave) {
  const problemas = resultado.erros.filter((e) => e.includes(`"${chave}"`));
  if (problemas.length > 0) throw erroDeUso_(`A configuração "${chave}" está repetida ou com um valor que o kit não entende. Corrija na aba Configurações antes de criar o modelo e a pasta.`);
  return resultado.config[chave] || '';
}

// Acha o arquivo que uma execução anterior criou e não chegou a registrar. Mais de um: para, sem escolher por conta própria.
function reaproveitarOuNada_(papel, rotulo) {
  const achados = driveAcharPorPapel(papel);
  if (achados.length > 1) {
    throw erroDeUso_(`Já existem ${achados.length} ${rotulo} criados pelo kit e nenhum está em Configurações. Mande para a lixeira os que sobram e tente de novo.`);
  }
  return achados[0] || null;
}

// Cria o modelo (Docs) e a pasta (Drive) só se os ids ainda estiverem em branco; nunca troca um id já preenchido.
// Tudo dentro da trava e relendo as Configurações depois dela: duas execuções não criam dois modelos nem duas pastas.
// Se uma execução anterior criou o arquivo e caiu antes de gravar o id, o arquivo é reaproveitado (reconciliação por papel).
function criarModeloEPastaDeRecibos() {
  executarNoMenu_('recibo', () => comTrava_(() => {
    const resultado = validarConfiguracoes(lerLinhasConfiguracoes_());
    const feito = [];
    const reaproveitado = [];
    if (!idJaConfigurado_(resultado, 'id_modelo_recibo')) {
      let id = reaproveitarOuNada_(PAPEL_MODELO_RECIBO, 'modelos de recibo');
      if (id) {
        reaproveitado.push('modelo do recibo');
      } else {
        id = driveCriarDocumento('Modelo de recibo - Kit do Consultório', { [PROPRIEDADE_PAPEL_KIT]: PAPEL_MODELO_RECIBO });
        const documento = DocumentApp.openById(id);
        const corpo = documento.getBody();
        corpo.clear();
        for (const linha of linhasModeloRecibo()) corpo.appendParagraph(linha);
        documento.saveAndClose();
        feito.push('modelo do recibo (Google Docs)');
      }
      atualizarConfiguracao_('id_modelo_recibo', id);
    }
    if (!idJaConfigurado_(resultado, 'id_pasta_recibos')) {
      let id = reaproveitarOuNada_(PAPEL_PASTA_RECIBOS, 'pastas de recibos');
      if (id) {
        reaproveitado.push('pasta dos recibos');
      } else {
        id = driveCriarPasta('Recibos - Kit do Consultório', { [PROPRIEDADE_PAPEL_KIT]: PAPEL_PASTA_RECIBOS });
        feito.push('pasta dos recibos (Drive)');
      }
      atualizarConfiguracao_('id_pasta_recibos', id);
    }
    const partes = [];
    if (feito.length > 0) partes.push(`Criado: ${feito.join(' e ')}. Os ids já foram gravados em Configurações. Você pode editar o modelo à vontade, mantendo os campos entre {{ }}.`);
    if (reaproveitado.length > 0) partes.push(`Já existia (uma tentativa anterior parou antes de gravar o id): ${reaproveitado.join(' e ')}. O id foi gravado em Configurações, sem criar outro.`);
    SpreadsheetApp.getUi().alert(partes.length > 0 ? partes.join('\n') : 'O modelo e a pasta já estão configurados. Nada foi criado.');
  }));
}
