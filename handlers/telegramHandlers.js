const moment = require('moment')
const numeral = require('numeral')
const supabaseService = require('../services/supabase')
const llmService = require('../services/llm')

// Configura o moment para PT-BR
moment.locale('pt-br')

// Define comandos disponíveis
const commands = [
  { command: 'start', description: 'Iniciar o assistente financeiro' },
  { command: 'relatorio', description: 'Ver relatório financeiro do mês' },
  { command: 'hoje', description: 'Ver transações de hoje' },
  { command: 'semana', description: 'Ver transações da semana' },
  { command: 'mes', description: 'Ver transações do mês' },
  { command: 'ajuda', description: 'Mostrar comandos disponíveis' }
]

// Função para formatar valores monetários
const formatCurrency = (value) => {
  return `R$ ${numeral(value).format('0,0.00')}`
}

// Handler para o comando /start
async function handleStart(bot, msg) {
  const { id: telegramId, first_name, last_name, username } = msg.from
  
  try {
    // Cadastra o usuário no banco de dados
    await supabaseService.getOrCreateUser(telegramId, first_name, last_name, username)
    
    const welcomeMessage = `
Olá, ${first_name}! 👋

Sou seu assistente financeiro pessoal. Você pode me contar sobre suas despesas e receitas de forma natural, e eu vou registrá-las automaticamente.

📝 *Exemplos de registros:*
• "Almoço no restaurante 32,50"
• "Compras no mercado 157,90"
• "Recebi salário 2500"
• "Uber para o trabalho 19,90"

📊 *Comandos disponíveis:*
/relatorio - Ver relatório financeiro mensal
/hoje - Ver transações de hoje
/semana - Ver transações da semana
/mes - Ver transações do mês
/ajuda - Mostrar esta mensagem de ajuda

Experimente agora registrando uma transação! 💰
    `
    
    // Configura os comandos para o bot
    await bot.setMyCommands(commands)
    
    // Envia a mensagem de boas-vindas
    return bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error('Error in handleStart:', error)
    return bot.sendMessage(msg.chat.id, '❌ Ocorreu um erro ao inicializar o assistente.')
  }
}

// Handler para o comando /ajuda
async function handleHelp(bot, msg) {
  const helpMessage = `
📋 *Comandos Disponíveis:*
/relatorio - Ver relatório financeiro mensal
/hoje - Ver transações de hoje
/semana - Ver transações da semana
/mes - Ver transações do mês
/ajuda - Mostrar esta mensagem

✏️ *Como registrar transações:*
Basta escrever naturalmente! Por exemplo:
• "Almoço no restaurante 32,50"
• "Café 5,00"
• "Salário mensal 2500"
• "Recebi 100 de presente"
  `
  
  return bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' })
}

// Handler para processar mensagens normais (potenciais transações)
async function handleMessage(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  const userMsg = msg.text
  
  try {
    // Obter ou criar usuário
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username)
    
    // Analisa a mensagem com o LLM
    const analysis = await llmService.analyzeMessage(userMsg)
    
    // Se não for uma transação, responde com uma mensagem padrão
    if (!analysis.isTransaction) {
      return bot.sendMessage(chatId, `Desculpe, não entendi isso como uma transação financeira. Você pode me contar sobre despesas ou receitas para que eu registre para você.`)
    }
    
    // Processa a transação
    const { type, amount, description, category, date } = analysis
    
    // Encontra a categoria no banco de dados
    const categoryData = await supabaseService.getCategoryByName(category, type)
    
    // Cria a transação
    const transaction = await supabaseService.createTransaction(
      user.id,
      categoryData.id,
      amount,
      description,
      type,
      date ? new Date(date) : new Date()
    )
    
    // Emoji com base no tipo
    const emoji = type === 'income' ? '💰' : '💸'
    const typeText = type === 'income' ? 'Receita' : 'Despesa'
    
    // Formata data
    const dateFormatted = moment(transaction.transaction_date).format('DD/MM/YYYY')
    
    // Prepara mensagem de confirmação
    const confirmationMessage = `
${emoji} *${typeText} registrada com sucesso!*

📝 *Descrição:* ${description}
💲 *Valor:* ${formatCurrency(amount)}
🗂️ *Categoria:* ${categoryData.icon} ${categoryData.name}
📅 *Data:* ${dateFormatted}
    `
    
    return bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error('Error in handleMessage:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao processar sua mensagem.')
  }
}

// Handler para gerar relatórios
async function handleReport(bot, msg, periodType) {
  const { id: telegramId } = msg.from
  const chatId = msg.chat.id
  
  try {
    // Obter usuário
    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username)
    
    // Definir período do relatório
    let startDate, endDate, periodTitle
    const now = new Date()
    
    switch (periodType) {
      case 'day':
        startDate = moment(now).startOf('day').toISOString()
        endDate = moment(now).endOf('day').toISOString()
        periodTitle = `Hoje (${moment(now).format('DD/MM/YYYY')})`
        break
      case 'week':
        startDate = moment(now).startOf('week').toISOString()
        endDate = moment(now).endOf('week').toISOString()
        periodTitle = `Semana (${moment(now).startOf('week').format('DD/MM')} - ${moment(now).endOf('week').format('DD/MM')})`
        break
      case 'month':
      default:
        startDate = moment(now).startOf('month').toISOString()
        endDate = moment(now).endOf('month').toISOString()
        periodTitle = `Mês de ${moment(now).format('MMMM/YYYY')}`
        break
    }
    
    // Obter resumo financeiro
    const summary = await supabaseService.getSummary(user.id, startDate, endDate)
    
    // Obter transações do período
    const transactions = await supabaseService.getUserTransactions(user.id, startDate, endDate)
    
    // Preparar mensagem de relatório
    let reportMessage = `
📊 *Relatório Financeiro - ${periodTitle}*

💰 *Receitas:* ${formatCurrency(summary.income)}
💸 *Despesas:* ${formatCurrency(summary.expense)}
🏦 *Saldo:* ${formatCurrency(summary.balance)}

${summary.balance >= 0 ? '✅ Suas finanças estão positivas!' : '⚠️ Cuidado! Suas despesas estão maiores que suas receitas.'}
`
    
    // Adiciona detalhamento por categoria se houver transações
    if (transactions.length > 0) {
      reportMessage += `\n\n📋 *Detalhamento por Categoria:*\n`
      
      // Separar categorias por tipo
      const expenseCategories = []
      const incomeCategories = []
      
      Object.entries(summary.categories).forEach(([name, data]) => {
        if (data.type === 'expense') {
          expenseCategories.push({ name, total: data.total, icon: data.icon })
        } else {
          incomeCategories.push({ name, total: data.total, icon: data.icon })
        }
      })
      
      // Ordenar por valor (maior para menor)
      expenseCategories.sort((a, b) => b.total - a.total)
      incomeCategories.sort((a, b) => b.total - a.total)
      
      // Adicionar categorias de despesa
      if (expenseCategories.length > 0) {
        reportMessage += `\n💸 *Despesas:*\n`
        expenseCategories.forEach(cat => {
          reportMessage += `${cat.icon} ${cat.name}: ${formatCurrency(cat.total)}\n`
        })
      }
      
      // Adicionar categorias de receita
      if (incomeCategories.length > 0) {
        reportMessage += `\n💰 *Receitas:*\n`
        incomeCategories.forEach(cat => {
          reportMessage += `${cat.icon} ${cat.name}: ${formatCurrency(cat.total)}\n`
        })
      }
      
      // Adiciona últimas transações (máximo 10)
      const recentTransactions = transactions.slice(0, 10)
      
      if (recentTransactions.length > 0) {
        reportMessage += `\n\n📝 *Últimas Transações:*\n`
        recentTransactions.forEach(tx => {
          const emoji = tx.type === 'income' ? '💰' : '💸'
          const date = moment(tx.transaction_date).format('DD/MM')
          const category = tx.categories?.name || 'Sem categoria'
          const categoryIcon = tx.categories?.icon || ''
          
          reportMessage += `${emoji} ${date} - ${categoryIcon} ${tx.description}: ${formatCurrency(tx.amount)}\n`
        })
      }
    } else {
      reportMessage += `\n\n📭 Não há transações registradas neste período.`
    }
    
    // Adiciona dica ao final
    reportMessage += `\n\n💡 *Dica:* Use /ajuda para ver os comandos disponíveis.`
    
    return bot.sendMessage(chatId, reportMessage, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error(`Error in handleReport (${periodType}):`, error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o relatório.')
  }
}

// Exporta os handlers
module.exports = {
  commands,
  handleStart,
  handleHelp,
  handleMessage,
  handleReport
}