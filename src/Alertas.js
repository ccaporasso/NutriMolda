// Registro e alerta de falha (chamadas ao Google). A lógica está em Registro.js.
// Função única de log: registrar(). Falha do próprio registro nunca lança outro erro
// por cima do original: o último recurso é o Logger do Apps Script.

const FUSO_KIT = 'America/Sao_Paulo';

function agoraTexto_() {
  return Utilities.formatDate(new Date(), FUSO_KIT, 'yyyy-MM-dd HH:mm:ss');
}

// Grava uma linha na aba Registro. Devolve true se gravou.
function registrar(modulo, nivel, mensagem) {
  let linha;
  try {
    linha = montarLinhaRegistro(agoraTexto_(), modulo, nivel, mensagem);
    const folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Registro');
    if (!folha) throw new Error('A aba "Registro" não existe.');
    folha.appendRow(linha);
    return true;
  } catch (e) {
    // Só o nome do erro e a linha já mascarada: nada de dado pessoal no Logger.
    Logger.log(`Kit do Consultório: não consegui gravar no Registro (${descreverErro(e)}). Linha: ${linha ? linha.join(' | ') : '(não montada)'}`);
    return false;
  }
}

// Registra o erro e avisa por e-mail. Devolve { registrado, emailEnviado }.
function registrarErro(modulo, erro) {
  const registrado = registrar(modulo, 'erro', descreverErro(erro));
  let emailEnviado = false;
  try {
    const para = lerEmailAlertas();
    if (!para) throw new Error('"email_alertas" não está preenchido ou é inválido.');
    const email = montarEmailAlerta(modulo, agoraTexto_());
    MailApp.sendEmail(para, email.assunto, email.corpo);
    emailEnviado = true;
  } catch (e) {
    registrar('alertas', 'aviso', `E-mail de alerta não enviado: ${descreverErro(e)}`);
  }
  return { registrado, emailEnviado };
}

// Item do menu: força um erro inventado para conferir o Registro e o e-mail.
function testarAlertaDeFalha() {
  let resultado;
  try {
    throw new Error('Erro de teste forçado pelo menu. Nenhum dado real.');
  } catch (e) {
    resultado = registrarErro('teste', e);
  }
  SpreadsheetApp.getUi().alert([
    `Registrado na aba Registro: ${resultado.registrado ? 'sim' : 'NÃO'}.`,
    `E-mail de alerta enviado: ${resultado.emailEnviado ? 'sim' : 'NÃO (veja a aba Registro)'}.`,
  ].join('\n'));
}
