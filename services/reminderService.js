const { supabase } = require('./supabase')
const moment = require('moment')

/**
 * Serviço para gerenciar lembretes
 */
module.exports = {
  /**
   * Cria um novo lembrete
   * @param {number} userId - ID do usuário
   * @param {string} description - Descrição do lembrete
   * @param {Date|string} dueDate - Data/hora do lembrete
   * @param {boolean} isRecurring - Se o lembrete é recorrente
   * @param {string} recurrencePattern - Padrão de recorrência (diário, semanal, mensal, anual)
   * @returns {Promise<Object>} O lembrete criado
   */
  async createReminder(userId, description, dueDate, isRecurring = false, recurrencePattern = null) {
    try {
      console.log(`Criando lembrete para o usuário ${userId}: "${description}" para ${dueDate}`);
      
      // Garantir que a data está em formato ISO
      let isoDate;
      if (dueDate instanceof Date) {
        isoDate = dueDate.toISOString();
      } else if (typeof dueDate === 'string') {
        isoDate = new Date(dueDate).toISOString();
      } else {
        throw new Error('Data de lembrete inválida');
      }
      
      const { data, error } = await supabase
        .from('reminders')
        .insert({
          user_id: userId,
          description: description,
          due_date: isoDate,
          is_recurring: isRecurring,
          recurrence_pattern: recurrencePattern
        })
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao criar lembrete:', error);
        throw error;
      }
      
      console.log(`Lembrete criado com sucesso: ID ${data.id}`);
      return data;
    } catch (error) {
      console.error('Erro no createReminder:', error);
      throw error;
    }
  },
  
  /**
   * Obtém todos os lembretes de um usuário
   * @param {number} userId - ID do usuário
   * @param {boolean} includeCompleted - Se deve incluir lembretes concluídos
   * @returns {Promise<Array>} Lista de lembretes
   */
  async getUserReminders(userId, includeCompleted = false) {
    try {
      let query = supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .order('due_date', { ascending: true });
      
      if (!includeCompleted) {
        query = query.eq('is_completed', false);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Erro ao buscar lembretes:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getUserReminders:', error);
      throw error;
    }
  },
  
  /**
   * Obtém lembretes pendentes para um período específico
   * @param {Date|string} startDate - Data de início do período
   * @param {Date|string} endDate - Data de fim do período
   * @returns {Promise<Array>} Lista de lembretes pendentes no período
   */
  async getPendingReminders(startDate, endDate) {
    try {
      // Converter datas para ISO se necessário
      const isoStartDate = startDate instanceof Date ? startDate.toISOString() : startDate;
      const isoEndDate = endDate instanceof Date ? endDate.toISOString() : endDate;
      
      const { data, error } = await supabase
        .from('reminders')
        .select(`
          *,
          users!reminders_user_id_fkey (
            telegram_id
          )
        `)
        .eq('is_completed', false)
        .eq('reminder_sent', false)
        .gte('due_date', isoStartDate)
        .lte('due_date', isoEndDate);
      
      if (error) {
        console.error('Erro ao buscar lembretes pendentes:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getPendingReminders:', error);
      throw error;
    }
  },
  
  /**
   * Marca um lembrete como enviado
   * @param {number} reminderId - ID do lembrete
   * @returns {Promise<Object>} O lembrete atualizado
   */
  async markReminderAsSent(reminderId) {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .update({ reminder_sent: true })
        .eq('id', reminderId)
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao marcar lembrete como enviado:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no markReminderAsSent:', error);
      throw error;
    }
  },
  
  /**
   * Marca um lembrete como concluído
   * @param {number} reminderId - ID do lembrete
   * @returns {Promise<Object>} O lembrete atualizado
   */
  async markReminderAsCompleted(reminderId) {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .update({ is_completed: true })
        .eq('id', reminderId)
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao marcar lembrete como concluído:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no markReminderAsCompleted:', error);
      throw error;
    }
  },
  
  /**
   * Exclui um lembrete
   * @param {number} reminderId - ID do lembrete
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<boolean>} Sucesso da exclusão
   */
  async deleteReminder(reminderId, userId) {
    try {
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminderId)
        .eq('user_id', userId);
      
      if (error) {
        console.error('Erro ao excluir lembrete:', error);
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('Erro no deleteReminder:', error);
      throw error;
    }
  },
  
  /**
   * Processa lembretes recorrentes, criando a próxima instância após concluídos
   * @param {number} reminderId - ID do lembrete original
   * @returns {Promise<Object|null>} Novo lembrete se criado
   */
  async processRecurringReminder(reminderId) {
    try {
      // Busca o lembrete original
      const { data: reminder, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('id', reminderId)
        .single();
      
      if (error) {
        console.error('Erro ao buscar lembrete recorrente:', error);
        throw error;
      }
      
      // Se não for recorrente, não faz nada
      if (!reminder.is_recurring) return null;
      
      // Calcula a próxima data com base no padrão de recorrência
      let nextDate = moment(reminder.due_date);
      
      switch (reminder.recurrence_pattern) {
        case 'daily':
          nextDate.add(1, 'day');
          break;
        case 'weekly':
          nextDate.add(1, 'week');
          break;
        case 'monthly':
          nextDate.add(1, 'month');
          break;
        case 'yearly':
          nextDate.add(1, 'year');
          break;
        default:
          nextDate.add(1, 'month'); // Padrão mensal
      }
      
      // Cria o próximo lembrete
      const nextReminder = await this.createReminder(
        reminder.user_id,
        reminder.description,
        nextDate.toISOString(),
        true,
        reminder.recurrence_pattern
      );
      
      return nextReminder;
    } catch (error) {
      console.error('Erro no processRecurringReminder:', error);
      throw error;
    }
  }
};