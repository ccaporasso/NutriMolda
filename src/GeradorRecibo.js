// Recibo em PDF (chamadas ao Google). A lógica está em Recibo.js.
// Escopos: documents (preencher o modelo e gerar o PDF) e drive.file (copiar o modelo e salvar o PDF, pelo serviço avançado Drive, ver DriveAvancado.js). Com drive.file o script só enxerga arquivos
// que ele mesmo criou: por isso o menu "Criar modelo e pasta de recibos" cria os dois e grava os ids em Configurações.
// Fluxo: copia o modelo -> troca os campos -> exporta PDF na pasta -> apaga a cópia -> grava o link no pagamento.

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
    copia = driveCopiar(idModelo, `rascunho-${nomeArquivoRecibo(pagamento).replace('.pdf', '')}`, idPasta);
    const documento = DocumentApp.openById(copia);
    const faltando = camposFaltandoNoModelo(textoDoDocumento_(documento), dados.campos);
    if (faltando.length > 0) {
      throw erroDeUso_(`O modelo do recibo não tem o(s) campo(s) obrigatório(s): ${faltando.map((c) => `{{${c}}}`).join(', ')}. `
        + 'Nada foi gerado. Corrija o modelo (ou crie outro em Configuração > Criar modelo e pasta de recibos, com o id em branco) e tente de novo.');
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
    const link = driveCriarArquivo(idPasta, dados.nomeArquivo, 'application/pdf', pdf).url;
    gravarCelula('Pagamentos', numeroLinha, 'link_recibo', link, { id: pagamento.id });
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

// Cria o modelo (Docs) e a pasta (Drive) só se os ids ainda estiverem em branco; nunca troca um id já preenchido.
function criarModeloEPastaDeRecibos() {
  executarNoMenu_('recibo', () => {
    const cfg = validarConfiguracoes(lerLinhasConfiguracoes_()).config;
    const feito = [];
    if (!cfg.id_modelo_recibo) {
      const documento = DocumentApp.create('Modelo de recibo - Kit do Consultório');
      const corpo = documento.getBody();
      corpo.clear();
      for (const linha of linhasModeloRecibo()) corpo.appendParagraph(linha);
      documento.saveAndClose();
      atualizarConfiguracao_('id_modelo_recibo', documento.getId());
      feito.push('modelo do recibo (Google Docs)');
    }
    if (!cfg.id_pasta_recibos) {
      atualizarConfiguracao_('id_pasta_recibos', driveCriarPasta('Recibos - Kit do Consultório'));
      feito.push('pasta dos recibos (Drive)');
    }
    SpreadsheetApp.getUi().alert(feito.length > 0
      ? `Criado: ${feito.join(' e ')}. Os ids já foram gravados em Configurações. Você pode editar o modelo à vontade, mantendo os campos entre {{ }}.`
      : 'O modelo e a pasta já estão configurados. Nada foi criado.');
  });
}
