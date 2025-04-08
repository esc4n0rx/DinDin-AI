const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase credentials missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

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
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: categoryId,
        amount: amount,
        description: description,
        transaction_date: date,
        type: type
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating transaction:', error)
      throw error
    }
    
    return data
  },
  
  async getUserTransactions(userId, startDate, endDate, type = null) {
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
      .order('transaction_date', { ascending: false })
    
    if (startDate) {
      query = query.gte('transaction_date', startDate)
    }
    
    if (endDate) {
      query = query.lte('transaction_date', endDate)
    }
    
    if (type) {
      query = query.eq('type', type)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching transactions:', error)
      throw error
    }
    
    return data
  },
  
  async getSummary(userId, startDate, endDate) {
    // Busca todas as transações do período
    const transactions = await this.getUserTransactions(userId, startDate, endDate)
    
    // Calcula totais
    const summary = {
      income: 0,
      expense: 0,
      balance: 0,
      categories: {}
    }
    
    transactions.forEach(tx => {
      if (tx.type === 'income') {
        summary.income += parseFloat(tx.amount)
      } else {
        summary.expense += parseFloat(tx.amount)
      }
      
      // Agrupa por categoria
      const categoryName = tx.categories?.name || 'Sem categoria'
      const categoryIcon = tx.categories?.icon || ''
      
      if (!summary.categories[categoryName]) {
        summary.categories[categoryName] = {
          total: 0,
          icon: categoryIcon,
          type: tx.type
        }
      }
      
      summary.categories[categoryName].total += parseFloat(tx.amount)
    })
    
    summary.balance = summary.income - summary.expense
    
    return summary
  }
}