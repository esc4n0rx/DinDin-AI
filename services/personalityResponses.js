const { PERSONALITIES } = require('./userConfig')
const moment = require('moment')
const numeral = require('numeral')

// Função para formatar valores monetários
const formatCurrency = (value) => {
  return `R$ ${numeral(value).format('0,0.00')}`
}

// Respostas para cada personalidade
const responses = {
  // AMIGÁVEL E TRANQUILO
  [PERSONALITIES.FRIENDLY]: {
    // Introdução no começo do bot
    introduction: (firstName) => `
Olá, ${firstName}! 👋

Sou o DinDin AI, seu assistente financeiro pessoal. Estou aqui para te ajudar a cuidar do seu dinheiro de um jeito simples e tranquilo.

Você pode me contar sobre suas despesas e receitas de forma natural, e eu vou registrá-las automaticamente.

📝 *Exemplos de como você pode me usar:*
• "Almoço no restaurante 32,50"
• "Compras no mercado 157,90"
• "Recebi salário 2500"
• "Uber para o trabalho 19,90"

Vamos começar? Escolha como você prefere que eu me comunique com você:
    `,
    
    // Mensagem quando o usuário não registra uma transação válida
    notTransaction: `Hmm, não consegui entender isso como uma transação financeira. Você pode me contar sobre seus gastos ou ganhos? Por exemplo "café da manhã 15 reais" ou "recebi 50 de presente".`,
    
    // Confirmação de despesa registrada
    expenseConfirmation: (transaction, category) => {
      const { amount, description } = transaction
      const { name, icon } = category
      
      const responses = [
        `✅ Anotei sua despesa com ${description}. ${formatCurrency(amount)} foram registrados na categoria ${icon} ${name}.`,
        `Registrei ${formatCurrency(amount)} de despesa com ${description}. Está na categoria ${icon} ${name}.`,
        `Sua despesa de ${formatCurrency(amount)} com ${description} foi anotada! Coloquei na categoria ${icon} ${name}.`
      ]
      
      return responses[Math.floor(Math.random() * responses.length)]
    },
    
    // Confirmação de receita registrada
    incomeConfirmation: (transaction, category) => {
      const { amount, description } = transaction
      const { name, icon } = category
      
      const responses = [
        `✅ Ótimas notícias! Registrei ${formatCurrency(amount)} de receita: ${description}. Categoria: ${icon} ${name}.`,
        `Legal! Adicionei ${formatCurrency(amount)} como receita de ${description}. Está na categoria ${icon} ${name}.`,
        `Receita registrada com sucesso: ${formatCurrency(amount)} de ${description}. Categoria: ${icon} ${name}.`
      ]
      
      return responses[Math.floor(Math.random() * responses.length)]
    },
    
    // Comentário sobre a saúde financeira (usado em relatórios)
    financialHealthComment: (income, expense, balance) => {
      if (balance > 0 && balance > income * 0.5) {
        return `Você está indo super bem! Conseguiu economizar mais da metade do que ganhou. Continue assim! 👏`
      } else if (balance > 0) {
        return `Você está no caminho certo! Seu saldo está positivo. Que tal tentar economizar um pouco mais no próximo mês? 😊`
      } else if (balance === 0) {
        return `Você gastou exatamente o que ganhou este mês. Vamos tentar economizar um pouquinho no próximo? 🙂`
      } else if (balance < 0 && Math.abs(balance) < income * 0.2) {
        return `Você gastou um pouco mais do que ganhou. Vamos ficar de olho para equilibrar as contas! 🧐`
      } else {
        return `Atenção! Suas despesas estão maiores que suas receitas. Vamos criar estratégias para equilibrar isso? 🤔`
      }
    },
    
    // Comentário sobre gastos elevados em uma categoria
    highSpendingComment: (categoryName, amount, totalExpense) => {
      const percentage = (amount / totalExpense * 100).toFixed(0)
      
      if (percentage > 50) {
        return `Você gastou ${percentage}% do seu dinheiro com ${categoryName}. Talvez valha a pena dar uma olhada nisso! 🧐`
      } else if (percentage > 30) {
        return `${categoryName} representa ${percentage}% dos seus gastos. Está de acordo com o que você planejou? 🤔`
      }
      
      return null // Não faz comentário se for menos de 30%
    },
    
    // Dica aleatória de finanças (no final dos relatórios)
    randomTip: () => {
      const tips = [
        "💡 *Dica:* Experimente a regra 50/30/20: 50% para necessidades, 30% para desejos e 20% para poupança.",
        "💡 *Dica:* Criar uma reserva de emergência pode te salvar de muitas dores de cabeça!",
        "💡 *Dica:* Registrar pequenos gastos todos os dias pode revelar para onde seu dinheiro está indo.",
        "💡 *Dica:* Revise suas assinaturas mensais. Você realmente usa todas elas?",
        "💡 *Dica:* Comparar preços antes de comprar pode gerar uma economia surpreendente no fim do mês."
      ]
      
      return tips[Math.floor(Math.random() * tips.length)]
    }
  },
  
  // DEBOCHADO E ENGRAÇADO
  [PERSONALITIES.SASSY]: {
    // Introdução no começo do bot
    introduction: (firstName) => `
E aí, ${firstName}! 🤘

Sou o DinDin AI, seu assistente financeiro com zero paciência para desculpas furadas sobre gastos!

Pode mandar a real sobre onde tá jogando seu dinheiro que eu anoto tudo - se você tá torrando a grana, pelo menos vai saber onde foi parar! 😂

📝 *Exemplos do que pode mandar pra mim:*
• "Hambúrguer artesanal hipster 47,90" (tô julgando já...)
• "Compras no mercado 157,90" (deixa eu adivinhar, metade foi chocolate?)
• "Recebi salário 2500" (hora de gastar tudo em besteira, né?)
• "Uber pra balada 19,90" (economia que fala, né?)

Vamos nessa? Escolhe aí como você quer que eu te zoe:
    `,
    
    // Mensagem quando o usuário não registra uma transação válida
    notTransaction: `Oi??? Tô esperando você falar de dinheiro e você me vem com isso? Fala de novo, mas dessa vez menciona quanto custou ou quanto recebeu, blz? Tipo "joguei 50 pila fora com besteira" ou "ganhei 100 mangos da vovó".`,
    
    // Confirmação de despesa registrada
    expenseConfirmation: (transaction, category) => {
      const { amount, description } = transaction
      const { name, icon } = category
      
      const responses = [
        `Lá se foi mais um dinheirinho! 💸 ${formatCurrency(amount)} jogados fora com ${description}. Categoria: ${icon} ${name} (como se isso melhorasse a situação)`,
        `Eita, gastando com ${description}, né? Anotei os ${formatCurrency(amount)} que sumiram da sua conta. Categoria: ${icon} ${name}. Depois não vem chorar!`,
        `Mais ${formatCurrency(amount)} que viraram fumaça com ${description}! Coloquei na categoria ${icon} ${name}. Tá rico, hein?`,
        `Xiiii, lá se foram ${formatCurrency(amount)} em ${description}! Categoria: ${icon} ${name}. Vou fingir que não vi esse gasto 👀`,
        `Mais uma mordiiiida na sua conta! ${formatCurrency(amount)} pro ralo com ${description}. Categoria: ${icon} ${name}. Vou chamar esse app de "Onde Foi Meu Dinheiro?" 🤣`,
        `CARAMBA! Acabou de torrar ${formatCurrency(amount)} em ${description}?! Categoria: ${icon} ${name}. Tá feliz agora? 💸`,
        `Adivinha quem acaba de ficar ${formatCurrency(amount)} mais pobre por causa de ${description}? VOCÊ! Categoria: ${icon} ${name}. Quem precisa de aposentadoria mesmo? 🙄`
      ]
      
      return responses[Math.floor(Math.random() * responses.length)]
    },
    
    // Confirmação de receita registrada
    incomeConfirmation: (transaction, category) => {
      const { amount, description } = transaction
      const { name, icon } = category
      
      const responses = [
        `Uhuuul, dinheiro na conta! 🤑 ${formatCurrency(amount)} caíram do céu como ${description}. Categoria: ${icon} ${name}. Quanto tempo até gastar tudo?`,
        `Olha só, ficou rico! ${formatCurrency(amount)} de ${description}. Categoria: ${icon} ${name}. Já tá planejando como torrar isso?`,
        `Aeeee, ${formatCurrency(amount)} a mais na conta: ${description}. Categoria: ${icon} ${name}. Mas calma, não sai gastando tudo em bobeira!`,
        `FINALMENTE algum dinheiro entrando! ${formatCurrency(amount)} de ${description}. Categoria: ${icon} ${name}. Agora só falta aprender a não gastar...`,
        `Milagre! Entrou dinheiro na conta: ${formatCurrency(amount)} de ${description}. Categoria: ${icon} ${name}. Vou cronometrar quanto tempo dura! ⏱️`,
        `Opa, chegou a grana! ${formatCurrency(amount)} de ${description}. Categoria: ${icon} ${name}. Duvido que sobre alguma coisa no fim do mês... 😏`,
        `UAU! ${formatCurrency(amount)} de ${description}! Categoria: ${icon} ${name}. Não gaste tudo em besteira... quem estou enganando, claro que vai gastar! 💸`
      ]
      
      return responses[Math.floor(Math.random() * responses.length)]
    },
    
    // Comentário sobre a saúde financeira (usado em relatórios)
    financialHealthComment: (income, expense, balance) => {
      if (balance > 0 && balance > income * 0.5) {
        return `CARAMBA! Você economizou mais da metade da grana! Tá doente? Nunca te vi assim! 😱`
      } else if (balance > 0) {
        return `Opa, saldo positivo! Milagres acontecem! Deve estar se segurando pra não gastar tudo em besteira, né? 😏`
      } else if (balance === 0) {
        return `Zero a zero. Nem lucro, nem prejuízo. Mediocridade financeira definida. 🥱`
      } else if (balance < 0 && Math.abs(balance) < income * 0.2) {
        return `Adivinha? Você gastou mais do que ganhou! *Chocante*, eu sei... 🙄 Só um pouquinho negativo, mas ainda assim, né?`
      } else {
        return `ALERTA VERMELHO! 🚨 Suas contas parecem o Titanic... afundando RAPIDAMENTE! Talvez seja hora de conhecer aquele conceito revolucionário chamado "economizar"?`
      }
    },
    
    // Comentário sobre gastos elevados em uma categoria
    highSpendingComment: (categoryName, amount, totalExpense) => {
      const percentage = (amount / totalExpense * 100).toFixed(0)
      
      if (percentage > 50) {
        return `Uau! Você torrou ${percentage}% da sua grana só com ${categoryName}! Tá tentando bater algum recorde? 🏆`
      } else if (percentage > 30) {
        return `${percentage}% do seu dinheiro foi embora com ${categoryName}. Se continuar assim, vai precisar de um empréstimo logo logo! 💸`
      } else if (percentage > 20) {
        return `${categoryName} comeu ${percentage}% do seu orçamento. Nada absurdo, mas também não tá aquela maravilha, né? 😬`
      }
      
      return null
    },
    
    // Dica aleatória de finanças (no final dos relatórios)
    randomTip: () => {
      const tips = [
        "💡 *Dica sarcástica:* Que tal parar de comprar café gourmet todo dia e ficar rico em 50 anos?",
        "💡 *Dica óbvia:* Gastar menos do que ganha é o segredo para não falir. Revolucionário, né?",
        "💡 *Semi-conselho:* Cartão de crédito não é dinheiro infinito. Eu sei, chocante!",
        "💡 *Sabedoria duvidosa:* Investir em bolo de pote ainda não substitui um plano de aposentadoria decente.",
        "💡 *Filosofando:* Se você não sabe onde seu dinheiro vai, provavelmente vai embora.",
        "💡 *Conselho nutricional:* Miojo todo dia economiza dinheiro E tempo de vida! Dois em um!",
        "💡 *Pense nisso:* Dinheiro não traz felicidade, mas paga a terapia pra você descobrir por que anda tão triste.",
        "💡 *Fato aleatório:* Seu extrato bancário lido de trás pra frente dá uma excelente história de terror."
      ]
      
      return tips[Math.floor(Math.random() * tips.length)]
    }
  },
  
  // PROFISSIONAL E CONCISO
  [PERSONALITIES.PROFESSIONAL]: {
    // Introdução no começo do bot
    introduction: (firstName) => `
Prezado(a) ${firstName},

Sou o DinDin AI, seu assistente financeiro pessoal. Estou aqui para auxiliá-lo(a) no registro e análise de suas transações financeiras com precisão e eficiência.

Você pode registrar suas transações usando linguagem natural. Eu identificarei automaticamente:
• Tipo de transação (receita/despesa)
• Valor
• Categoria apropriada
• Descrição

📝 *Exemplos de registros:*
• "Restaurante corporativo 32,50"
• "Supermercado 157,90"
• "Recebi honorários 2500"
• "Transporte executivo 19,90"

Selecione seu estilo de comunicação preferido:
    `,
    
    // Mensagem quando o usuário não registra uma transação válida
    notTransaction: `Não foi possível identificar uma transação financeira válida. Por favor, especifique o valor e a natureza da transação (ex: "alimentação 25,00" ou "recebimento de 150,00").`,
    
    // Confirmação de despesa registrada
    expenseConfirmation: (transaction, category) => {
      const { amount, description } = transaction
      const { name, icon } = category
      
      return `Despesa registrada: ${formatCurrency(amount)} - ${description}. Categoria: ${icon} ${name}. Registro efetuado com sucesso.`
    },
    
    // Confirmação de receita registrada
    incomeConfirmation: (transaction, category) => {
      const { amount, description } = transaction
      const { name, icon } = category
      
      return `Receita registrada: ${formatCurrency(amount)} - ${description}. Categoria: ${icon} ${name}. Registro efetuado com sucesso.`
    },
    
    // Comentário sobre a saúde financeira (usado em relatórios)
    financialHealthComment: (income, expense, balance) => {
      const savingsRate = (balance / income * 100).toFixed(1)
      
      if (balance > 0) {
        return `Taxa de poupança atual: ${savingsRate}% da receita total. ${savingsRate > 20 ? 'Performance acima da média.' : 'Oportunidade para otimização.'}`
      } else if (balance === 0) {
        return `Fluxo de caixa neutro. Recomenda-se estabelecer meta de poupança entre 15-20% da receita.`
      } else {
        return `Déficit orçamentário detectado. Recomenda-se revisão das despesas para reestabelecer equilíbrio financeiro.`
      }
    },
    
    // Comentário sobre gastos elevados em uma categoria
    highSpendingComment: (categoryName, amount, totalExpense) => {
      const percentage = (amount / totalExpense * 100).toFixed(1)
      
      if (percentage > 40) {
        return `Análise: ${categoryName} representa ${percentage}% do dispêndio total. Considere avaliar oportunidades de otimização nesta categoria.`
      } else if (percentage > 25) {
        return `Observação: ${categoryName} constitui ${percentage}% das despesas. Aloque atenção ao monitoramento desta categoria.`
      }
      
      return null
    },
    
    // Dica aleatória de finanças (no final dos relatórios)
    randomTip: () => {
      const tips = [
        "💡 *Recomendação:* Estruture seu orçamento conforme a metodologia 50/30/20 para alocação eficiente de recursos.",
        "💡 *Análise:* Um fundo de emergência equivalente a 3-6 meses de despesas essenciais minimiza riscos financeiros imprevistos.",
        "💡 *Estratégia:* Revisões periódicas de despesas recorrentes podem identificar oportunidades de otimização não evidentes.",
        "💡 *Metodologia:* Automatize transferências para investimentos para assegurar consistência na formação de patrimônio.",
        "💡 *Procedimento:* Renegociação anual de serviços contratados frequentemente resulta em condições comerciais otimizadas."
      ]
      
      return tips[Math.floor(Math.random() * tips.length)]
    }
  }
}

// Função para obter a resposta adequada à personalidade
function getResponse(personality, responseType, ...args) {
  // Se a personalidade não existir, usa a amigável como padrão
  const personalityConfig = responses[personality] || responses[PERSONALITIES.FRIENDLY]
  
  // Se o tipo de resposta existir para esta personalidade, retorna ela
  if (personalityConfig[responseType]) {
    if (typeof personalityConfig[responseType] === 'function') {
      return personalityConfig[responseType](...args)
    }
    return personalityConfig[responseType]
  }
  
  // Fallback para resposta amigável
  if (responses[PERSONALITIES.FRIENDLY][responseType]) {
    if (typeof responses[PERSONALITIES.FRIENDLY][responseType] === 'function') {
      return responses[PERSONALITIES.FRIENDLY][responseType](...args)
    }
    return responses[PERSONALITIES.FRIENDLY][responseType]
  }
  
  // Se não encontrar nada, retorna mensagem padrão
  console.error(`Response type "${responseType}" not found for personality "${personality}"`)
  return 'Entendido!'
}

module.exports = {
  getResponse
}