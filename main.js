require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const handlers = require('./handlers/telegramHandlers')
const goalHandlers = require('./handlers/goalHandlers')
const incomeConfigHandler = require('./handlers/incomeConfigHandler')
const userConfigService = require('./services/userConfig')
const reminderScheduler = require('./services/reminderScheduler')
const incomeSourceService = require('./services/incomeSourceService')
const recurringExpenseService = require('./services/recurringExpenseService')
const supabaseService = require('./services/supabase');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN

if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN não encontrado no arquivo .env')
  process.exit(1)
}

const botOptions = {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
}

async function initApp() {
  try {
    await userConfigService.setupConfigTable()
    console.log('Tabela de configurações inicializada com sucesso!')
    const bot = new TelegramBot(TELEGRAM_TOKEN, botOptions)
    
    // Compartilhar a instância do bot com o módulo goalHandlers
    goalHandlers.setBotInstance(bot);

    bot.on('polling_error', (error) => {
      console.error('Erro de polling:', error.message || error)
      
      if (error.code === 'ETELEGRAM' && error.message && error.message.includes('409')) {
        console.log('Aviso: Múltiplas instâncias detectadas. Certifique-se de rodar apenas uma instância do bot.')
      }
    })
    
    bot.setMyCommands(handlers.commands)
    
    // Comandos básicos
    bot.onText(/\/start/, (msg) => handlers.handleStart(bot, msg))
    bot.onText(/\/ajuda/, (msg) => handlers.handleHelp(bot, msg))
    bot.onText(/\/configurar/, (msg) => handlers.handleConfigure(bot, msg))
    bot.onText(/\/relatorio/, (msg) => handlers.handleReport(bot, msg, 'month'))
    bot.onText(/\/hoje/, (msg) => handlers.handleReport(bot, msg, 'day'))
    bot.onText(/\/semana/, (msg) => handlers.handleReport(bot, msg, 'week'))
    bot.onText(/\/mes/, (msg) => handlers.handleReport(bot, msg, 'month'))
    bot.onText(/\/reset/, (msg) => handlers.handleReset(bot, msg))
    bot.onText(/\/lembretes/, (msg) => handlers.handleListReminders(bot, msg))
    
    // Comandos de metas
    bot.onText(/\/meta/, (msg) => goalHandlers.handleNewGoalCommand(bot, msg))
    bot.onText(/\/metas/, (msg) => goalHandlers.handleGoalsCommand(bot, msg))
    bot.onText(/\/metadetalhes(.*)/, (msg) => goalHandlers.handleGoalDetails(bot, msg))
    bot.onText(/\/novameta/, (msg) => goalHandlers.handleNewGoalCommand(bot, msg))
    
    // Comandos de visualização/gráficos
    bot.onText(/\/dashboard/, (msg) => handlers.handleDashboard(bot, msg, 'month'))
    bot.onText(/\/grafico_despesas/, (msg) => handlers.handleExpenseChart(bot, msg, 'month'))
    bot.onText(/\/grafico_receitas/, (msg) => handlers.handleIncomeChart(bot, msg, 'month'))
    bot.onText(/\/grafico_evolucao/, (msg) => handlers.handleBalanceEvolutionChart(bot, msg, 'month'))
    bot.onText(/\/grafico_comparativo/, (msg) => handlers.handleComparisonChart(bot, msg, 'month'))
    bot.onText(/\/visualizar/, (msg) => handlers.handleDashboardMenu(bot, msg))
    
    // Novos comandos para configuração financeira
    bot.onText(/\/renda/, (msg) => handleIncomeManagement(bot, msg))
    bot.onText(/\/despesas/, (msg) => handleRecurringExpensesManagement(bot, msg))
    bot.onText(/\/configurar_financas/, (msg) => incomeConfigHandler.startIncomeConfigFlow(bot, msg))
    
    // Usar variável compartilhada para controlar se uma mensagem está sendo processada por algum fluxo especial
    let processingUsers = new Set();
    
    // Handler de mensagens
    bot.on('message', async (msg) => {
      // Ignora mensagens que são comandos
      if (msg.text && msg.text.startsWith('/')) return;
      
      const telegramId = msg.from.id;
      
      // Verificar se o usuário está no fluxo de configuração financeira
      if (incomeConfigHandler.isUserInIncomeConfigFlow(telegramId)) {
        console.log('Usuário está no fluxo de configuração financeira, direcionando para incomeConfigHandler');
        processingUsers.add(telegramId);
        
        try {
          // Tentar processar com os handlers de configuração financeira
          if (await incomeConfigHandler.handlePostSaveDecision(bot, msg)) {
            setTimeout(() => processingUsers.delete(telegramId), 1000);
            return;
          }
          
          if (await incomeConfigHandler.handleExpensesConfigMessage(bot, msg)) {
            setTimeout(() => processingUsers.delete(telegramId), 1000);
            return;
          }
          
          if (await incomeConfigHandler.handleIncomeConfigMessage(bot, msg)) {
            setTimeout(() => processingUsers.delete(telegramId), 1000);
            return;
          }
        } catch (error) {
          console.error('Erro ao processar fluxo de configuração financeira:', error);
        }
        
        // Remove depois de processado para evitar bloqueios permanentes
        setTimeout(() => processingUsers.delete(telegramId), 1000);
        return;
      }
      
      // Verificar se o usuário está no fluxo de metas
      if (goalHandlers.isUserInGoalFlow(telegramId)) {
        console.log('Usuário está no fluxo de metas, direcionando para goalHandlers');
        processingUsers.add(telegramId);
        
        try {
          await goalHandlers.handleOngoingGoalFlow(bot, msg);
        } catch (error) {
          console.error('Erro ao processar fluxo de metas:', error);
        }
        
        // Remove depois de processado para evitar bloqueios permanentes
        setTimeout(() => processingUsers.delete(telegramId), 1000);
        return;
      }
      
      // Se não for fluxo especial, processa como mensagem normal
      if (!processingUsers.has(telegramId)) {
        handlers.handleMessage(bot, msg);
      }
    });
    
    // Handler de callback queries
    bot.on('callback_query', async (callbackQuery) => {
      try {
        const callbackData = callbackQuery.data
        
        if (callbackData.startsWith('complete_reminder:')) {
          await reminderScheduler.handleReminderCompletion(bot, callbackQuery)
        }
        else if (callbackData.startsWith('income_')) {
          await handleIncomeCallbacks(bot, callbackQuery)
        }
        else if (callbackData.startsWith('expense_')) {
          await handleExpenseCallbacks(bot, callbackQuery)
        }
        else if (
          callbackData.startsWith('dashboard_') || 
          callbackData.startsWith('expense_chart_') ||
          callbackData.startsWith('income_chart_') ||
          callbackData.startsWith('balance_chart_') ||
          callbackData.startsWith('comparison_chart_')
        ) {
          await handlers.handleDashboardCallbacks(bot, callbackQuery)
        }
        else if (callbackData.startsWith('goal_')) {
          await goalHandlers.handleGoalCallbacks(bot, callbackQuery)
        }
        
      } catch (error) {
        console.error('Erro ao processar callback:', error)
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Ocorreu um erro. Tente novamente.'
        })
      }
    })
    
    // Inicializar o scheduler de lembretes
    reminderScheduler.setupReminderScheduler(bot)
    
    // Também configurar atualizações periódicas para rendas e despesas
    setupFinancialScheduler(bot)
    
    console.log('DinDin AI inicializado com sucesso! 🤖💰')
    console.log('Novos comandos de gerenciamento financeiro disponíveis!')
  } catch (error) {
    console.error('Erro ao inicializar o aplicativo:', error)
    process.exit(1)
  }
}

/**
 * Gerencia fontes de renda do usuário
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function handleIncomeManagement(bot, msg) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    // Verificar se está em outro fluxo
    if (incomeConfigHandler.isUserInIncomeConfigFlow(telegramId) || 
        goalHandlers.isUserInGoalFlow(telegramId)) {
      return;
    }
    
    // Obter as fontes de renda do usuário
    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    const incomeSources = await incomeSourceService.getUserIncomeSources(user.id);
    
    if (incomeSources.length === 0) {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Configurar fonte de renda', callback_data: 'income_config' }]
          ]
        }
      };
      
      await bot.sendMessage(
        chatId, 
        "Você ainda não tem fontes de renda configuradas. Configurar agora?",
        keyboard
      );
      return;
    }
    
    // Mostrar lista de fontes de renda
    let message = "📋 *Suas Fontes de Renda:*\n\n";
    
    incomeSources.forEach((source, index) => {
      message += `${index + 1}. *${source.name}*: R$ ${source.amount.toFixed(2)}\n`;
      
      // Adicionar dias de recebimento
      if (source.recurring_type === 'monthly') {
        message += `   📅 Recebimento: Dia ${source.recurring_days[0]} de cada mês\n`;
      } else if (source.recurring_type === 'biweekly') {
        message += `   📅 Recebimento: Dias ${source.recurring_days.join(' e ')} de cada mês\n`;
      } else if (source.recurring_type === 'weekly') {
        const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const days = source.recurring_days.map(d => weekDays[d % 7]);
        message += `   📅 Recebimento: ${days.join(' e ')} de cada semana\n`;
      }
      
      // Adicionar próxima data esperada
      if (source.next_expected_date) {
        const nextDate = new Date(source.next_expected_date);
        message += `   📌 Próximo recebimento: ${nextDate.toLocaleDateString('pt-BR')}\n`;
      }
      
      message += '\n';
    });
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Adicionar nova fonte', callback_data: 'income_add' },
            { text: 'Confirmar recebimento', callback_data: 'income_confirm' }
          ],
          [
            { text: 'Editar fonte', callback_data: 'income_edit' },
            { text: 'Remover fonte', callback_data: 'income_delete' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      ...keyboard
    });
    
  } catch (error) {
    console.error('Erro no handleIncomeManagement:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao gerenciar suas fontes de renda. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Gerencia despesas recorrentes do usuário
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function handleRecurringExpensesManagement(bot, msg) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    // Verificar se está em outro fluxo
    if (incomeConfigHandler.isUserInIncomeConfigFlow(telegramId) || 
        goalHandlers.isUserInGoalFlow(telegramId)) {
      return;
    }
    
    // Obter as despesas recorrentes do usuário
    const user = await handlers.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    const recurringExpenses = await recurringExpenseService.getUserRecurringExpenses(user.id);
    
    if (recurringExpenses.length === 0) {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Configurar despesa recorrente', callback_data: 'expense_config' }]
          ]
        }
      };
      
      await bot.sendMessage(
        chatId, 
        "Você ainda não tem despesas recorrentes configuradas. Configurar agora?",
        keyboard
      );
      return;
    }
    
    // Mostrar lista de despesas recorrentes
    let message = "📋 *Suas Despesas Recorrentes:*\n\n";
    
    recurringExpenses.forEach((expense, index) => {
      message += `${index + 1}. *${expense.name}*: R$ ${expense.amount.toFixed(2)}\n`;
      message += `   📅 Vencimento: Dia ${expense.due_day} de cada mês\n`;
      
      // Adicionar categoria se disponível
      if (expense.categories) {
        message += `   📊 Categoria: ${expense.categories.icon} ${expense.categories.name}\n`;
      }
      
      // Adicionar próxima data de vencimento
      if (expense.next_due_date) {
        const dueDate = new Date(expense.next_due_date);
        message += `   📌 Próximo vencimento: ${dueDate.toLocaleDateString('pt-BR')}\n`;
      }
      
      message += '\n';
    });
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Adicionar nova despesa', callback_data: 'expense_add' },
            { text: 'Marcar como paga', callback_data: 'expense_pay' }
          ],
          [
            { text: 'Editar despesa', callback_data: 'expense_edit' },
            { text: 'Remover despesa', callback_data: 'expense_delete' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      ...keyboard
    });
    
  } catch (error) {
    console.error('Erro no handleRecurringExpensesManagement:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao gerenciar suas despesas recorrentes. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Processa callbacks relacionados a fontes de renda
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} callbackQuery - Objeto da query de callback
 */
async function handleIncomeCallbacks(bot, callbackQuery) {
  const { data } = callbackQuery;
  const chatId = callbackQuery.message.chat.id;
  const { id: telegramId } = callbackQuery.from;
  
  // Responder ao callback para remover o "carregando"
  await bot.answerCallbackQuery(callbackQuery.id);
  
  try {
    // Obter o usuário
    const user = await supabaseService.getOrCreateUser(telegramId, callbackQuery.from.first_name, callbackQuery.from.last_name, callbackQuery.from.username);
    
    if (data === 'income_config' || data === 'income_add') {
      // Iniciar fluxo de configuração de renda
      await incomeConfigHandler.startIncomeConfigFlow(bot, callbackQuery.message);
    } 
    else if (data.startsWith('income_confirm:')) {
      // Confirmação de recebimento de renda específica
      const incomeId = data.split(':')[1];
      
      // Verificar se a fonte de renda existe
      const incomeSource = await incomeSourceService.getIncomeSourceById(incomeId, user.id);
      
      if (!incomeSource) {
        await bot.sendMessage(chatId, "Fonte de renda não encontrada ou não pertence a você.");
        return;
      }
      
      // Perguntar se o valor recebido foi diferente do esperado
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: `Sim, recebi R$ ${incomeSource.amount.toFixed(2)}`, callback_data: `income_confirm_exact:${incomeId}` }
            ],
            [
              { text: 'Não, recebi um valor diferente', callback_data: `income_confirm_different:${incomeId}` }
            ]
          ]
        }
      };
      
      await bot.sendMessage(
        chatId,
        `Você está confirmando o recebimento de *${incomeSource.name}*.\n\nO valor esperado é R$ ${incomeSource.amount.toFixed(2)}. Você recebeu exatamente este valor?`,
        { parse_mode: 'Markdown', ...keyboard }
      );
    }
    else if (data.startsWith('income_confirm_exact:')) {
      // Confirmação com valor exato
      const incomeId = data.split(':')[1];
      
      // Confirmar o recebimento com o valor padrão
      const updatedIncome = await incomeSourceService.confirmIncomeReceived(incomeId, user.id);
      
      // Criar a transação automaticamente
      await supabaseService.createTransaction(
        user.id,
        null, // Sem categoria específica por enquanto
        updatedIncome.amount,
        `${updatedIncome.name} (Recebimento automático)`,
        'income',
        new Date()
      );
      
      await bot.sendMessage(
        chatId,
        `✅ Recebimento de *${updatedIncome.name}* confirmado com sucesso!\n\nValor: R$ ${updatedIncome.amount.toFixed(2)}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nA transação foi registrada automaticamente.`,
        { parse_mode: 'Markdown' }
      );
      
      // Atualizar a próxima data de recebimento
      await incomeSourceService.updateExpectedDates();
      
      // Mostrar próxima data de recebimento
      const refreshedIncome = await incomeSourceService.getIncomeSourceById(incomeId, user.id);
      if (refreshedIncome && refreshedIncome.next_expected_date) {
        const nextDate = new Date(refreshedIncome.next_expected_date);
        await bot.sendMessage(
          chatId,
          `📌 Próximo recebimento previsto para: ${nextDate.toLocaleDateString('pt-BR')}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    else if (data.startsWith('income_confirm_different:')) {
      // Confirmar com valor diferente
      const incomeId = data.split(':')[1];
      
      // Armazenar o ID para processamento posterior
      const userConfig = await userConfigService.getUserConfig(user.id);
      userConfig.temp_income_id = incomeId;
      await userConfigService.saveUserConfig(user.id, userConfig);
      
      await bot.sendMessage(
        chatId,
        "Por favor, informe o valor que você recebeu (apenas números, ex: 1500.50):",
        { parse_mode: 'Markdown' }
      );
      
      // Adicionar ao estado para saber que estamos esperando um valor
      const processingUsers = processingUsers || new Set();
      processingUsers.add(telegramId);
      
      // Definir um estado temporário para este usuário
      if (!global.userTempStates) global.userTempStates = new Map();
      global.userTempStates.set(telegramId, {
        state: 'awaiting_income_amount',
        incomeId: incomeId
      });
      
      setTimeout(() => {
        if (processingUsers.has(telegramId)) {
          processingUsers.delete(telegramId);
        }
      }, 60000); // Timeout de 1 minuto
    }
    else if (data === 'income_list') {
      // Mostrar lista de fontes de renda (útil após confirmações)
      await handleIncomeManagement(bot, callbackQuery.message);
    }
    else if (data.startsWith('income_edit:')) {
      // Implementação básica de edição (completa na próxima etapa)
      const incomeId = data.split(':')[1];
      await bot.sendMessage(
        chatId, 
        `Funcionalidade de edição para fonte de renda ID ${incomeId} será implementada em breve.`
      );
    }
    else if (data.startsWith('income_delete:')) {
      // Confirmar exclusão
      const incomeId = data.split(':')[1];
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Sim, excluir fonte de renda', callback_data: `income_delete_confirm:${incomeId}` }
            ],
            [
              { text: 'Não, cancelar', callback_data: 'income_list' }
            ]
          ]
        }
      };
      
      await bot.sendMessage(
        chatId,
        "Tem certeza que deseja excluir esta fonte de renda? Esta ação não pode ser desfeita.",
        keyboard
      );
    }
    else if (data.startsWith('income_delete_confirm:')) {
      // Excluir fonte de renda
      const incomeId = data.split(':')[1];
      
      // Obter nome para mensagem de confirmação
      const income = await incomeSourceService.getIncomeSourceById(incomeId, user.id);
      const incomeName = income ? income.name : "Fonte de renda";
      
      // Excluir
      await incomeSourceService.deleteIncomeSource(incomeId, user.id);
      
      await bot.sendMessage(
        chatId,
        `✅ Fonte de renda "${incomeName}" excluída com sucesso.`,
        { parse_mode: 'Markdown' }
      );
      
      // Mostrar lista atualizada
      setTimeout(() => handleIncomeManagement(bot, callbackQuery.message), 1000);
    }
  } catch (error) {
    console.error('Erro no handleIncomeCallbacks:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
  }
}

// Adicione esta função ao arquivo main.js
/**
 * Processa mensagens relacionadas a valores de renda/despesa
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem
 * @returns {boolean} Se a mensagem foi processada
 */
async function handleAmountMessages(bot, msg) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Verificar se há um estado temporário para este usuário
  if (!global.userTempStates || !global.userTempStates.has(telegramId)) {
    return false;
  }
  
  const tempState = global.userTempStates.get(telegramId);
  
  try {
    if (tempState.state === 'awaiting_income_amount') {
      // Processando valor personalizado para renda
      // Validar e extrair valor
      const amount = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
      
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(
          chatId,
          "Por favor, informe um valor numérico válido maior que zero.",
          { parse_mode: 'Markdown' }
        );
        return true;
      }
      
      const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
      
      // Confirmar o recebimento com valor personalizado
      const updatedIncome = await incomeSourceService.confirmIncomeReceived(
        tempState.incomeId, 
        user.id, 
        amount
      );
      
      // Criar a transação automaticamente
      await supabaseService.createTransaction(
        user.id,
        null, // Sem categoria específica por enquanto
        amount,
        `${updatedIncome.name} (Recebimento automático)`,
        'income',
        new Date()
      );
      
      await bot.sendMessage(
        chatId,
        `✅ Recebimento de *${updatedIncome.name}* confirmado com sucesso!\n\nValor: R$ ${amount.toFixed(2)}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nA transação foi registrada automaticamente.`,
        { parse_mode: 'Markdown' }
      );
      
      // Limpar o estado temporário
      global.userTempStates.delete(telegramId);
      
      // Atualizar a próxima data de recebimento
      await incomeSourceService.updateExpectedDates();
      
      // Mostrar próxima data de recebimento
      const refreshedIncome = await incomeSourceService.getIncomeSourceById(tempState.incomeId, user.id);
      if (refreshedIncome && refreshedIncome.next_expected_date) {
        const nextDate = new Date(refreshedIncome.next_expected_date);
        await bot.sendMessage(
          chatId,
          `📌 Próximo recebimento previsto para: ${nextDate.toLocaleDateString('pt-BR')}`,
          { parse_mode: 'Markdown' }
        );
      }
      
      return true;
    }
    else if (tempState.state === 'awaiting_expense_amount') {
      // Processando valor personalizado para despesa
      // Validar e extrair valor
      const amount = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
      
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(
          chatId,
          "Por favor, informe um valor numérico válido maior que zero.",
          { parse_mode: 'Markdown' }
        );
        return true;
      }
      
      const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
      
      // Confirmar o pagamento com valor personalizado
      const updatedExpense = await recurringExpenseService.markRecurringExpenseAsPaid(
        tempState.expenseId, 
        user.id, 
        amount, 
        new Date(), 
        true // Criar transação
      );
      
      await bot.sendMessage(
        chatId,
        `✅ Pagamento de *${updatedExpense.name}* confirmado com sucesso!\n\nValor: R$ ${amount.toFixed(2)}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nA transação foi registrada automaticamente.`,
        { parse_mode: 'Markdown' }
      );
      
      // Limpar o estado temporário
      global.userTempStates.delete(telegramId);
      
      // Mostrar próxima data de vencimento
      if (updatedExpense.next_due_date) {
        const nextDate = new Date(updatedExpense.next_due_date);
        await bot.sendMessage(
          chatId,
          `📌 Próximo vencimento previsto para: ${nextDate.toLocaleDateString('pt-BR')}`,
          { parse_mode: 'Markdown' }
        );
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Erro no handleAmountMessages:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
    
    // Limpar o estado temporário em caso de erro
    global.userTempStates.delete(telegramId);
    return true;
  }
}



/**
 * Processa callbacks relacionados a despesas recorrentes
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} callbackQuery - Objeto da query de callback
 */
async function handleExpenseCallbacks(bot, callbackQuery) {
  const { data } = callbackQuery;
  const chatId = callbackQuery.message.chat.id;
  const { id: telegramId } = callbackQuery.from;
  
  // Responder ao callback para remover o "carregando"
  await bot.answerCallbackQuery(callbackQuery.id);
  
  try {
    // Obter o usuário
    const user = await supabaseService.getOrCreateUser(telegramId, callbackQuery.from.first_name, callbackQuery.from.last_name, callbackQuery.from.username);
    
    if (data === 'expense_config' || data === 'expense_add') {
      // Iniciar fluxo de configuração de despesa
      await incomeConfigHandler.startExpensesConfigFlow(bot, callbackQuery.message);
    } 
    else if (data.startsWith('expense_pay:')) {
      // Confirmação de pagamento de despesa específica
      const expenseId = data.split(':')[1];
      
      // Verificar se a despesa existe
      const expense = await recurringExpenseService.getRecurringExpenseById(expenseId, user.id);
      
      if (!expense) {
        await bot.sendMessage(chatId, "Despesa recorrente não encontrada ou não pertence a você.");
        return;
      }
      
      // Perguntar se o valor pago foi diferente do esperado
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: `Sim, paguei R$ ${expense.amount.toFixed(2)}`, callback_data: `expense_pay_exact:${expenseId}` }
            ],
            [
              { text: 'Não, paguei um valor diferente', callback_data: `expense_pay_different:${expenseId}` }
            ]
          ]
        }
      };
      
      await bot.sendMessage(
        chatId,
        `Você está confirmando o pagamento de *${expense.name}*.\n\nO valor esperado é R$ ${expense.amount.toFixed(2)}. Você pagou exatamente este valor?`,
        { parse_mode: 'Markdown', ...keyboard }
      );
    }
    else if (data.startsWith('expense_pay_exact:')) {
      // Confirmação com valor exato
      const expenseId = data.split(':')[1];
      
      // Confirmar o pagamento com o valor padrão
      const updatedExpense = await recurringExpenseService.markRecurringExpenseAsPaid(
        expenseId, 
        user.id, 
        null, // Valor padrão
        new Date(), 
        true // Criar transação
      );
      
      await bot.sendMessage(
        chatId,
        `✅ Pagamento de *${updatedExpense.name}* confirmado com sucesso!\n\nValor: R$ ${updatedExpense.amount.toFixed(2)}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nA transação foi registrada automaticamente.`,
        { parse_mode: 'Markdown' }
      );
      
      // Mostrar próxima data de vencimento
      if (updatedExpense.next_due_date) {
        const nextDate = new Date(updatedExpense.next_due_date);
        await bot.sendMessage(
          chatId,
          `📌 Próximo vencimento previsto para: ${nextDate.toLocaleDateString('pt-BR')}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    else if (data.startsWith('expense_pay_different:')) {
      // Confirmar com valor diferente
      const expenseId = data.split(':')[1];
      
      // Armazenar o ID para processamento posterior
      const userConfig = await userConfigService.getUserConfig(user.id);
      userConfig.temp_expense_id = expenseId;
      await userConfigService.saveUserConfig(user.id, userConfig);
      
      await bot.sendMessage(
        chatId,
        "Por favor, informe o valor que você pagou (apenas números, ex: 150.75):",
        { parse_mode: 'Markdown' }
      );
      
      // Adicionar ao estado para saber que estamos esperando um valor
      const processingUsers = processingUsers || new Set();
      processingUsers.add(telegramId);
      
      // Definir um estado temporário para este usuário
      if (!global.userTempStates) global.userTempStates = new Map();
      global.userTempStates.set(telegramId, {
        state: 'awaiting_expense_amount',
        expenseId: expenseId
      });
      
      setTimeout(() => {
        if (processingUsers.has(telegramId)) {
          processingUsers.delete(telegramId);
        }
      }, 60000); // Timeout de 1 minuto
    }
    else if (data === 'expense_list') {
      // Mostrar lista de despesas (útil após confirmações)
      await handleRecurringExpensesManagement(bot, callbackQuery.message);
    }
    else if (data.startsWith('expense_edit:')) {
      // Implementação básica de edição (completa na próxima etapa)
      const expenseId = data.split(':')[1];
      await bot.sendMessage(
        chatId, 
        `Funcionalidade de edição para despesa ID ${expenseId} será implementada em breve.`
      );
    }
    else if (data.startsWith('expense_delete:')) {
      // Confirmar exclusão
      const expenseId = data.split(':')[1];
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Sim, excluir despesa', callback_data: `expense_delete_confirm:${expenseId}` }
            ],
            [
              { text: 'Não, cancelar', callback_data: 'expense_list' }
            ]
          ]
        }
      };
      
      await bot.sendMessage(
        chatId,
        "Tem certeza que deseja excluir esta despesa recorrente? Esta ação não pode ser desfeita.",
        keyboard
      );
    }
    else if (data.startsWith('expense_delete_confirm:')) {
      // Excluir despesa
      const expenseId = data.split(':')[1];
      
      // Obter nome para mensagem de confirmação
      const expense = await recurringExpenseService.getRecurringExpenseById(expenseId, user.id);
      const expenseName = expense ? expense.name : "Despesa recorrente";
      
      // Excluir
      await recurringExpenseService.deleteRecurringExpense(expenseId, user.id);
      
      await bot.sendMessage(
        chatId,
        `✅ Despesa recorrente "${expenseName}" excluída com sucesso.`,
        { parse_mode: 'Markdown' }
      );
      
      // Mostrar lista atualizada
      setTimeout(() => handleRecurringExpensesManagement(bot, callbackQuery.message), 1000);
    }
  } catch (error) {
    console.error('Erro no handleExpenseCallbacks:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
  }
}



/**
 * Configura atualizações periódicas para rendas e despesas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 */
function setupFinancialScheduler(bot) {
  // Atualizar datas esperadas diariamente à meia-noite
  const dailyUpdate = setInterval(async () => {
    try {
      console.log('Executando atualização diária de receitas e despesas...');
      await incomeSourceService.updateExpectedDates();
      await recurringExpenseService.updateDueDates();
      console.log('Atualização concluída com sucesso');
    } catch (error) {
      console.error('Erro na atualização diária de receitas e despesas:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 horas
  
  // Verificar rendas esperadas a cada 4 horas
  const incomeCheck = setInterval(async () => {
    try {
      console.log('Verificando receitas esperadas para os próximos dias...');
      const upcomingIncomes = await incomeSourceService.getUpcomingIncomeSources(2);
      
      for (const income of upcomingIncomes) {
        const telegramId = income.users.telegram_id;
        const expectedDate = new Date(income.next_expected_date);
        const formattedDate = expectedDate.toLocaleDateString('pt-BR');
        
        await bot.sendMessage(
          telegramId,
          `💰 *Lembrete de Receita*\n\nOlá! Seu ${income.name} de R$ ${income.amount.toFixed(2)} está previsto para ${formattedDate}.\n\nQuando receber, confirme para manter seu controle financeiro atualizado!`,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Confirmar recebimento', callback_data: `income_confirm:${income.id}` }]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Erro na verificação de receitas esperadas:', error);
    }
  }, 4 * 60 * 60 * 1000); // 4 horas
  
  // Verificar despesas a vencer a cada 4 horas
  const expenseCheck = setInterval(async () => {
    try {
      console.log('Verificando despesas a vencer nos próximos dias...');
      const upcomingExpenses = await recurringExpenseService.getUpcomingRecurringExpenses(2);
      
      for (const expense of upcomingExpenses) {
        const telegramId = expense.users.telegram_id;
        const dueDate = new Date(expense.next_due_date);
        const formattedDate = dueDate.toLocaleDateString('pt-BR');
        
        await bot.sendMessage(
          telegramId,
          `📅 *Lembrete de Pagamento*\n\nOlá! Seu ${expense.name} de R$ ${expense.amount.toFixed(2)} vence em ${formattedDate}.\n\nNão se esqueça de realizar o pagamento!`,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Marcar como pago', callback_data: `expense_pay:${expense.id}` }]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Erro na verificação de despesas a vencer:', error);
    }
  }, 4 * 60 * 60 * 1000); // 4 horas
  
  // Retornar os IDs dos intervalos para possível limpeza
  return { dailyUpdate, incomeCheck, expenseCheck };
}

initApp()