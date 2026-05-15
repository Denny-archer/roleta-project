import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

// ✅ Pool sem "options" — não funciona junto com connectionString no node-postgres.
//    O search_path é aplicado via pool.on('connect') que roda em CADA conexão nova do pool.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('connect', client => {
    client.query('SET search_path TO roleta, public').catch(err => {
        console.error('[ERRO search_path]:', err.message);
    });
});

const app = express();
const PORT = Number(process.env.PORT || 3000);

// ✅ CORS via pacote oficial — mais robusto e battle-tested que middleware manual.
//    O middleware manual causava problemas quando o Express lançava erros antes de setar headers.
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://172.16.10.28:8081',
    'https://roleta.coffito.gov.br'
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Permite requisições sem origin (ex: Postman, health checks)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'X-Admin-Password'],
    credentials: true,
    optionsSuccessStatus: 200
}));

app.options('*', cors());
app.use(express.json());

const requireAdmin = (req, res, next) => {
    const clientPassword = req.headers['x-admin-password'] || req.headers['X-Admin-Password'];
    const serverPassword = process.env.ADMIN_PASSWORD;

    if (clientPassword && clientPassword === serverPassword) {
        next();
    } else {
        res.status(401).json({ error: 'Acesso negado: Senha incorreta ou ausente.' });
    }
};

app.get('/', (req, res) => {
    res.json({ status: 'Online', message: 'Backend Multi-Tenant a funcionar!' });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.post('/api/auth', requireAdmin, (req, res) => {
    res.status(200).json({ message: 'Autenticado com sucesso' });
});

/**
 * ROTA: BUSCAR PRÉMIOS (FILTRADO POR EVENTO)
 */
app.get('/api/prizes', async (req, res) => {
    const evento = req.query.evento || 'geral';
    try {
        const result = await pool.query(
            'SELECT name, quantity FROM prizes WHERE event_slug = $1 ORDER BY id ASC',
            [evento]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('[ERRO AO BUSCAR PRÉMIOS]:', error);
        res.status(500).json({ error: 'Erro ao buscar prémios.' });
    }
});

/**
 * ROTA: SALVAR CONFIGURAÇÕES (ISOLADO POR EVENTO)
 */
app.post('/api/prizes/save', requireAdmin, async (req, res) => {
    const { prizes, evento } = req.body;
    const eventSlug = evento || 'geral';

    if (!prizes || !Array.isArray(prizes)) {
        return res.status(400).json({ error: 'Lista de prémios inválida.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM prizes WHERE event_slug = $1', [eventSlug]);

        for (const p of prizes) {
            await client.query(
                'INSERT INTO prizes (name, quantity, event_slug) VALUES ($1, $2, $3)',
                [p.name, p.quantity || 0, eventSlug]
            );
        }

        await client.query('COMMIT');
        res.json({ message: `Configurações salvas para o evento: ${eventSlug}` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[ERRO AO SALVAR]:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    } finally {
        client.release();
    }
});

/**
 * ROTA: LIMPAR BANCO (ISOLADO POR EVENTO)
 */
app.delete('/api/prizes/clear', requireAdmin, async (req, res) => {
    const evento = req.query.evento || 'geral';
    try {
        await pool.query('DELETE FROM prizes WHERE event_slug = $1', [evento]);
        await pool.query('DELETE FROM spin_history WHERE event_slug = $1', [evento]);
        res.json({ message: `Banco limpo para o evento: ${evento}` });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao limpar banco.' });
    }
});

/**
 * ROTA: VERIFICAR SE EMAIL JÁ PARTICIPOU
 * Usada pelo frontend no carregamento para restaurar estado após refresh.
 */
app.get('/api/check-spin', async (req, res) => {
    const { evento, email } = req.query;
    const eventSlug = evento || 'geral';

    if (!email) {
        return res.status(400).json({ error: 'Email obrigatório.' });
    }

    try {
        const result = await pool.query(
            'SELECT id FROM spin_history WHERE email = $1 AND event_slug = $2',
            [email, eventSlug]
        );
        res.json({ jaParticipou: result.rowCount > 0 });
    } catch (error) {
        console.error('[ERRO CHECK-SPIN]:', error);
        res.status(500).json({ error: 'Erro ao verificar participação.' });
    }
});

/**
 * ROTA DE SORTEIO (ISOLADO POR EVENTO)
 */
app.post('/api/spin', async (req, res) => {
    const { evento, email } = req.body;
    const eventSlug = evento || 'geral';

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Um email válido é obrigatório para participar do sorteio.' });
    }

    const client = await pool.connect();
    // Flag para só fazer ROLLBACK se BEGIN foi chamado
    let transactionStarted = false;

    try {
        // Verifica se o email já participou neste evento
        const checkUser = await client.query(
            'SELECT id FROM spin_history WHERE email = $1 AND event_slug = $2',
            [email, eventSlug]
        );

        if (checkUser.rowCount > 0) {
            return res.status(403).json({ error: 'Este e-mail já participou do sorteio neste evento!' });
        }

        let spinSuccess = false;
        let finalPrize = '';
        let attempts = 0;
        const MAX_ATTEMPTS = 5;

        while (!spinSuccess && attempts < MAX_ATTEMPTS) {
            attempts++;

            const { rows: availablePrizes } = await client.query(
                'SELECT name, quantity FROM prizes WHERE quantity > 0 AND event_slug = $1',
                [eventSlug]
            );

            if (availablePrizes.length === 0) {
                return res.status(400).json({ error: `Brindes esgotados para o evento: ${eventSlug}` });
            }

            let totalStock = availablePrizes.reduce((acc, prize) => acc + prize.quantity, 0);
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
            transactionStarted = true;

            const updateResult = await client.query(
                'UPDATE prizes SET quantity = quantity - 1 WHERE name = $1 AND event_slug = $2 AND quantity > 0 RETURNING *',
                [prizeName, eventSlug]
            );

            if (updateResult.rowCount > 0) {
                const historyResult = await client.query(
                    'INSERT INTO spin_history (prize_name, event_slug, email) VALUES ($1, $2, $3) RETURNING *',
                    [prizeName, eventSlug, email]
                );
                await client.query('COMMIT');
                transactionStarted = false;
                spinSuccess = true;
                finalPrize = prizeName;
                return res.json({ prize: finalPrize, timestamp: historyResult.rows[0].created_at });
            } else {
                await client.query('ROLLBACK');
                transactionStarted = false;
            }
        }

        if (!spinSuccess) {
            res.status(500).json({ error: 'Muitos acessos simultâneos. Tente novamente.' });
        }

    } catch (error) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }
        // Código 23505 = unique_violation no PostgreSQL (email duplicado)
        if (error.code === '23505') {
            return res.status(403).json({ error: 'Este e-mail já participou do sorteio neste evento!' });
        }
        console.error('[ERRO NO SORTEIO]:', error);
        res.status(500).json({ error: 'Erro ao processar sorteio.' });
    } finally {
        client.release();
    }
});

/**
 * ROTA: HISTÓRICO DE SORTEIOS
 */
app.get('/api/history', async (req, res) => {
    const evento = req.query.evento || 'geral';
    try {
        const result = await pool.query(
            'SELECT * FROM spin_history WHERE event_slug = $1 ORDER BY created_at DESC LIMIT 10',
            [evento]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

// ✅ Rota não encontrada
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ✅ Error handler global — garante que erros inesperados do Express
//    retornem JSON com mensagem clara em vez de travar a resposta
app.use((err, req, res, next) => {
    console.error('[ERRO GLOBAL]:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
