const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase credentials missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Função auxiliar para garantir formato ISO de datas
function ensureISODate(date) {
  if (!date) return null;
  
  if (date instanceof Date) {
    return date.toISOString();
  }
  
  if (typeof date === 'string') {
    // Verifica se é uma string de data ISO válida
    if (date.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return date;
    }
    
    // Tenta converter outras strings de data para ISO
    try {
      return new Date(date).toISOString();
    } catch (e) {
      console.error(`Data inválida: ${date}`, e);
      return null;
    }
  }
  
  return null;
}

module.exports = {
  supabase,
  
  // Funções de usuário
  async getOrCreateUser(telegramId, firstName, lastName, username) {
    // Verifica se o usuário já existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()
    
    if (existingUser) return existingUser
    
    // Cria um novo usuário
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        first_name: firstName,
        last_name: lastName,
        username: username
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating user:', error)
      throw error
    }
    
    return newUser
  },
  
  // Categorias
  async getCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name')
    
    if (error) {
      console.error('Error fetching categories:', error)
      throw error
    }
    
    return data
  },
  
  async getCategoryByName(name, type) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .ilike('name', `%${name}%`)
      .eq('type', type)
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 é o erro quando não encontra nada
      console.error('Error fetching category:', error)
      throw error
    }
    
    // Se não encontrar categoria específica, usa a categoria "Outros"
    if (!data) {
      const { data: defaultCategory } = await supabase
        .from('categories')
        .select('*')
        .eq('name', 'Outros')
        .eq('type', type)
        .single()
      
      return defaultCategory
    }
    
    return data
  },
  
  // Transações
  async createTransaction(userId, categoryId, amount, description, type, date = new Date()) {
    // Garantir que a data é sempre baseada na hora atual do servidor
    const transactionDate = date || new Date();
    const isoDate = ensureISODate(transactionDate);
    
    console.log(`Criando transação com data: ${isoDate}`);
    
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: categoryId,
        amount: amount,
        description: description,
        transaction_date: isoDate,
        type: type
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
    
    console.log(`Transação criada: ID ${data.id}, Data: ${data.transaction_date}`);
    return data;
  },
  
  async getUserTransactions(userId, startDate, endDate, type = null) {
    // Converter datas para ISO se necessário
    const isoStartDate = startDate ? ensureISODate(startDate) : null;
    const isoEndDate = endDate ? ensureISODate(endDate) : null;
    
    console.log(`Buscando transações - Período: ${isoStartDate || 'sem início'} até ${isoEndDate || 'sem fim'}`);
    
    let query = supabase
      .from('transactions')
      .select(`
        *,
        categories:category_id (
          name,
          icon
        )
      `)
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false });
    
    if (isoStartDate) {
      query = query.gte('transaction_date', isoStartDate);
    }
    
    if (isoEndDate) {
      query = query.lte('transaction_date', isoEndDate);
    }
    
    if (type) {
      query = query.eq('type', type);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
    
    console.log(`Encontradas ${data.length} transações`);
    return data;
  },
  
  async getSummary(userId, startDate, endDate) {
    console.log(`Gerando resumo para userId: ${userId}, período: ${startDate} a ${endDate}`);
    try {
      // Busca todas as transações do período
      const transactions = await this.getUserTransactions(userId, startDate, endDate);
      console.log(`Transações encontradas para resumo: ${transactions.length}`);
      
      // Log das transações para debug
      if (transactions.length > 0) {
        console.log('Amostra das transações no resumo:');
        transactions.slice(0, 3).forEach(tx => {
          console.log(`ID: ${tx.id}, Data: ${tx.transaction_date}, Tipo: ${tx.type}, Valor: ${tx.amount}, Descrição: ${tx.description}`);
        });
      }
      
      // Calcula totais
      const summary = {
        income: 0,
        expense: 0,
        balance: 0,
        categories: {}
      };
      
      // Para garantir que valores são tratados corretamente como números
      const parseAmount = (amount) => {
        if (typeof amount === 'string') {
          return parseFloat(amount) || 0;
        }
        return amount || 0;
      };
      
      transactions.forEach(tx => {
        const amount = parseAmount(tx.amount);
        
        if (tx.type === 'income') {
          summary.income += amount;
        } else {
          summary.expense += amount;
        }
        
        // Agrupa por categoria
        const categoryName = tx.categories?.name || 'Sem categoria';
        const categoryIcon = tx.categories?.icon || '';
        
        if (!summary.categories[categoryName]) {
          summary.categories[categoryName] = {
            total: 0,
            icon: categoryIcon,
            type: tx.type
          };
        }
        
        summary.categories[categoryName].total += amount;
      });
      
      summary.balance = summary.income - summary.expense;
      
      console.log(`Resumo calculado: Receitas: ${summary.income}, Despesas: ${summary.expense}, Saldo: ${summary.balance}`);
      console.log(`Categorias: ${Object.keys(summary.categories).length}`);
      
      return summary;
    } catch (error) {
      console.error('Erro ao gerar resumo:', error);
      throw error;
    }
  }
}