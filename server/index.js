import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Forçar o PostgreSQL a usar o Schema 'roleta'
pool.on('connect', client => {
    client.query('SET search_path TO roleta, public');
});

const app = express();
const PORT = Number(process.env.PORT || 3000);

// 👇 NOVA CONFIGURAÇÃO CORS BLINDADA 👇
app.use(cors({
    // Permite explicitamente o domínio do frontend
    origin: [process.env.FRONTEND_URL, 'http://172.16.10.28:8081', 'https://roleta.coffito.gov.br'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'X-Admin-Password'],
    credentials: true,
    optionsSuccessStatus: 200 // Alguns navegadores antigos engasgam no 204
}));

// Força a resposta ao pedido fantasma (Preflight OPTIONS) manualmente
app.options('*', cors()); 
// 👆 -------------------------------- 👆

app.use(express.json());

// 👇 MIDDLEWARE DE SEGURANÇA (O "Segurança da Porta") 👇
const requireAdmin = (req, res, next) => {
    const clientPassword = req.headers['x-admin-password'];
    const serverPassword = process.env.ADMIN_PASSWORD;

    if (!serverPassword) {
        console.warn("⚠️ AVISO: A variável ADMIN_PASSWORD não está configurada no .env!");
    }

    if (clientPassword && clientPassword === serverPassword) {
        next(); // Senha correta!
    } else {
        res.status(401).json({ error: 'Acesso negado: Senha incorreta ou ausente.' });
    }
};

/**
 * ROTA DE TESTE (GET)
 */
app.get('/', (req, res) => {
    res.json({
        status: 'Online',
        message: 'Backend da Roleta de Brindes está a funcionar!'
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

/**
 * NOVA ROTA: AUTENTICAÇÃO (POST)
 */
app.post('/api/auth', requireAdmin, (req, res) => {
    res.status(200).json({ message: 'Autenticado com sucesso' });
});

/**
 * ROTA: SALVAR CONFIGURAÇÕES (POST) - PROTEGIDA
 */
app.post('/api/prizes/save', requireAdmin, async (req, res) => {
    const { prizes } = req.body;

    if (!prizes || !Array.isArray(prizes)) {
        return res.status(400).json({ error: 'Lista de prémios inválida.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM prizes');

        for (const p of prizes) {
            await client.query(
                'INSERT INTO prizes (name, quantity) VALUES ($1, $2)',
                [p.name, p.quantity || 0]
            );
        }

        await client.query('COMMIT');
        console.log('✅ Configurações salvas.');
        res.json({ message: 'Configurações salvas com sucesso!' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[ERRO AO SALVAR]:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    } finally {
        client.release();
    }
});

/**
 * ROTA: LIMPAR BANCO (DELETE) - PROTEGIDA
 */
app.delete('/api/prizes/clear', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM prizes');
        await pool.query('DELETE FROM spin_history');
        console.log('🗑️ Banco limpo.');
        res.json({ message: 'Banco de dados limpo com sucesso!' });
    } catch (error) {
        console.error('[ERRO AO LIMPAR]:', error);
        res.status(500).json({ error: 'Erro ao limpar banco.' });
    }
});

/**
 * ROTA DE SORTEIO (POST) - ATUALIZADA PARA CONCORRÊNCIA E SEM SENHA
 */
app.post('/api/spin', async (req, res) => {
    const client = await pool.connect();
    
    try {
        let spinSuccess = false;
        let finalPrize = '';
        let attempts = 0;
        const MAX_ATTEMPTS = 5;

        while (!spinSuccess && attempts < MAX_ATTEMPTS) {
            attempts++;
            
            const { rows: availablePrizes } = await client.query(
                'SELECT name, quantity FROM prizes WHERE quantity > 0'
            );

            if (availablePrizes.length === 0) {
                return res.status(400).json({ error: 'Todos os brindes estão esgotados!' });
            }

            let totalStock = 0;
            for (const prize of availablePrizes) {
                totalStock += prize.quantity;
            }

            let randomValue = Math.floor(Math.random() * totalStock);
            let prizeName = '';

            for (const prize of availablePrizes) {
                randomValue -= prize.quantity;
                if (randomValue < 0) {
                    prizeName = prize.name;
                    break;
                }
            }

            await client.query('BEGIN');

            const updateResult = await client.query(
                'UPDATE prizes SET quantity = quantity - 1 WHERE name = $1 AND quantity > 0 RETURNING *',
                [prizeName]
            );

            if (updateResult.rowCount > 0) {
                const historyResult = await client.query(
                    'INSERT INTO spin_history (prize_name) VALUES ($1) RETURNING *',
                    [prizeName]
                );

                await client.query('COMMIT');
                
                spinSuccess = true;
                finalPrize = prizeName;
                
                console.log(`[SUCESSO] Sorteado: ${prizeName}`);
                
                return res.json({
                    prize: finalPrize,
                    timestamp: historyResult.rows[0].created_at
                });
            } else {
                await client.query('ROLLBACK');
            }
        }

        if (!spinSuccess) {
            res.status(500).json({ error: 'Muitos acessos simultâneos, por favor tente novamente.' });
        }

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[ERRO SQL NO SORTEIO]:', error);
        res.status(500).json({ error: 'Erro ao processar o sorteio.' });
    } finally {
        client.release();
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

/**
 * ROTA: BUSCAR CONFIGURAÇÕES ATUAIS (GET) - PÚBLICA
 * Usada pelo frontend para carregar a roleta quando o site é aberto
 */
app.get('/api/prizes', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, quantity FROM prizes ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('[ERRO AO BUSCAR PRÉMIOS]:', error);
        res.status(500).json({ error: 'Erro ao buscar prémios da base de dados.' });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});