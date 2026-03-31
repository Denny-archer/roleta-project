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

// NOVO: MIDDLEWARE DE SEGURANÇA
const requiredAdmin = (req, res, next) => {
    // pegar a senha do frontend (pode ser um header, ou parte do body)
    const clientPassword = req.headers['x-admin-password'];
    const serverPassword = process.env.ADMIN_PASSWORD;

    if (!serverPassword) {
        console.warn("⚠️ AVISO: A variável ADMIN_PASSWORD não está configurada no .env!");
    }

    if (clientPassword && clientPassword === serverPassword) {
        next(); // Senha correta, continua para a rota
    } else {
        res.status(401).json({ error: 'Acesso negado. Senha de administrador é necessária.' });
    }
};

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
    app.post('/api/prizes/save', requiredAdmin, async (req, res) => {
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
    app.delete('/api/prizes/clear', requiredAdmin, async (req, res) => {
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
     * ROTA DE SORTEIO (POST) - PREPARADA PARA ALTA CONCORRÊNCIA (RACE CONDITIONS)
     */
    app.post('/api/spin', async (req, res) => {
        const client = await pool.connect();

        try {
            let spinSuccess = false;
            let finalPrize = '';
            let attempts = 0;
            const MAX_ATTEMPTS = 5; // Tenta recalcular até 5 vezes se houver colisão de stock

            // Loop de tentativa (caso 2 pessoas ganhem o mesmo último item ao mesmo tempo)
            while (!spinSuccess && attempts < MAX_ATTEMPTS) {
                attempts++;

                // 1. Busca os prémios disponíveis
                const { rows: availablePrizes } = await client.query(
                    'SELECT name, quantity FROM prizes WHERE quantity > 0'
                );

                if (availablePrizes.length === 0) {
                    return res.status(400).json({ error: 'Todos os brindes estão esgotados!' });
                }

                // 2. Lógica matemática de Sorteio Ponderado
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

                // 3. TRANSACÇÃO ATÓMICA (O segredo para acessos simultâneos)
                await client.query('BEGIN');

                // Tenta subtrair 1 APENAS se ainda houver stock no momento exato do UPDATE
                const updateResult = await client.query(
                    'UPDATE prizes SET quantity = quantity - 1 WHERE name = $1 AND quantity > 0 RETURNING *',
                    [prizeName]
                );

                // Se rowCount > 0, significa que ganhámos a "corrida" e o item é nosso
                if (updateResult.rowCount > 0) {
                    // Grava o histórico
                    const historyResult = await client.query(
                        'INSERT INTO spin_history (prize_name) VALUES ($1) RETURNING *',
                        [prizeName]
                    );

                    await client.query('COMMIT'); // Confirma as alterações no banco

                    spinSuccess = true;
                    finalPrize = prizeName;

                    console.log(`[SUCESSO] Sorteado: ${prizeName} | Tentativa: ${attempts}`);

                    return res.json({
                        prize: finalPrize,
                        timestamp: historyResult.rows[0].created_at
                    });
                } else {
                    // Se rowCount === 0, alguém levou o prémio no milissegundo anterior!
                    // Desfazemos a transação e o loop "while" vai rodar de novo para sortear outro item.
                    await client.query('ROLLBACK');
                    console.log(`[COLISÃO] Prémio ${prizeName} esgotou no momento da gravação. Recalculando...`);
                }
            }

            // Se sair do loop e não teve sucesso (muito raro, só se a base de dados estiver sobrecarregada)
            if (!spinSuccess) {
                res.status(500).json({ error: 'Muitos acessos simultâneos, por favor tente girar novamente.' });
            }

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ERRO SQL NO SORTEIO]:', error);
            res.status(500).json({ error: 'Erro ao processar o sorteio.' });
        } finally {
            client.release(); // Liberta a conexão para não travar o banco
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