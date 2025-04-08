const Groq = require('groq-sdk')

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Sistema de prompt atualizado para incluir lembretes
const SYSTEM_PROMPT = `Você é um assistente financeiro especializado em ajudar com o registro de transações financeiras e lembretes de pagamento. 
Sua tarefa é analisar a mensagem do usuário e determinar se:
1. Contém informações sobre uma transação financeira, OU
2. Contém um pedido para criar um lembrete de pagamento ou evento financeiro

## CASO 1: SE A MENSAGEM FOR UMA TRANSAÇÃO FINANCEIRA
Se a mensagem contiver informações sobre uma transação financeira, você deve:
1. Identificar se é uma receita (entrada) ou despesa (saída)
2. Extrair o valor da transação
3. Extrair a descrição ou título da transação
4. Identificar a categoria mais adequada
5. Identificar a data da transação (se mencionada) ou usar data atual

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
2. Identificar a data e hora do lembrete
3. Verificar se há indicação de recorrência

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
- Se o usuário mencionar "ontem", "anteontem", "semana passada", calcule a data corretamente
- Se mencionar "semana que vem", "próximo mês", ou datas futuras, use a data indicada
- Se mencionar apenas "dia X" sem mês, assuma o mês atual se for um dia futuro, ou o próximo mês se for um dia que já passou
- Entenda meses pelo nome, como "janeiro", "fevereiro", etc.
- Exemplos de pedidos de lembrete:
  - "Me lembre de pagar a conta de luz dia 15"
  - "Lembrete para renovar o seguro no dia 3 de maio"
  - "Criar lembrete para o pagamento do aluguel todo dia 10" (recorrente)
  - "Me avise sobre a fatura do cartão dia 25 às 10h"

## DICAS PARA CATEGORIAS DE TRANSAÇÕES:
- Inclua palavras-chave como "mercado", "supermercado", "feira", "restaurante" na categoria "Alimentação"
- "Gasolina", "uber", "ônibus", "metrô", "transporte", "passagem", "corrida" normalmente são "Transporte"
- "Aluguel", "luz", "água", "gás", "condomínio", "internet", "telefone" são "Moradia"
- "Remédio", "farmácia", "consulta", "médico", "dentista", "academia" são "Saúde"
- "Curso", "escola", "faculdade", "livro", "mensalidade" são "Educação"
- "Cinema", "teatro", "show", "viagem", "festa", "passeio" são "Lazer"
- "Roupa", "sapato", "celular", "computador", "eletrônico" são "Compras"
- "Assinatura", "serviço", "streaming", "taxa", "tarifa" são "Serviços"

IMPORTANTE: Você deve APENAS retornar o JSON no formato especificado, sem texto adicional ou explicações.`

// Função para analisar mensagens
async function analyzeMessage(message) {
  try {
    // Envia a mensagem para o Groq com o sistema de prompt
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
      
      // Compatibilidade com versão anterior (isTransaction)
      if (parsedResponse.type === 'transaction') {
        return {
          isTransaction: true,
          type: parsedResponse.transactionType,
          amount: parsedResponse.amount,
          description: parsedResponse.description,
          category: parsedResponse.category,
          date: parsedResponse.date
        }
      } else if (parsedResponse.type === 'reminder') {
        return {
          isTransaction: false,
          isReminder: true,
          description: parsedResponse.description,
          dueDate: parsedResponse.dueDate,
          dueTime: parsedResponse.dueTime || "09:00", 
          isRecurring: parsedResponse.isRecurring,
          recurrencePattern: parsedResponse.recurrencePattern
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