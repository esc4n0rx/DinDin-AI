require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')

// Importando os serviços e handlers
const handlers = require('./handlers/telegramHandlers')
const userConfigService = require('./services/userConfig')
const reminderScheduler = require('./services/reminderScheduler') // Nova importação

// Token do Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN

// Verifica se o token foi definido
if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN não encontrado no arquivo .env')
  process.exit(1)
}

// Configurações adicionais para o bot
const botOptions = {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
}

// Inicializa a tabela de configurações no supabase
async function initApp() {
  try {
    await userConfigService.setupConfigTable()
    console.log('Tabela de configurações inicializada com sucesso!')
    
    // Cria uma instância do bot com opções melhoradas
    const bot = new TelegramBot(TELEGRAM_TOKEN, botOptions)
    
    // Tratamento para erros de polling
    bot.on('polling_error', (error) => {
      // Exibe o erro mas não encerra o bot
      console.error('Erro de polling:', error.message || error)
      
      // Se for erro de conflito, apenas loga
      if (error.code === 'ETELEGRAM' && error.message && error.message.includes('409')) {
        console.log('Aviso: Múltiplas instâncias detectadas. Certifique-se de rodar apenas uma instância do bot.')
      }
    })
    
    // Configura os comandos disponíveis
    bot.setMyCommands(handlers.commands)
    
    // Listener para comandos
    bot.onText(/\/start/, (msg) => handlers.handleStart(bot, msg))
    bot.onText(/\/ajuda/, (msg) => handlers.handleHelp(bot, msg))
    bot.onText(/\/configurar/, (msg) => handlers.handleConfigure(bot, msg))
    bot.onText(/\/relatorio/, (msg) => handlers.handleReport(bot, msg, 'month'))
    bot.onText(/\/hoje/, (msg) => handlers.handleReport(bot, msg, 'day'))
    bot.onText(/\/semana/, (msg) => handlers.handleReport(bot, msg, 'week'))
    bot.onText(/\/mes/, (msg) => handlers.handleReport(bot, msg, 'month'))
    bot.onText(/\/reset/, (msg) => handlers.handleReset(bot, msg))
    
    // Novo comando para lembretes
    bot.onText(/\/lembretes/, (msg) => handlers.handleListReminders(bot, msg))
    
    // Listener para mensagens normais (possíveis transações ou configurações)
    bot.on('message', (msg) => {
      // Ignora comandos
      if (msg.text && msg.text.startsWith('/')) return
      
      // Processa mensagem normal
      handlers.handleMessage(bot, msg)
    })
    
    // Listener para callbacks de botões (necessário para os lembretes)
    bot.on('callback_query', async (callbackQuery) => {
      try {
        // Formato do callback data: 'action:id'
        const callbackData = callbackQuery.data
        
        if (callbackData.startsWith('complete_reminder:')) {
          // Processa conclusão de lembrete
          await reminderScheduler.handleReminderCompletion(bot, callbackQuery)
        }
        // Aqui podem ser adicionados outros tipos de callback no futuro
      } catch (error) {
        console.error('Erro ao processar callback:', error)
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Ocorreu um erro. Tente novamente.'
        })
      }
    })
    
    // Inicializa o agendador de lembretes
    reminderScheduler.setupReminderScheduler(bot)
    
    console.log('DinDin AI inicializado com sucesso! 🤖💰')
  } catch (error) {
    console.error('Erro ao inicializar o aplicativo:', error)
    process.exit(1)
  }
}

// Inicia o bot
initApp()