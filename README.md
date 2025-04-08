# 💰 DinDin AI - Assistente Financeiro para Telegram

Um bot assistente financeiro para Telegram que usa LLM (Groq API) para processar linguagem natural e registrar transações financeiras no Supabase, com personalidade customizável.

## 📋 Funcionalidades

- Registra despesas e receitas em linguagem natural
- Personalidade customizável (Amigável, Debochado ou Profissional)
- Categoriza automaticamente transações
- Gera relatórios por dia, semana e mês
- Armazena dados no Supabase
- Interface amigável via Telegram

## 🚀 Instalação

### Pré-requisitos

- Node.js (v14+)
- Conta no Telegram para criar um bot (@BotFather)
- Conta no Groq para acesso à API
- Conta no Supabase para o banco de dados

### Passos para instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/dindin-ai.git
cd dindin-ai
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o ambiente:
   - Crie um arquivo `.env` com base no `.env.example`
   - Preencha as chaves necessárias:
     - `TELEGRAM_TOKEN`: Obtenha este token do @BotFather no Telegram
     - `GROQ_API_KEY`: Obtenha na plataforma Groq
     - `SUPABASE_URL` e `SUPABASE_KEY`: Obtenha no painel do Supabase

4. Configure o banco de dados:
   - Execute o script SQL fornecido no Supabase SQL Editor

5. Inicie o bot:
```bash
npm start
```

## 💬 Como usar

1. Inicie uma conversa com o bot no Telegram
2. Use o comando `/start` para começar
3. Escolha uma personalidade para o bot:
   - 😊 **Amigável e Tranquilo**: Tom mais suave e empático
   - 😜 **Debochado e Engraçado**: Tom bem-humorado e irônico
   - 👔 **Profissional e Conciso**: Tom formal e objetivo
4. Registre transações enviando mensagens como:
   - "Hambúrguer do iFood 34,90"
   - "Salário 1900"
   - "Entrada 50"
   - "Compras no mercado 125,75"
5. Use comandos para ver relatórios:
   - `/hoje` - Transações de hoje
   - `/semana` - Transações da semana
   - `/mes` - Transações do mês
   - `/relatorio` - Relatório mensal completo
   - `/configurar` - Mudar a personalidade do bot
   - `/ajuda` - Ver todos os comandos disponíveis

## 🧠 Como funciona

1. O usuário envia uma mensagem ao bot no Telegram
2. Um LLM (Groq API) analisa a mensagem para identificar transações financeiras
3. Os dados são extraídos e categorizados automaticamente
4. A transação é registrada no Supabase
5. O bot envia uma confirmação ou resposta contextual com base na personalidade escolhida

## 📁 Estrutura do Projeto

```
├── main.js                   # Arquivo principal do bot
├── handlers/                 # Manipuladores de comandos e eventos
│   └── telegramHandlers.js   # Handlers para comandos do Telegram
├── services/                 # Serviços de integração
│   ├── llm.js                # Integração com Groq LLM
│   ├── supabase.js           # Integração com Supabase
│   ├── userConfig.js         # Gerenciamento de configurações do usuário
│   └── personalityResponses.js # Respostas personalizadas por personalidade
├── .env                      # Variáveis de ambiente (não commitar)
└── package.json              # Dependências do projeto
```

## 📄 Database Schema

O banco de dados contém as seguintes tabelas:

- **users**: Informações dos usuários do Telegram
- **categories**: Categorias de transações (despesas e receitas)
- **transactions**: Registros financeiros dos usuários
- **user_configs**: Configurações e preferências dos usuários

## 🏗️ Melhorias Futuras

- Adicionar suporte a múltiplas moedas
- Implementar sistema de metas financeiras
- Adicionar gráficos nos relatórios
- Permitir edição e exclusão de transações
- Adicionar suporte a transações recorrentes
- Implementar exportação de dados
- Adicionar autenticação extra para mais segurança

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests.

## 📃 Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para mais detalhes.