/**
 * services/incomeSourceService.js
 * Serviço para gerenciar fontes de renda recorrentes
 */

const { supabase } = require('./supabase');
const moment = require('moment');

module.exports = {
  /**
   * Cria uma nova fonte de renda recorrente
   * @param {number} userId - ID do usuário
   * @param {string} name - Nome da fonte de renda (ex: "Salário principal")
   * @param {number} amount - Valor da renda
   * @param {string} recurringType - Tipo de recorrência (monthly, biweekly, weekly)
   * @param {Array<number>} recurringDays - Dias do mês para recebimento [1-31]
   * @param {boolean} isVariable - Se o valor varia mensalmente
   * @returns {Promise<Object>} A fonte de renda criada
   */
  async createIncomeSource(userId, name, amount, recurringType = 'monthly', recurringDays = [], isVariable = false) {
    try {
      console.log(`Criando fonte de renda para o usuário ${userId}: "${name}" no valor de ${amount}`);
      
      // Validar dias recorrentes
      if (!recurringDays || !recurringDays.length) {
        throw new Error('É necessário informar pelo menos um dia para recebimento');
      }
      
      // Normalizar dias para serem valores entre 1-31
      const normalizedDays = recurringDays.map(day => {
        return Math.max(1, Math.min(31, parseInt(day) || 1));
      });
      
      // Calcular a próxima data esperada
      const nextExpectedDate = calculateNextExpectedDate(normalizedDays, recurringType);
      
      // Criar a fonte de renda
      const { data, error } = await supabase
        .from('income_sources')
        .insert({
          user_id: userId,
          name: name,
          amount: amount,
          recurring_type: recurringType,
          recurring_days: normalizedDays,
          is_variable: isVariable,
          next_expected_date: nextExpectedDate
        })
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao criar fonte de renda:', error);
        throw error;
      }
      
      console.log(`Fonte de renda criada com sucesso: ID ${data.id}`);
      return data;
    } catch (error) {
      console.error('Erro no createIncomeSource:', error);
      throw error;
    }
  },
  
  /**
   * Obtém todas as fontes de renda de um usuário
   * @param {number} userId - ID do usuário
   * @returns {Promise<Array>} Lista de fontes de renda
   */
  async getUserIncomeSources(userId) {
    try {
      const { data, error } = await supabase
        .from('income_sources')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });
      
      if (error) {
        console.error('Erro ao buscar fontes de renda:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getUserIncomeSources:', error);
      throw error;
    }
  },
  
  /**
   * Obtém uma fonte de renda específica por ID
   * @param {number} sourceId - ID da fonte de renda
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<Object>} A fonte de renda
   */
  async getIncomeSourceById(sourceId, userId) {
    try {
      const { data, error } = await supabase
        .from('income_sources')
        .select('*')
        .eq('id', sourceId)
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error('Erro ao buscar fonte de renda:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getIncomeSourceById:', error);
      throw error;
    }
  },
  
  /**
   * Atualiza uma fonte de renda existente
   * @param {number} sourceId - ID da fonte de renda
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @param {Object} updates - Campos a serem atualizados
   * @returns {Promise<Object>} A fonte de renda atualizada
   */
  async updateIncomeSource(sourceId, userId, updates) {
    try {
      // Se estiver atualizando dias recorrentes, recalcular próxima data esperada
      if (updates.recurring_days) {
        const recurringType = updates.recurring_type || 
          (await this.getIncomeSourceById(sourceId, userId)).recurring_type;
        
        updates.next_expected_date = calculateNextExpectedDate(
          updates.recurring_days, 
          recurringType
        );
      }
      
      const { data, error } = await supabase
        .from('income_sources')
        .update(updates)
        .eq('id', sourceId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao atualizar fonte de renda:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no updateIncomeSource:', error);
      throw error;
    }
  },
  
  /**
   * Confirma o recebimento de uma renda
   * @param {number} sourceId - ID da fonte de renda
   * @param {number} userId - ID do usuário
   * @param {number} amount - Valor recebido (opcional, se diferente do esperado)
   * @param {Date} receivedDate - Data de recebimento (opcional, padrão é data atual)
   * @returns {Promise<Object>} A fonte de renda atualizada
   */
  async confirmIncomeReceived(sourceId, userId, amount = null, receivedDate = new Date()) {
    try {
      const source = await this.getIncomeSourceById(sourceId, userId);
      
      if (!source) {
        throw new Error('Fonte de renda não encontrada');
      }
      
      // Converter a data para ISO string
      const receivedDateISO = receivedDate instanceof Date 
        ? receivedDate.toISOString() 
        : new Date(receivedDate).toISOString();
      
      // Preparar atualizações
      const updates = {
        last_received_date: receivedDateISO,
        is_confirmed: true
      };
      
      // Se foi informado um valor diferente e a fonte tem valor variável
      if (amount !== null && source.is_variable) {
        updates.amount = amount;
      }
      
      // Atualizar a fonte de renda
      const updatedSource = await this.updateIncomeSource(sourceId, userId, updates);
      
      // Registrar a transação se configurado para registrar automaticamente
      // (Isso pode ser implementado depois)
      
      return updatedSource;
    } catch (error) {
      console.error('Erro no confirmIncomeReceived:', error);
      throw error;
    }
  },
  
  /**
   * Exclui uma fonte de renda
   * @param {number} sourceId - ID da fonte de renda
   * @param {number} userId - ID do usuário (para verificação de segurança)
   * @returns {Promise<boolean>} Sucesso da exclusão
   */
  async deleteIncomeSource(sourceId, userId) {
    try {
      const { error } = await supabase
        .from('income_sources')
        .delete()
        .eq('id', sourceId)
        .eq('user_id', userId);
      
      if (error) {
        console.error('Erro ao excluir fonte de renda:', error);
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('Erro no deleteIncomeSource:', error);
      throw error;
    }
  },
  
  /**
   * Obtém as fontes de renda que estão próximas de receber
   * @param {number} daysAhead - Número de dias à frente para verificar
   * @returns {Promise<Array>} Lista de fontes de renda com recebimento próximo
   */
  async getUpcomingIncomeSources(daysAhead = 3) {
    try {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      
      const { data, error } = await supabase
        .from('income_sources')
        .select(`
          *,
          users!income_sources_user_id_fkey (
            id,
            telegram_id,
            first_name
          )
        `)
        .gte('next_expected_date', now.toISOString())
        .lte('next_expected_date', futureDate.toISOString())
        .eq('is_confirmed', false);
      
      if (error) {
        console.error('Erro ao buscar fontes de renda próximas:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro no getUpcomingIncomeSources:', error);
      throw error;
    }
  },
  
  /**
   * Atualiza as datas esperadas após confirmação ou recálculo mensal
   */
  async updateExpectedDates() {
    try {
      // Buscar todas as fontes de renda onde a última data recebida já passou
      const { data: sources, error } = await supabase
        .from('income_sources')
        .select('*')
        .lt('next_expected_date', new Date().toISOString());
      
      if (error) {
        console.error('Erro ao buscar fontes de renda para atualização:', error);
        throw error;
      }
      
      // Atualizar cada fonte de renda com a próxima data esperada
      for (const source of sources) {
        const nextExpectedDate = calculateNextExpectedDate(
          source.recurring_days,
          source.recurring_type,
          source.next_expected_date
        );
        
        await supabase
          .from('income_sources')
          .update({
            next_expected_date: nextExpectedDate,
            is_confirmed: false
          })
          .eq('id', source.id);
      }
      
      return true;
    } catch (error) {
      console.error('Erro no updateExpectedDates:', error);
      throw error;
    }
  }
};

/**
 * Calcula a próxima data esperada para recebimento
 * @param {Array<number>} recurringDays - Dias do mês para recebimento [1-31]
 * @param {string} recurringType - Tipo de recorrência (monthly, biweekly, weekly)
 * @param {Date|string} referenceDate - Data de referência (opcional)
 * @returns {string} Próxima data esperada em formato ISO
 */
function calculateNextExpectedDate(recurringDays, recurringType = 'monthly', referenceDate = null) {
  // Usar data atual como referência se não informada
  const now = referenceDate ? moment(referenceDate) : moment();
  
  // Ordenar os dias para facilitar o cálculo
  const sortedDays = [...recurringDays].sort((a, b) => a - b);
  
  let nextDate = null;
  
  if (recurringType === 'monthly') {
    // Encontrar o próximo dia do mês atual ou próximo mês
    const currentDay = now.date();
    
    // Procurar um dia este mês que ainda não passou
    const nextDay = sortedDays.find(day => day > currentDay);
    
    if (nextDay) {
      // Ainda tem um dia este mês
      nextDate = moment(now).date(nextDay);
    } else {
      // Próximo mês, pegar o primeiro dia da lista
      nextDate = moment(now).add(1, 'month').date(sortedDays[0]);
    }
  } else if (recurringType === 'biweekly') {
    // Para quinzenal, assumimos duas datas por mês
    const currentDay = now.date();
    
    if (sortedDays.length >= 2) {
      // Se tiver pelo menos dois dias configurados
      const nextDay = sortedDays.find(day => day > currentDay);
      
      if (nextDay) {
        // Ainda tem um dia este mês
        nextDate = moment(now).date(nextDay);
      } else {
        // Próximo mês, pegar o primeiro dia da lista
        nextDate = moment(now).add(1, 'month').date(sortedDays[0]);
      }
    } else {
      // Se só tiver um dia configurado, assumir 15 dias depois
      nextDate = moment(now).add(15, 'days');
    }
  } else if (recurringType === 'weekly') {
    // Para semanal, interpretar os dias como dias da semana (0-6, onde 0 é domingo)
    const currentDayOfWeek = now.day();
    
    // Normalizar para usar dias da semana
    const weekDays = sortedDays.map(d => d % 7);
    
    // Encontrar o próximo dia da semana
    const nextDayOfWeek = weekDays.find(day => day > currentDayOfWeek);
    
    if (nextDayOfWeek !== undefined) {
      // Ainda tem um dia esta semana
      nextDate = moment(now).day(nextDayOfWeek);
    } else {
      // Próxima semana, pegar o primeiro dia da lista
      nextDate = moment(now).add(1, 'week').day(weekDays[0]);
    }
  }
  
  // Garantir que a data é futura
  if (nextDate && nextDate.isSameOrBefore(now)) {
    if (recurringType === 'monthly') {
      nextDate = moment(now).add(1, 'month').date(sortedDays[0]);
    } else if (recurringType === 'biweekly') {
      nextDate = moment(now).add(15, 'days');
    } else if (recurringType === 'weekly') {
      nextDate = moment(now).add(1, 'week');
    }
  }
  
  // Retornar em formato ISO
  return nextDate ? nextDate.toISOString() : now.add(1, 'month').toISOString();
}