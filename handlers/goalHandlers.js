
const goalService = require('../services/goalService');
const personalityService = require('../services/personalityResponses');
const userConfigService = require('../services/userConfig');
const supabaseService = require('../services/supabase');
const handlers = require('./telegramHandlers'); 
const moment = require('moment'); 
const numeral = require('numeral');

// Armazenar estado das conversas sobre metas
const goalConversations = new Map();

let botInstance = null;

/**
 * Define a instância do bot para uso em handlers isolados
 * @param {TelegramBot} bot - Instância do bot do Telegram
 */
function setBotInstance(bot) {
  botInstance = bot;
  console.log('Instância do bot configurada no módulo goalHandlers');
}

/**
 * Modifica a mensagem para indicar que foi processada pelo fluxo de metas
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @returns {Object} - Mensagem modificada
 */
function markMessageAsProcessed(msg) {
  // Cria uma cópia da mensagem para evitar modificar o objeto original
  const processedMsg = {...msg};
  // Adiciona flag para evitar processamento duplicado
  processedMsg._processedByGoalFlow = true;
  return processedMsg;
}


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
      console.log(`Iniciando fluxo de criação de meta para usuário ${telegramId}`);
      
      // Obter usuário e configurações
      const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username);
      const userConfig = await userConfigService.getUserConfig(user.id);
      
      // Criar um event listener específico para este usuário
      const goalCreationHandler = async (responseMsg) => {
        // Ignora mensagens de outros usuários ou chats
        if (responseMsg.from.id !== telegramId || responseMsg.chat.id !== chatId) return;
        // Ignora comandos
        if (responseMsg.text && responseMsg.text.startsWith('/')) return;
        
        const currentState = goalConversations.get(telegramId);
        if (!currentState) return;
        
        console.log(`Processando resposta para estado: ${currentState.state}`);
        
        switch (currentState.state) {
          case 'awaiting_title':
            // Salvar o título e perguntar o valor alvo
            currentState.title = responseMsg.text.trim();
            currentState.state = 'awaiting_target_amount';
            
            const targetPrompt = personalityService.getResponse(
              userConfig.personality,
              'goalCreatePrompt'
            );
            
            bot.sendMessage(chatId, targetPrompt, { parse_mode: 'Markdown' });
            break;
            
          case 'awaiting_target_amount':
            // Processar valor alvo
            try {
              const numericValue = responseMsg.text.replace(/[R$\s]/g, '').replace(',', '.');
              const targetAmount = parseFloat(numericValue);
              
              if (isNaN(targetAmount) || targetAmount <= 0) {
                bot.sendMessage(
                  chatId,
                  "Por favor, informe um valor numérico válido. Por exemplo: '1500', '2000,50', etc.",
                  { parse_mode: 'Markdown' }
                );
                return;
              }
              
              // Atualizar conversa
              currentState.targetAmount = targetAmount;
              currentState.state = 'awaiting_initial_amount';
              
              const initialPrompt = personalityService.getResponse(
                userConfig.personality,
                'goalInitialAmountPrompt'
              );
              
              bot.sendMessage(chatId, initialPrompt, { parse_mode: 'Markdown' });
            } catch (error) {
              console.error('Erro ao processar valor alvo:', error);
              bot.sendMessage(
                chatId,
                "Ocorreu um erro ao processar o valor. Por favor, tente novamente com um número válido.",
                { parse_mode: 'Markdown' }
              );
            }
            break;
            
          case 'awaiting_initial_amount':
            // Processar valor inicial
            try {
              let initialAmount = 0;
              
              if (!/^(não|nao|n|no|0)$/i.test(responseMsg.text)) {
                const numericValue = responseMsg.text.replace(/[R$\s]/g, '').replace(',', '.');
                initialAmount = parseFloat(numericValue);
                if (isNaN(initialAmount)) initialAmount = 0;
              }
              
              // Atualizar conversa
              currentState.initialAmount = initialAmount;
              currentState.state = 'awaiting_target_date';
              
              const datePrompt = personalityService.getResponse(
                userConfig.personality,
                'goalTargetDatePrompt'
              );
              
              bot.sendMessage(chatId, datePrompt, { parse_mode: 'Markdown' });
            } catch (error) {
              console.error('Erro ao processar valor inicial:', error);
              currentState.initialAmount = 0;
              currentState.state = 'awaiting_target_date';
              
              const datePrompt = personalityService.getResponse(
                userConfig.personality,
                'goalTargetDatePrompt'
              );
              
              bot.sendMessage(chatId, datePrompt, { parse_mode: 'Markdown' });
            }
            break;
            
          case 'awaiting_target_date':
            // Processar data alvo
            try {
              let targetDate = null;
              
              if (!/^(não|nao|n|no|sem prazo|sem data|indefinido)$/i.test(responseMsg.text)) {
                // Tentar extrair data
                if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(responseMsg.text)) {
                  // Formato DD/MM/YYYY
                  targetDate = moment(responseMsg.text, 'DD/MM/YYYY').toDate();
                } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(responseMsg.text)) {
                  // Formato YYYY-MM-DD
                  targetDate = moment(responseMsg.text, 'YYYY-MM-DD').toDate();
                } else {
                  // Outros formatos
                  targetDate = new Date(responseMsg.text);
                }
                
                // Verificar data válida
                if (isNaN(targetDate.getTime())) {
                  targetDate = null;
                }
              }
              
              // Atualizar conversa
              currentState.targetDate = targetDate;
              currentState.state = 'confirmation';
              
              // Remover o listener após o último passo
              bot.removeListener('message', goalCreationHandler);
              
              // Criar a meta
              const goal = await goalService.createGoal(
                user.id,
                currentState.title,
                currentState.targetAmount,
                currentState.initialAmount || 0,
                currentState.targetDate,
                null // categoryId opcional
              );
              
              // Enviar mensagem de sucesso
              const successMessage = personalityService.getResponse(
                userConfig.personality,
                'goalCreationSuccess',
                goal
              );
              
              bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
              
              // Limpar a conversa
              goalConversations.delete(telegramId);
            } catch (error) {
              console.error('Erro ao finalizar criação de meta:', error);
              bot.sendMessage(
                chatId,
                "Desculpe, ocorreu um erro ao criar sua meta. Por favor, tente novamente.",
                { parse_mode: 'Markdown' }
              );
              
              // Limpar a conversa em caso de erro
              goalConversations.delete(telegramId);
              
              // Remover o listener em caso de erro
              bot.removeListener('message', goalCreationHandler);
            }
            break;
            
          default:
            console.log(`Estado desconhecido: ${currentState.state}`);
            // Remover o listener para estados desconhecidos
            bot.removeListener('message', goalCreationHandler);
            break;
        }
      };
      
      // Adicionar o event listener para processar respostas
      bot.on('message', goalCreationHandler);
      
      // Iniciar o fluxo de criação de meta
      goalConversations.set(telegramId, {
        state: 'awaiting_title',
        title: null,
        targetAmount: null,
        initialAmount: 0,
        targetDate: null,
        category: null
      });
      
      // Enviar a primeira mensagem perguntando o nome da meta
      await bot.sendMessage(
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
 * @returns {Promise<boolean>} - Retorna true se a mensagem foi processada como parte do fluxo de meta
 */
async function handleGoalMessage(bot, msg, analysis) {
    const { id: telegramId, first_name } = msg.from;
    const chatId = msg.chat.id;
    
    try {
      // Obter usuário e configurações
      const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username);
      const userConfig = await userConfigService.getUserConfig(user.id);
      
      // Verificar se o usuário está em algum estado do fluxo de criação de meta
      const userState = handlers.getUserState(telegramId);
      
      if (userState && userState.state && userState.state.startsWith('awaiting_goal_')) {
        console.log(`Processando mensagem de meta para usuário ${telegramId} em estado ${userState.state}`);
        
        // Verificar em qual etapa do fluxo de criação de meta o usuário está
        switch (userState.state) {
          case 'awaiting_goal_name':
            // Salvando o nome da meta
            userState.goalData = userState.goalData || {};
            userState.goalData.title = msg.text.trim();
            userState.state = 'awaiting_goal_amount';
            
            await bot.sendMessage(
              chatId,
              "Ótimo! Agora, me diga qual é o valor total da meta?",
              { parse_mode: 'Markdown' }
            );
            return true;
            
          case 'awaiting_goal_amount':
            // Processando o valor da meta
            try {
              const amount = parseFloat(msg.text.replace(/[R$\s]/g, '').replace(',', '.'));
              
              if (isNaN(amount) || amount <= 0) {
                await bot.sendMessage(
                  chatId,
                  "Por favor, informe um valor numérico válido maior que zero.",
                  { parse_mode: 'Markdown' }
                );
                return true;
              }
              
              userState.goalData.targetAmount = amount;
              userState.state = 'awaiting_goal_initial_amount';
              
              const prompt = personalityService.getResponse(
                userConfig.personality,
                'goalInitialAmountPrompt'
              );
              
              await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
              return true;
            } catch (error) {
              console.error('Erro ao processar valor da meta:', error);
              await bot.sendMessage(
                chatId,
                "Ocorreu um erro ao processar o valor. Por favor, informe um valor numérico válido.",
                { parse_mode: 'Markdown' }
              );
              return true;
            }
            
          case 'awaiting_goal_initial_amount':
            // Processando o valor inicial
            try {
              let initialAmount = 0;
              
              if (!/^(não|nao|n|no|0)$/i.test(msg.text)) {
                initialAmount = parseFloat(msg.text.replace(/[R$\s]/g, '').replace(',', '.'));
                if (isNaN(initialAmount)) initialAmount = 0;
              }
              
              userState.goalData.initialAmount = initialAmount;
              userState.state = 'awaiting_goal_target_date';
              
              const prompt = personalityService.getResponse(
                userConfig.personality,
                'goalTargetDatePrompt'
              );
              
              await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
              return true;
            } catch (error) {
              console.error('Erro ao processar valor inicial:', error);
              userState.goalData.initialAmount = 0;
              userState.state = 'awaiting_goal_target_date';
              
              const prompt = personalityService.getResponse(
                userConfig.personality,
                'goalTargetDatePrompt'
              );
              
              await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
              return true;
            }
            
          case 'awaiting_goal_target_date':
            // Processando a data alvo
            try {
              let targetDate = null;
              
              if (!/^(não|nao|n|no|sem prazo|sem data|indefinido)$/i.test(msg.text)) {
                // Tentar extrair data
                if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(msg.text)) {
                  // Formato DD/MM/YYYY
                  targetDate = moment(msg.text, 'DD/MM/YYYY').toDate();
                } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(msg.text)) {
                  // Formato YYYY-MM-DD
                  targetDate = moment(msg.text, 'YYYY-MM-DD').toDate();
                } else {
                  // Outros formatos
                  targetDate = new Date(msg.text);
                }
                
                // Verificar data válida
                if (isNaN(targetDate.getTime())) {
                  targetDate = null;
                }
              }
              
              userState.goalData.targetDate = targetDate;
              userState.state = 'confirmation';
              
              // Criar a meta
              await handleGoalConfirmation(bot, msg, user, userConfig);
              return true;
            } catch (error) {
              console.error('Erro ao processar data alvo:', error);
              userState.goalData.targetDate = null;
              userState.state = 'confirmation';
              
              await handleGoalConfirmation(bot, msg, user, userConfig);
              return true;
            }
            
          case 'confirmation':
            // Se já está na confirmação, finaliza o processo
            await handleGoalConfirmation(bot, msg, user, userConfig);
            return true;
            
          default:
            console.log(`Estado desconhecido: ${userState.state}`);
            return false;
        }
      }
      
      // Se chegou aqui, verifica se a mensagem é uma solicitação relacionada a metas
      if (analysis.isGoal) {
        // Identificar a ação desejada
        switch (analysis.goalAction) {
          case 'create':
            await handleGoalCreation(bot, msg, analysis, user, userConfig);
            return true;
          
          case 'contribute':
            await handleGoalContribution(bot, msg, analysis, user, userConfig);
            return true;
          
          case 'query':
            await handleGoalQuery(bot, msg, analysis, user, userConfig);
            return true;
          
          default:
            await bot.sendMessage(
              chatId,
              "Não entendi o que você gostaria de fazer com sua meta. Você pode criar uma meta, adicionar valores, ou consultar seu progresso.",
              { parse_mode: 'Markdown' }
            );
            return true;
        }
      } 
      else if (analysis.isGoalInfo) {
        await handleGoalInfo(bot, msg, analysis, user, userConfig);
        return true;
      }
      
      return false; // Indica que a mensagem não foi processada como meta
    } catch (error) {
      console.error('Error in handleGoalMessage:', error);
      await bot.sendMessage(
        chatId,
        "Desculpe, ocorreu um erro ao processar sua solicitação relacionada a metas. Por favor, tente novamente.",
        { parse_mode: 'Markdown' }
      );
      return true; 
    }
  }


/**
 * Manipula o comando para ver detalhes de uma meta específica
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function handleGoalDetails(bot, msg) {
    const { id: telegramId } = msg.from;
    const chatId = msg.chat.id;
    const text = msg.text;
  
    try {
      // Extrair o número ou nome da meta da mensagem
      let goalId;
      const commandParts = text.split(' ');
      
      if (commandParts.length < 2) {
        return bot.sendMessage(chatId, 'Por favor, especifique o número ou nome da meta. Exemplo: /metadetalhes 1 ou /metadetalhes Viagem');
      }
      
      // Obter usuário e configurações
      const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
      const userConfig = await userConfigService.getUserConfig(user.id);
      
      // Obter todas as metas do usuário
      const userGoals = await goalService.getUserGoals(user.id);
      
      if (userGoals.length === 0) {
        return bot.sendMessage(
          chatId,
          "Você ainda não tem nenhuma meta financeira. Para criar uma, diga 'Quero criar uma meta para [objetivo]'.",
          { parse_mode: 'Markdown' }
        );
      }
      
      // Tentar encontrar a meta por número ou nome
      let targetGoal;
      const queryParam = commandParts.slice(1).join(' ');
      
      // Tentar interpretar como número
      const goalIndex = parseInt(queryParam) - 1; // índices começam em 0, mas para o usuário começam em 1
      
      if (!isNaN(goalIndex) && goalIndex >= 0 && goalIndex < userGoals.length) {
        // É um número válido
        targetGoal = userGoals[goalIndex];
      } else {
        // Não é um número válido, tentar encontrar por nome
        targetGoal = userGoals.find(goal => 
          goal.title.toLowerCase().includes(queryParam.toLowerCase())
        );
      }
      
      if (!targetGoal) {
        return bot.sendMessage(
          chatId,
          `Não encontrei uma meta com o identificador "${queryParam}". Por favor, use /metas para ver suas metas disponíveis.`,
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
      
      // Botões de ação para a meta
      const goalActionKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { 
                text: 'Adicionar valor', 
                callback_data: `goal_add:${targetGoal.id}` 
              },
              { 
                text: targetGoal.completed ? 'Reabrir meta' : 'Marcar concluída', 
                callback_data: `goal_toggle:${targetGoal.id}` 
              }
            ],
            [
              { 
                text: 'Criar lembrete', 
                callback_data: `goal_reminder:${targetGoal.id}` 
              },
              { 
                text: 'Excluir meta', 
                callback_data: `goal_delete:${targetGoal.id}` 
              }
            ]
          ]
        }
      };
      
      return bot.sendMessage(
        chatId, 
        goalDetailsMessage, 
        { 
          parse_mode: 'Markdown',
          ...goalActionKeyboard
        }
      );
    } catch (error) {
      console.error('Error in handleGoalDetails:', error);
      return bot.sendMessage(
        chatId,
        "Desculpe, ocorreu um erro ao exibir os detalhes da meta. Por favor, tente novamente.",
        { parse_mode: 'Markdown' }
      );
    }
  }


  /**
 * Manipula callbacks relacionados a metas financeiras
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} callbackQuery - Objeto de callback do Telegram
 */
async function handleGoalCallbacks(bot, callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const { id: telegramId } = callbackQuery.from;
    const data = callbackQuery.data;
  
    try {
      // Obter usuário e configurações
      const user = await supabaseService.getOrCreateUser(
        telegramId, 
        callbackQuery.from.first_name, 
        callbackQuery.from.last_name, 
        callbackQuery.from.username
      );
      const userConfig = await userConfigService.getUserConfig(user.id);
  
      // Parsear os dados do callback
      const [action, goalId] = data.split(':');
  
      if (!goalId) {
        return bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Erro: Identificador da meta não encontrado',
          show_alert: true
        });
      }
  
      // Verificar se a meta existe e pertence ao usuário
      const goal = await goalService.getGoalById(goalId, user.id);
      if (!goal) {
        return bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Esta meta não foi encontrada ou não pertence a você.',
          show_alert: true
        });
      }
  
      switch (action) {
        case 'goal_add': {
          // Adicionar valor à meta
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Informe o valor a adicionar'
          });
  
          // Configurar estado para esperar o valor
          userStates.set(telegramId, {
            state: 'awaiting_goal_contribution',
            userId: user.id,
            goalId: goalId
          });
  
          await bot.sendMessage(
            chatId,
            `Quanto você quer adicionar à meta "${goal.title}"? Digite apenas o valor numérico.`,
            { parse_mode: 'Markdown' }
          );
          break;
        }
  
        case 'goal_toggle': {
          // Alternar status da meta (concluída/não concluída)
          const newStatus = !goal.completed;
  
          await goalService.updateGoal(goalId, user.id, {
            completed: newStatus
          });
  
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: newStatus ? 'Meta marcada como concluída! 🎉' : 'Meta reaberta para contribuições'
          });
  
          // Atualizar a mensagem original
          const stats = await goalService.getGoalStatistics(goalId, user.id);
          const updatedGoal = await goalService.getGoalById(goalId, user.id);
  
          const updatedMessage = personalityService.getResponse(
            userConfig.personality,
            'goalQuerySingle',
            updatedGoal,
            stats
          );
  
          // Botões atualizados
          const goalActionKeyboard = {
            reply_markup: {
              inline_keyboard: [
                [
                  { 
                    text: 'Adicionar valor', 
                    callback_data: `goal_add:${goalId}` 
                  },
                  { 
                    text: updatedGoal.completed ? 'Reabrir meta' : 'Marcar concluída', 
                    callback_data: `goal_toggle:${goalId}` 
                  }
                ],
                [
                  { 
                    text: 'Criar lembrete', 
                    callback_data: `goal_reminder:${goalId}` 
                  },
                  { 
                    text: 'Excluir meta', 
                    callback_data: `goal_delete:${goalId}` 
                  }
                ]
              ]
            }
          };
  
          await bot.editMessageText(
            updatedMessage,
            {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id,
              parse_mode: 'Markdown',
              ...goalActionKeyboard
            }
          );
          break;
        }
  
        case 'goal_reminder': {
          // Criar lembrete para a meta
          await bot.answerCallbackQuery(callbackQuery.id);
  
          const reminderOptions = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Diário', callback_data: `goal_reminder_daily:${goalId}` },
                  { text: 'Semanal', callback_data: `goal_reminder_weekly:${goalId}` },
                  { text: 'Mensal', callback_data: `goal_reminder_monthly:${goalId}` }
                ]
              ]
            }
          };
  
          await bot.sendMessage(
            chatId,
            `Com qual frequência você deseja receber lembretes para a meta "${goal.title}"?`,
            reminderOptions
          );
          break;
        }
  
        case 'goal_reminder_daily':
        case 'goal_reminder_weekly':
        case 'goal_reminder_monthly': {
          // Processar frequência de lembrete
          const frequency = action.split('_')[2]; // daily, weekly, monthly
  
          await createGoalReminder(bot, callbackQuery.message, goalId, frequency, user, userConfig);
          
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: `Lembrete ${frequency} criado com sucesso!`
          });
          break;
        }
  
        case 'goal_delete': {
          // Confirmar exclusão da meta
          await bot.answerCallbackQuery(callbackQuery.id);
  
          const deleteConfirmKeyboard = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Sim, excluir', callback_data: `goal_delete_confirm:${goalId}` },
                  { text: 'Não, cancelar', callback_data: `goal_delete_cancel:${goalId}` }
                ]
              ]
            }
          };
  
          await bot.sendMessage(
            chatId,
            `Tem certeza que deseja excluir a meta "${goal.title}"? Esta ação não pode ser desfeita.`,
            deleteConfirmKeyboard
          );
          break;
        }
  
        case 'goal_delete_confirm': {
          // Excluir a meta definitivamente
          await goalService.deleteGoal(goalId, user.id);
  
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Meta excluída com sucesso'
          });
  
          await bot.sendMessage(
            chatId,
            `A meta "${goal.title}" foi excluída permanentemente.`,
            { parse_mode: 'Markdown' }
          );
          break;
        }
  
        case 'goal_delete_cancel': {
          // Cancelar a exclusão da meta
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Operação cancelada'
          });
          
          await bot.sendMessage(
            chatId,
            `A exclusão da meta "${goal.title}" foi cancelada.`,
            { parse_mode: 'Markdown' }
          );
          break;
        }
  
        default:
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Ação não reconhecida'
          });
          break;
      }
    } catch (error) {
      console.error('Error in handleGoalCallbacks:', error);
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Ocorreu um erro ao processar sua solicitação',
        show_alert: true
      });
      
      await bot.sendMessage(
        chatId,
        "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.",
        { parse_mode: 'Markdown' }
      );
    }
  }


// Exportar funções
module.exports = {
    handleGoalMessage,
    handleGoalsCommand,
    handleNewGoalCommand,
    handleGoalDetails,
    handleGoalCallbacks,
    createGoalReminder,
    setBotInstance
};