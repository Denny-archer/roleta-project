import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// 👇 CORREÇÃO: Forçar o PostgreSQL a usar o Schema 'roleta' onde as tuas tabelas estão 👇
pool.on('connect', client => {
    client.query('SET search_path TO roleta, public');
});

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors({
    origin: process.env.FRONTEND_URL
}));
app.use(express.json());

/**
 * ROTA DE TESTE (GET)
 */
app.get('/', (req, res) => {
    res.json({
        status: 'Online',
        message: 'Backend da Roleta de Brindes está a funcionar com gestão de stock!'
    });
});

/**
 * ROTA DE SAÚDE (HEALTH CHECK) - Colocada no topo para boas práticas Docker
 */
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

/**
 * NOVA ROTA: SALVAR CONFIGURAÇÕES (POST)
 */
app.post('/api/prizes/save', async (req, res) => {
    const { prizes } = req.body; // Array de { name, quantity }

    if (!prizes || !Array.isArray(prizes)) {
        return res.status(400).json({ error: 'Lista de prémios inválida.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Inicia transação

        // Limpa as configurações antigas
        await client.query('DELETE FROM prizes');

        // Insere as novas configurações
        for (const p of prizes) {
            await client.query(
                'INSERT INTO prizes (name, quantity) VALUES ($1, $2)',
                [p.name, p.quantity || 0]
            );
        }

        await client.query('COMMIT'); // Confirma as mudanças
        console.log('✅ Configurações de prémios atualizadas no banco.');
        res.json({ message: 'Configurações salvas com sucesso!' });
    } catch (error) {
        await client.query('ROLLBACK'); // Em caso de erro, desfaz as mudanças
        console.error('[ERRO AO SALVAR]:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    } finally {
        client.release();
    }
});

/**
 * NOVA ROTA: LIMPAR BANCO (DELETE)
 */
app.delete('/api/prizes/clear', async (req, res) => {
    try {
        await pool.query('DELETE FROM prizes');
        await pool.query('DELETE FROM spin_history');
        console.log('🗑️ Banco de dados completamente limpo.');
        res.json({ message: 'Banco de dados limpo com sucesso!' });
    } catch (error) {
        console.error('[ERRO AO LIMPAR]:', error);
        res.status(500).json({ error: 'Erro ao limpar banco.' });
    }
});

/**
 * ROTA DE SORTEIO (POST) - ATUALIZADA PARA GERIR STOCK E SORTEIO PONDERADO
 */
app.post('/api/spin', async (req, res) => {
    try {
        // 1. Busca os prémios que ainda têm stock disponível, trazendo também a quantidade
        const { rows: availablePrizes } = await pool.query(
            'SELECT name, quantity FROM prizes WHERE quantity > 0'
        );

        if (availablePrizes.length === 0) {
            return res.status(400).json({ error: 'Todos os brindes estão esgotados ou não configurados!' });
        }

        // 2. Lógica matemática de Sorteio Ponderado (Weighted Random)
        let totalStock = 0;
        for (const prize of availablePrizes) {
            totalStock += prize.quantity;
        }

        let randomValue = Math.floor(Math.random() * totalStock);
        let prizeName = '';

        // Encontra em qual "fatia" caiu
        for (const prize of availablePrizes) {
            randomValue -= prize.quantity;
            if (randomValue < 0) {
                prizeName = prize.name;
                break;
            }
        }

        // Validação
        if (!prizeName) {
            throw new Error('Erro ao selecionar premio sorteado.');
        }

        const spinId = crypto.randomUUID();

        // 3. Transação: Atualiza stock e grava histórico
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Subtrai 1 do stock
            await client.query('UPDATE prizes SET quantity = quantity - 1 WHERE name = $1', [prizeName]);

            // Grava histórico (SEM o spin_id)
            const historyResult = await client.query(
                'INSERT INTO spin_history (prize_name) VALUES ($1) RETURNING *',
                [prizeName]
            );


            await client.query('COMMIT');

            console.log(`[SORTEIO E STOCK] Sorteado: ${prizeName} | Stock reduzido em 1.`);

            // 4. Devolve ao frontend o nome sorteado
            res.json({
                prize: prizeName,
                timestamp: historyResult.rows[0].created_at,
                spinId: spinId
            });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('[ERRO SQL NO SORTEIO]:', error);
        res.status(500).json({ error: 'Erro ao processar o sorteio na base de dados.' });
    }
});

/**
 * ROTA DO HISTÓRICO (GET)
 */
app.get('/api/history', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM spin_history ORDER BY created_at DESC LIMIT 10');
        res.json(result.rows);
    } catch (error) {
        console.error('[ERROR]', error.message);
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

// Tratamento de rotas não encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada neste servidor API.' });
});

// 3. INICIAR O SERVIDOR
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});