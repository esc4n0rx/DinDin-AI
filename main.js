require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')

// Importando os handlers
const handlers = require('./handlers/telegramHandlers')

// Token do Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN

// Verifica se o token foi definido
if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN não encontrado no arquivo .env')
  process.exit(1)
}

// Cria uma instância do bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true })

// Configura os comandos disponíveis
bot.setMyCommands(handlers.commands)

// Listener para comandos
bot.onText(/\/start/, (msg) => handlers.handleStart(bot, msg))
bot.onText(/\/ajuda/, (msg) => handlers.handleHelp(bot, msg))
bot.onText(/\/relatorio/, (msg) => handlers.handleReport(bot, msg, 'month'))
bot.onText(/\/hoje/, (msg) => handlers.handleReport(bot, msg, 'day'))
bot.onText(/\/semana/, (msg) => handlers.handleReport(bot, msg, 'week'))
bot.onText(/\/mes/, (msg) => handlers.handleReport(bot, msg, 'month'))

// Listener para mensagens normais (possíveis transações)
bot.on('message', (msg) => {
  // Ignora comandos
  if (msg.text && msg.text.startsWith('/')) return
  
  // Processa mensagem normal
  handlers.handleMessage(bot, msg)
})

console.log('Bot iniciado com sucesso! 🚀')