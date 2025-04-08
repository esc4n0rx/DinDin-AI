const moment = require('moment')
const numeral = require('numeral')
const supabaseService = require('../services/supabase')
const llmService = require('../services/llm')
const userConfigService = require('../services/userConfig')
const personalityService = require('../services/personalityResponses')

// Configura o moment para PT-BR
moment.locale('pt-br')

// Define comandos disponíveis
const commands = [
  { command: 'start', description: 'Iniciar o assistente financeiro' },
  { command: 'configurar', description: 'Configurar sua personalidade preferida' },
  { command: 'relatorio', description: 'Ver relatório financeiro do mês' },
  { command: 'hoje', description: 'Ver transações de hoje' },
  { command: 'semana', description: 'Ver transações da semana' },
  { command: 'mes', description: 'Ver transações do mês' },
  { command: 'reset', description: 'Apagar todos os seus dados e começar de novo' },
  { command: 'ajuda', description: 'Mostrar comandos disponíveis' }


]

// Função para formatar valores monetários
const formatCurrency = (value) => {
  return `R$ ${numeral(value).format('0,0.00')}`
}

// Estados dos usuários para o processo de configuração
const userStates = new Map()

// Função para criar teclado de personalidades
function createPersonalityKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '😊 Amigável e Tranquilo' }],
        [{ text: '😜 Debochado e Engraçado' }],
        [{ text: '👔 Profissional e Conciso' }]
      ],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  }
}

// Handler para o comando /start
// Handler para o comando /start
async function handleStart(bot, msg) {
  const { id: telegramId, first_name, last_name, username } = msg.from
  const chatId = msg.chat.id
  
  try {
    console.log(`Iniciando configuração para usuário ${telegramId} (${first_name})`)
    
    // Cadastra o usuário no banco de dados
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, last_name, username)
    
    // Verifica se o usuário já completou a configuração
    const userConfig = await userConfigService.getUserConfig(user.id)
    
    // Força a exibição do menu de personalidades sempre que /start for chamado
    const forceConfigMenu = msg.text && msg.text.includes('/start')
    
    if (!userConfig.setup_completed || forceConfigMenu) {
      console.log(`Exibindo menu de personalidades para usuário ${telegramId}`)
      
      // Inicia o processo de configuração
      await bot.sendMessage(
        chatId, 
        `Olá, ${first_name}! Bem-vindo ao *DinDin AI* - seu assistente financeiro inteligente! 🤖💰\n\nAntes de começarmos, vamos personalizar sua experiência. Como você prefere que eu me comunique com você?`,
        { 
          parse_mode: 'Markdown',
          ...createPersonalityKeyboard()
        }
      )
      
      // Define o estado do usuário para aguardar a escolha da personalidade
      userStates.set(telegramId, { state: 'awaiting_personality', userId: user.id })
      console.log(`Estado do usuário ${telegramId} definido para: awaiting_personality`)
      
      return
    }
    
    // Se já configurou, envia mensagem de boas-vindas normal
    const welcomeMessage = personalityService.getResponse(
      userConfig.personality,
      'introduction',
      first_name
    )
    
    // Configura os comandos para o bot
    await bot.setMyCommands(commands)
    
    // Envia a mensagem de boas-vindas com as instruções
    const helpMessage = `
📋 *Comandos Disponíveis:*
/relatorio - Ver relatório financeiro mensal
/hoje - Ver transações de hoje
/semana - Ver transações da semana
/mes - Ver transações do mês
/configurar - Mudar minha personalidade
/reset - Apagar todos os seus dados e começar de novo
/ajuda - Mostrar esta mensagem
    `
    
    // Envia as duas mensagens
    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' })
    return bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
    
  } catch (error) {
    console.error('Error in handleStart:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao inicializar o assistente.')
  }
}

// Handler para o comando /configurar
async function handleConfigure(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  
  try {
    // Obtém o usuário
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username)
    
    // Envia mensagem de configuração
    await bot.sendMessage(
      chatId, 
      `Vamos personalizar sua experiência! Como você prefere que eu me comunique com você?`,
      { 
        parse_mode: 'Markdown',
        ...createPersonalityKeyboard()
      }
    )
    
    // Define o estado do usuário para aguardar a escolha da personalidade
    userStates.set(telegramId, { state: 'awaiting_personality', userId: user.id })
    
  } catch (error) {
    console.error('Error in handleConfigure:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao iniciar a configuração.')
  }
}
// Handler para o comando /reset
async function handleReset(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  
  try {
    // Encontrar o usuário pelo ID do telegram
    const { data: existingUser } = await supabaseService.supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramId)
      .single()
    
    if (!existingUser) {
      return bot.sendMessage(chatId, 'Não encontrei nenhuma configuração para você. Use /start para iniciar o bot.');
    }
    
    // Excluir configurações do usuário
    await supabaseService.supabase
      .from('user_configs')
      .delete()
      .eq('user_id', existingUser.id)
    
    // Excluir todas as transações do usuário
    await supabaseService.supabase
      .from('transactions')
      .delete()
      .eq('user_id', existingUser.id)
    
    // Opcional: excluir o próprio usuário
     await supabaseService.supabase
      .from('users')
      .delete()
      .eq('id', existingUser.id)
    
    // Remover estados em memória
    if (userStates.has(telegramId)) {
      userStates.delete(telegramId)
    }
    
    // Enviar mensagem de confirmação
    await bot.sendMessage(
      chatId, 
      `🗑️ Todos os seus dados foram resetados com sucesso, ${first_name}!\n\nUtilize /start para configurar o bot novamente.`,
      { parse_mode: 'Markdown' }
    )
    
    // Iniciar novamente o processo de configuração
    setTimeout(() => handleStart(bot, msg), 1000)
    
  } catch (error) {
    console.error('Error in handleReset:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao tentar resetar seus dados. Por favor, tente novamente.')
  }
}


// Handler para processar a escolha de personalidade
async function handlePersonalitySelection(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  const text = msg.text
  
  try {
    // Verifica se o usuário está no estado de aguardar personalidade
    const userState = userStates.get(telegramId)
    if (!userState || userState.state !== 'awaiting_personality') {
      return handleMessage(bot, msg) // Não está esperando personalidade, trata como mensagem normal
    }
    
    console.log(`Recebida seleção de personalidade: "${text}" do usuário ${telegramId}`)
    
    // Determina qual personalidade foi escolhida
    let personality
    if (text.includes('Amigável') || text.includes('amigavel') || text.includes('Amigavel')) {
      personality = userConfigService.PERSONALITIES.FRIENDLY
    } else if (text.includes('Debochado') || text.includes('debochado') || text.includes('Engraçado') || text.includes('engracado')) {
      personality = userConfigService.PERSONALITIES.SASSY
    } else if (text.includes('Profissional') || text.includes('profissional') || text.includes('conciso')) {
      personality = userConfigService.PERSONALITIES.PROFESSIONAL
    } else {
      // Opção inválida, pede para escolher novamente
      console.log(`Opção de personalidade não reconhecida: "${text}"`)
      return bot.sendMessage(
        chatId,
        'Hmm, não reconheci essa opção. Por favor, escolha uma das opções abaixo:',
        createPersonalityKeyboard()
      )
    }
    
    console.log(`Personalidade selecionada: ${personality} para usuário ${telegramId}`)
    
    // Salva a configuração do usuário
    await userConfigService.saveUserConfig(userState.userId, {
      personality: personality,
      setup_completed: true
    })
    
    // Remove o estado do usuário
    userStates.delete(telegramId)
    
    // Mensagens de confirmação com base na personalidade
    let confirmationMessage
    
    if (personality === userConfigService.PERSONALITIES.FRIENDLY) {
      confirmationMessage = `Ótimo! Vou ser amigável e tranquilo nas nossas conversas. 😊\n\nAgora você pode começar a registrar suas despesas e receitas. Basta me enviar mensagens como "Almoço 25,90" ou "Recebi salário 2500".`
    } else if (personality === userConfigService.PERSONALITIES.SASSY) {
      confirmationMessage = `Beleza! Vou ser debochado e engraçado, espero que aguente as verdades! 😜\n\nAgora é só mandar seus gastos pra eu julgar! Tipo "Fast food 30 pila" ou "Ganhei 100 mangos de bônus".`
    } else {
      confirmationMessage = `Configuração concluída. Utilizarei comunicação profissional e concisa. 👔\n\nVocê pode iniciar o registro de suas transações financeiras agora. Exemplos: "Refeição corporativa 35,00" ou "Honorários recebidos 3000,00".`
    }
    
    // Mensagem de ajuda
    const helpMessage = `
📋 *Comandos Disponíveis:*
/relatorio - Ver relatório financeiro mensal
/hoje - Ver transações de hoje
/semana - Ver transações da semana
/mes - Ver transações do mês
/configurar - Mudar minha personalidade
/ajuda - Mostrar esta mensagem
    `
    
    // Envia as mensagens de confirmação e ajuda
    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' })
    return bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
    
  } catch (error) {
    console.error('Error in handlePersonalitySelection:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao salvar sua preferência. Por favor, tente novamente com /configurar.')
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
/configurar - Mudar minha personalidade
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
// Handler para processar mensagens normais (potenciais transações)
async function handleMessage(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  const userMsg = msg.text
  
  // Verifica se o usuário está em um processo de configuração
  const userState = userStates.get(telegramId)
  if (userState) {
    // Se estiver aguardando personalidade, processa a escolha
    if (userState.state === 'awaiting_personality') {
      console.log(`Usuário ${telegramId} está em estado de escolha de personalidade, redirecionando para handlePersonalitySelection`)
      return handlePersonalitySelection(bot, msg)
    }
  }
  
  try {
    // Verifica se é uma opção de personalidade mesmo sem estar no estado
    if (userMsg.includes('Amigável') || userMsg.includes('Debochado') || userMsg.includes('Profissional')) {
      console.log(`Detectada possível escolha de personalidade "${userMsg}" fora do estado`)
      
      // Obtém o usuário
      const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username)
      
      // Cria um estado temporário
      userStates.set(telegramId, { state: 'awaiting_personality', userId: user.id })
      
      // Processa como escolha de personalidade
      return handlePersonalitySelection(bot, msg)
    }
    
    // Obter ou criar usuário
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username)
    
    // Obtém a configuração do usuário
    const userConfig = await userConfigService.getUserConfig(user.id)
    
    // Se o usuário não finalizou a configuração, inicia o processo
    if (!userConfig.setup_completed) {
      console.log(`Usuário ${telegramId} não finalizou a configuração, iniciando setup`)
      return handleStart(bot, msg)
    }
    
    // Analisa a mensagem com o LLM
    const analysis = await llmService.analyzeMessage(userMsg)
    
    // Se não for uma transação, responde com uma mensagem personalizada
    if (!analysis.isTransaction) {
      const notTransactionMessage = personalityService.getResponse(
        userConfig.personality,
        'notTransaction'
      )
      return bot.sendMessage(chatId, notTransactionMessage, { parse_mode: 'Markdown' })
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
    
    // Personaliza a mensagem de confirmação com base no tipo e personalidade
    let confirmationMessage
    
    if (type === 'income') {
      confirmationMessage = personalityService.getResponse(
        userConfig.personality,
        'incomeConfirmation',
        transaction,
        categoryData
      )
    } else {
      confirmationMessage = personalityService.getResponse(
        userConfig.personality,
        'expenseConfirmation',
        transaction,
        categoryData
      )
    }
    
    // Adiciona a data formatada ao final da mensagem
    const dateFormatted = moment(transaction.transaction_date).format('DD/MM/YYYY')
    confirmationMessage += `\n📅 *Data:* ${dateFormatted}`
    
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
    
    // Obter configuração do usuário
    const userConfig = await userConfigService.getUserConfig(user.id)
    
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
`
    
    // Adicionar comentário personalizado sobre saúde financeira
    const healthComment = personalityService.getResponse(
      userConfig.personality,
      'financialHealthComment',
      summary.income,
      summary.expense,
      summary.balance
    )
    
    reportMessage += `\n${healthComment}`
    
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
        
        // Verifica se há alguma categoria com gasto elevado para comentar
        if (expenseCategories.length > 0 && summary.expense > 0) {
          const highestCategory = expenseCategories[0]
          const comment = personalityService.getResponse(
            userConfig.personality,
            'highSpendingComment',
            highestCategory.name,
            highestCategory.total,
            summary.expense
          )
          
          if (comment) {
            reportMessage += `\n${comment}\n`
          }
        }
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
    
    // Adiciona dica personalizada ao final
    const tip = personalityService.getResponse(
      userConfig.personality,
      'randomTip'
    )
    
    reportMessage += `\n\n${tip}`
    
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
  handleConfigure,
  handlePersonalitySelection,
  handleMessage,
  handleReport,
  handleReset,
  createPersonalityKeyboard
}