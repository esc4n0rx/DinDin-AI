// services/llm.js - versão modificada para incluir data atual no prompt

const Groq = require('groq-sdk')

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Função para analisar mensagens
async function analyzeMessage(message) {
  try {
    // Obter a data atual do servidor
    const now = new Date();
    const currentDateISO = now.toISOString();
    const formattedDate = now.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Sistema de prompt atualizado para incluir lembretes e a data atual
    const systemPrompt = `Você é um assistente financeiro especializado em ajudar com o registro de transações financeiras e lembretes de pagamento.

IMPORTANTE: A DATA ATUAL É ${formattedDate} (${currentDateISO}). Utilize esta data como referência para todos os cálculos de data.

Sua tarefa é analisar a mensagem do usuário e determinar se:
1. Contém informações sobre uma transação financeira, OU
2. Contém um pedido para criar um lembrete de pagamento ou evento financeiro

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

## CASO 3: SE A MENSAGEM NÃO FOR NENHUM DOS CASOS ACIMA
Se a mensagem não for nem uma transação nem um pedido de lembrete, responda:
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

    // Envia a mensagem para o Groq com o sistema de prompt
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.1, // Temperatura mais baixa para obter respostas mais determinísticas
      max_completion_tokens: 500,
      top_p: 1,
      stream: false
    })

    const response = chatCompletion.choices[0]?.message?.content || '{}'
    
    try {
      // Tenta fazer o parse do JSON
      const parsedResponse = JSON.parse(response);
      
      console.log('Resposta do LLM:', parsedResponse);
      
      // Compatibilidade com versão anterior (isTransaction)
      if (parsedResponse.type === 'transaction') {
        return {
          isTransaction: true,
          type: parsedResponse.transactionType,
          amount: parsedResponse.amount,
          description: parsedResponse.description,
          category: parsedResponse.category,
          date: parsedResponse.date || now.toISOString().split('T')[0]
        }
      } else if (parsedResponse.type === 'reminder') {
        // Garantir que dueDate nunca seja vazio
        const dueDate = parsedResponse.dueDate || now.toISOString().split('T')[0];
        
        return {
          isTransaction: false,
          isReminder: true,
          description: parsedResponse.description,
          dueDate: dueDate,
          dueTime: parsedResponse.dueTime || "09:00", 
          isRecurring: parsedResponse.isRecurring || false,
          recurrencePattern: parsedResponse.recurrencePattern || ''
        }
      } else {
        return { 
          isTransaction: false,
          isReminder: false
        }
      }
    } catch (parseError) {
      console.error('Error parsing LLM response:', parseError)
      console.log('Original response:', response)
      return { isTransaction: false, error: 'Failed to parse response' }
    }
  } catch (error) {
    console.error('Error analyzing message with LLM:', error)
    return { isTransaction: false, error: 'Failed to analyze message' }
  }
}

module.exports = {
  analyzeMessage
}