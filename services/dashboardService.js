/**
 * dashboardService.js
 * Serviço para geração de dashboards visuais para o Telegram
 * 
 * Este serviço permite a criação de gráficos e visualizações de dados
 * financeiros que podem ser enviados como imagens pelo Telegram.
 */

const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');

// Configuração de cores para categorias
const CATEGORY_COLORS = {
  // Despesas
  'Alimentação': '#FF6384',
  'Transporte': '#36A2EB',
  'Moradia': '#FFCE56',
  'Lazer': '#4BC0C0',
  'Saúde': '#9966FF',
  'Educação': '#FF9F40',
  'Vestuário': '#C9CBCF',
  'Compras': '#7BC043',
  'Serviços': '#EF5F3C',
  // Receitas
  'Salário': '#4CAF50',
  'Investimentos': '#2196F3',
  'Bônus': '#FFC107',
  'Freelance': '#9C27B0',
  'Outros': '#607D8B'
};

// Diretório para armazenar imagens temporárias
const TEMP_DIR = path.join(__dirname, '../temp');

// Garante que o diretório temp existe
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Gera um gráfico de distribuição de gastos por categoria
 * @param {number} userId - ID do usuário
 * @param {string} startDate - Data inicial no formato ISO
 * @param {string} endDate - Data final no formato ISO
 * @param {string} type - Tipo de transação ('expense' ou 'income')
 * @returns {Promise<string>} - Caminho para o arquivo de imagem gerado
 */
async function generateCategoryDistributionChart(userId, startDate, endDate, type = 'expense') {
  try {
    // Busca as transações do período
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        amount,
        categories:category_id (
          name,
          icon
        )
      `)
      .eq('user_id', userId)
      .eq('type', type)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);
    
    if (error) throw error;
    
    // Agrupa por categoria
    const categoryTotals = {};
    transactions.forEach(tx => {
      const categoryName = tx.categories?.name || 'Sem categoria';
      if (!categoryTotals[categoryName]) {
        categoryTotals[categoryName] = 0;
      }
      categoryTotals[categoryName] += Number(tx.amount);
    });
    
    // Ordena categorias por valor (do maior para o menor)
    const sortedCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1]);
    
    // Prepara dados para o gráfico
    const labels = sortedCategories.map(([name]) => name);
    const data = sortedCategories.map(([, amount]) => amount);
    const colors = labels.map(label => CATEGORY_COLORS[label] || '#' + Math.floor(Math.random()*16777215).toString(16));
    
    // Cria o canvas
    const canvas = createCanvas(600, 400);
    const ctx = canvas.getContext('2d');
    
    // Gera o gráfico
    new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: {
                size: 14
              }
            }
          },
          title: {
            display: true,
            text: type === 'expense' ? 'Distribuição de Despesas por Categoria' : 'Distribuição de Receitas por Categoria',
            font: {
              size: 18
            }
          }
        }
      }
    });
    
    // Salva a imagem
    const fileName = `category_distribution_${userId}_${Date.now()}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    
    return new Promise((resolve, reject) => {
      out.on('finish', () => resolve(filePath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Erro ao gerar gráfico de distribuição:', error);
    throw error;
  }
}

/**
 * Gera um gráfico de linha mostrando a evolução dos gastos ao longo do tempo
 * @param {number} userId - ID do usuário
 * @param {string} startDate - Data inicial no formato ISO
 * @param {string} endDate - Data final no formato ISO
 * @param {string} type - Tipo de transação ('expense' ou 'income')
 * @returns {Promise<string>} - Caminho para o arquivo de imagem gerado
 */
async function generateTimeSeriesChart(userId, startDate, endDate, type = 'expense') {
  try {
    // Busca as transações do período
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`amount, transaction_date`)
      .eq('user_id', userId)
      .eq('type', type)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: true });
    
    if (error) throw error;
    
    // Agrupa por dia
    const dailyTotals = {};
    transactions.forEach(tx => {
      const date = moment(tx.transaction_date).format('YYYY-MM-DD');
      if (!dailyTotals[date]) {
        dailyTotals[date] = 0;
      }
      dailyTotals[date] += Number(tx.amount);
    });
    
    // Preenche os dias sem transações
    const days = [];
    const currentDate = moment(startDate);
    const lastDate = moment(endDate);
    
    while (currentDate <= lastDate) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      days.push(dateStr);
      if (!dailyTotals[dateStr]) {
        dailyTotals[dateStr] = 0;
      }
      currentDate.add(1, 'day');
    }
    
    // Ordena as datas
    days.sort();
    
    // Cria o canvas
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Gera o gráfico
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: days.map(d => moment(d).format('DD/MM')),
        datasets: [{
          label: type === 'expense' ? 'Despesas' : 'Receitas',
          data: days.map(day => dailyTotals[day]),
          borderColor: type === 'expense' ? '#FF6384' : '#4CAF50',
          backgroundColor: type === 'expense' ? 'rgba(255, 99, 132, 0.2)' : 'rgba(76, 175, 80, 0.2)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: type === 'expense' 
              ? 'Evolução das Despesas ao Longo do Tempo' 
              : 'Evolução das Receitas ao Longo do Tempo',
            font: {
              size: 18
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return 'R$ ' + value.toFixed(2);
              }
            }
          }
        }
      }
    });
    
    // Salva a imagem
    const fileName = `time_series_${userId}_${Date.now()}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    
    return new Promise((resolve, reject) => {
      out.on('finish', () => resolve(filePath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Erro ao gerar gráfico de série temporal:', error);
    throw error;
  }
}

/**
 * Gera um gráfico de barras comparando receitas e despesas
 * @param {number} userId - ID do usuário
 * @param {string} startDate - Data inicial no formato ISO
 * @param {string} endDate - Data final no formato ISO
 * @returns {Promise<string>} - Caminho para o arquivo de imagem gerado
 */
async function generateIncomeExpenseComparisonChart(userId, startDate, endDate) {
  try {
    // Busca todas as transações do período
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`amount, type, transaction_date`)
      .eq('user_id', userId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);
    
    if (error) throw error;
    
    // Define o período para agrupamento (dias, semanas ou meses)
    let groupByFormat;
    const days = moment(endDate).diff(moment(startDate), 'days');
    
    if (days <= 14) {
      groupByFormat = 'YYYY-MM-DD'; // Agrupar por dia
    } else if (days <= 60) {
      groupByFormat = 'YYYY-WW'; // Agrupar por semana
    } else {
      groupByFormat = 'YYYY-MM'; // Agrupar por mês
    }
    
    // Agrupa por período
    const groups = {};
    transactions.forEach(tx => {
      const period = moment(tx.transaction_date).format(groupByFormat);
      
      if (!groups[period]) {
        groups[period] = { income: 0, expense: 0 };
      }
      
      if (tx.type === 'income') {
        groups[period].income += Number(tx.amount);
      } else {
        groups[period].expense += Number(tx.amount);
      }
    });
    
    // Ordena os períodos
    const periods = Object.keys(groups).sort();
    
    // Formata os rótulos com base no tipo de período
    const formatLabel = (period) => {
      if (groupByFormat === 'YYYY-MM-DD') {
        return moment(period).format('DD/MM');
      } else if (groupByFormat === 'YYYY-WW') {
        const week = period.split('-')[1];
        return `Sem ${week}`;
      } else {
        return moment(period, 'YYYY-MM').format('MMM/YY');
      }
    };
    
    // Cria o canvas
    const canvas = createCanvas(800, 500);
    const ctx = canvas.getContext('2d');
    
    // Gera o gráfico
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: periods.map(formatLabel),
        datasets: [
          {
            label: 'Receitas',
            data: periods.map(period => groups[period].income),
            backgroundColor: 'rgba(76, 175, 80, 0.7)',
            borderColor: 'rgba(76, 175, 80, 1)',
            borderWidth: 1
          },
          {
            label: 'Despesas',
            data: periods.map(period => groups[period].expense),
            backgroundColor: 'rgba(255, 99, 132, 0.7)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: 'Comparativo de Receitas e Despesas',
            font: {
              size: 18
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return 'R$ ' + value.toFixed(2);
              }
            }
          }
        }
      }
    });
    
    // Salva a imagem
    const fileName = `comparison_${userId}_${Date.now()}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    
    return new Promise((resolve, reject) => {
      out.on('finish', () => resolve(filePath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Erro ao gerar gráfico comparativo:', error);
    throw error;
  }
}

/**
 * Gera um gráfico de evolução do saldo (receitas - despesas)
 * @param {number} userId - ID do usuário
 * @param {string} startDate - Data inicial no formato ISO
 * @param {string} endDate - Data final no formato ISO
 * @returns {Promise<string>} - Caminho para o arquivo de imagem gerado
 */
async function generateBalanceEvolutionChart(userId, startDate, endDate) {
  try {
    // Busca todas as transações do período
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`amount, type, transaction_date`)
      .eq('user_id', userId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: true });
    
    if (error) throw error;
    
    // Calcula a evolução do saldo
    let balance = 0;
    const balanceData = [];
    const dates = [];
    
    // Agrupa por dia
    const dailyBalances = {};
    transactions.forEach(tx => {
      const date = moment(tx.transaction_date).format('YYYY-MM-DD');
      
      if (!dailyBalances[date]) {
        dailyBalances[date] = 0;
      }
      
      if (tx.type === 'income') {
        dailyBalances[date] += Number(tx.amount);
      } else {
        dailyBalances[date] -= Number(tx.amount);
      }
    });
    
    // Preenche os dias e calcula o saldo acumulado
    const currentDate = moment(startDate);
    const lastDate = moment(endDate);
    
    while (currentDate <= lastDate) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      dates.push(dateStr);
      
      balance += (dailyBalances[dateStr] || 0);
      balanceData.push(balance);
      
      currentDate.add(1, 'day');
    }
    
    // Cria o canvas
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Gera o gráfico
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map(d => moment(d).format('DD/MM')),
        datasets: [{
          label: 'Saldo',
          data: balanceData,
          borderColor: '#3F51B5',
          backgroundColor: 'rgba(63, 81, 181, 0.2)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: 'Evolução do Saldo',
            font: {
              size: 18
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: function(value) {
                return 'R$ ' + value.toFixed(2);
              }
            }
          }
        }
      }
    });
    
    // Salva a imagem
    const fileName = `balance_evolution_${userId}_${Date.now()}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    
    return new Promise((resolve, reject) => {
      out.on('finish', () => resolve(filePath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Erro ao gerar gráfico de evolução de saldo:', error);
    throw error;
  }
}

/**
 * Limpa arquivos temporários antigos
 * @param {number} maxAgeMinutes - Idade máxima dos arquivos em minutos
 */
function cleanupTempFiles(maxAgeMinutes = 60) {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      const fileAge = (now - stats.mtimeMs) / (1000 * 60); // idade em minutos
      
      if (fileAge > maxAgeMinutes) {
        fs.unlinkSync(filePath);
        console.log(`Arquivo temporário removido: ${file}`);
      }
    });
  } catch (error) {
    console.error('Erro ao limpar arquivos temporários:', error);
  }
}

/**
 * Gera todos os gráficos do dashboard para um período
 * @param {number} userId - ID do usuário
 * @param {string} startDate - Data inicial no formato ISO
 * @param {string} endDate - Data final no formato ISO
 * @returns {Promise<Object>} - Objeto com caminhos para os arquivos de imagem gerados
 */
async function generateDashboard(userId, startDate, endDate) {
  try {
    // Limpa arquivos temporários antigos
    cleanupTempFiles();
    
    // Gera todos os gráficos em paralelo
    const [
      expenseDistributionPath,
      incomeDistributionPath,
      expenseTimeSeriesPath,
      incomeExpenseComparisonPath,
      balanceEvolutionPath
    ] = await Promise.all([
      generateCategoryDistributionChart(userId, startDate, endDate, 'expense'),
      generateCategoryDistributionChart(userId, startDate, endDate, 'income'),
      generateTimeSeriesChart(userId, startDate, endDate, 'expense'),
      generateIncomeExpenseComparisonChart(userId, startDate, endDate),
      generateBalanceEvolutionChart(userId, startDate, endDate)
    ]);
    
    return {
      expenseDistribution: expenseDistributionPath,
      incomeDistribution: incomeDistributionPath,
      expenseTimeSeries: expenseTimeSeriesPath,
      incomeExpenseComparison: incomeExpenseComparisonPath,
      balanceEvolution: balanceEvolutionPath
    };
  } catch (error) {
    console.error('Erro ao gerar dashboard:', error);
    throw error;
  }
}

module.exports = {
  generateCategoryDistributionChart,
  generateTimeSeriesChart,
  generateIncomeExpenseComparisonChart,
  generateBalanceEvolutionChart,
  generateDashboard,
  cleanupTempFiles
};