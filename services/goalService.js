/**
 * services/goalService.js
 * Serviço para gerenciar metas financeiras
 */

const { supabase } = require('./supabase');
const moment = require('moment');

/**
 * Serviço para gerenciar metas financeiras
 */
module.exports = {
  /**
   * Cria uma nova meta financeira
   * @param {number} userId - ID do usuário
   * @param {string} title - Título da meta
   * @param {number} targetAmount - Valor alvo da meta
   * @param {number} initialAmount - Valor inicial já economizado (opcional)
   * @param {Date|string} targetDate - Data alvo para completar a meta (opcional)
   * @param {number} categoryId - ID da categoria relacionada (opcional)
   * @returns {Promise<Object>} A meta criada
   */
  async createGoal(userId, title, targetAmount, initialAmount = 0, targetDate = null, categoryId = null) {
    try {
      console.log(`Criando meta para o usuário ${userId}: "${title}" no valor de ${targetAmount}`);
      
      // Formatar a data alvo se fornecida
      let formattedTargetDate = null;
      if (targetDate) {
        if (targetDate instanceof Date) {
          formattedTargetDate = targetDate.toISOString();
        } else if (typeof targetDate === 'string') {
          formattedTargetDate = new Date(targetDate).toISOString();
        }
      }
      
      // Criar a meta
      const { data, error } = await supabase
        .from('financial_goals')
        .insert({
          user_id: userId,
          title: title,
          target_amount: targetAmount,
          current_amount: initialAmount,
          target_date: formattedTargetDate,
          category_id: categoryId
        })
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao criar meta:', error);
        throw error;
      }
      
      // Se houver valor inicial, registrar como primeira contribuição
      if (initialAmount > 0) {
        await this.addContribution(data.id, initialAmount, 'Valor inicial');
      }
      
      console.log(`Meta criada com sucesso: ID ${data.id}`);
      return data;
    } catch (error) {
      console.error('Erro no createGoal:', error);
      throw error;
    }
  },
  
  /**
   * Adiciona uma contribuição a uma meta existente
   * @param {number} goalId - ID da meta
   * @param {number} amount - Valor da contribuição
   * @param {string} notes - Notas sobre a contribuição (opcional)
   * @returns {Promise<Object>} A contribuição criada
   */
  async addContribution(goalId, amount, notes = '') {
    try {
      // Verificar se a meta existe
      const { data: goal, error: goalError } = await supabase
        .from('financial_goals')
        .select('*')
        .eq('id', goalId)
        .single();
      
      if (goalError) {
        console.error('Erro ao buscar meta:', goalError);
        throw new Error('Meta não encontrada');
      }
      
      // Registrar contribuição
      const { data, error } = await supabase
        .from('goal_contributions')
        .insert({
          goal_id: goalId,
          amount: amount,
          notes: notes
        })
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao adicionar contribuição:', error);
        throw error;
      }
      
      // Buscar a meta atualizada após a contribuição
      const { data: updatedGoal, error: updateError } = await supabase
        .from('financial_goals')
        .select('*')
        .eq('id', goalId)
        .single();
        
      if (updateError) {
        console.error('Erro ao buscar meta atualizada:', updateError);
      }
      
      return {
        contribution: data,
        goal: updatedGoal || goal
      };
    } catch (error) {
      console.error('Erro no addContribution:', error);
      throw error;
    }
  },
  
  /**
   * Obtém todas as metas do usuário
   * @param {number} userId - ID do usuário
   * @param {boolean} includeCompleted - Se deve incluir metas concluídas
   * @returns {Promise<Array>} Lista de metas
   */
  async getUserGoals(userId, includeCompleted = true) {
    try {
      let query = supabase
        .from('financial_goals')
        .select(`
          *,
          categories:category_id (
            name,
            icon
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (!includeCompleted) {
        query = query.eq('completed', false);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Erro ao buscar metas:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getUserGoals:', error);
      throw error;
    }
  },
  
  /**
   * Obtém uma meta específica por ID
   * @param {number} goalId - ID da meta
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<Object>} A meta
   */
  async getGoalById(goalId, userId) {
    try {
      const { data, error } = await supabase
        .from('financial_goals')
        .select(`
          *,
          categories:category_id (
            name,
            icon
          ),
          contributions:goal_contributions (
            id,
            amount,
            contribution_date,
            notes
          )
        `)
        .eq('id', goalId)
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error('Erro ao buscar meta:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getGoalById:', error);
      throw error;
    }
  },
  
  /**
   * Atualiza uma meta existente
   * @param {number} goalId - ID da meta
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @param {Object} updates - Campos a serem atualizados
   * @returns {Promise<Object>} A meta atualizada
   */
  async updateGoal(goalId, userId, updates) {
    try {
      // Formatar a data alvo se fornecida
      if (updates.targetDate) {
        if (updates.targetDate instanceof Date) {
          updates.target_date = updates.targetDate.toISOString();
        } else if (typeof updates.targetDate === 'string') {
          updates.target_date = new Date(updates.targetDate).toISOString();
        }
        delete updates.targetDate;
      }
      
      // Mapear nomes de campos
      const mappedUpdates = {};
      if (updates.title) mappedUpdates.title = updates.title;
      if (updates.targetAmount) mappedUpdates.target_amount = updates.targetAmount;
      if (updates.target_date) mappedUpdates.target_date = updates.target_date;
      if (updates.categoryId) mappedUpdates.category_id = updates.categoryId;
      if ('completed' in updates) mappedUpdates.completed = updates.completed;
      
      const { data, error } = await supabase
        .from('financial_goals')
        .update(mappedUpdates)
        .eq('id', goalId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao atualizar meta:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no updateGoal:', error);
      throw error;
    }
  },
  
  /**
   * Exclui uma meta
   * @param {number} goalId - ID da meta
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<boolean>} Sucesso da exclusão
   */
  async deleteGoal(goalId, userId) {
    try {
      const { error } = await supabase
        .from('financial_goals')
        .delete()
        .eq('id', goalId)
        .eq('user_id', userId);
      
      if (error) {
        console.error('Erro ao excluir meta:', error);
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('Erro no deleteGoal:', error);
      throw error;
    }
  },
  
  /**
   * Obtém o histórico de contribuições para uma meta
   * @param {number} goalId - ID da meta
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<Array>} Lista de contribuições
   */
  async getGoalContributions(goalId, userId) {
    try {
      // Primeiro verifica se a meta pertence ao usuário
      const { data: goal, error: goalError } = await supabase
        .from('financial_goals')
        .select('id')
        .eq('id', goalId)
        .eq('user_id', userId)
        .single();
      
      if (goalError) {
        console.error('Erro ao verificar propriedade da meta:', goalError);
        throw new Error('Meta não encontrada ou não pertence ao usuário');
      }
      
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('*')
        .eq('goal_id', goalId)
        .order('contribution_date', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar contribuições:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getGoalContributions:', error);
      throw error;
    }
  },
  
  /**
   * Calcula estatísticas e previsões para uma meta
   * @param {number} goalId - ID da meta
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<Object>} Estatísticas da meta
   */
  async getGoalStatistics(goalId, userId) {
    try {
      // Buscar a meta com contribuições
      const goal = await this.getGoalById(goalId, userId);
      
      if (!goal) {
        throw new Error('Meta não encontrada');
      }
      
      const now = new Date();
      const startDate = new Date(goal.start_date);
      const targetDate = goal.target_date ? new Date(goal.target_date) : null;
      
      // Dias passados desde o início
      const daysPassed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
      
      // Dias restantes até a data alvo
      let daysRemaining = null;
      if (targetDate) {
        daysRemaining = Math.max(0, Math.floor((targetDate - now) / (1000 * 60 * 60 * 24)));
      }
      
      // Valor restante a economizar
      const remainingAmount = Math.max(0, goal.target_amount - goal.current_amount);
      
      // Progresso percentual
      const progressPercentage = (goal.current_amount / goal.target_amount) * 100;
      
      // Média diária de contribuição até agora
      const dailyAverage = daysPassed > 0 ? goal.current_amount / daysPassed : 0;
      
      // Valor diário necessário para atingir a meta na data alvo
      let dailyNeeded = null;
      if (daysRemaining !== null && daysRemaining > 0) {
        dailyNeeded = remainingAmount / daysRemaining;
      }
      
      // Previsão de conclusão baseada no ritmo atual
      let estimatedCompletionDate = null;
      if (dailyAverage > 0 && remainingAmount > 0) {
        const daysToComplete = Math.ceil(remainingAmount / dailyAverage);
        estimatedCompletionDate = new Date(now);
        estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + daysToComplete);
      }
      
      return {
        goal,
        statistics: {
          progressPercentage,
          daysPassed,
          daysRemaining,
          remainingAmount,
          dailyAverage,
          dailyNeeded,
          estimatedCompletionDate
        }
      };
    } catch (error) {
      console.error('Erro no getGoalStatistics:', error);
      throw error;
    }
  },
  
  /**
   * Cria um lembrete para uma meta
   * @param {number} goalId - ID da meta
   * @param {number} userId - ID do usuário
   * @param {string} frequency - Frequência do lembrete (daily, weekly, monthly)
   * @returns {Promise<Object>} O lembrete criado
   */
  async createGoalReminder(goalId, userId, frequency = 'weekly') {
    try {
      // Buscar a meta para verificar propriedade e obter detalhes
      const goal = await this.getGoalById(goalId, userId);
      
      if (!goal) {
        throw new Error('Meta não encontrada');
      }
      
      // Integrar com o serviço de lembretes existente
      const reminderService = require('./reminderService');
      
      // Criar descrição do lembrete
      const description = `Contribuir para sua meta: ${goal.title} (Progresso: ${Math.round(goal.current_amount / goal.target_amount * 100)}%)`;
      
      // Definir data do lembrete baseado na frequência
      const now = new Date();
      let reminderDate;
      let recurrencePattern;
      
      switch (frequency) {
        case 'daily':
          reminderDate = new Date(now.setDate(now.getDate() + 1));
          reminderDate.setHours(9, 0, 0, 0); // 9:00 AM
          recurrencePattern = 'daily';
          break;
        case 'weekly':
          reminderDate = new Date(now.setDate(now.getDate() + 7));
          reminderDate.setHours(10, 0, 0, 0); // 10:00 AM
          recurrencePattern = 'weekly';
          break;
        case 'monthly':
          reminderDate = new Date(now.setMonth(now.getMonth() + 1));
          reminderDate.setHours(10, 0, 0, 0); // 10:00 AM
          recurrencePattern = 'monthly';
          break;
        default:
          reminderDate = new Date(now.setDate(now.getDate() + 7));
          reminderDate.setHours(10, 0, 0, 0); // 10:00 AM
          recurrencePattern = 'weekly';
      }
      
      // Criar o lembrete
      const reminder = await reminderService.createReminder(
        userId,
        description,
        reminderDate,
        true, // Recorrente
        recurrencePattern
      );
      
      return reminder;
    } catch (error) {
      console.error('Erro no createGoalReminder:', error);
      throw error;
    }
  }
};