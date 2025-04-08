/**
 * DinDin AI - Ferramenta de desenvolvimento e testes
 * 
 * Este script permite testar componentes individuais do DinDin AI
 * sem precisar executar o bot completo.
 */

require('dotenv').config();
const readline = require('readline');
const llmService = require('./services/llm');
const userConfigService = require('./services/userConfig');
const personalityService = require('./services/personalityResponses');
const supabaseService = require('./services/supabase');
const moment = require('moment');

// Configuração do terminal interativo
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Menu principal
function showMainMenu() {
  console.clear();
  console.log('🤖 DinDin AI - Menu de Desenvolvimento');
  console.log('--------------------------------------');
  console.log('1. Testar classificação de mensagens (LLM)');
  console.log('2. Testar personalidades');
  console.log('3. Testar conexão com Supabase');
  console.log('4. Simular processo de configuração');
  console.log('5. Testar relatórios');
  console.log('0. Sair');
  
  rl.question('\nEscolha uma opção: ', (answer) => {
    switch(answer) {
      case '1':
        testLLM();
        break;
      case '2':
        testPersonalities();
        break;
      case '3':
        testSupabase();
        break;
      case '4':
        simulateConfig();
        break;
      case '5':
        testReports();
        break;
      case '0':
        console.log('👋 Até mais!');
        rl.close();
        break;
      default:
        console.log('❌ Opção inválida!');
        setTimeout(showMainMenu, 1500);
    }
  });
}

// Teste do LLM para classificação de mensagens
async function testLLM() {
  console.clear();
  console.log('🧠 Teste de classificação de mensagens (LLM)');
  console.log('--------------------------------------------');
  console.log('Digite uma mensagem para classificar ou "voltar" para retornar ao menu principal.');
  
  async function promptMessage() {
    rl.question('\nMensagem: ', async (message) => {
      if (message.toLowerCase() === 'voltar') {
        showMainMenu();
        return;
      }
      
      console.log('\nAnalisando mensagem...');
      
      try {
        const result = await llmService.analyzeMessage(message);
        console.log('\n✅ Resultado da análise:');
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.log('\n❌ Erro ao analisar a mensagem:');
        console.error(error);
      }
      
      promptMessage();
    });
  }
  
  promptMessage();
}

// Teste de personalidades
function testPersonalities() {
  console.clear();
  console.log('😀 Teste de personalidades');
  console.log('-------------------------');
  console.log('1. Amigável e Tranquilo');
  console.log('2. Debochado e Engraçado');
  console.log('3. Profissional e Conciso');
  console.log('0. Voltar');
  
  rl.question('\nEscolha uma personalidade: ', (answer) => {
    let personality;
    
    switch(answer) {
      case '1':
        personality = userConfigService.PERSONALITIES.FRIENDLY;
        break;
      case '2':
        personality = userConfigService.PERSONALITIES.SASSY;
        break;
      case '3':
        personality = userConfigService.PERSONALITIES.PROFESSIONAL;
        break;
      case '0':
        showMainMenu();
        return;
      default:
        console.log('❌ Opção inválida!');
        setTimeout(testPersonalities, 1500);
        return;
    }
    
    console.clear();
    console.log(`Testando personalidade: ${personality}`);
    console.log('----------------------------------------');
    
    // Exibe a mensagem de introdução
    console.log('\n🎬 Mensagem de introdução:');
    console.log(personalityService.getResponse(personality, 'introduction', 'Usuário'));
    
    // Exibe resposta para não-transação
    console.log('\n🚫 Resposta para não-transação:');
    console.log(personalityService.getResponse(personality, 'notTransaction'));
    
    // Exemplifica uma despesa
    console.log('\n💸 Resposta para despesa:');
    const mockExpenseTransaction = {
      amount: 59.90,
      description: 'Pizza de pepperoni'
    };
    const mockExpenseCategory = {
      name: 'Alimentação',
      icon: '🍔'
    };
    console.log(personalityService.getResponse(
      personality, 
      'expenseConfirmation', 
      mockExpenseTransaction, 
      mockExpenseCategory
    ));
    
    // Exemplifica uma receita
    console.log('\n💰 Resposta para receita:');
    const mockIncomeTransaction = {
      amount: 250.00,
      description: 'Venda de item usado'
    };
    const mockIncomeCategory = {
      name: 'Outros',
      icon: '💵'
    };
    console.log(personalityService.getResponse(
      personality, 
      'incomeConfirmation', 
      mockIncomeTransaction, 
      mockIncomeCategory
    ));
    
    // Dica aleatória
    console.log('\n💡 Dica aleatória:');
    console.log(personalityService.getResponse(personality, 'randomTip'));
    
    rl.question('\nPressione Enter para voltar...', () => {
      testPersonalities();
    });
  });
}

// Teste de conexão com Supabase
async function testSupabase() {
  console.clear();
  console.log('🗃️ Teste de conexão com Supabase');
  console.log('-------------------------------');
  
  try {
    console.log('Testando conexão...');
    
    // Testar se consegue inicializar a tabela de configurações
    await userConfigService.setupConfigTable();
    console.log('✅ Inicialização da tabela de configurações: OK');
    
    // Testar se consegue obter categorias
    const categories = await supabaseService.getCategories();
    console.log(`✅ Obtenção de categorias: OK (${categories.length} categorias encontradas)`);
    
    // Exibir algumas categorias de exemplo
    if (categories.length > 0) {
      console.log('\nCategorias de exemplo:');
      categories.slice(0, 5).forEach(cat => {
        console.log(`- ${cat.icon} ${cat.name} (${cat.type})`);
      });
    }
    
    console.log('\n✅ Conexão com Supabase estabelecida com sucesso!');
  } catch (error) {
    console.log('\n❌ Erro ao testar conexão com Supabase:');
    console.error(error);
  }
  
  rl.question('\nPressione Enter para voltar...', showMainMenu);
}

// Simular processo de configuração
function simulateConfig() {
  console.clear();
  console.log('⚙️ Simulação do processo de configuração');
  console.log('---------------------------------------');
  console.log('Este teste simula o fluxo de configuração inicial do bot.');
  
  // Simular o fluxo de boas-vindas
  console.log('\n🎬 Passo 1: Mensagem de boas-vindas');
  console.log('Olá, Usuário! Bem-vindo ao DinDin AI - seu assistente financeiro inteligente! 🤖💰');
  console.log('Antes de começarmos, vamos personalizar sua experiência. Como você prefere que eu me comunique com você?');
  console.log('- 😊 Amigável e Tranquilo');
  console.log('- 😜 Debochado e Engraçado');
  console.log('- 👔 Profissional e Conciso');
  
  rl.question('\nEscolha uma personalidade (digite 1, 2 ou 3): ', (answer) => {
    let personality;
    let personalityName;
    
    switch(answer) {
      case '1':
        personality = userConfigService.PERSONALITIES.FRIENDLY;
        personalityName = 'Amigável e Tranquilo';
        break;
      case '2':
        personality = userConfigService.PERSONALITIES.SASSY;
        personalityName = 'Debochado e Engraçado';
        break;
      case '3':
        personality = userConfigService.PERSONALITIES.PROFESSIONAL;
        personalityName = 'Profissional e Conciso';
        break;
      default:
        console.log('❌ Opção inválida!');
        setTimeout(simulateConfig, 1500);
        return;
    }
    
    console.log(`\n🎬 Passo 2: Confirmação da escolha (${personalityName})`);
    
    // Exibir mensagem de confirmação com base na personalidade
    let confirmationMessage;
    if (personality === userConfigService.PERSONALITIES.FRIENDLY) {
      confirmationMessage = `Ótimo! Vou ser amigável e tranquilo nas nossas conversas. 😊\n\nAgora você pode começar a registrar suas despesas e receitas. Basta me enviar mensagens como "Almoço 25,90" ou "Recebi salário 2500".`;
    } else if (personality === userConfigService.PERSONALITIES.SASSY) {
      confirmationMessage = `Beleza! Vou ser debochado e engraçado, espero que aguente as verdades! 😜\n\nAgora é só mandar seus gastos pra eu julgar! Tipo "Fast food 30 pila" ou "Ganhei 100 mangos de bônus".`;
    } else {
      confirmationMessage = `Configuração concluída. Utilizarei comunicação profissional e concisa. 👔\n\nVocê pode iniciar o registro de suas transações financeiras agora. Exemplos: "Refeição corporativa 35,00" ou "Honorários recebidos 3000,00".`;
    }
    
    console.log(confirmationMessage);
    
    // Exibir mensagem de comandos disponíveis
    console.log('\n📋 Comandos Disponíveis:');
    console.log('/relatorio - Ver relatório financeiro mensal');
    console.log('/hoje - Ver transações de hoje');
    console.log('/semana - Ver transações da semana');
    console.log('/mes - Ver transações do mês');
    console.log('/configurar - Mudar minha personalidade');
    console.log('/ajuda - Mostrar esta mensagem');
    
    // Simulação de transação
    console.log('\n🎬 Passo 3: Simulação de registro de transação');
    rl.question('Digite uma transação para simular o registro: ', async (transaction) => {
      try {
        console.log('\nAnalisando mensagem...');
        const analysis = await llmService.analyzeMessage(transaction);
        
        if (!analysis.isTransaction) {
          console.log('\nResposta do bot:');
          console.log(personalityService.getResponse(personality, 'notTransaction'));
        } else {
          // Simulando uma categoria
          const mockCategory = {
            name: analysis.category,
            icon: analysis.type === 'income' ? '💰' : '💸'
          };
          
          // Simulando uma transação
          const mockTransaction = {
            amount: analysis.amount,
            description: analysis.description
          };
          
          console.log('\nResposta do bot:');
          let response;
          if (analysis.type === 'income') {
            response = personalityService.getResponse(personality, 'incomeConfirmation', mockTransaction, mockCategory);
          } else {
            response = personalityService.getResponse(personality, 'expenseConfirmation', mockTransaction, mockCategory);
          }
          console.log(response);
        }
      } catch (error) {
        console.log('\n❌ Erro ao simular transação:');
        console.error(error);
      }
      
      rl.question('\nPressione Enter para voltar...', showMainMenu);
    });
  });
}

// Testar relatórios
async function testReports() {
  console.clear();
  console.log('📊 Teste de relatórios');
  console.log('--------------------');
  console.log('1. Relatório diário');
  console.log('2. Relatório semanal');
  console.log('3. Relatório mensal');
  console.log('0. Voltar');
  
  rl.question('\nEscolha um tipo de relatório: ', async (answer) => {
    let periodType;
    let periodName;
    
    switch(answer) {
      case '1':
        periodType = 'day';
        periodName = 'Diário';
        break;
      case '2':
        periodType = 'week';
        periodName = 'Semanal';
        break;
      case '3':
        periodType = 'month';
        periodName = 'Mensal';
        break;
      case '0':
        showMainMenu();
        return;
      default:
        console.log('❌ Opção inválida!');
        setTimeout(testReports, 1500);
        return;
    }
    
    // Escolher personalidade
    console.log('\nEscolha a personalidade para o relatório:');
    console.log('1. Amigável e Tranquilo');
    console.log('2. Debochado e Engraçado');
    console.log('3. Profissional e Conciso');
    
    rl.question('Personalidade: ', async (personalityChoice) => {
      let personality;
      
      switch(personalityChoice) {
        case '1':
          personality = userConfigService.PERSONALITIES.FRIENDLY;
          break;
        case '2':
          personality = userConfigService.PERSONALITIES.SASSY;
          break;
        case '3':
          personality = userConfigService.PERSONALITIES.PROFESSIONAL;
          break;
        default:
          console.log('❌ Opção inválida!');
          setTimeout(testReports, 1500);
          return;
      }
      
      console.clear();
      console.log(`📊 Simulação de Relatório ${periodName} (${personality})`);
      console.log('--------------------------------------------------');
      
      try {
        // Definir período
        let startDate, endDate, periodTitle;
        const now = new Date();
        
        switch (periodType) {
          case 'day':
            startDate = moment(now).startOf('day').toISOString();
            endDate = moment(now).endOf('day').toISOString();
            periodTitle = `Hoje (${moment(now).format('DD/MM/YYYY')})`;
            break;
          case 'week':
            startDate = moment(now).startOf('week').toISOString();
            endDate = moment(now).endOf('week').toISOString();
            periodTitle = `Semana (${moment(now).startOf('week').format('DD/MM')} - ${moment(now).endOf('week').format('DD/MM')})`;
            break;
          case 'month':
          default:
            startDate = moment(now).startOf('month').toISOString();
            endDate = moment(now).endOf('month').toISOString();
            periodTitle = `Mês de ${moment(now).format('MMMM/YYYY')}`;
            break;
        }
        
        // Simular dados de relatório
        const mockSummary = {
          income: 3500.00,
          expense: 2800.00,
          balance: 700.00,
          categories: {
            'Alimentação': { 
              total: 950.00, 
              icon: '🍔', 
              type: 'expense'
            },
            'Transporte': { 
              total: 350.00, 
              icon: '🚗', 
              type: 'expense'
            },
            'Moradia': { 
              total: 1200.00, 
              icon: '🏠', 
              type: 'expense'
            },
            'Lazer': { 
              total: 300.00, 
              icon: '🎮', 
              type: 'expense'
            },
            'Salário': { 
              total: 3200.00, 
              icon: '💰', 
              type: 'income'
            },
            'Freelance': { 
              total: 300.00, 
              icon: '💻', 
              type: 'income'
            }
          }
        };
        
        // Simular transações
        const mockTransactions = [
          {
            description: 'Salário mensal',
            amount: 3200.00,
            type: 'income',
            transaction_date: moment().subtract(5, 'days').toISOString(),
            categories: { name: 'Salário', icon: '💰' }
          },
          {
            description: 'Aluguel',
            amount: 1200.00,
            type: 'expense',
            transaction_date: moment().subtract(3, 'days').toISOString(),
            categories: { name: 'Moradia', icon: '🏠' }
          },
          {
            description: 'Supermercado',
            amount: 450.00,
            type: 'expense',
            transaction_date: moment().subtract(2, 'days').toISOString(),
            categories: { name: 'Alimentação', icon: '🍔' }
          },
          {
            description: 'Restaurante',
            amount: 120.00,
            type: 'expense',
            transaction_date: moment().subtract(1, 'days').toISOString(),
            categories: { name: 'Alimentação', icon: '🍔' }
          },
          {
            description: 'Freelance design',
            amount: 300.00,
            type: 'income',
            transaction_date: moment().toISOString(),
            categories: { name: 'Freelance', icon: '💻' }
          }
        ];
        
        // Montar mensagem de relatório
        let reportMessage = `
📊 *Relatório Financeiro - ${periodTitle}*

💰 *Receitas:* R$ ${mockSummary.income.toFixed(2)}
💸 *Despesas:* R$ ${mockSummary.expense.toFixed(2)}
🏦 *Saldo:* R$ ${mockSummary.balance.toFixed(2)}
`;
        
        // Adicionar comentário sobre saúde financeira
        reportMessage += '\n' + personalityService.getResponse(
          personality,
          'financialHealthComment',
          mockSummary.income,
          mockSummary.expense,
          mockSummary.balance
        );
        
        // Adicionar categorias
        reportMessage += '\n\n📋 *Detalhamento por Categoria:*\n';
        
        // Categorias de despesa
        reportMessage += '\n💸 *Despesas:*\n';
        Object.entries(mockSummary.categories)
          .filter(([_, data]) => data.type === 'expense')
          .sort(([_, a], [__, b]) => b.total - a.total)
          .forEach(([name, data]) => {
            reportMessage += `${data.icon} ${name}: R$ ${data.total.toFixed(2)}\n`;
          });
        
        // Adicionar comentário sobre categoria de maior gasto
        const highestExpenseCat = Object.entries(mockSummary.categories)
          .filter(([_, data]) => data.type === 'expense')
          .sort(([_, a], [__, b]) => b.total - a.total)[0];
          
        if (highestExpenseCat) {
          const comment = personalityService.getResponse(
            personality,
            'highSpendingComment',
            highestExpenseCat[0],
            highestExpenseCat[1].total,
            mockSummary.expense
          );
          
          if (comment) {
            reportMessage += `\n${comment}\n`;
          }
        }
        
        // Categorias de receita
        reportMessage += '\n💰 *Receitas:*\n';
        Object.entries(mockSummary.categories)
          .filter(([_, data]) => data.type === 'income')
          .sort(([_, a], [__, b]) => b.total - a.total)
          .forEach(([name, data]) => {
            reportMessage += `${data.icon} ${name}: R$ ${data.total.toFixed(2)}\n`;
          });
        
        // Últimas transações
        reportMessage += '\n\n📝 *Últimas Transações:*\n';
        mockTransactions.forEach(tx => {
          const emoji = tx.type === 'income' ? '💰' : '💸';
          const date = moment(tx.transaction_date).format('DD/MM');
          reportMessage += `${emoji} ${date} - ${tx.categories.icon} ${tx.description}: R$ ${tx.amount.toFixed(2)}\n`;
        });
        
        // Adicionar dica personalizada
        reportMessage += '\n\n' + personalityService.getResponse(personality, 'randomTip');
        
        // Exibir o relatório simulado
        console.log(reportMessage);
      } catch (error) {
        console.log('❌ Erro ao simular relatório:');
        console.error(error);
      }
      
      rl.question('\nPressione Enter para voltar...', testReports);
    });
  });
}

// Iniciar o aplicativo
console.log('Inicializando DinDin AI Dev Tool...');
showMainMenu();