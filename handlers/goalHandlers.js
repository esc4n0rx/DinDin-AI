/**
 * handlers/goalHandlers.js
 * Manipuladores para comandos e mensagens relacionadas a metas financeiras
 */

const goalService = require('../services/goalService');
const personalityService = require('../services/personalityResponses');
const userConfigService = require('../services/userConfig');
const supabaseService = require('../services/supabase');
const moment = require('moment');
const numeral = require('numeral');

// Armazenar estado das conversas sobre metas
const goalConversations = new Map();

/**
 * Gerencia o fluxo de criação de metas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} analysis - Análise da mensagem feita pelo LLM
 * @param {Object} user - Objeto do usuário
 * @param {Object} userConfig - Configuração do usuário
 */
async function handleGoalCreation(bot, msg, analysis, user, userConfig) {
  const chatId = msg.chat.id;
  const { id: telegramId } = msg.from;
  
  try {
    // Verificar se já existe uma conversa em andamento
    if (!goalConversations.has(telegramId)) {
      // Iniciar nova conversa de criação de meta
      goalConversations.set(telegramId, {
        state: 'awaiting_target_amount',
        title: analysis.title || null,
        targetAmount: analysis.targetAmount || null,
        initialAmount: analysis.initialAmount || 0,
        targetDate: analysis.targetDate || null,
        category: analysis.category || null
      });
      
      // Verificar se já temos as informações necessárias da análise inicial
      const conversation = goalConversations.get(telegramId);
      
      // Se já temos o título e o valor alvo, podemos pular direto para confirmar
      if (conversation.title && conversation.targetAmount) {
        return handleGoalConfirmation(bot, msg, user, userConfig);
      }
      
      // Se temos o título mas não o valor, perguntar o valor
      if (conversation.title && !conversation.targetAmount) {
        const prompt = personalityService.getResponse(
          userConfig.personality,
          'goalCreatePrompt'
        );
        return bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
      }
      
      // Se não temos nem o título, perguntar primeiramente o título
      if (!conversation.title) {
        return bot.sendMessage(
          chatId,
          "Por favor, dê um nome para a sua meta. Por exemplo: 'Celular novo', 'Viagem para a praia', etc.",
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      // Continuar conversa existente
      const conversation = goalConversations.get(telegramId);
      
      if (conversation.state === 'awaiting_title') {
        // Atualizar título
        conversation.title = msg.text.trim();
        conversation.state = 'awaiting_target_amount';
        
        const prompt = personalityService.getResponse(
          userConfig.personality,
          'goalCreatePrompt'
        );
        
        return bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
      }
      else if (conversation.state === 'awaiting_target_amount') {
        // Processar valor alvo
        let targetAmount;
        
        // Tentar extrair valor numérico
        try {
          // Remover símbolos de moeda e substituir vírgulas por pontos
          const numericValue = msg.text.replace(/[R$\s]/g, '').replace(',', '.');
          targetAmount = parseFloat(numericValue);
          
          if (isNaN(targetAmount)) {
            throw new Error('Valor inválido');
          }
        } catch (error) {
          return bot.sendMessage(
            chatId,
            "Por favor, informe um valor numérico válido. Por exemplo: '1500', '2000,50', etc.",
            { parse_mode: 'Markdown' }
          );
        }
        
        // Atualizar conversa
        conversation.targetAmount = targetAmount;
        conversation.state = 'awaiting_initial_amount';
        
        const prompt = personalityService.getResponse(
          userConfig.personality,
          'goalInitialAmountPrompt'
        );
        
        return bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
      }
      else if (conversation.state === 'awaiting_initial_amount') {
        // Processar valor inicial
        let initialAmount = 0;
        
        // Verificar se é uma resposta negativa
        if (/^(não|nao|n|no|0)$/i.test(msg.text)) {
          initialAmount = 0;
        } else {
          // Tentar extrair valor numérico
          try {
            // Remover símbolos de moeda e substituir vírgulas por pontos
            const numericValue = msg.text.replace(/[R$\s]/g, '').replace(',', '.');
            initialAmount = parseFloat(numericValue);
            
            if (isNaN(initialAmount)) {
              initialAmount = 0;
            }
          } catch (error) {
            initialAmount = 0;
          }
        }
        
        // Atualizar conversa
        conversation.initialAmount = initialAmount;
        conversation.state = 'awaiting_target_date';
        
        const prompt = personalityService.getResponse(
          userConfig.personality,
          'goalTargetDatePrompt'
        );
        
        return bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
      }
      else if (conversation.state === 'awaiting_target_date') {
        // Processar data alvo
        let targetDate = null;
        
        // Verificar se é uma resposta negativa
        if (/^(não|nao|n|no|sem prazo|sem data|indefinido)$/i.test(msg.text)) {
          targetDate = null;
        } else {
          // Tentar extrair data
          try {
            // Formato brasileiro DD/MM/YYYY
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(msg.text)) {
              targetDate = moment(msg.text, 'DD/MM/YYYY').toDate();
            }
            // Formato YYYY-MM-DD
            else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(msg.text)) {
              targetDate = moment(msg.text, 'YYYY-MM-DD').toDate();
            }
            // Outros formatos
            else {
              targetDate = new Date(msg.text);
            }
            
            // Verificar se a data é válida e futura
            if (isNaN(targetDate.getTime()) || targetDate < new Date()) {
              targetDate = null;
            }
          } catch (error) {
            targetDate = null;
          }
        }
        
        // Atualizar conversa
        conversation.targetDate = targetDate;
        conversation.state = 'confirmation';
        
        return handleGoalConfirmation(bot, msg, user, userConfig);
      }
    }
  } catch (error) {
    console.error('Error in handleGoalCreation:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Manipula a confirmação e criação final da meta
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} user - Objeto do usuário
 * @param {Object} userConfig - Configuração do usuário
 */
async function handleGoalConfirmation(bot, msg, user, userConfig) {
  const chatId = msg.chat.id;
  const { id: telegramId } = msg.from;
  
  try {
    // Verificar se existe uma conversa
    if (!goalConversations.has(telegramId)) {
      return bot.sendMessage(
        chatId,
        "Parece que não há uma criação de meta em andamento. Por favor, inicie novamente com 'Criar meta para [objetivo]'.",
        { parse_mode: 'Markdown' }
      );
    }
    
    const conversation = goalConversations.get(telegramId);
    
    // Verificar se temos as informações mínimas necessárias
    if (!conversation.title || !conversation.targetAmount) {
      return bot.sendMessage(
        chatId,
        "Informações insuficientes para criar a meta. Por favor, inicie novamente com 'Criar meta para [objetivo]'.",
        { parse_mode: 'Markdown' }
      );
    }
    
    // Criar a meta
    const goal = await goalService.createGoal(
      user.id,
      conversation.title,
      conversation.targetAmount,
      conversation.initialAmount || 0,
      conversation.targetDate,
      null // Category ID (opcional, não implementado neste exemplo)
    );
    
    // Enviar mensagem de sucesso
    const successMessage = personalityService.getResponse(
      userConfig.personality,
      'goalCreationSuccess',
      goal
    );
    
    // Limpar conversa
    goalConversations.delete(telegramId);
    
    return bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in handleGoalConfirmation:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao criar sua meta. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Manipula a adição de contribuição a uma meta existente
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} analysis - Análise da mensagem feita pelo LLM
 * @param {Object} user - Objeto do usuário
 * @param {Object} userConfig - Configuração do usuário
 */
async function handleGoalContribution(bot, msg, analysis, user, userConfig) {
  const chatId = msg.chat.id;
  
  try {
    // Verificar se temos as informações necessárias
    if (!analysis.title || !analysis.contributionAmount) {
      return bot.sendMessage(
        chatId,
        "Por favor, especifique o título da meta e o valor da contribuição. Por exemplo: 'Adicionar 100 reais na meta Viagem'.",
        { parse_mode: 'Markdown' }
      );
    }
    
    // Buscar metas do usuário
    const userGoals = await goalService.getUserGoals(user.id);
    
    if (userGoals.length === 0) {
      return bot.sendMessage(
        chatId,
        "Você ainda não tem nenhuma meta financeira. Para criar uma, diga 'Quero criar uma meta para [objetivo]'.",
        { parse_mode: 'Markdown' }
      );
    }
    
    // Encontrar a meta pelo título (correspondência parcial)
    const goalTitle = analysis.title.toLowerCase();
    let targetGoal = null;
    
    for (const goal of userGoals) {
      if (goal.title.toLowerCase().includes(goalTitle)) {
        targetGoal = goal;
        break;
      }
    }
    
    if (!targetGoal) {
      // Não encontrou a meta pelo título
      const goalsText = userGoals.map(g => `- ${g.title}`).join('\n');
      return bot.sendMessage(
        chatId,
        `Não encontrei nenhuma meta com o nome "${analysis.title}". Suas metas atuais são:\n${goalsText}`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // Adicionar contribuição à meta
    const contribution = await goalService.addContribution(
      targetGoal.id,
      analysis.contributionAmount,
      `Adicionado via chat: ${msg.text}`
    );
    
    // Enviar mensagem de sucesso
    const successMessage = personalityService.getResponse(
      userConfig.personality,
      'goalContributionSuccess',
      contribution.goal,
      contribution.contribution
    );
    
    return bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in handleGoalContribution:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua contribuição. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Manipula consultas sobre metas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} analysis - Análise da mensagem feita pelo LLM
 * @param {Object} user - Objeto do usuário
 * @param {Object} userConfig - Configuração do usuário
 */
async function handleGoalQuery(bot, msg, analysis, user, userConfig) {
  const chatId = msg.chat.id;
  
  try {
    // Buscar metas do usuário
    const userGoals = await goalService.getUserGoals(user.id);
    
    if (userGoals.length === 0) {
      return bot.sendMessage(
        chatId,
        "Você ainda não tem nenhuma meta financeira. Para criar uma, diga 'Quero criar uma meta para [objetivo]'.",
        { parse_mode: 'Markdown' }
      );
    }
    
    // Verificar se está consultando uma meta específica
    if (analysis.title) {
      // Buscar meta específica
      const goalTitle = analysis.title.toLowerCase();
      let targetGoal = null;
      
      for (const goal of userGoals) {
        if (goal.title.toLowerCase().includes(goalTitle)) {
          targetGoal = goal;
          break;
        }
      }
      
      if (!targetGoal) {
        // Não encontrou a meta pelo título
        const goalsText = userGoals.map(g => `- ${g.title}`).join('\n');
        return bot.sendMessage(
          chatId,
          `Não encontrei nenhuma meta com o nome "${analysis.title}". Suas metas atuais são:\n${goalsText}`,
          { parse_mode: 'Markdown' }
        );
      }
      
      // Obter estatísticas da meta
      const stats = await goalService.getGoalStatistics(targetGoal.id, user.id);
      
      // Enviar resposta com detalhes da meta
      const goalDetailsMessage = personalityService.getResponse(
        userConfig.personality,
        'goalQuerySingle',
        targetGoal,
        stats
      );
      
      return bot.sendMessage(chatId, goalDetailsMessage, { parse_mode: 'Markdown' });
    } else {
      // Listar todas as metas
      const goalsListMessage = personalityService.getResponse(
        userConfig.personality,
        'goalQueryMultiple',
        userGoals
      );
      
      return bot.sendMessage(chatId, goalsListMessage, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error in handleGoalQuery:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao consultar suas metas. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Manipula o comando /metas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function handleGoalsCommand(bot, msg) {
  const { id: telegramId, first_name } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    // Obter usuário e configurações
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username);
    const userConfig = await userConfigService.getUserConfig(user.id);
    
    // Buscar metas do usuário
    const userGoals = await goalService.getUserGoals(user.id);
    
    // Exibir lista de metas
    const goalsListMessage = personalityService.getResponse(
      userConfig.personality,
      'goalQueryMultiple',
      userGoals
    );
    
    return bot.sendMessage(chatId, goalsListMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in handleGoalsCommand:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao consultar suas metas. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Manipula o comando /novameta
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function handleNewGoalCommand(bot, msg) {
  const { id: telegramId, first_name } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    // Obter usuário e configurações
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username);
    const userConfig = await userConfigService.getUserConfig(user.id);
    
    // Iniciar fluxo de criação de meta
    goalConversations.set(telegramId, {
      state: 'awaiting_title',
      title: null,
      targetAmount: null,
      initialAmount: 0,
      targetDate: null,
      category: null
    });
    
    return bot.sendMessage(
      chatId,
      "Vamos criar uma nova meta financeira! Por favor, dê um nome para a sua meta. Por exemplo: 'Celular novo', 'Viagem para a praia', etc.",
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in handleNewGoalCommand:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao iniciar a criação da meta. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Manipula informações adicionais sobre metas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} analysis - Análise da mensagem feita pelo LLM
 * @param {Object} user - Objeto do usuário
 * @param {Object} userConfig - Configuração do usuário
 */
async function handleGoalInfo(bot, msg, analysis, user, userConfig) {
  const chatId = msg.chat.id;
  const { id: telegramId } = msg.from;
  
  try {
    // Verificar se existe uma conversa de meta em andamento
    if (!goalConversations.has(telegramId)) {
      return bot.sendMessage(
        chatId,
        "Não há uma criação de meta em andamento. Para iniciar, diga 'Quero criar uma meta para [objetivo]'.",
        { parse_mode: 'Markdown' }
      );
    }
    
    const conversation = goalConversations.get(telegramId);
    const infoType = analysis.infoType;
    const value = analysis.value;
    
    if (infoType === 'target_amount') {
      // Processar valor alvo
      let targetAmount;
      try {
        targetAmount = parseFloat(value);
        if (isNaN(targetAmount)) {
          throw new Error('Valor inválido');
        }
      } catch (error) {
        return bot.sendMessage(
          chatId,
          "Por favor, informe um valor numérico válido para a meta.",
          { parse_mode: 'Markdown' }
        );
      }
      
      conversation.targetAmount = targetAmount;
      conversation.state = 'awaiting_initial_amount';
      
      const prompt = personalityService.getResponse(
        userConfig.personality,
        'goalInitialAmountPrompt'
      );
      
      return bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
    }
    else if (infoType === 'initial_amount') {
      // Processar valor inicial
      let initialAmount = 0;
      try {
        initialAmount = parseFloat(value);
        if (isNaN(initialAmount)) {
          initialAmount = 0;
        }
      } catch (error) {
        initialAmount = 0;
      }
      
      conversation.initialAmount = initialAmount;
      conversation.state = 'awaiting_target_date';
      
      const prompt = personalityService.getResponse(
        userConfig.personality,
        'goalTargetDatePrompt'
      );
      
      return bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
    }
    else if (infoType === 'target_date') {
      // Processar data alvo
      let targetDate = null;
      try {
        // Tentar converter para data
        targetDate = new Date(value);
        if (isNaN(targetDate.getTime())) {
          targetDate = null;
        }
      } catch (error) {
        targetDate = null;
      }
      
      conversation.targetDate = targetDate;
      conversation.state = 'confirmation';
      
      return handleGoalConfirmation(bot, msg, user, userConfig);
    }
    else {
      return bot.sendMessage(
        chatId,
        "Não entendi sua resposta. Por favor, responda à pergunta anterior.",
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Error in handleGoalInfo:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua resposta. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Cria lembretes para acompanhamento de meta
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {number} goalId - ID da meta
 * @param {string} frequency - Frequência do lembrete (daily, weekly, monthly)
 * @param {Object} user - Objeto do usuário
 * @param {Object} userConfig - Configuração do usuário
 */
async function createGoalReminder(bot, msg, goalId, frequency, user, userConfig) {
  const chatId = msg.chat.id;
  
  try {
    const reminder = await goalService.createGoalReminder(goalId, user.id, frequency);
    
    const successMessage = personalityService.getResponse(
      userConfig.personality,
      'goalCreateReminderSuccess',
      frequency
    );
    
    return bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in createGoalReminder:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao criar o lembrete para sua meta. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Função principal para lidar com mensagens relacionadas a metas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} analysis - Análise da mensagem feita pelo LLM
 */
async function handleGoalMessage(bot, msg, analysis) {
  const { id: telegramId, first_name } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    // Obter usuário e configurações
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username);
    const userConfig = await userConfigService.getUserConfig(user.id);
    
    // Verificar tipo de ação relacionada à meta
    if (analysis.isGoal) {
      // Identificar a ação desejada
      switch (analysis.goalAction) {
        case 'create':
          return handleGoalCreation(bot, msg, analysis, user, userConfig);
        
        case 'contribute':
          return handleGoalContribution(bot, msg, analysis, user, userConfig);
        
        case 'query':
          return handleGoalQuery(bot, msg, analysis, user, userConfig);
        
        default:
          return bot.sendMessage(
            chatId,
            "Não entendi o que você gostaria de fazer com sua meta. Você pode criar uma meta, adicionar valores, ou consultar seu progresso.",
            { parse_mode: 'Markdown' }
          );
      }
    } 
    else if (analysis.isGoalInfo) {
      return handleGoalInfo(bot, msg, analysis, user, userConfig);
    }
  } catch (error) {
    console.error('Error in handleGoalMessage:', error);
    return bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua solicitação relacionada a metas. Por favor, tente novamente.",
      { parse_mode: 'Markdown' }
    );
  }
}

// Exportar funções
module.exports = {
  handleGoalMessage,
  handleGoalsCommand,
  handleNewGoalCommand,
  createGoalReminder
};