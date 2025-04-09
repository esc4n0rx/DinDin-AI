
const Groq = require('groq-sdk')

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

async function analyzeMessage(message) {
  try {
    const now = new Date();
    const currentDateISO = now.toISOString();
    const formattedDate = now.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const systemPrompt = `Você é um assistente financeiro especializado em ajudar com o registro de transações financeiras, lembretes de pagamento e metas financeiras.

IMPORTANTE: A DATA ATUAL É ${formattedDate} (${currentDateISO}). Utilize esta data como referência para todos os cálculos de data.

Sua tarefa é analisar a mensagem do usuário e determinar se:
1. Contém informações sobre uma transação financeira, OU
2. Contém um pedido para criar um lembrete de pagamento ou evento financeiro, OU
3. Contém um pedido para gerenciar uma meta financeira

## CASO 1: SE A MENSAGEM FOR UMA TRANSAÇÃO FINANCEIRA
Se a mensagem contiver informações sobre uma transação financeira, você deve:
1. Identificar se é uma receita (entrada) ou despesa (saída)
2. Extrair o valor da transação
3. Extrair a descrição ou título da transação
4. Identificar a categoria mais adequada
5. Identificar a data da transação (se mencionada) ou usar data atual (${formattedDate})

Responda APENAS em formato JSON:
{
  "type": "transaction",
  "transactionType": "income"/"expense",
  "amount": valor numérico sem símbolos de moeda,
  "description": "descrição da transação",
  "category": "nome da categoria",
  "date": "YYYY-MM-DD" (data da transação, se mencionada, ou data atual)
}

## CASO 2: SE A MENSAGEM FOR UM PEDIDO DE LEMBRETE
Se a mensagem for um pedido para criar um lembrete, você deve:
1. Extrair a descrição do que deve ser lembrado
2. Identificar a data do lembrete com base na data atual (${formattedDate})
3. Verificar se há indicação de recorrência

Alguns exemplos importantes para datas de lembretes:
- Se a mensagem diz "dia 15" e hoje é dia ${now.getDate()}, deve ser dia 15 do mês atual (${now.getMonth() + 1}) se ainda não passou, ou do próximo mês se já passou
- Se a mensagem diz "amanhã", deve ser ${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}
- NUNCA defina uma data no passado

Responda APENAS em formato JSON:
{
  "type": "reminder",
  "description": "descrição do lembrete",
  "dueDate": "YYYY-MM-DD" (data do lembrete),
  "dueTime": "HH:MM" (hora do lembrete, se mencionada, caso contrário "09:00"),
  "isRecurring": true/false (se o lembrete deve repetir),
  "recurrencePattern": "daily"/"weekly"/"monthly"/"yearly" (apenas se isRecurring for true)
}

## CASO 3: SE A MENSAGEM FOR SOBRE UMA META FINANCEIRA
Se a mensagem for um pedido para criar ou gerenciar uma meta financeira, você deve:
1. Determinar a ação desejada (criar meta, adicionar valor, consultar progresso, etc.)
2. Extrair o título/nome da meta
3. Extrair o valor alvo da meta (se for uma nova meta)
4. Extrair o valor inicial ou a contribuição (se mencionado)
5. Extrair a data alvo para alcançar a meta (se mencionada)

Considere estas ações possíveis:
- Criar nova meta
- Adicionar valor/contribuição a uma meta existente
- Consultar progresso de meta(s)
- Atualizar meta
- Excluir meta

Responda APENAS em formato JSON:
{
  "type": "goal",
  "action": "create"/"contribute"/"query"/"update"/"delete",
  "title": "título da meta (obrigatório para create, opcional para outros)",
  "targetAmount": valor numérico sem símbolos de moeda (obrigatório para create),
  "contributionAmount": valor numérico sem símbolos de moeda (obrigatório para contribute),
  "initialAmount": valor numérico sem símbolos de moeda (opcional),
  "targetDate": "YYYY-MM-DD" (data alvo para completar a meta, opcional),
  "category": "nome da categoria relacionada" (opcional)
}

Para pedidos de consulta (query), o campo "title" pode ser vazio para listar todas as metas, ou especificar uma meta particular para ver detalhes.

Alguns exemplos:
- "Quero criar uma meta para comprar um celular" -> Identifique como "create" e aguarde mais informações
- "Comprar computador novo até dezembro por 5000 reais" -> Identificar como meta com action=create
- "Adicionar 200 reais na minha meta da viagem" -> Identificar como meta com action=contribute
- "Como está minha meta do carro?" -> Identificar como meta com action=query
- "Quanto falta para completar a meta da poupança?" -> Identificar como meta com action=query

## CASO 4: SE A MENSAGEM FOR UMA CONTINUAÇÃO DE CONVERSA SOBRE META
Se a mensagem for uma resposta a uma pergunta sobre informações adicionais para uma meta, como:
- Resposta a "Qual o valor total da meta?"
- Resposta a "Você já tem algum valor guardado?"
- Resposta a "Até quando deseja alcançar essa meta?"

Responda com o JSON correspondente ao tipo de informação fornecida:
{
  "type": "goal_info",
  "infoType": "target_amount"/"initial_amount"/"target_date",
  "value": valor ou data correspondente
}

## CASO 5: SE A MENSAGEM NÃO FOR NENHUM DOS CASOS ACIMA
Se a mensagem não for nenhum dos casos acima, responda:
{
  "type": "unknown"
}

## DICAS PARA ENTENDER REFERÊNCIAS DE TEMPO:
- Data atual: ${formattedDate} (${currentDateISO})
- Dia atual: ${now.getDate()}
- Mês atual: ${now.getMonth() + 1}
- Ano atual: ${now.getFullYear()}
- Se o usuário mencionar "amanhã", use ${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}
- Se mencionar "semana que vem", use ${new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]}
- Se mencionar apenas "dia X" e esse dia já passou no mês atual, use o dia X do próximo mês
- Entenda meses pelo nome, como "janeiro", "fevereiro", etc.

IMPORTANTE: Você deve APENAS retornar o JSON no formato especificado, sem texto adicional ou explicações.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.1, 
      max_completion_tokens: 500,
      top_p: 1,
      stream: false
    })

    const response = chatCompletion.choices[0]?.message?.content || '{}'
    
    try {

      const parsedResponse = JSON.parse(response);
      
      console.log('Resposta do LLM:', parsedResponse);
      
      if (parsedResponse.type === 'transaction') {
        return {
          isTransaction: true,
          isReminder: false,
          isGoal: false,
          isGoalInfo: false,
          type: parsedResponse.transactionType,
          amount: parsedResponse.amount,
          description: parsedResponse.description,
          category: parsedResponse.category,
          date: parsedResponse.date || now.toISOString().split('T')[0]
        }
      } else if (parsedResponse.type === 'reminder') {
        const dueDate = parsedResponse.dueDate || now.toISOString().split('T')[0];
        
        return {
          isTransaction: false,
          isReminder: true,
          isGoal: false,
          isGoalInfo: false,
          description: parsedResponse.description,
          dueDate: dueDate,
          dueTime: parsedResponse.dueTime || "06:00", 
          isRecurring: parsedResponse.isRecurring || false,
          recurrencePattern: parsedResponse.recurrencePattern || ''
        }
      } else if (parsedResponse.type === 'goal') {
        return {
          isTransaction: false,
          isReminder: false,
          isGoal: true,
          isGoalInfo: false,
          goalAction: parsedResponse.action,
          title: parsedResponse.title,
          targetAmount: parsedResponse.targetAmount,
          contributionAmount: parsedResponse.contributionAmount,
          initialAmount: parsedResponse.initialAmount || 0,
          targetDate: parsedResponse.targetDate,
          category: parsedResponse.category
        }
      } else if (parsedResponse.type === 'goal_info') {
        return {
          isTransaction: false,
          isReminder: false,
          isGoal: false,
          isGoalInfo: true,
          infoType: parsedResponse.infoType,
          value: parsedResponse.value
        }
      } else {
        return { 
          isTransaction: false,
          isReminder: false,
          isGoal: false,
          isGoalInfo: false
        }
      }
    } catch (parseError) {
      console.error('Error parsing LLM response:', parseError)
      console.log('Original response:', response)
      return { 
        isTransaction: false, 
        isReminder: false,
        isGoal: false,
        isGoalInfo: false,
        error: 'Failed to parse response' 
      }
    }
  } catch (error) {
    console.error('Error analyzing message with LLM:', error)
    return { 
      isTransaction: false, 
      isReminder: false,
      isGoal: false,
      isGoalInfo: false,
      error: 'Failed to analyze message' 
    }
  }
}

module.exports = {
  analyzeMessage
}