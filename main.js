require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const handlers = require('./handlers/telegramHandlers')
const goalHandlers = require('./handlers/goalHandlers')
const userConfigService = require('./services/userConfig')
const reminderScheduler = require('./services/reminderScheduler')


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
    
    bot.onText(/\/start/, (msg) => handlers.handleStart(bot, msg))
    bot.onText(/\/ajuda/, (msg) => handlers.handleHelp(bot, msg))
    bot.onText(/\/configurar/, (msg) => handlers.handleConfigure(bot, msg))
    bot.onText(/\/relatorio/, (msg) => handlers.handleReport(bot, msg, 'month'))
    bot.onText(/\/hoje/, (msg) => handlers.handleReport(bot, msg, 'day'))
    bot.onText(/\/semana/, (msg) => handlers.handleReport(bot, msg, 'week'))
    bot.onText(/\/mes/, (msg) => handlers.handleReport(bot, msg, 'month'))
    bot.onText(/\/reset/, (msg) => handlers.handleReset(bot, msg))
    bot.onText(/\/lembretes/, (msg) => handlers.handleListReminders(bot, msg))
    bot.onText(/\/meta/, (msg) => goalHandlers.handleNewGoalCommand(bot, msg))
    bot.onText(/\/metas/, (msg) => goalHandlers.handleGoalsCommand(bot, msg))
    bot.onText(/\/metadetalhes(.*)/, (msg) => goalHandlers.handleGoalDetails(bot, msg))
    bot.onText(/\/novameta/, (msg) => goalHandlers.handleNewGoalCommand(bot, msg))
    bot.onText(/\/dashboard/, (msg) => handlers.handleDashboard(bot, msg, 'month'))
    bot.onText(/\/grafico_despesas/, (msg) => handlers.handleExpenseChart(bot, msg, 'month'))
    bot.onText(/\/grafico_receitas/, (msg) => handlers.handleIncomeChart(bot, msg, 'month'))
    bot.onText(/\/grafico_evolucao/, (msg) => handlers.handleBalanceEvolutionChart(bot, msg, 'month'))
    bot.onText(/\/grafico_comparativo/, (msg) => handlers.handleComparisonChart(bot, msg, 'month'))
    bot.onText(/\/visualizar/, (msg) => handlers.handleDashboardMenu(bot, msg))
    
    // Usar variável compartilhada para controlar se uma mensagem está sendo processada pelo fluxo de metas
    let goalProcessingUsers = new Set();
    
    // Adicionamos um handler específico para verificar primeiro se a mensagem deve ser tratada pelo fluxo de metas
    bot.on('message', async (msg) => {
      // Ignora mensagens que são comandos
      if (msg.text && msg.text.startsWith('/')) return;
      
      // Verifica se o usuário está no meio de um fluxo de metas
      const telegramId = msg.from.id;
      
      if (goalHandlers.isUserInGoalFlow(telegramId)) {
        console.log('Usuário está no fluxo de metas, direcionando para goalHandlers');
        goalProcessingUsers.add(telegramId);
        
        try {
          await goalHandlers.handleOngoingGoalFlow(bot, msg);
        } catch (error) {
          console.error('Erro ao processar fluxo de metas:', error);
        }
        
        // Remove depois de processado para evitar bloqueios permanentes
        setTimeout(() => {
          goalProcessingUsers.delete(telegramId);
        }, 1000);
        
        return;
      }
      
      // Se não for um comando ou fluxo de metas em andamento, processa normalmente
      if (!goalProcessingUsers.has(telegramId)) {
        handlers.handleMessage(bot, msg);
      }
    });
    
    bot.on('callback_query', async (callbackQuery) => {
      try {
        const callbackData = callbackQuery.data
        
        if (callbackData.startsWith('complete_reminder:')) {
          await reminderScheduler.handleReminderCompletion(bot, callbackQuery)
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
    
    reminderScheduler.setupReminderScheduler(bot)
    
    console.log('DinDin AI inicializado com sucesso! 🤖💰')
    console.log('Novos comandos de dashboard visual disponíveis!')
  } catch (error) {
    console.error('Erro ao inicializar o aplicativo:', error)
    process.exit(1)
  }
}

initApp()