const { supabase } = require('./supabase')

// Tipos de personalidade disponíveis
const PERSONALITIES = {
  FRIENDLY: 'friendly',
  SASSY: 'sassy',
  PROFESSIONAL: 'professional'
}

// Atualizar o schema para adicionar a tabela de configurações
async function setupConfigTable() {
  // Verifica se a tabela existe, se não, a cria
  const { error } = await supabase.rpc('create_config_table_if_not_exists', {})
  
  if (error && !error.message.includes('already exists')) {
    console.error('Error setting up config table:', error)
    throw error
  }
}

// Obter a configuração do usuário
async function getUserConfig(userId) {
  try {
    const { data, error } = await supabase
      .from('user_configs')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 é o erro quando não encontra nada
      console.error('Error fetching user config:', error)
      throw error
    }
    
    // Se não encontrou, retorna configuração padrão
    if (!data) {
      return {
        personality: PERSONALITIES.FRIENDLY, // Personalidade padrão
        setup_completed: false
      }
    }
    
    return data
  } catch (error) {
    console.error('Error in getUserConfig:', error)
    // Retorna config padrão em caso de erro
    return {
      personality: PERSONALITIES.FRIENDLY,
      setup_completed: false
    }
  }
}

// Salvar a configuração do usuário
async function saveUserConfig(userId, config) {
  try {
    // Verifica se já existe
    const existingConfig = await getUserConfig(userId)
    
    if (existingConfig && existingConfig.id) {
      // Atualiza
      const { data, error } = await supabase
        .from('user_configs')
        .update({
          personality: config.personality,
          setup_completed: config.setup_completed || false,
          updated_at: new Date()
        })
        .eq('id', existingConfig.id)
        .select()
        .single()
      
      if (error) {
        console.error('Error updating user config:', error)
        throw error
      }
      
      return data
    } else {
      // Cria novo
      const { data, error } = await supabase
        .from('user_configs')
        .insert({
          user_id: userId,
          personality: config.personality,
          setup_completed: config.setup_completed || false
        })
        .select()
        .single()
      
      if (error) {
        console.error('Error creating user config:', error)
        throw error
      }
      
      return data
    }
  } catch (error) {
    console.error('Error in saveUserConfig:', error)
    throw error
  }
}

module.exports = {
  PERSONALITIES,
  setupConfigTable,
  getUserConfig,
  saveUserConfig
}