/**
 * services/recurringExpenseService.js
 * Serviço para gerenciar despesas recorrentes
 */

const { supabase } = require('./supabase');
const moment = require('moment');

module.exports = {
  /**
   * Cria uma nova despesa recorrente
   * @param {number} userId - ID do usuário
   * @param {string} name - Nome da despesa (ex: "Aluguel", "Netflix")
   * @param {number} amount - Valor da despesa
   * @param {number} dueDay - Dia do mês de vencimento [1-31]
   * @param {number} categoryId - ID da categoria (opcional)
   * @param {boolean} isVariable - Se o valor varia mensalmente
   * @returns {Promise<Object>} A despesa recorrente criada
   */
  async createRecurringExpense(userId, name, amount, dueDay, categoryId = null, isVariable = false) {
    try {
      console.log(`Criando despesa recorrente para o usuário ${userId}: "${name}" no valor de ${amount}`);
      
      // Normalizar o dia de vencimento para ser um valor entre 1-31
      const normalizedDueDay = Math.max(1, Math.min(31, parseInt(dueDay) || 1));
      
      // Calcular a próxima data de vencimento
      const nextDueDate = calculateNextDueDate(normalizedDueDay);
      
      // Criar a despesa recorrente
      const { data, error } = await supabase
        .from('recurring_expenses')
        .insert({
          user_id: userId,
          name: name,
          amount: amount,
          due_day: normalizedDueDay,
          category_id: categoryId,
          is_variable: isVariable,
          next_due_date: nextDueDate
        })
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao criar despesa recorrente:', error);
        throw error;
      }
      
      console.log(`Despesa recorrente criada com sucesso: ID ${data.id}`);
      return data;
    } catch (error) {
      console.error('Erro no createRecurringExpense:', error);
      throw error;
    }
  },
  
  /**
   * Obtém todas as despesas recorrentes de um usuário
   * @param {number} userId - ID do usuário
   * @param {boolean} includeInactive - Se deve incluir despesas inativas
   * @returns {Promise<Array>} Lista de despesas recorrentes
   */
  async getUserRecurringExpenses(userId, includeInactive = false) {
    try {
      let query = supabase
        .from('recurring_expenses')
        .select(`
          *,
          categories:category_id (
            name,
            icon
          )
        `)
        .eq('user_id', userId)
        .order('due_day', { ascending: true });
      
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Erro ao buscar despesas recorrentes:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getUserRecurringExpenses:', error);
      throw error;
    }
  },
  
  /**
   * Obtém uma despesa recorrente específica por ID
   * @param {number} expenseId - ID da despesa recorrente
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<Object>} A despesa recorrente
   */
  async getRecurringExpenseById(expenseId, userId) {
    try {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select(`
          *,
          categories:category_id (
            name,
            icon
          )
        `)
        .eq('id', expenseId)
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error('Erro ao buscar despesa recorrente:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getRecurringExpenseById:', error);
      throw error;
    }
  },
  
  /**
   * Atualiza uma despesa recorrente existente
   * @param {number} expenseId - ID da despesa recorrente
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @param {Object} updates - Campos a serem atualizados
   * @returns {Promise<Object>} A despesa recorrente atualizada
   */
  async updateRecurringExpense(expenseId, userId, updates) {
    try {
      // Se estiver atualizando o dia de vencimento, recalcular próxima data de vencimento
      if (updates.due_day) {
        updates.next_due_date = calculateNextDueDate(updates.due_day);
      }
      
      const { data, error } = await supabase
        .from('recurring_expenses')
        .update(updates)
        .eq('id', expenseId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao atualizar despesa recorrente:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no updateRecurringExpense:', error);
      throw error;
    }
  },
  
  /**
   * Marca uma despesa recorrente como paga
   * @param {number} expenseId - ID da despesa recorrente
   * @param {number} userId - ID do usuário
   * @param {number} amount - Valor pago (opcional, se diferente do esperado)
   * @param {Date} paidDate - Data de pagamento (opcional, padrão é data atual)
   * @param {boolean} createTransaction - Se deve criar uma transação de despesa
   * @returns {Promise<Object>} A despesa recorrente atualizada
   */
  async markRecurringExpenseAsPaid(expenseId, userId, amount = null, paidDate = new Date(), createTransaction = true) {
    try {
      const expense = await this.getRecurringExpenseById(expenseId, userId);
      
      if (!expense) {
        throw new Error('Despesa recorrente não encontrada');
      }
      
      // Converter a data para ISO string
      const paidDateISO = paidDate instanceof Date 
        ? paidDate.toISOString() 
        : new Date(paidDate).toISOString();
      
      // Calcular a próxima data de vencimento
      const nextDueDate = calculateNextDueDate(expense.due_day, paidDate);
      
      // Preparar atualizações
      const updates = {
        last_paid_date: paidDateISO,
        next_due_date: nextDueDate
      };
      
      // Se foi informado um valor diferente e a despesa tem valor variável
      if (amount !== null && expense.is_variable) {
        updates.amount = amount;
      }
      
      // Atualizar a despesa recorrente
      const updatedExpense = await this.updateRecurringExpense(expenseId, userId, updates);
      
      // Registrar a transação se solicitado
      if (createTransaction) {
        const finalAmount = amount !== null ? amount : expense.amount;
        
        // Importar o serviço dentro da função para evitar dependência circular
        const supabaseService = require('./supabase');
        
        await supabaseService.createTransaction(
          userId,
          expense.category_id,
          finalAmount,
          `${expense.name} (Despesa recorrente)`,
          'expense',
          paidDate
        );
      }
      
      return updatedExpense;
    } catch (error) {
      console.error('Erro no markRecurringExpenseAsPaid:', error);
      throw error;
    }
  },
  
  /**
   * Ativa ou desativa uma despesa recorrente
   * @param {number} expenseId - ID da despesa recorrente
   * @param {number} userId - ID do usuário
   * @param {boolean} isActive - Status de ativação
   * @returns {Promise<Object>} A despesa recorrente atualizada
   */
  async toggleRecurringExpenseStatus(expenseId, userId, isActive) {
    try {
      return await this.updateRecurringExpense(expenseId, userId, {
        is_active: isActive
      });
    } catch (error) {
      console.error('Erro no toggleRecurringExpenseStatus:', error);
      throw error;
    }
  },
  
  /**
   * Exclui uma despesa recorrente
   * @param {number} expenseId - ID da despesa recorrente
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<boolean>} Sucesso da exclusão
   */
  async deleteRecurringExpense(expenseId, userId) {
    try {
      const { error } = await supabase
        .from('recurring_expenses')
        .delete()
        .eq('id', expenseId)
        .eq('user_id', userId);
      
      if (error) {
        console.error('Erro ao excluir despesa recorrente:', error);
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('Erro no deleteRecurringExpense:', error);
      throw error;
    }
  },
  
  /**
   * Obtém as despesas recorrentes próximas do vencimento
   * @param {number} daysAhead - Número de dias à frente para verificar
   * @returns {Promise<Array>} Lista de despesas próximas do vencimento
   */
  async getUpcomingRecurringExpenses(daysAhead = 3) {
    try {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select(`
          *,
          categories:category_id (
            name,
            icon
          ),
          users!recurring_expenses_user_id_fkey (
            id,
            telegram_id,
            first_name
          )
        `)
        .gte('next_due_date', now.toISOString())
        .lte('next_due_date', futureDate.toISOString())
        .eq('is_active', true);
      
      if (error) {
        console.error('Erro ao buscar despesas próximas do vencimento:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getUpcomingRecurringExpenses:', error);
      throw error;
    }
  },
  
  /**
   * Atualiza as datas de vencimento para despesas não pagas
   */
  async updateDueDates() {
    try {
      // Buscar todas as despesas recorrentes onde a data de vencimento já passou
      const { data: expenses, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .lt('next_due_date', new Date().toISOString())
        .eq('is_active', true);
      
      if (error) {
        console.error('Erro ao buscar despesas para atualização:', error);
        throw error;
      }
      
      // Atualizar cada despesa com a próxima data de vencimento
      for (const expense of expenses) {
        const nextDueDate = calculateNextDueDate(expense.due_day);
        
        await supabase
          .from('recurring_expenses')
          .update({
            next_due_date: nextDueDate
          })
          .eq('id', expense.id);
      }
      
      return true;
    } catch (error) {
      console.error('Erro no updateDueDates:', error);
      throw error;
    }
  }
};

/**
 * Calcula a próxima data de vencimento
 * @param {number} dueDay - Dia do mês de vencimento [1-31]
 * @param {Date|string} referenceDate - Data de referência (opcional)
 * @returns {string} Próxima data de vencimento em formato ISO
 */
function calculateNextDueDate(dueDay, referenceDate = null) {
  // Normalizar o dia de vencimento
  const normalizedDueDay = Math.max(1, Math.min(31, parseInt(dueDay) || 1));
  
  // Usar data atual como referência se não informada
  const now = referenceDate ? moment(referenceDate) : moment();
  
  // Determinar o mês e ano a ser usado
  let targetMonth = now.month();
  let targetYear = now.year();
  
  // Se o dia de vencimento já passou neste mês, avançar para o próximo mês
  if (now.date() > normalizedDueDay) {
    targetMonth += 1;
    
    // Verificar se ultrapassou dezembro
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }
  
  // Criar a próxima data de vencimento
  let nextDueDate = moment({ year: targetYear, month: targetMonth, day: normalizedDueDay });
  
  // Verificar se o dia é válido para o mês (ex: 31 de fevereiro não existe)
  if (nextDueDate.month() !== targetMonth) {
    // Se o dia não é válido para o mês, usar o último dia do mês
    nextDueDate = moment({ year: targetYear, month: targetMonth }).endOf('month');
  }
  
  // Garantir que a data é futura
  if (nextDueDate.isSameOrBefore(now)) {
    nextDueDate = moment(now).add(1, 'month').date(normalizedDueDay);
    
    // Verificar novamente se o dia é válido para o mês
    if (nextDueDate.month() !== now.month() + 1 % 12) {
      nextDueDate = moment({ year: now.year(), month: now.month() }).add(1, 'month').endOf('month');
    }
  }
  
  // Retornar em formato ISO
  return nextDueDate.toISOString();
}