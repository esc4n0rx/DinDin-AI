/**
 * handlers/incomeConfigHandler.js
 * Gerencia o fluxo de configuração de receitas recorrentes e despesas fixas
 */

const incomeSourceService = require('../services/incomeSourceService');
const recurringExpenseService = require('../services/recurringExpenseService');
const userConfigService = require('../services/userConfig');
const supabaseService = require('../services/supabase');
const personalityService = require('../services/personalityResponses');
const moment = require('moment');
const numeral = require('numeral');

// Armazenar os estados de configuração dos usuários
const incomeConfigStates = new Map();

// Formatar valor monetário
const formatCurrency = (value) => {
  return `R$ ${numeral(value).format('0,0.00')}`;
};

/**
 * Verifica se um usuário está no fluxo de configuração de receitas
 * @param {string|number} telegramId - ID do usuário no Telegram
 * @returns {boolean} - Se o usuário está no fluxo de configuração
 */
function isUserInIncomeConfigFlow(telegramId) {
  return incomeConfigStates.has(telegramId);
}

/**
 * Inicia o fluxo de configuração de receitas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {boolean} afterPersonality - Se está sendo chamado após a configuração de personalidade
 */
async function startIncomeConfigFlow(bot, msg, afterPersonality = false) {
  const { id: telegramId, first_name } = msg.from;
  const chatId = msg.chat.id;

  try {
    console.log(`Iniciando configuração de receitas para usuário ${telegramId}`);

    // Obter usuário e configurações
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username);
    const userConfig = await userConfigService.getUserConfig(user.id);

    // Inicializar o estado de configuração
    incomeConfigStates.set(telegramId, {
      userId: user.id,
      state: 'initial',
      hasIncome: null,
      incomeName: null,
      incomeAmount: null,
      incomeFrequency: null,
      incomeDays: [],
      step: 0
    });

    let message;
    if (afterPersonality) {
      // Se veio da configuração de personalidade, adaptar a mensagem
      message = "Agora, vamos configurar suas finanças! Isso vai me ajudar a monitorar seu dinheiro.\n\nVocê recebe alguma renda mensal regular (como salário)?";
    } else {
      message = "Vamos configurar suas receitas regulares. Isso vai me ajudar a monitorar seu dinheiro e te lembrar quando o pagamento chegar.\n\nVocê recebe alguma renda mensal regular (como salário)?";
    }

    const keyboard = {
      reply_markup: {
        keyboard: [
          [{ text: 'Sim, recebo regularmente' }],
          [{ text: 'Não, minha renda é variável' }]
        ],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    };

    await bot.sendMessage(chatId, message, keyboard);

  } catch (error) {
    console.error('Erro no startIncomeConfigFlow:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao iniciar a configuração de receitas. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
    incomeConfigStates.delete(telegramId);
  }
}

/**
 * Processa as mensagens no fluxo de configuração de receitas
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @returns {boolean} - Se a mensagem foi processada pelo fluxo
 */
async function handleIncomeConfigMessage(bot, msg) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  const text = msg.text;

  // Verificar se o usuário está no fluxo de configuração
  if (!isUserInIncomeConfigFlow(telegramId)) {
    return false;
  }

  console.log(`Processando mensagem do fluxo de configuração: "${text}" de ${telegramId}`);

  try {
    // Obter o estado atual do usuário
    const state = incomeConfigStates.get(telegramId);
    
    // Verificar se o estado existe
    if (!state) {
      return false;
    }

    // Processar a mensagem de acordo com o estado atual
    switch (state.state) {
      case 'initial':
        // Resposta se recebe renda regular
        if (text.toLowerCase().includes('sim')) {
          state.hasIncome = true;
          state.state = 'awaiting_income_name';
          
          await bot.sendMessage(
            chatId,
            "Ótimo! Como podemos chamar essa fonte de renda? (Ex: Salário, Freelance mensal, etc)",
            { parse_mode: 'Markdown' }
          );
        } else if (text.toLowerCase().includes('não') || text.toLowerCase().includes('nao')) {
          state.hasIncome = false;
          
          // Finalizar o fluxo de configuração
          await bot.sendMessage(
            chatId,
            "Entendi que sua renda é variável. Você pode registrar suas receitas conforme recebê-las!\n\nPara registrar uma receita, basta me dizer algo como 'Recebi 500 reais de freelance'.",
            { parse_mode: 'Markdown' }
          );
          
          // Finalizar o fluxo de configuração
          incomeConfigStates.delete(telegramId);
          
          // Perguntar se quer configurar despesas recorrentes
          await askAboutRecurringExpenses(bot, msg);
          
          return true;
        } else {
          await bot.sendMessage(
            chatId,
            "Por favor, responda se você recebe alguma renda regular (sim ou não).",
            { parse_mode: 'Markdown' }
          );
        }
        break;

      case 'awaiting_income_name':
        // Salvar o nome da fonte de renda
        state.incomeName = text.trim();
        state.state = 'awaiting_income_amount';
        
        await bot.sendMessage(
          chatId,
          `Ótimo! Quanto você recebe de ${state.incomeName} normalmente? (Digite apenas o valor numérico, ex: 2500)`,
          { parse_mode: 'Markdown' }
        );
        break;

      case 'awaiting_income_amount':
        // Processar o valor da renda
        try {
          const amount = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
          
          if (isNaN(amount) || amount <= 0) {
            await bot.sendMessage(
              chatId,
              "Por favor, informe um valor numérico válido maior que zero.",
              { parse_mode: 'Markdown' }
            );
            return true;
          }
          
          state.incomeAmount = amount;
          state.state = 'awaiting_income_frequency';
          
          // Perguntar sobre a frequência
          const keyboard = {
            reply_markup: {
              keyboard: [
                [{ text: 'Mensal (um dia fixo)' }],
                [{ text: 'Quinzenal (dois dias no mês)' }],
                [{ text: 'Semanal' }]
              ],
              one_time_keyboard: true,
              resize_keyboard: true
            }
          };
          
          await bot.sendMessage(
            chatId,
            `Com qual frequência você recebe ${state.incomeName}?`,
            keyboard
          );
        } catch (error) {
          await bot.sendMessage(
            chatId,
            "Ocorreu um erro ao processar o valor. Por favor, informe apenas números (ex: 2500).",
            { parse_mode: 'Markdown' }
          );
        }
        break;

      case 'awaiting_income_frequency':
        // Processar a frequência da renda
        if (text.toLowerCase().includes('mensal')) {
          state.incomeFrequency = 'monthly';
          state.state = 'awaiting_income_days_monthly';
          
          await bot.sendMessage(
            chatId,
            `Em qual dia do mês você costuma receber ${state.incomeName}? (Digite apenas o número do dia, ex: 5 para dia 5)`,
            { parse_mode: 'Markdown' }
          );
        } else if (text.toLowerCase().includes('quinzenal')) {
          state.incomeFrequency = 'biweekly';
          state.state = 'awaiting_income_days_biweekly_first';
          
          await bot.sendMessage(
            chatId,
            `Qual é o primeiro dia do mês em que você recebe ${state.incomeName}? (Digite apenas o número do dia, ex: 15 para dia 15)`,
            { parse_mode: 'Markdown' }
          );
        } else if (text.toLowerCase().includes('semanal')) {
          state.incomeFrequency = 'weekly';
          state.state = 'awaiting_income_days_weekly';
          
          const keyboard = {
            reply_markup: {
              keyboard: [
                [{ text: 'Segunda-feira' }, { text: 'Terça-feira' }],
                [{ text: 'Quarta-feira' }, { text: 'Quinta-feira' }],
                [{ text: 'Sexta-feira' }, { text: 'Sábado/Domingo' }]
              ],
              one_time_keyboard: true,
              resize_keyboard: true
            }
          };
          
          await bot.sendMessage(
            chatId,
            `Em qual dia da semana você costuma receber ${state.incomeName}?`,
            keyboard
          );
        } else {
          await bot.sendMessage(
            chatId,
            "Por favor, escolha uma das opções de frequência disponíveis: Mensal, Quinzenal ou Semanal.",
            { parse_mode: 'Markdown' }
          );
        }
        break;

      case 'awaiting_income_days_monthly':
        // Processar o dia do mês
        try {
          const day = parseInt(text.trim());
          
          if (isNaN(day) || day < 1 || day > 31) {
            await bot.sendMessage(
              chatId,
              "Por favor, informe um dia válido entre 1 e 31.",
              { parse_mode: 'Markdown' }
            );
            return true;
          }
          
          state.incomeDays = [day];
          
          // Salvar a fonte de renda
          await saveIncomeSource(bot, msg, state);
        } catch (error) {
          await bot.sendMessage(
            chatId,
            "Ocorreu um erro ao processar o dia. Por favor, informe apenas o número do dia (ex: 5).",
            { parse_mode: 'Markdown' }
          );
        }
        break;

      case 'awaiting_income_days_biweekly_first':
        // Processar o primeiro dia quinzenal
        try {
          const day = parseInt(text.trim());
          
          if (isNaN(day) || day < 1 || day > 31) {
            await bot.sendMessage(
              chatId,
              "Por favor, informe um dia válido entre 1 e 31.",
              { parse_mode: 'Markdown' }
            );
            return true;
          }
          
          state.incomeDays = [day];
          state.state = 'awaiting_income_days_biweekly_second';
          
          await bot.sendMessage(
            chatId,
            `Qual é o segundo dia do mês em que você recebe ${state.incomeName}? (Digite apenas o número do dia)`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          await bot.sendMessage(
            chatId,
            "Ocorreu um erro ao processar o dia. Por favor, informe apenas o número do dia (ex: 15).",
            { parse_mode: 'Markdown' }
          );
        }
        break;

      case 'awaiting_income_days_biweekly_second':
        // Processar o segundo dia quinzenal
        try {
          const day = parseInt(text.trim());
          
          if (isNaN(day) || day < 1 || day > 31) {
            await bot.sendMessage(
              chatId,
              "Por favor, informe um dia válido entre 1 e 31.",
              { parse_mode: 'Markdown' }
            );
            return true;
          }
          
          state.incomeDays.push(day);
          
          // Salvar a fonte de renda
          await saveIncomeSource(bot, msg, state);
        } catch (error) {
          await bot.sendMessage(
            chatId,
            "Ocorreu um erro ao processar o dia. Por favor, informe apenas o número do dia (ex: 30).",
            { parse_mode: 'Markdown' }
          );
        }
        break;

      case 'awaiting_income_days_weekly':
        // Processar o dia da semana
        let dayOfWeek;
        
        if (text.toLowerCase().includes('segunda')) {
          dayOfWeek = 1; // Segunda-feira
        } else if (text.toLowerCase().includes('terça') || text.toLowerCase().includes('terca')) {
          dayOfWeek = 2; // Terça-feira
        } else if (text.toLowerCase().includes('quarta')) {
          dayOfWeek = 3; // Quarta-feira
        } else if (text.toLowerCase().includes('quinta')) {
          dayOfWeek = 4; // Quinta-feira
        } else if (text.toLowerCase().includes('sexta')) {
          dayOfWeek = 5; // Sexta-feira
        } else if (text.toLowerCase().includes('sábado') || text.toLowerCase().includes('sabado') || text.toLowerCase().includes('domingo')) {
          dayOfWeek = text.toLowerCase().includes('sábado') || text.toLowerCase().includes('sabado') ? 6 : 0; // Sábado ou Domingo
        } else {
          await bot.sendMessage(
            chatId,
            "Por favor, escolha um dia da semana válido.",
            { parse_mode: 'Markdown' }
          );
          return true;
        }
        
        state.incomeDays = [dayOfWeek];
        
        // Salvar a fonte de renda
        await saveIncomeSource(bot, msg, state);
        break;

      default:
        // Estado desconhecido, reiniciar o fluxo
        console.log(`Estado desconhecido: ${state.state}`);
        incomeConfigStates.delete(telegramId);
        return false;
    }

    return true;
  } catch (error) {
    console.error('Erro no handleIncomeConfigMessage:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
    incomeConfigStates.delete(telegramId);
    return true;
  }
}

/**
 * Salva a fonte de renda e continua o fluxo
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} state - Estado atual do usuário
 */
async function saveIncomeSource(bot, msg, state) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    // Criar a fonte de renda no banco de dados
    const incomeSource = await incomeSourceService.createIncomeSource(
      state.userId,
      state.incomeName,
      state.incomeAmount,
      state.incomeFrequency,
      state.incomeDays,
      false // Não é variável
    );
    
    // Formatar a mensagem de confirmação
    let confirmationMessage = `✅ Fonte de renda configurada com sucesso!\n\n`;
    confirmationMessage += `*${state.incomeName}*: ${formatCurrency(state.incomeAmount)}\n`;
    
    // Adicionar mensagem específica de acordo com a frequência
    if (state.incomeFrequency === 'monthly') {
      confirmationMessage += `📅 Recebimento: Todo dia ${state.incomeDays[0]} do mês\n`;
    } else if (state.incomeFrequency === 'biweekly') {
      confirmationMessage += `📅 Recebimento: Dias ${state.incomeDays[0]} e ${state.incomeDays[1]} do mês\n`;
    } else if (state.incomeFrequency === 'weekly') {
      const weekDays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      confirmationMessage += `📅 Recebimento: Toda ${weekDays[state.incomeDays[0]]}\n`;
    }
    
    confirmationMessage += `\nVou te avisar na data esperada de recebimento para confirmar. 📝`;
    
    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' });
    
    // Perguntar se quer adicionar outra fonte de renda
    const keyboard = {
      reply_markup: {
        keyboard: [
          [{ text: 'Sim, adicionar outra fonte de renda' }],
          [{ text: 'Não, continuar com despesas recorrentes' }]
        ],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    };
    
    await bot.sendMessage(
      chatId,
      "Você gostaria de adicionar outra fonte de renda recorrente?",
      keyboard
    );
    
    // Atualizar o estado
    state.state = 'awaiting_add_another';
    
  } catch (error) {
    console.error('Erro no saveIncomeSource:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao salvar sua fonte de renda. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
    incomeConfigStates.delete(telegramId);
  }
}

/**
 * Pergunta ao usuário se deseja configurar despesas recorrentes
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function askAboutRecurringExpenses(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    const keyboard = {
      reply_markup: {
        keyboard: [
          [{ text: 'Sim, configurar despesas recorrentes' }],
          [{ text: 'Não, terminar configuração' }]
        ],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    };
    
    await bot.sendMessage(
      chatId,
      "Agora, você gostaria de configurar despesas recorrentes (como aluguel, assinaturas, etc)?",
      keyboard
    );
    
    // Atualizar o estado para aguardar resposta sobre despesas
    const { id: telegramId } = msg.from;
    const state = incomeConfigStates.get(telegramId) || {
      userId: (await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username)).id,
      state: 'awaiting_expenses_decision'
    };
    
    state.state = 'awaiting_expenses_decision';
    incomeConfigStates.set(telegramId, state);
    
  } catch (error) {
    console.error('Erro no askAboutRecurringExpenses:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro. Você pode configurar despesas recorrentes mais tarde usando o comando /configurar_despesas.",
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Inicia o fluxo de configuração de despesas recorrentes
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 */
async function startExpensesConfigFlow(bot, msg) {
  const { id: telegramId, first_name } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    console.log(`Iniciando configuração de despesas para usuário ${telegramId}`);
    
    // Obter usuário e configurações
    const user = await supabaseService.getOrCreateUser(telegramId, first_name, msg.from.last_name, msg.from.username);
    
    // Inicializar ou atualizar o estado de configuração
    const state = incomeConfigStates.get(telegramId) || { userId: user.id };
    state.state = 'awaiting_expense_name';
    state.expenseName = null;
    state.expenseAmount = null;
    state.expenseDueDay = null;
    state.expenseCategory = null;
    incomeConfigStates.set(telegramId, state);
    
    await bot.sendMessage(
      chatId,
      "Vamos configurar uma despesa recorrente. Qual é o nome desta despesa? (Ex: Aluguel, Netflix, Academia)",
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Erro no startExpensesConfigFlow:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao iniciar a configuração de despesas. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
    incomeConfigStates.delete(telegramId);
  }
}

/**
 * Processa mensagens relacionadas à configuração de despesas recorrentes
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @returns {boolean} - Se a mensagem foi processada pelo fluxo
 */
async function handleExpensesConfigMessage(bot, msg) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Verificar se o usuário está no fluxo de configuração
  if (!isUserInIncomeConfigFlow(telegramId)) {
    return false;
  }
  
  // Obter o estado atual do usuário
  const state = incomeConfigStates.get(telegramId);
  
  // Verificar se o estado existe e é relacionado à configuração de despesas
  if (!state || !state.state.includes('expense')) {
    return false;
  }
  
  console.log(`Processando mensagem de configuração de despesa: "${text}" de ${telegramId}`);
  
  try {
    switch (state.state) {
      case 'awaiting_expense_name':
        // Salvar o nome da despesa
        state.expenseName = text.trim();
        state.state = 'awaiting_expense_amount';
        
        await bot.sendMessage(
          chatId,
          `Qual é o valor mensal de ${state.expenseName}? (Digite apenas o valor numérico, ex: 150)`,
          { parse_mode: 'Markdown' }
        );
        break;
        
      case 'awaiting_expense_amount':
        // Processar o valor da despesa
        try {
          const amount = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
          
          if (isNaN(amount) || amount <= 0) {
            await bot.sendMessage(
              chatId,
              "Por favor, informe um valor numérico válido maior que zero.",
              { parse_mode: 'Markdown' }
            );
            return true;
          }
          
          state.expenseAmount = amount;
          state.state = 'awaiting_expense_due_day';
          
          await bot.sendMessage(
            chatId,
            `Em qual dia do mês você costuma pagar ${state.expenseName}? (Digite apenas o número do dia, ex: 10 para dia 10)`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          await bot.sendMessage(
            chatId,
            "Ocorreu um erro ao processar o valor. Por favor, informe apenas números (ex: 150).",
            { parse_mode: 'Markdown' }
          );
        }
        break;
        
      case 'awaiting_expense_due_day':
        // Processar o dia de vencimento
        try {
          const day = parseInt(text.trim());
          
          if (isNaN(day) || day < 1 || day > 31) {
            await bot.sendMessage(
              chatId,
              "Por favor, informe um dia válido entre 1 e 31.",
              { parse_mode: 'Markdown' }
            );
            return true;
          }
          
          state.expenseDueDay = day;
          state.state = 'awaiting_expense_category';
          
          // Obter categorias de despesa para o teclado
          const categories = await supabaseService.getCategories();
          const expenseCategories = categories.filter(cat => cat.type === 'expense');
          
          // Criar teclado com categorias
          const keyboard = {
            reply_markup: {
              keyboard: [
                ...expenseCategories.reduce((rows, category, index) => {
                  if (index % 2 === 0) {
                    rows.push([{ text: `${category.icon} ${category.name}` }]);
                  } else {
                    rows[rows.length - 1].push({ text: `${category.icon} ${category.name}` });
                  }
                  return rows;
                }, []),
                [{ text: '⏭️ Pular seleção de categoria' }]
              ],
              one_time_keyboard: true,
              resize_keyboard: true
            }
          };
          
          await bot.sendMessage(
            chatId,
            `Em qual categoria ${state.expenseName} se encaixa?`,
            keyboard
          );
        } catch (error) {
          await bot.sendMessage(
            chatId,
            "Ocorreu um erro ao processar o dia. Por favor, informe apenas o número do dia (ex: 10).",
            { parse_mode: 'Markdown' }
          );
        }
        break;
        
      case 'awaiting_expense_category':
        // Processar a categoria
        if (text.includes('Pular seleção')) {
          state.expenseCategory = null;
        } else {
          // Extrair o nome da categoria (removendo o emoji)
          const categoryName = text.trim().replace(/^[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}]+ /u, '');
          
          // Buscar a categoria pelo nome
          const categories = await supabaseService.getCategories();
          const category = categories.find(cat => cat.name === categoryName && cat.type === 'expense');
          
          state.expenseCategory = category ? category.id : null;
        }
        
        // Salvar a despesa recorrente
        await saveRecurringExpense(bot, msg, state);
        break;
        
      default:
        // Estado desconhecido, não processar
        return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro no handleExpensesConfigMessage:', error);
    await bot.sendMessage(
      chatId,
      "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.",
      { parse_mode: 'Markdown' }
    );
    incomeConfigStates.delete(telegramId);
    return true;
  }
}

/**
 * Salva a despesa recorrente e continua o fluxo
 * @param {TelegramBot} bot - Instância do bot do Telegram
 * @param {Object} msg - Objeto da mensagem do Telegram
 * @param {Object} state - Estado atual do usuário
 */
async function saveRecurringExpense(bot, msg, state) {
  const { id: telegramId } = msg.from;
  const chatId = msg.chat.id;
  
  try {
    // Criar a despesa recorrente no banco de dados
    const expense = await recurringExpenseService.createRecurringExpense(
      state.userId,
      state.expenseName,
      state.expenseAmount,
      state.expenseDueDay,
      state.expenseCategory,
      false // Não é variável
    );
    
    // Formatar a mensagem de confirmação
    let confirmationMessage = `✅ Despesa recorrente configurada com sucesso!\n\n`;
    confirmationMessage += `*${state.expenseName}*: ${formatCurrency(state.expenseAmount)}\n`;
    confirmationMessage += `📅 Vencimento: Todo dia ${state.expenseDueDay} do mês\n`;
    
    // Adicionar categoria se disponível
    if (state.expenseCategory) {
      const categories = await supabaseService.getCategories();
      const category = categories.find(cat => cat.id === state.expenseCategory);
      
      if (category) {
        confirmationMessage += `📊 Categoria: ${category.icon} ${category.name}\n`;
      }
    }
    
    confirmationMessage += `\nVou te avisar próximo à data de vencimento para você não esquecer de pagar. 📝`;
    
    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' });
    
    // Perguntar se quer adicionar outra despesa recorrente
    const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: 'Sim, adicionar outra despesa' }],
            [{ text: 'Não, finalizar configuração' }]
          ],
          one_time_keyboard: true,
          resize_keyboard: true
        }
      };
      
      await bot.sendMessage(
        chatId,
        "Você gostaria de adicionar outra despesa recorrente?",
        keyboard
      );
      
      // Atualizar o estado
      state.state = 'awaiting_add_another_expense';
      
    } catch (error) {
      console.error('Erro no saveRecurringExpense:', error);
      await bot.sendMessage(
        chatId,
        "Desculpe, ocorreu um erro ao salvar sua despesa recorrente. Por favor, tente novamente mais tarde.",
        { parse_mode: 'Markdown' }
      );
      incomeConfigStates.delete(telegramId);
    }
  }
  
  /**
   * Processa decisões após salvar uma fonte de renda ou despesa recorrente
   * @param {TelegramBot} bot - Instância do bot do Telegram
   * @param {Object} msg - Objeto da mensagem do Telegram
   * @returns {boolean} - Se a mensagem foi processada pelo fluxo
   */
  async function handlePostSaveDecision(bot, msg) {
    const { id: telegramId } = msg.from;
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Verificar se o usuário está no fluxo de configuração
    if (!isUserInIncomeConfigFlow(telegramId)) {
      return false;
    }
    
    // Obter o estado atual do usuário
    const state = incomeConfigStates.get(telegramId);
    
    // Verificar se o estado existe e está em um estado de decisão pós-salvamento
    if (!state || !(state.state === 'awaiting_add_another' || 
                  state.state === 'awaiting_add_another_expense' || 
                  state.state === 'awaiting_expenses_decision')) {
      return false;
    }
    
    console.log(`Processando decisão pós-salvamento: "${text}" de ${telegramId}`);
    
    try {
      if (state.state === 'awaiting_add_another') {
        // Decisão após salvar uma fonte de renda
        if (text.toLowerCase().includes('sim')) {
          // Reiniciar o fluxo para adicionar outra fonte de renda
          state.state = 'awaiting_income_name';
          state.incomeName = null;
          state.incomeAmount = null;
          state.incomeFrequency = null;
          state.incomeDays = [];
          
          await bot.sendMessage(
            chatId,
            "Como podemos chamar essa nova fonte de renda? (Ex: Freelance, Aluguel recebido, etc)",
            { parse_mode: 'Markdown' }
          );
        } else {
          // Continuar para configuração de despesas
          await askAboutRecurringExpenses(bot, msg);
        }
        
        return true;
      } else if (state.state === 'awaiting_expenses_decision') {
        // Decisão se quer configurar despesas
        if (text.toLowerCase().includes('sim')) {
          // Iniciar fluxo de configuração de despesas
          await startExpensesConfigFlow(bot, msg);
        } else {
          // Finalizar toda a configuração
          await finishConfiguration(bot, msg);
        }
        
        return true;
      } else if (state.state === 'awaiting_add_another_expense') {
        // Decisão após salvar uma despesa recorrente
        if (text.toLowerCase().includes('sim')) {
          // Reiniciar o fluxo para adicionar outra despesa
          await startExpensesConfigFlow(bot, msg);
        } else {
          // Finalizar toda a configuração
          await finishConfiguration(bot, msg);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Erro no handlePostSaveDecision:', error);
      await bot.sendMessage(
        chatId,
        "Desculpe, ocorreu um erro ao processar sua escolha. Por favor, tente novamente mais tarde.",
        { parse_mode: 'Markdown' }
      );
      incomeConfigStates.delete(telegramId);
      return true;
    }
  }
  
  /**
   * Finaliza todo o fluxo de configuração
   * @param {TelegramBot} bot - Instância do bot do Telegram
   * @param {Object} msg - Objeto da mensagem do Telegram
   */
  async function finishConfiguration(bot, msg) {
    const { id: telegramId } = msg.from;
    const chatId = msg.chat.id;
    
    try {
      // Obter usuário e configurações
      const user = await supabaseService.getOrCreateUser(telegramId, msg.from.first_name, msg.from.last_name, msg.from.username);
      const userConfig = await userConfigService.getUserConfig(user.id);
      
      // Marcar configuração como completa
      await userConfigService.saveUserConfig(user.id, {
        ...userConfig,
        income_setup_completed: true
      });
      
      // Obter os dados configurados para resumo
      const incomeSources = await incomeSourceService.getUserIncomeSources(user.id);
      const recurringExpenses = await recurringExpenseService.getUserRecurringExpenses(user.id);
      
      // Criar mensagem de resumo
      let summaryMessage = "🎉 *Configuração financeira concluída!*\n\n";
      
      if (incomeSources.length > 0) {
        summaryMessage += "📈 *Fontes de Renda Configuradas:*\n";
        incomeSources.forEach(source => {
          summaryMessage += `- *${source.name}*: ${formatCurrency(source.amount)}\n`;
        });
        summaryMessage += "\n";
      }
      
      if (recurringExpenses.length > 0) {
        summaryMessage += "📉 *Despesas Recorrentes Configuradas:*\n";
        recurringExpenses.forEach(expense => {
          summaryMessage += `- *${expense.name}*: ${formatCurrency(expense.amount)} (Dia ${expense.due_day})\n`;
        });
        summaryMessage += "\n";
      }
      
      // Calcular balanço mensal estimado
      const totalIncome = incomeSources.reduce((sum, source) => sum + Number(source.amount), 0);
      const totalExpenses = recurringExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      const balance = totalIncome - totalExpenses;
      
      if (totalIncome > 0 || totalExpenses > 0) {
        summaryMessage += "💰 *Balanço Mensal Estimado:*\n";
        summaryMessage += `- Receitas: ${formatCurrency(totalIncome)}\n`;
        summaryMessage += `- Despesas: ${formatCurrency(totalExpenses)}\n`;
        summaryMessage += `- Saldo: ${formatCurrency(balance)}\n\n`;
      }
      
      // Adicionar dica personalizada baseada no balanço
      if (balance > 0) {
        summaryMessage += "✅ Seu balanço mensal é positivo! Considere destinar uma parte para economias ou investimentos.\n\n";
      } else if (balance < 0) {
        summaryMessage += "⚠️ Seu balanço mensal é negativo. Considere revisar suas despesas ou buscar aumentar sua renda.\n\n";
      }
      
      summaryMessage += "Você pode gerenciar suas fontes de renda e despesas recorrentes a qualquer momento usando os comandos:\n";
      summaryMessage += "- /renda - Gerenciar fontes de renda\n";
      summaryMessage += "- /despesas - Gerenciar despesas recorrentes\n\n";
      summaryMessage += "Agora estou pronto para te ajudar a acompanhar suas finanças! 🚀";
      
      await bot.sendMessage(chatId, summaryMessage, { parse_mode: 'Markdown' });
      
      // Limpar o estado
      incomeConfigStates.delete(telegramId);
      
      // Devolver ao teclado padrão
      const keyboard = {
        reply_markup: {
          remove_keyboard: true
        }
      };
      
      await bot.sendMessage(
        chatId,
        "Use os comandos ou simplesmente me conte sobre suas transações financeiras!",
        keyboard
      );
      
    } catch (error) {
      console.error('Erro no finishConfiguration:', error);
      await bot.sendMessage(
        chatId,
        "Desculpe, ocorreu um erro ao finalizar a configuração. Suas informações foram salvas, mas você pode revisá-las a qualquer momento com os comandos /renda e /despesas.",
        { parse_mode: 'Markdown' }
      );
      incomeConfigStates.delete(telegramId);
    }
  }
  
  module.exports = {
    startIncomeConfigFlow,
    handleIncomeConfigMessage,
    handleExpensesConfigMessage,
    handlePostSaveDecision,
    isUserInIncomeConfigFlow,
    startExpensesConfigFlow
  };