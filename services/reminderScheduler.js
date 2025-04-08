const cron = require('node-cron');
const moment = require('moment');
const reminderService = require('./reminderService');
const personalityService = require('./personalityResponses');
const userConfigService = require('./userConfig');

/**
 * Configuração do agendador de lembretes
 * @param {TelegramBot} bot - Instância do bot do Telegram
 */
function setupReminderScheduler(bot) {
  console.log('Inicializando agendador de lembretes...');
  
  // Verificar lembretes a cada 5 minutos
  // Formato cron: segundo(0-59) minuto(0-59) hora(0-23) dia(1-31) mês(1-12) diaSemana(0-7)
  cron.schedule('0 */5 * * * *', async () => {
    try {
      await checkPendingReminders(bot);
    } catch (error) {
      console.error('Erro na verificação programada de lembretes:', error);
    }
  });
  
  console.log('Agendador de lembretes inicializado com sucesso.');
}

/**
 * Verifica lembretes pendentes e envia notificações
 * @param {TelegramBot} bot - Instância do bot do Telegram
 */
async function checkPendingReminders(bot) {
  try {
    console.log('Verificando lembretes pendentes...');
    
    // Define janela de tempo para verificação (próximos 5 minutos)
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
    
    // Busca lembretes que vencem nos próximos 5 minutos e ainda não foram enviados
    const pendingReminders = await reminderService.getPendingReminders(
      now.toISOString(),
      fiveMinutesLater.toISOString()
    );
    
    console.log(`Encontrados ${pendingReminders.length} lembretes pendentes para envio.`);
    
    // Processa cada lembrete
    for (const reminder of pendingReminders) {
      try {
        await processReminder(bot, reminder);
      } catch (reminderError) {
        console.error(`Erro ao processar lembrete ID ${reminder.id}:`, reminderError);
      }
    }
    
    console.log('Verificação de lembretes concluída.');
  } catch (error) {
    console.error('Erro ao verificar lembretes pendentes:', error);
    throw error;
  }
}

/**
 * Processa um lembrete individual, enviando notificação
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} reminder - Objeto do lembrete
 */
async function processReminder(bot, reminder) {
  try {
    // Obtém o ID do Telegram do usuário
    const telegramId = reminder.users.telegram_id;
    
    if (!telegramId) {
      console.error(`Telegram ID não encontrado para o lembrete ID ${reminder.id}`);
      return;
    }
    
    // Obtém configuração do usuário para personalizar a mensagem
    const userConfig = await userConfigService.getUserConfig(reminder.user_id);
    
    // Formata a data do lembrete
    const dueDate = moment(reminder.due_date).format('DD/MM/YYYY [às] HH:mm');
    
    // Constói a mensagem com base na personalidade
    let message;
    
    if (userConfig.personality === userConfigService.PERSONALITIES.FRIENDLY) {
      message = `⏰ *Lembrete!*\n\n📝 ${reminder.description}\n📅 Agendado para: ${dueDate}\n\nEspero que isso te ajude! 😊`;
    } else if (userConfig.personality === userConfigService.PERSONALITIES.SASSY) {
      message = `⏰ *TRIMMMM! Lembrete!*\n\n📝 ${reminder.description}\n📅 Era para: ${dueDate}\n\nNão diga que não te avisei! 😜`;
    } else {
      message = `⏰ *Notificação de Lembrete*\n\n📝 ${reminder.description}\n📅 Agendado para: ${dueDate}\n\nEste é um lembrete automatizado.`;
    }
    
    // Adiciona informação sobre recorrência se aplicável
    if (reminder.is_recurring) {
      const recurrence = getRecurrenceText(reminder.recurrence_pattern);
      message += `\n\n🔄 Este é um lembrete ${recurrence.toLowerCase()}.`;
    }
    
    // Adiciona botão para marcar como concluído
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Marcar como concluído', callback_data: `complete_reminder:${reminder.id}` }]
        ]
      }
    };
    
    // Envia a mensagem
    await bot.sendMessage(telegramId, message, { 
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    console.log(`Lembrete ID ${reminder.id} enviado para o usuário ${telegramId}`);
    
    // Marca o lembrete como enviado
    await reminderService.markReminderAsSent(reminder.id);
    
    // Se for recorrente, processa a recorrência quando for marcado como concluído
    // A recorrência será processada quando o usuário clicar no botão "Marcar como concluído"
  } catch (error) {
    console.error(`Erro ao processar lembrete ID ${reminder.id}:`, error);
    throw error;
  }
}

/**
 * Processar callback de botão para concluir lembrete
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} callbackQuery - Objeto da query de callback
 */
async function handleReminderCompletion(bot, callbackQuery) {
  try {
    const reminderId = callbackQuery.data.split(':')[1];
    const chatId = callbackQuery.message.chat.id;
    
    console.log(`Processando conclusão do lembrete ID ${reminderId} por ${callbackQuery.from.id}`);
    
    // Marca o lembrete como concluído
    const reminder = await reminderService.markReminderAsCompleted(reminderId);
    
    // Verifica se é um lembrete recorrente
    if (reminder.is_recurring) {
      // Cria a próxima instância do lembrete
      const nextReminder = await reminderService.processRecurringReminder(reminderId);
      
      if (nextReminder) {
        console.log(`Próximo lembrete recorrente criado: ID ${nextReminder.id}`);
      }
    }
    
    // Responde ao callback
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Lembrete marcado como concluído!'
    });
    
    // Atualiza a mensagem original
    await bot.editMessageText(
      callbackQuery.message.text + '\n\n✅ Marcado como concluído',
      {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] } // Remove o botão
      }
    );
  } catch (error) {
    console.error('Erro ao processar conclusão de lembrete:', error);
    
    // Responde ao callback com erro
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Erro ao concluir lembrete. Tente novamente.'
    });
  }
}

/**
 * Função auxiliar para formatar o texto de recorrência
 */
function getRecurrenceText(pattern) {
  switch (pattern) {
    case 'daily':
      return 'Diário';
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

module.exports = {
  setupReminderScheduler,
  checkPendingReminders,
  handleReminderCompletion
};