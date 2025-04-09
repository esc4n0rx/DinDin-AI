const moment = require('moment')
const numeral = require('numeral')
const supabaseService = require('../services/supabase')
const llmService = require('../services/llm')
const userConfigService = require('../services/userConfig')
const personalityService = require('../services/personalityResponses')
const reminderService = require('../services/reminderService');
const dashboardService = require('../services/dashboardService');
const goalService = require('../services/goalService');

moment.locale('pt-br')


const commands = [
  { command: 'start', description: 'Iniciar o assistente financeiro' },
  { command: 'configurar', description: 'Configurar sua personalidade preferida' },
  { command: 'relatorio', description: 'Ver relatório financeiro do mês' },
  { command: 'hoje', description: 'Ver transações de hoje' },
  { command: 'semana', description: 'Ver transações da semana' },
  { command: 'mes', description: 'Ver transações do mês' },
  { command: 'lembretes', description: 'Ver seus lembretes pendentes' },
  { command: 'metas', description: 'Ver suas metas financeiras' },
  { command: 'novameta', description: 'Criar uma nova meta financeira' },
  { command: 'reset', description: 'Apagar todos os seus dados e começar de novo' },
  { command: 'ajuda', description: 'Mostrar comandos disponíveis' },
  { command: 'dashboard', description: 'Ver dashboard visual das suas finanças' },
  { command: 'grafico_despesas', description: 'Ver gráfico de despesas por categoria' },
  { command: 'grafico_receitas', description: 'Ver gráfico de receitas por categoria' },
  { command: 'grafico_evolucao', description: 'Ver gráfico de evolução financeira' },
  { command: 'visualizar', description: 'Mostrar menu de visualizações e gráficos' },
  { command: 'grafico_comparativo', description: 'Ver comparativo entre receitas e despesas' }
]

const formatCurrency = (value) => {
  return `R$ ${numeral(value).format('0,0.00')}`
}


const userStates = new Map()

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

async function handleStart(bot, msg) {
  const { id: telegramId, first_name, last_name, username } = msg.from
  const chatId = msg.chat.id
  
  try {
    console.log(`Iniciando configuração para usuário ${telegramId} (${first_name})`)
    
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, last_name, username)
    
    const userConfig = await userConfigService.getUserConfig(user.id)
    
    const forceConfigMenu = msg.text && msg.text.includes('/start')
    
    if (!userConfig.setup_completed || forceConfigMenu) {
      console.log(`Exibindo menu de personalidades para usuário ${telegramId}`)
      
      await bot.sendMessage(
        chatId, 
        `Olá, ${first_name}! Bem-vindo ao *DinDin AI* - seu assistente financeiro inteligente! 🤖💰\n\nAntes de começarmos, vamos personalizar sua experiência. Como você prefere que eu me comunique com você?`,
        { 
          parse_mode: 'Markdown',
          ...createPersonalityKeyboard()
        }
      )
      
      userStates.set(telegramId, { state: 'awaiting_personality', userId: user.id })
      console.log(`Estado do usuário ${telegramId} definido para: awaiting_personality`)
      
      return
    }
    
    const welcomeMessage = personalityService.getResponse(
      userConfig.personality,
      'introduction',
      first_name
    )

    await bot.setMyCommands(commands)
    
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
    
    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' })
    return bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
    
  } catch (error) {
    console.error('Error in handleStart:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao inicializar o assistente.')
  }
}

async function handleConfigure(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  
  try {
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username)
    
    await bot.sendMessage(
      chatId, 
      `Vamos personalizar sua experiência! Como você prefere que eu me comunique com você?`,
      { 
        parse_mode: 'Markdown',
        ...createPersonalityKeyboard()
      }
    )
    
    userStates.set(telegramId, { state: 'awaiting_personality', userId: user.id })
    
  } catch (error) {
    console.error('Error in handleConfigure:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao iniciar a configuração.')
  }
}

async function handleReset(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  
  try {

    const { data: existingUser } = await supabaseService.supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramId)
      .single()
    
    if (!existingUser) {
      return bot.sendMessage(chatId, 'Não encontrei nenhuma configuração para você. Use /start para iniciar o bot.');
    }
    

    await supabaseService.supabase
      .from('user_configs')
      .delete()
      .eq('user_id', existingUser.id)
    

    await supabaseService.supabase
      .from('transactions')
      .delete()
      .eq('user_id', existingUser.id)
    

     await supabaseService.supabase
      .from('users')
      .delete()
      .eq('id', existingUser.id)
    

    if (userStates.has(telegramId)) {
      userStates.delete(telegramId)
    }
    

    await bot.sendMessage(
      chatId, 
      `🗑️ Todos os seus dados foram resetados com sucesso, ${first_name}!\n\nUtilize /start para configurar o bot novamente.`,
      { parse_mode: 'Markdown' }
    )
    

    setTimeout(() => handleStart(bot, msg), 1000)
    
  } catch (error) {
    console.error('Error in handleReset:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao tentar resetar seus dados. Por favor, tente novamente.')
  }
}



async function handlePersonalitySelection(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  const text = msg.text
  
  try {

    const userState = userStates.get(telegramId)
    if (!userState || userState.state !== 'awaiting_personality') {
      return handleMessage(bot, msg)
    }
    
    console.log(`Recebida seleção de personalidade: "${text}" do usuário ${telegramId}`)
    

    let personality
    if (text.includes('Amigável') || text.includes('amigavel') || text.includes('Amigavel')) {
      personality = userConfigService.PERSONALITIES.FRIENDLY
    } else if (text.includes('Debochado') || text.includes('debochado') || text.includes('Engraçado') || text.includes('engracado')) {
      personality = userConfigService.PERSONALITIES.SASSY
    } else if (text.includes('Profissional') || text.includes('profissional') || text.includes('conciso')) {
      personality = userConfigService.PERSONALITIES.PROFESSIONAL
    } else {

      console.log(`Opção de personalidade não reconhecida: "${text}"`)
      return bot.sendMessage(
        chatId,
        'Hmm, não reconheci essa opção. Por favor, escolha uma das opções abaixo:',
        createPersonalityKeyboard()
      )
    }
    
    console.log(`Personalidade selecionada: ${personality} para usuário ${telegramId}`)
    

    await userConfigService.saveUserConfig(userState.userId, {
      personality: personality,
      setup_completed: true
    })
    

    userStates.delete(telegramId)
    

    let confirmationMessage
    
    if (personality === userConfigService.PERSONALITIES.FRIENDLY) {
      confirmationMessage = `Ótimo! Vou ser amigável e tranquilo nas nossas conversas. 😊\n\nAgora você pode começar a registrar suas despesas e receitas. Basta me enviar mensagens como "Almoço 25,90" ou "Recebi salário 2500".`
    } else if (personality === userConfigService.PERSONALITIES.SASSY) {
      confirmationMessage = `Beleza! Vou ser debochado e engraçado, espero que aguente as verdades! 😜\n\nAgora é só mandar seus gastos pra eu julgar! Tipo "Fast food 30 pila" ou "Ganhei 100 mangos de bônus".`
    } else {
      confirmationMessage = `Configuração concluída. Utilizarei comunicação profissional e concisa. 👔\n\nVocê pode iniciar o registro de suas transações financeiras agora. Exemplos: "Refeição corporativa 35,00" ou "Honorários recebidos 3000,00".`
    }
    
    const helpMessage = `
📋 *Comandos Disponíveis:*
/relatorio - Ver relatório financeiro mensal
/hoje - Ver transações de hoje
/semana - Ver transações da semana
/mes - Ver transações do mês
/configurar - Mudar minha personalidade
/ajuda - Mostrar esta mensagem
`

    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' })
    return bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
    
  } catch (error) {
    console.error('Error in handlePersonalitySelection:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao salvar sua preferência. Por favor, tente novamente com /configurar.')
  }
}

async function handleHelp(bot, msg) {
  const helpMessage = `
📋 *Comandos Disponíveis:*

*Principais Comandos:*
/relatorio - Ver relatório financeiro mensal
/hoje - Ver transações de hoje
/semana - Ver transações da semana
/mes - Ver transações do mês
/lembretes - Ver seus lembretes pendentes
/configurar - Mudar minha personalidade
/ajuda - Mostrar esta mensagem

*Comandos de Dashboard Visual:*
/dashboard - Ver dashboard completo com todos os gráficos
/grafico_despesas - Ver gráfico de despesas por categoria
/grafico_receitas - Ver gráfico de receitas por categoria
/grafico_evolucao - Ver gráfico de evolução do saldo
/grafico_comparativo - Ver comparativo entre receitas e despesas

✏️ *Como usar:*
• *Para registrar transações*: Ex. "Almoço 25,90" ou "Recebi 100 de presente"
• *Para criar lembretes*: Ex. "Me lembre de pagar a conta de luz dia 10" 
  `;
  
  return bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
}

async function handleMessage(bot, msg) {
  const { id: telegramId, first_name } = msg.from
  const chatId = msg.chat.id
  const userMsg = msg.text
  

  const userState = userStates.get(telegramId)
  if (userState) {

    if (userState.state === 'awaiting_personality') {
      console.log(`Usuário ${telegramId} está em estado de escolha de personalidade, redirecionando para handlePersonalitySelection`)
      return handlePersonalitySelection(bot, msg)
    }
  }
  
  try {

    if (userMsg.includes('Amigável') || userMsg.includes('Debochado') || userMsg.includes('Profissional')) {
      console.log(`Detectada possível escolha de personalidade "${userMsg}" fora do estado`)
      

      const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username)
      
o
      userStates.set(telegramId, { state: 'awaiting_personality', userId: user.id })
      

      return handlePersonalitySelection(bot, msg)
    }
    

    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username)
    

    const userConfig = await userConfigService.getUserConfig(user.id)
    

    if (!userConfig.setup_completed) {
      console.log(`Usuário ${telegramId} não finalizou a configuração, iniciando setup`)
      return handleStart(bot, msg)
    }
    
    const analysis = await llmService.analyzeMessage(userMsg)

    if (analysis.isReminder) {
      return handleReminderCreation(bot, msg, user, userConfig, analysis);
    }
    
    if (!analysis.isTransaction) {
      const notTransactionMessage = personalityService.getResponse(
        userConfig.personality,
        'notTransaction'
      )
      return bot.sendMessage(chatId, notTransactionMessage, { parse_mode: 'Markdown' })
    }
    

    const { type, amount, description, category, date } = analysis
    

    const categoryData = await supabaseService.getCategoryByName(category, type)

    const currentDate = new Date();
    

    const transaction = await supabaseService.createTransaction(
      user.id,
      categoryData.id,
      amount,
      description,
      type,
      currentDate
    )
    

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
    
    const dateFormatted = moment(transaction.transaction_date).format('DD/MM/YYYY')
    confirmationMessage += `\n📅 *Data:* ${dateFormatted}`
    
    return bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error('Error in handleMessage:', error)
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao processar sua mensagem.')
  }
}

async function handleReport(bot, msg, periodType) {
  const { id: telegramId } = msg.from
  const chatId = msg.chat.id
  
  try {

    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username)
    

    const userConfig = await userConfigService.getUserConfig(user.id)
    

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
    

    const summary = await supabaseService.getSummary(user.id, startDate, endDate)
    

    const transactions = await supabaseService.getUserTransactions(user.id, startDate, endDate)
    

    let reportMessage = `
📊 *Relatório Financeiro - ${periodTitle}*

💰 *Receitas:* ${formatCurrency(summary.income)}
💸 *Despesas:* ${formatCurrency(summary.expense)}
🏦 *Saldo:* ${formatCurrency(summary.balance)}
`
    

    const healthComment = personalityService.getResponse(
      userConfig.personality,
      'financialHealthComment',
      summary.income,
      summary.expense,
      summary.balance
    )
    
    reportMessage += `\n${healthComment}`
    

    if (transactions.length > 0) {
      reportMessage += `\n\n📋 *Detalhamento por Categoria:*\n`
      

      const expenseCategories = []
      const incomeCategories = []
      
      Object.entries(summary.categories).forEach(([name, data]) => {
        if (data.type === 'expense') {
          expenseCategories.push({ name, total: data.total, icon: data.icon })
        } else {
          incomeCategories.push({ name, total: data.total, icon: data.icon })
        }
      })
      

      expenseCategories.sort((a, b) => b.total - a.total)
      incomeCategories.sort((a, b) => b.total - a.total)
      

      if (expenseCategories.length > 0) {
        reportMessage += `\n💸 *Despesas:*\n`
        expenseCategories.forEach(cat => {
          reportMessage += `${cat.icon} ${cat.name}: ${formatCurrency(cat.total)}\n`
        })
        

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
      

      if (incomeCategories.length > 0) {
        reportMessage += `\n💰 *Receitas:*\n`
        incomeCategories.forEach(cat => {
          reportMessage += `${cat.icon} ${cat.name}: ${formatCurrency(cat.total)}\n`
        })
      }
      

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

async function handleReminderCreation(bot, msg, user, userConfig, analysis) {
  const chatId = msg.chat.id;
  
  try {
    console.log('Processando criação de lembrete:', analysis);
    
    const { description, dueDate, dueTime, isRecurring, recurrencePattern } = analysis;
    const dueDateStr = dueDate || new Date().toISOString().split('T')[0];
    const dueTimeStr = dueTime || '09:00';
    
    const dueDateObj = new Date(`${dueDateStr}T${dueTimeStr}`);
    console.log(`Data do lembrete: ${dueDateObj.toISOString()}`);
    
    if (isNaN(dueDateObj.getTime())) {
      console.error(`Data inválida criada: ${dueDateStr}T${dueTimeStr}`);
      return bot.sendMessage(
        chatId,
        '❌ Não consegui entender a data do lembrete. Por favor, tente novamente com uma data mais clara.',
        { parse_mode: 'Markdown' }
      );
    }
    
    const reminder = await reminderService.createReminder(
      user.id,
      description,
      dueDateObj,
      isRecurring || false,
      recurrencePattern
    );
    
    const dateFormatted = moment(dueDateObj).format('DD/MM/YYYY [às] HH:mm');
    const recurrenceText = isRecurring 
      ? `\n⏰ Repetição: ${getRecurrenceText(recurrencePattern)}` 
      : '';
    
    const reminderForResponse = {
      description,
      dueDate: dueDateObj
    };
    
    const confirmationMessage = personalityService.getResponse(
      userConfig.personality,
      'reminderCreated',
      reminderForResponse
    ) + recurrenceText;
    
    return bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error creating reminder:', error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao criar o lembrete. Por favor, tente novamente.');
  }
}


function getRecurrenceText(pattern) {
  switch (pattern) {
    case 'daily':
      return 'Diária';
    case 'weekly':
      return 'Semanal';
    case 'monthly':
      return 'Mensal';
    case 'yearly':
      return 'Anual';
    default:
      return pattern;
  }
}

async function handleListReminders(bot, msg) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {

    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    

    const reminders = await reminderService.getUserReminders(user.id);
    
    if (reminders.length === 0) {
      return bot.sendMessage(chatId, '📝 Você não tem lembretes pendentes.');
    }
    
    const remindersByDate = {};
    
    reminders.forEach(reminder => {
      const date = moment(reminder.due_date).format('DD/MM/YYYY');
      
      if (!remindersByDate[date]) {
        remindersByDate[date] = [];
      }
      
      remindersByDate[date].push(reminder);
    });
    
 
    let message = '📝 *Seus Lembretes Pendentes*\n\n';
    
    Object.keys(remindersByDate).sort().forEach(date => {
      message += `📅 *${date}*\n`;
      
      remindersByDate[date].forEach(reminder => {
        const time = moment(reminder.due_date).format('HH:mm');
        const recurringIcon = reminder.is_recurring ? '🔄 ' : '';
        
        message += `  • ${recurringIcon}${time} - ${reminder.description}\n`;
      });
      
      message += '\n';
    });
    
    message += 'Para marcar um lembrete como concluído, envie "concluir lembrete X" ou "completar lembrete X".';
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error listing reminders:', error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao listar seus lembretes.');
  }
}

async function handleDashboard(bot, msg, periodType = 'month') {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {

    const loadingMessage = await bot.sendMessage(
      chatId,
      '📊 Gerando seu dashboard financeiro. Isso pode levar alguns segundos...',
      { parse_mode: 'Markdown' }
    );
    

    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    
    let startDate, endDate, periodTitle;
    const now = new Date();
    
    switch (periodType) {
      case 'day':
        startDate = moment(now).startOf('day').toISOString();
        endDate = moment(now).endOf('day').toISOString();
        periodTitle = `Hoje (${moment(now).format('DD/MM/YYYY')})`;
        break;
      case 'week':
        startDate = moment(now).startOf('week').toISOString();
        endDate = moment(now).endOf('week').toISOString();
        periodTitle = `Semana (${moment(now).startOf('week').format('DD/MM')} - ${moment(now).endOf('week').format('DD/MM')})`;
        break;
      case 'month':
      default:
        startDate = moment(now).startOf('month').toISOString();
        endDate = moment(now).endOf('month').toISOString();
        periodTitle = `Mês de ${moment(now).format('MMMM/YYYY')}`;
        break;
    }
    

    const dashboard = await dashboardService.generateDashboard(user.id, startDate, endDate);
    
    await bot.editMessageText(
      `📊 *Dashboard Financeiro - ${periodTitle}*\n\nAqui estão os gráficos da sua situação financeira:`,
      {
        chat_id: chatId,
        message_id: loadingMessage.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    await bot.sendPhoto(chatId, dashboard.expenseDistribution, {
      caption: '📉 Distribuição de Despesas por Categoria'
    });
    
    await bot.sendPhoto(chatId, dashboard.incomeDistribution, {
      caption: '📈 Distribuição de Receitas por Categoria'
    });
    
    await bot.sendPhoto(chatId, dashboard.expenseTimeSeries, {
      caption: '📊 Evolução das Despesas ao Longo do Tempo'
    });
    
    await bot.sendPhoto(chatId, dashboard.incomeExpenseComparison, {
      caption: '📊 Comparativo entre Receitas e Despesas'
    });
    
    await bot.sendPhoto(chatId, dashboard.balanceEvolution, {
      caption: '📊 Evolução do seu Saldo'
    });
    

    const periodKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Hoje', callback_data: 'dashboard_day' },
            { text: 'Semana', callback_data: 'dashboard_week' },
            { text: 'Mês', callback_data: 'dashboard_month' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(
      chatId,
      'Você pode visualizar seu dashboard para diferentes períodos:',
      periodKeyboard
    );
    
  } catch (error) {
    console.error(`Error in handleDashboard (${periodType}):`, error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o dashboard. Talvez você ainda não tenha transações suficientes neste período.');
  }
}


async function handleExpenseChart(bot, msg, periodType = 'month') {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {

    const loadingMessage = await bot.sendMessage(
      chatId,
      '📊 Gerando gráfico de despesas. Um momento...',
      { parse_mode: 'Markdown' }
    );
    

    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    

    let startDate, endDate, periodTitle;
    const now = new Date();
    
    switch (periodType) {
      case 'day':
        startDate = moment(now).startOf('day').toISOString();
        endDate = moment(now).endOf('day').toISOString();
        periodTitle = `Hoje (${moment(now).format('DD/MM/YYYY')})`;
        break;
      case 'week':
        startDate = moment(now).startOf('week').toISOString();
        endDate = moment(now).endOf('week').toISOString();
        periodTitle = `Semana (${moment(now).startOf('week').format('DD/MM')} - ${moment(now).endOf('week').format('DD/MM')})`;
        break;
      case 'month':
      default:
        startDate = moment(now).startOf('month').toISOString();
        endDate = moment(now).endOf('month').toISOString();
        periodTitle = `Mês de ${moment(now).format('MMMM/YYYY')}`;
        break;
    }
    

    const chartPath = await dashboardService.generateCategoryDistributionChart(user.id, startDate, endDate, 'expense');
    

    await bot.deleteMessage(chatId, loadingMessage.message_id);
    

    await bot.sendPhoto(chatId, chartPath, {
      caption: `📉 Distribuição de Despesas por Categoria - ${periodTitle}`
    });
    

    const periodKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Hoje', callback_data: 'expense_chart_day' },
            { text: 'Semana', callback_data: 'expense_chart_week' },
            { text: 'Mês', callback_data: 'expense_chart_month' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(
      chatId,
      'Você pode visualizar este gráfico para diferentes períodos:',
      periodKeyboard
    );
    
  } catch (error) {
    console.error(`Error in handleExpenseChart (${periodType}):`, error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o gráfico. Talvez você ainda não tenha despesas neste período.');
  }
}

async function handleIncomeChart(bot, msg, periodType = 'month') {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {

    const loadingMessage = await bot.sendMessage(
      chatId,
      '📊 Gerando gráfico de receitas. Um momento...',
      { parse_mode: 'Markdown' }

    );
    

    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    

    let startDate, endDate, periodTitle;
    const now = new Date();
    
    switch (periodType) {
      case 'day':
        startDate = moment(now).startOf('day').toISOString();
        endDate = moment(now).endOf('day').toISOString();
        periodTitle = `Hoje (${moment(now).format('DD/MM/YYYY')})`;
        break;
      case 'week':
        startDate = moment(now).startOf('week').toISOString();
        endDate = moment(now).endOf('week').toISOString();
        periodTitle = `Semana (${moment(now).startOf('week').format('DD/MM')} - ${moment(now).endOf('week').format('DD/MM')})`;
        break;
      case 'month':
      default:
        startDate = moment(now).startOf('month').toISOString();
        endDate = moment(now).endOf('month').toISOString();
        periodTitle = `Mês de ${moment(now).format('MMMM/YYYY')}`;
        break;
    }
    

    const chartPath = await dashboardService.generateCategoryDistributionChart(user.id, startDate, endDate, 'income');
    

    await bot.deleteMessage(chatId, loadingMessage.message_id);
    

    await bot.sendPhoto(chatId, chartPath, {
      caption: `📈 Distribuição de Receitas por Categoria - ${periodTitle}`
    });
    

    const periodKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Hoje', callback_data: 'income_chart_day' },
            { text: 'Semana', callback_data: 'income_chart_week' },
            { text: 'Mês', callback_data: 'income_chart_month' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(
      chatId,
      'Você pode visualizar este gráfico para diferentes períodos:',
      periodKeyboard
    );
    
  } catch (error) {
    console.error(`Error in handleIncomeChart (${periodType}):`, error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o gráfico. Talvez você ainda não tenha receitas neste período.');
  }
}


async function handleBalanceEvolutionChart(bot, msg, periodType = 'month') {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {

    const loadingMessage = await bot.sendMessage(
      chatId,
      '📊 Gerando gráfico de evolução do saldo. Um momento...',
      { parse_mode: 'Markdown' }
    );
    

    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    

    let startDate, endDate, periodTitle;
    const now = new Date();
    
    switch (periodType) {
      case 'day':
        startDate = moment(now).startOf('day').toISOString();
        endDate = moment(now).endOf('day').toISOString();
        periodTitle = `Hoje (${moment(now).format('DD/MM/YYYY')})`;
        break;
      case 'week':
        startDate = moment(now).startOf('week').toISOString();
        endDate = moment(now).endOf('week').toISOString();
        periodTitle = `Semana (${moment(now).startOf('week').format('DD/MM')} - ${moment(now).endOf('week').format('DD/MM')})`;
        break;
      case 'month':
      default:
        startDate = moment(now).startOf('month').toISOString();
        endDate = moment(now).endOf('month').toISOString();
        periodTitle = `Mês de ${moment(now).format('MMMM/YYYY')}`;
        break;
    }
    

    const chartPath = await dashboardService.generateBalanceEvolutionChart(user.id, startDate, endDate);
    

    await bot.deleteMessage(chatId, loadingMessage.message_id);
    

    await bot.sendPhoto(chatId, chartPath, {
      caption: `📊 Evolução do Saldo - ${periodTitle}`
    });
    
    const periodKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Hoje', callback_data: 'balance_chart_day' },
            { text: 'Semana', callback_data: 'balance_chart_week' },
            { text: 'Mês', callback_data: 'balance_chart_month' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(
      chatId,
      'Você pode visualizar este gráfico para diferentes períodos:',
      periodKeyboard
    );
    
  } catch (error) {
    console.error(`Error in handleBalanceEvolutionChart (${periodType}):`, error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o gráfico. Talvez você ainda não tenha transações suficientes neste período.');
  }
}


async function handleComparisonChart(bot, msg, periodType = 'month') {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {

    const loadingMessage = await bot.sendMessage(
      chatId,
      '📊 Gerando gráfico comparativo. Um momento...',
      { parse_mode: 'Markdown' }
    );
    
    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    
    let startDate, endDate, periodTitle;
    const now = new Date();
    
    switch (periodType) {
      case 'day':
        startDate = moment(now).startOf('day').toISOString();
        endDate = moment(now).endOf('day').toISOString();
        periodTitle = `Hoje (${moment(now).format('DD/MM/YYYY')})`;
        break;
      case 'week':
        startDate = moment(now).startOf('week').toISOString();
        endDate = moment(now).endOf('week').toISOString();
        periodTitle = `Semana (${moment(now).startOf('week').format('DD/MM')} - ${moment(now).endOf('week').format('DD/MM')})`;
        break;
      case 'month':
      default:
        startDate = moment(now).startOf('month').toISOString();
        endDate = moment(now).endOf('month').toISOString();
        periodTitle = `Mês de ${moment(now).format('MMMM/YYYY')}`;
        break;
    }
    

    const chartPath = await dashboardService.generateIncomeExpenseComparisonChart(user.id, startDate, endDate);
    

    await bot.deleteMessage(chatId, loadingMessage.message_id);
    

    await bot.sendPhoto(chatId, chartPath, {
      caption: `📊 Comparativo entre Receitas e Despesas - ${periodTitle}`
    });
    

    const periodKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Hoje', callback_data: 'comparison_chart_day' },
            { text: 'Semana', callback_data: 'comparison_chart_week' },
            { text: 'Mês', callback_data: 'comparison_chart_month' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(
      chatId,
      'Você pode visualizar este gráfico para diferentes períodos:',
      periodKeyboard
    );
    
  } catch (error) {
    console.error(`Error in handleComparisonChart (${periodType}):`, error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o gráfico. Talvez você ainda não tenha transações suficientes neste período.');
  }
}

async function handleDashboardCallbacks(bot, callbackQuery) {
  try {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    

    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (data.startsWith('dashboard_')) {
      const period = data.split('_')[1]; 
      await handleDashboard(bot, callbackQuery.message, period);
    } 
    else if (data.startsWith('expense_chart_')) {
      const period = data.split('_')[2]; 
      await handleExpenseChart(bot, callbackQuery.message, period);
    }
    else if (data.startsWith('income_chart_')) {
      const period = data.split('_')[2]; 
      await handleIncomeChart(bot, callbackQuery.message, period);
    }
    else if (data.startsWith('balance_chart_')) {
      const period = data.split('_')[2]; 
      await handleBalanceEvolutionChart(bot, callbackQuery.message, period);
    }
    else if (data.startsWith('comparison_chart_')) {
      const period = data.split('_')[2]; 
      await handleComparisonChart(bot, callbackQuery.message, period);
    }
  } catch (error) {
    console.error('Error in handleDashboardCallbacks:', error);
    await bot.sendMessage(callbackQuery.message.chat.id, '❌ Ocorreu um erro ao processar sua solicitação.');
  }
}


/**
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function handleDashboardMenu(bot, msg) {
  const chatId = msg.chat.id;
  
  try {

    const { id: telegramId } = msg.from;
    const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
    const userConfig = await userConfigService.getUserConfig(user.id);
    
    let message;
    
    if (userConfig.personality === PERSONALITIES.FRIENDLY) {
      message = '📊 *Menu de Visualizações*\n\nOlá! Escolha o tipo de visualização que você gostaria de ver:';
    } else if (userConfig.personality === PERSONALITIES.SASSY) {
      message = '📊 *Hora de ver onde o dinheiro foi parar*\n\nVamos lá, escolha qual gráfico você quer ver (prepare-se para possíveis sustos):';
    } else {
      message = '📊 *Dashboard Financeiro*\n\nSelecione o tipo de visualização desejada:';
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📊 Dashboard Completo', callback_data: 'dashboard_month' }
          ],
          [
            { text: '💸 Despesas por Categoria', callback_data: 'expense_chart_month' }
          ],
          [
            { text: '💰 Receitas por Categoria', callback_data: 'income_chart_month' }
          ],
          [
            { text: '📈 Evolução do Saldo', callback_data: 'balance_chart_month' }
          ],
          [
            { text: '📊 Comparativo Receitas x Despesas', callback_data: 'comparison_chart_month' }
          ]
        ]
      }
    };
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      ...keyboard
    });
    
  } catch (error) {
    console.error('Error in handleDashboardMenu:', error);
    return bot.sendMessage(chatId, '❌ Ocorreu um erro ao exibir o menu de dashboard.');
  }
}

module.exports = {
  commands,
  handleStart,
  handleHelp,
  handleConfigure,
  handlePersonalitySelection,
  handleMessage,
  handleReport,
  handleReset,
  handleListReminders,
  createPersonalityKeyboard,
  handleDashboard,
  handleExpenseChart,
  handleIncomeChart,
  handleBalanceEvolutionChart,
  handleComparisonChart,
  handleDashboardCallbacks
}