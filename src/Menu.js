// Menu "Kit do Consultório" e suas ações (chamadas ao Google). A lógica está em Acoes.js.
// Ações sobre pagamentos e consultas valem para a(s) linha(s) selecionada(s) na aba certa (até 20 por vez).
// Toda ação passa por executarNoMenu_: problema de uso vira mensagem na tela; erro inesperado vai ao Registro e ao e-mail.

const MAX_LINHAS_POR_ACAO = 20;

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Kit do Consultório')
    .addItem('Sincronizar agenda', 'sincronizarAgendaPeloMenu')
    .addItem('Gerar valores a receber', 'gerarAReceberPeloMenu')
    .addSeparator()
    .addSubMenu(ui.createMenu('Pagamento (linha selecionada em Pagamentos)')
      .addItem('Marcar como pago (Pix)', 'marcarPagoPix')
      .addItem('Marcar como pago (cartão)', 'marcarPagoCartao')
      .addItem('Marcar como pago (dinheiro)', 'marcarPagoDinheiro')
      .addItem('Marcar como cortesia', 'marcarCortesia')
      .addItem('Marcar como consulta de pacote', 'marcarConsultaDePacote')
      .addSeparator()
      .addItem('Gerar Pix copia e cola', 'gerarPixDaLinha')
      .addItem('Gerar recibo em PDF', 'gerarReciboDaLinhaSelecionada'))
    .addSubMenu(ui.createMenu('Consulta (linha selecionada em Consultas)')
      .addItem('Marcar como realizada', 'marcarConsultaRealizada')
      .addItem('Marcar como faltou', 'marcarConsultaFaltou'))
    .addItem('Relatório do mês (aba e CSV)', 'gerarRelatorioDoMes')
    .addSeparator()
    .addSubMenu(ui.createMenu('Configuração')
      .addItem('Definir preços das consultas (em reais)', 'definirPrecosDasConsultas')
      .addItem('Instalar/atualizar planilha', 'instalarPlanilha')
      .addItem('Criar modelo e pasta de recibos', 'criarModeloEPastaDeRecibos')
      .addItem('Ativar sincronização automática', 'ativarSincronizacaoAutomatica')
      .addItem('Testar alerta de falha', 'testarAlertaDeFalha'));
  // O submenu de teste vem de GeradorTeste.js, que o pacote de produção não leva (ver scripts/empacotar-producao.js).
  if (typeof adicionarMenuDeTeste_ === 'function') adicionarMenuDeTeste_(ui, menu);
  menu.addToUi();
}

function hojeTexto_() {
  return dataParaTexto(hojeSaoPaulo_());
}

// Aplica `acao(linhaObjeto)` a cada linha selecionada. `acao` devolve { ok, motivo, gravar }.
// Devolve { feitos, motivos }. Linhas que falham não impedem as outras.
// `preparar`, se houver, roda DENTRO da trava, depois de a seleção ser lida, e o que devolve chega à `acao` como 2º argumento:
// assim nada lido antes da trava (como o saldo de um pacote) é usado depois de outra execução ter mudado a planilha.
function aplicarNasLinhas_(nomeAba, acao, preparar) {
  return comTrava_(() => {
    const linhas = linhasSelecionadas(nomeAba, MAX_LINHAS_POR_ACAO);
    const objetos = lerAbaComoObjetos(nomeAba);
    const contexto = preparar ? preparar() : undefined;
    let feitos = 0;
    const motivos = [];
    for (const numero of linhas) {
      const alvo = objetos.find((o) => o.linha === numero);
      if (!alvo) { motivos.push(`Linha ${numero}: está vazia.`); continue; }
      const r = acao(alvo, contexto);
      if (r.ok) { r.gravar(); feitos++; } else motivos.push(`Linha ${numero}: ${r.motivo}`);
    }
    return { feitos, motivos };
  });
}

function mostrarResultado_(titulo, r, extra) {
  const linhas = [`Feito em ${r.feitos} linha(s).`].concat(r.motivos);
  if (extra && r.feitos > 0) linhas.push(extra);
  SpreadsheetApp.getUi().alert(titulo, linhas.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function marcarPagoComForma_(forma, nomeForma) {
  executarNoMenu_('pagamentos', () => {
    const hoje = hojeTexto_();
    const r = aplicarNasLinhas_('Pagamentos', (p) => {
      const a = aplicarPagamentoRecebido(p, forma, hoje);
      if (a.ok) a.gravar = () => gravarLinha('Pagamentos', p.linha, linhaPagamento(a.pagamento));
      return a;
    });
    mostrarResultado_(`Pago em ${nomeForma}`, r, 'Se quiser o recibo, preencha "pagador_nome" e use Pagamento > Gerar recibo em PDF.');
  });
}

function marcarPagoPix() { marcarPagoComForma_('pix', 'Pix'); }
function marcarPagoCartao() { marcarPagoComForma_('cartao', 'cartão'); }
function marcarPagoDinheiro() { marcarPagoComForma_('dinheiro', 'dinheiro'); }

function marcarCortesia() {
  executarNoMenu_('pagamentos', () => {
    const ui = SpreadsheetApp.getUi();
    const ok = ui.alert('Cortesia', 'A consulta ficará com valor zero e não entra no relatório do mês. Confirma?', ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return;
    const r = aplicarNasLinhas_('Pagamentos', (p) => {
      const a = aplicarCortesia(p);
      if (a.ok) a.gravar = () => gravarLinha('Pagamentos', p.linha, linhaPagamento(a.pagamento));
      return a;
    });
    mostrarResultado_('Cortesia', r);
  });
}

// Gravação em duas etapas, nesta ordem: 1) o pagamento vira pago/pacote; 2) `usadas` sobe. Se a 2ª falhar, a próxima
// ação reconcilia `usadas` pelos pagamentos já feitos (reconciliarPacotes); se a 1ª falhar, nada foi consumido.
function marcarConsultaDePacote() {
  executarNoMenu_('pagamentos', () => {
    const hoje = hojeTexto_();
    const r = aplicarNasLinhas_('Pagamentos', (p, ctx) => {
      const a = aplicarPacote(p, ctx.pacotes, hoje);
      if (a.ok) {
        const indice = ctx.pacotes.findIndex((x) => x.linha === a.pacote.linha);
        a.gravar = () => {
          gravarLinha('Pagamentos', p.linha, linhaPagamento(a.pagamento));
          gravarCelula('Pacotes', a.pacote.linha, 'usadas', a.pacote.usadas);
          ctx.pacotes[indice] = a.pacote; // a próxima linha da seleção já enxerga o pacote atualizado
        };
      }
      return a;
    }, () => {
      const lidos = lerAbaComoObjetos('Pacotes');
      const { pacotes, corrigidos } = reconciliarPacotes(lidos, lerAbaComoObjetos('Pagamentos'));
      for (const c of corrigidos) gravarCelula('Pacotes', c.linha, 'usadas', c.usadas);
      return { pacotes };
    });
    mostrarResultado_('Consulta de pacote', r);
  });
}

function gerarPixDaLinha() {
  executarNoMenu_('pix', () => {
    const [linha] = linhasSelecionadas('Pagamentos', 1);
    const pagamento = lerAbaComoObjetos('Pagamentos').find((p) => p.linha === linha);
    if (!pagamento) throw erroDeUso_('Essa linha está vazia.');
    const r = montarPixDoPagamento(pagamento, lerConfiguracoes().config);
    if (!r.ok) throw erroDeUso_(r.motivo);
    SpreadsheetApp.getUi().alert('Pix copia e cola',
      `Selecione todo o texto abaixo, copie e mande ao paciente. Antes de mandar, confira o valor e o nome no app do seu banco (sem pagar).\n\n${r.texto}`,
      SpreadsheetApp.getUi().ButtonSet.OK);
  });
}

function marcarStatusDaConsulta_(novoStatus) {
  executarNoMenu_('menu', () => {
    const pagamentos = lerAbaComoObjetos('Pagamentos');
    let avisoCobranca = '';
    const r = aplicarNasLinhas_('Consultas', (c) => {
      const a = aplicarStatusConsulta(c, novoStatus);
      if (a.ok) {
        a.gravar = () => {
          gravarCelula('Consultas', c.linha, 'status', novoStatus);
          gravarCelula('Consultas', c.linha, 'atualizado_em', agoraTexto_());
        };
        if (novoStatus === 'faltou' && pagamentos.some((p) => String(p.id_evento) === String(c.id_evento) && p.status === 'a_receber')) {
          avisoCobranca = 'Há valor a receber ligado a uma consulta que faltou. Decida na aba Pagamentos: cobrar ou marcar como cortesia.';
        }
      }
      return a;
    });
    mostrarResultado_(`Consulta ${novoStatus}`, r, avisoCobranca);
  });
}

function marcarConsultaRealizada() { marcarStatusDaConsulta_('realizada'); }
function marcarConsultaFaltou() { marcarStatusDaConsulta_('faltou'); }
