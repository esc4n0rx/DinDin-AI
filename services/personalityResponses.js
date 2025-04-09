const { PERSONALITIES } = require('./userConfig')
const moment = require('moment')
const numeral = require('numeral')

// Função para formatar valores monetários
const formatCurrency = (value) => {
  return `R$ ${numeral(value).format('0,0.00')}`
}

// Função para formatar percentuais
const formatPercentage = (value) => {
  return `${Math.round(value)}%`
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
• "Me lembre de pagar a conta de luz dia 15"

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
    
    // Lembretes
    reminderCreated: (reminder) => {
      const { description, dueDate } = reminder;
      const dateFormatted = moment(dueDate).format('DD/MM/YYYY [às] HH:mm');
      
      const responses = [
        `✅ Lembrete criado com sucesso! Vou te avisar sobre "${description}" em ${dateFormatted}. Pode ficar tranquilo que não vou esquecer! 😊`,
        `Prontinho! 📝 Criei um lembrete para você sobre "${description}" para ${dateFormatted}. Vou te lembrar quando chegar a hora!`,
        `Entendido! Vou te lembrar sobre "${description}" em ${dateFormatted}. Pode confiar em mim para não esquecer! 👍`
      ];
      
      return responses[Math.floor(Math.random() * responses.length)];
    },

    reminderNotification: (reminder) => {
      const { description, dueDate } = reminder;
      const dateFormatted = moment(dueDate).format('DD/MM/YYYY [às] HH:mm');
      
      const responses = [
        `⏰ *Lembrete!*\n\nOlá! Vim te lembrar sobre: "${description}"\nAgendado para: ${dateFormatted}\n\nEspero que isso te ajude! 😊`,
        `⏰ *Não esqueça!*\n\nAqui está seu lembrete sobre: "${description}"\nMarcado para: ${dateFormatted}\n\nEstou aqui para ajudar você a se manter organizado(a)! 🌟`,
        `⏰ *Lembrete Amigável*\n\nOlá! Só passando para lembrar que: "${description}"\nHora prevista: ${dateFormatted}\n\nFeliz em poder ajudar com sua organização! 💫`
      ];
      
      return responses[Math.floor(Math.random() * responses.length)];
    },

    reminderListEmpty: () => {
      return "Você não tem nenhum lembrete pendente no momento. Que tal criar um? Basta me dizer algo como 'Me lembre de pagar a conta de luz dia 15'.";
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
      
        // Respostas para metas financeiras
    goalCreatePrompt: () => {
      return "Que ótimo que você quer criar uma meta financeira! Isso vai te ajudar a realizar seus sonhos com mais organização. 😊\n\nPor favor, me diga qual é o valor total que você precisa alcançar para essa meta?";
    },

    goalInitialAmountPrompt: () => {
      return "Legal! Você já tem algum valor guardado para começar essa meta? Se sim, quanto?";
    },

    goalTargetDatePrompt: () => {
      return "Até quando você gostaria de alcançar essa meta? Ter uma data ajuda a manter o foco! Se não tiver uma data específica em mente, pode me dizer 'sem data'.";
    },

    goalCreationSuccess: (goal) => {
      const { title, target_amount, current_amount, target_date } = goal;
      const formattedTargetAmount = formatCurrency(target_amount);
      const formattedCurrentAmount = formatCurrency(current_amount);
      const progress = (current_amount / target_amount) * 100;
      const formattedProgress = formatPercentage(progress);
      
      let dateMessage = "";
      if (target_date) {
        const formattedDate = moment(target_date).format('DD/MM/YYYY');
        dateMessage = `\nData alvo: ${formattedDate}`;
      }
      
      return `✅ Meta criada com sucesso! 🎯\n\n*${title}*\nValor total: ${formattedTargetAmount}${dateMessage}\nValor inicial: ${formattedCurrentAmount}\nProgresso atual: ${formattedProgress}${getProgressBar(progress)}\n\nVou te acompanhar nessa jornada! Você pode adicionar valores à sua meta quando quiser, basta me dizer algo como "Adicionar 50 reais na meta ${title}". 😊`;
    },

    goalContributionSuccess: (goal, contribution) => {
      const { title, target_amount, current_amount } = goal;
      const { amount } = contribution;
      const formattedAmount = formatCurrency(amount);
      const formattedTotal = formatCurrency(current_amount);
      const formattedTarget = formatCurrency(target_amount);
      const progress = (current_amount / target_amount) * 100;
      const formattedProgress = formatPercentage(progress);
      
      let completionMessage = "";
      if (progress >= 100) {
        completionMessage = "\n\n🎉 *PARABÉNS! Você atingiu sua meta!* 🎉\nQue conquista incrível! Estou muito feliz por você!";
      }
      
      return `✅ Adicionei ${formattedAmount} à sua meta "*${title}*"!\n\n*Novo saldo:* ${formattedTotal} de ${formattedTarget}\n*Progresso:* ${formattedProgress}${getProgressBar(progress)}${completionMessage}`;
    },

    goalQuerySingle: (goal, stats) => {
      const { title, target_amount, current_amount, target_date } = goal;
      const { progressPercentage, remainingAmount, daysRemaining, estimatedCompletionDate } = stats.statistics;
      
      const formattedTarget = formatCurrency(target_amount);
      const formattedCurrent = formatCurrency(current_amount);
      const formattedRemaining = formatCurrency(remainingAmount);
      const formattedProgress = formatPercentage(progressPercentage);
      
      let dateInfo = "";
      if (target_date) {
        const formattedDate = moment(target_date).format('DD/MM/YYYY');
        dateInfo = `\n*Data alvo:* ${formattedDate}`;
        
        if (daysRemaining !== null) {
          dateInfo += ` (faltam ${daysRemaining} dias)`;
        }
      }
      
      let estimatedInfo = "";
      if (estimatedCompletionDate && progressPercentage < 100) {
        const formattedEstimatedDate = moment(estimatedCompletionDate).format('DD/MM/YYYY');
        estimatedInfo = `\n*Previsão de conclusão:* ${formattedEstimatedDate} (no ritmo atual)`;
      }
      
      let message = `🎯 *Meta: ${title}*\n\n*Valor alvo:* ${formattedTarget}${dateInfo}\n*Valor atual:* ${formattedCurrent}\n*Valor restante:* ${formattedRemaining}\n*Progresso:* ${formattedProgress}${getProgressBar(progressPercentage)}${estimatedInfo}`;
      
      if (progressPercentage >= 100) {
        message += "\n\n🎉 *Meta concluída!* Parabéns pela conquista!";
      } else if (daysRemaining !== null && daysRemaining === 0) {
        message += "\n\n⚠️ *Atenção!* Hoje é o último dia para sua meta!";
      } else if (daysRemaining !== null && daysRemaining < 0) {
        message += "\n\n⚠️ *Atenção!* A data alvo da sua meta já passou.";
      } else if (progressPercentage > 80) {
        message += "\n\n🚀 Você está quase lá! Continue assim!";
      } else if (progressPercentage > 50) {
        message += "\n\n👍 Você já passou da metade! Bom trabalho!";
      } else if (progressPercentage > 25) {
        message += "\n\n👏 Você está fazendo um bom progresso!";
      } else {
        message += "\n\n💪 Toda jornada começa com o primeiro passo!";
      }
      
      return message;
    },

    goalQueryMultiple: (goals) => {
      if (!goals || goals.length === 0) {
        return "Você ainda não tem nenhuma meta financeira. Que tal criar uma? Basta me dizer algo como 'Quero criar uma meta para comprar um celular novo'! 😊";
      }
      
      let message = "🎯 *Suas Metas Financeiras*\n\n";
      
      goals.forEach((goal, index) => {
        const { title, target_amount, current_amount, completed } = goal;
        const formattedTarget = formatCurrency(target_amount);
        const formattedCurrent = formatCurrency(current_amount);
        const progress = (current_amount / target_amount) * 100;
        const formattedProgress = formatPercentage(progress);
        
        const statusEmoji = completed ? "✅" : "🔄";
        
        message += `${index + 1}. ${statusEmoji} *${title}*\n   ${formattedCurrent} de ${formattedTarget} (${formattedProgress})\n   ${getProgressBar(progress)}\n\n`;
      });
      
      message += "Para ver detalhes de uma meta específica, me pergunte sobre ela! Exemplo: 'Como está minha meta do celular?'";
      
      return message;
    },

    goalUpdateSuccess: (goal) => {
      return `✅ A meta "${goal.title}" foi atualizada com sucesso!`;
    },

    goalDeleteConfirmation: (goalTitle) => {
      return `Tem certeza que deseja excluir a meta "${goalTitle}"? Todos os dados relacionados a ela serão perdidos.\n\nResponda com *sim* para confirmar ou *não* para cancelar.`;
    },

    goalDeleteSuccess: () => {
      return "✅ Meta excluída com sucesso!";
    },

    goalCreateReminderSuccess: (frequency) => {
      let freqText = "semanal";
      if (frequency === 'daily') freqText = "diário";
      if (frequency === 'monthly') freqText = "mensal";
      
      return `✅ Lembrete ${freqText} criado para sua meta! Vou te avisar regularmente para você continuar progredindo. 😊`;
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
  • "Me lembre de pagar a conta de internet dia 20" (como se você fosse esquecer justo a internet, né?)

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
      
      // Lembretes
      reminderCreated: (reminder) => {
        const { description, dueDate } = reminder;
        const dateFormatted = moment(dueDate).format('DD/MM/YYYY [às] HH:mm');
        
        const responses = [
          `✅ Lembrete anotado! "${description}" para ${dateFormatted}. Agora é só esperar eu te salvar da sua memória de peixinho dourado! 🐠`,
          `Ok, vou te lembrar sobre "${description}" em ${dateFormatted}. Alguém tinha que fazer esse trabalho, né? 😜`,
          `Beleza, anotei aqui: "${description}" para ${dateFormatted}. Se você esquecer, a culpa é sua. Se eu esquecer... bem, a culpa ainda é sua por confiar em um bot! 🤣`
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
      },

      reminderNotification: (reminder) => {
        const { description, dueDate } = reminder;
        const dateFormatted = moment(dueDate).format('DD/MM/YYYY [às] HH:mm');
        
        const responses = [
          `⏰ *TRIIIIM! ACORDA!*\n\nTá lembrado que você tinha que: "${description}"\nEra pra ser em: ${dateFormatted}\n\nNão diga que não te avisei! Eu sou mais confiável que seu cérebro! 🧠`,
          `⏰ *Adivinhe quem lembrou?*\n\nEU, CLARO! Você com certeza esqueceu: "${description}"\nMarcado para: ${dateFormatted}\n\nVocê me agradece depois! 💅`,
          `⏰ *Ei, distraído(a)!*\n\nSó eu não esqueci que: "${description}"\nHorário: ${dateFormatted}\n\nSorte a sua me ter como assistente, hein? 😏`
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
      },

      reminderListEmpty: () => {
        return "Uau, zero lembretes! Ou você é super organizado, ou está vivendo perigosamente sem planejar nada! Quer criar um lembrete? É só dizer 'Me avise sobre a conta de luz dia 10'.";
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


      // Respostas para metas financeiras
  goalCreatePrompt: () => {
    return "Nossa, alguém aqui tá sonhando alto, hein? Vamos lá... 🙄\n\nQuanto custa esse sonho de consumo que provavelmente vai virar poeira na prateleira em 6 meses? (ou seja, qual o valor total da meta?)";
  },

  goalInitialAmountPrompt: () => {
    return "E aí, já tem alguma graninha guardada pra isso, ou começou a economizar só na imaginação? Me conta quanto já separou (se é que separou alguma coisa)...";
  },

  goalTargetDatePrompt: () => {
    return "E quando pretende realizar esse sonho de consumo? Amanhã? Daqui a 100 anos? Nunca? 😂\nMe dá uma data pra eu poder te zoar quando não conseguir cumprir (ou diga 'sem data' se não tiver coragem de se comprometer).";
  },

  goalCreationSuccess: (goal) => {
    const { title, target_amount, current_amount, target_date } = goal;
    const formattedTargetAmount = formatCurrency(target_amount);
    const formattedCurrentAmount = formatCurrency(current_amount);
    const progress = (current_amount / target_amount) * 100;
    const formattedProgress = formatPercentage(progress);
    
    let dateMessage = "";
    if (target_date) {
      const formattedDate = moment(target_date).format('DD/MM/YYYY');
      dateMessage = `\nData alvo: ${formattedDate} (vamos ver se você cumpre, né?)`;
    }
    
    return `Meta criada! 🎯\n\n*${title}*\nValor: ${formattedTargetAmount} (tá rico, hein?)${dateMessage}\nValor inicial: ${formattedCurrentAmount} (melhor que nada, eu acho?)\nProgresso: ${formattedProgress}${getProgressBar(progress)}\n\nAgora é só esperar sentado a mágica acontecer! 🪄✨ Brincadeira... Você vai ter que ralar muito, me dizendo coisas como "Adicionar 50 reais na meta ${title}" (isso se sobrar algum dinheiro depois do seu próximo rolê, né?)`;
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
• "Registrar lembrete para pagamento de fatura no dia 15"

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
    
    // Lembretes
    reminderCreated: (reminder) => {
      const { description, dueDate } = reminder;
      const dateFormatted = moment(dueDate).format('DD/MM/YYYY [às] HH:mm');
      
      return `✅ Lembrete registrado: "${description}" programado para ${dateFormatted}. Você receberá uma notificação no momento apropriado.`;
    },

    reminderNotification: (reminder) => {
      const { description, dueDate } = reminder;
      const dateFormatted = moment(dueDate).format('DD/MM/YYYY [às] HH:mm');
      
      return `⏰ *Notificação Programada*\n\nAssunto: "${description}"\nData/Hora: ${dateFormatted}\n\nEsta é uma notificação automática conforme solicitado.`;
    },

    reminderListEmpty: () => {
      return "Não há lembretes pendentes registrados em seu nome. Para criar um novo lembrete, utilize um comando como 'Registrar lembrete para pagamento de fatura no dia 15'.";
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


    goalCreatePrompt: () => {
      return "Inicializando procedimento de criação de meta financeira.\n\nPor favor, informe o valor monetário total necessário para a conclusão desta meta (valor numérico):";
    },

    goalInitialAmountPrompt: () => {
      return "Valor monetário já alocado para esta meta (opcional).\n\nCaso já possua recursos destinados a este objetivo, informe o montante inicial:";
    },

    goalTargetDatePrompt: () => {
      return "Data prevista para a conclusão da meta (opcional).\n\nEstabelecer um prazo definido aumenta a eficácia do planejamento financeiro. Caso deseje estabelecer uma data limite, informe-a no formato DD/MM/AAAA ou indique 'sem prazo' para objetivo de longo prazo:";
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

/**
 * Função que gera uma barra de progresso visual para o Telegram
 * @param {number} percentage - Porcentagem de progresso (0-100)
 * @param {number} length - Comprimento da barra (padrão: 10)
 * @returns {string} Barra de progresso visual
 */
function getProgressBar(percentage, length = 10) {
  // Limitar a porcentagem entre 0 e 100
  const limitedPercentage = Math.min(100, Math.max(0, percentage));
  
  // Calcular quantos segmentos completos
  const filledSegments = Math.round((limitedPercentage / 100) * length);
  
  // Criar a barra
  const filled = '█'.repeat(filledSegments);
  const empty = '▒'.repeat(length - filledSegments);
  
  return `\n[${filled}${empty}]`;
}



module.exports = {
  getResponse
}