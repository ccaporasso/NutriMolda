// Recibo em PDF (chamadas ao Google). A lógica está em Recibo.js.
// Copia o modelo do Docs, troca os {{marcadores}}, salva o PDF na pasta configurada e apaga a cópia.
// Interface para a T08 (menu): gerarReciboDaLinha_(numeroDaLinhaEmPagamentos) devolve { link, nomeArquivo }.
// Lê só a aba Pagamentos (e Consultas/Pacientes para descrição e nome do paciente); não depende da T07.

const COLUNAS_PAGAMENTOS_RECIBO = 10; // id ... link_recibo (ver Esquema.js)
const COLUNA_LINK_RECIBO = 10;

function lerPagamentoDaLinha_(folha, linha) {
  const l = folha.getRange(linha, 1, 1, COLUNAS_PAGAMENTOS_RECIBO).getValues()[0];
  return {
    id: String(l[0]), id_evento: String(l[1]), codigo_paciente: String(l[2]), pagador_nome: String(l[3]),
    pagador_cpf: String(l[4]), valor_centavos: Number(l[5]), forma: String(l[6]), status: String(l[7]),
    data_pagamento: celulaParaTexto_(l[8], 'yyyy-MM-dd'), link_recibo: String(l[9]),
  };
}

function acharPacienteParaRecibo_(planilha, codigo) {
  const folha = planilha.getSheetByName('Pacientes');
  if (!folha || folha.getLastRow() < 2 || !codigo) return null;
  const achada = folha.getRange(2, 1, folha.getLastRow() - 1, 3).getValues().find((l) => String(l[0]) === codigo);
  return achada ? { primeiro_nome: String(achada[1]), inicial_sobrenome: String(achada[2]) } : null;
}

function acharConsultaParaRecibo_(planilha, idEvento) {
  const folha = planilha.getSheetByName('Consultas');
  if (!folha || folha.getLastRow() < 2 || !idEvento) return null;
  const achada = folha.getRange(2, 1, folha.getLastRow() - 1, 2).getValues().find((l) => String(l[0]) === idEvento);
  return achada ? { data: celulaParaTexto_(achada[1], 'yyyy-MM-dd') } : null;
}

// Erro de acesso do Google vira texto claro, sem detalhes técnicos.
function abrirParaRecibo_(abrir, oQue) {
  try {
    return abrir();
  } catch (e) {
    throw new Error(`Não consegui abrir ${oQue}. Confira o id em Configurações e se este script tem permissão para ele. Se persistir, chame o suporte.`);
  }
}

// Gera o PDF do pagamento da linha indicada, grava o link na coluna link_recibo e devolve { link, nomeArquivo }.
function gerarReciboDaLinha_(linha) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra operação está em andamento. Tente de novo em um minuto.');
  let copia = null;
  try {
    const cfg = lerConfiguracoes().config;
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const folha = planilha.getSheetByName('Pagamentos');
    if (!folha) throw new Error('A aba "Pagamentos" não existe. Use o menu Kit do Consultório > Instalar/atualizar planilha.');
    if (!Number.isInteger(linha) || linha < 2 || linha > folha.getLastRow()) {
      throw new Error('Selecione uma linha de pagamento (não o cabeçalho) na aba Pagamentos.');
    }
    if (!cfg.id_modelo_recibo) throw new Error('Preencha "id_modelo_recibo" na aba Configurações (o id do modelo no Google Docs).');
    if (!cfg.id_pasta_recibos) throw new Error('Preencha "id_pasta_recibos" na aba Configurações (o id da pasta do Drive).');

    const pagamento = lerPagamentoDaLinha_(folha, linha);
    if (pagamento.link_recibo) {
      throw new Error('Este pagamento já tem recibo. Para gerar de novo, apague o link na coluna link_recibo.');
    }
    const dados = montarDadosRecibo({
      config: cfg, pagamento,
      paciente: acharPacienteParaRecibo_(planilha, pagamento.codigo_paciente),
      consulta: acharConsultaParaRecibo_(planilha, pagamento.id_evento),
      hoje: Utilities.formatDate(new Date(), FUSO_KIT, 'yyyy-MM-dd'),
    });
    if (dados.erros) throw new Error(textoErrosRecibo(dados.erros));

    const pasta = abrirParaRecibo_(() => DriveApp.getFolderById(cfg.id_pasta_recibos), 'a pasta de recibos');
    const modelo = abrirParaRecibo_(() => DriveApp.getFileById(cfg.id_modelo_recibo), 'o modelo do recibo');
    // A cópia temporária também leva só o código no nome.
    copia = modelo.makeCopy(`TEMP_${dados.nomeArquivo}`, pasta);
    const documento = DocumentApp.openById(copia.getId());
    const corpo = documento.getBody();
    const faltando = marcadoresFaltandoNoModelo(corpo.getText());
    if (faltando.length > 0) {
      throw new Error(`O modelo do recibo não tem estes marcadores: ${faltando.map((m) => `{{${m}}}`).join(', ')}. Acrescente no Google Docs e tente de novo.`);
    }
    for (const marcador of [...MARCADORES_OBRIGATORIOS_RECIBO, ...MARCADORES_OPCIONAIS_RECIBO]) {
      corpo.replaceText(`\\{\\{${marcador}\\}\\}`, dados.campos[marcador] || '');
    }
    documento.saveAndClose();

    const pdf = copia.getAs('application/pdf').setName(dados.nomeArquivo);
    const arquivo = pasta.createFile(pdf);
    folha.getRange(linha, COLUNA_LINK_RECIBO).setValue(arquivo.getUrl());
    registrar('recibo', 'info', `Recibo gerado para o pagamento ${pagamento.id} (paciente ${pagamento.codigo_paciente}).`);
    return { link: arquivo.getUrl(), nomeArquivo: dados.nomeArquivo };
  } finally {
    if (copia) {
      try { copia.setTrashed(true); } catch (e) { /* se não der para apagar, a cópia TEMP_ fica na pasta */ }
    }
    trava.releaseLock();
  }
}

// Item de menu: gera o recibo da linha selecionada na aba Pagamentos.
function gerarReciboDaLinhaSelecionada() {
  const ui = SpreadsheetApp.getUi();
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getActiveSheet();
    if (!aba || aba.getName() !== 'Pagamentos') throw new Error('Abra a aba "Pagamentos" e clique na linha do pagamento.');
    const r = gerarReciboDaLinha_(planilha.getActiveRange().getRow());
    ui.alert('Recibo gerado', `Arquivo ${r.nomeArquivo}\n${r.link}`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Recibo não gerado', e.message, ui.ButtonSet.OK);
  }
}
