import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import pg from 'pg'; // <-- Correção na importação do pg (ESM)

const { Pool } = pg;

// 1. LIGAÇÃO À BASE DE DADOS (No topo, antes das rotas)
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'roleta_brindes',
    password: 'Buscador-21',
    port: 5432
});

pool.connect()
    .then(() => console.log('🟢 Conectado ao PostgreSQL'))
    .catch(err => console.error('🔴 Erro ao conectar:', err));

// 2. CONFIGURAÇÃO DO EXPRESS
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/**
 * ROTA DE TESTE (GET)
 */
app.get('/', (req, res) => {
    res.json({ 
        status: 'Online', 
        message: 'Backend da Roleta de Brindes está a funcionar!'
    });
});

/**
 * ROTA DE SORTEIO (POST) - AGORA COM GRAVAÇÃO NA BASE DE DADOS
 */
app.post('/api/spin', async (req, res) => { // <-- Transformado em async
    const { prizes } = req.body;

    if (!prizes || !Array.isArray(prizes) || prizes.length < 2) {
        return res.status(400).json({ error: 'A lista de prémios é obrigatória.' });
    }

    try {
        // Lógica matemática
        const winningIndex = Math.floor(Math.random() * prizes.length);
        const prize = prizes[winningIndex];
        const spinId = crypto.randomUUID();

        // INSTRUÇÃO SQL (A peça que faltava para o Teste 2 passar!)
        const query = `
            INSERT INTO spin_history (spin_id, prize_name)
            VALUES ($1, $2)
            RETURNING *;
        `;
        
        // Esperamos que a base de dados grave
        const result = await pool.query(query, [spinId, prize]);

        console.log(`[DB GRAVADO] ID: ${result.rows[0].id} | Prémio: ${prize}`);

        // Devolvemos ao frontend
        res.json({
            winningIndex,
            prize,
            timestamp: result.rows[0].created_at,
            spinId: spinId
        });

    } catch (error) {
        console.error('[ERRO SQL]:', error);
        res.status(500).json({ error: 'Erro ao gravar na base de dados.' });
    }
});

/**
 * ROTA DO HISTÓRICO (GET) - Para o painel de últimos vencedores
 */
app.get('/api/history', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM spin_history ORDER BY created_at DESC LIMIT 10');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

// Tratamento de 404
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
});

// 3. INICIAR O SERVIDOR
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR ATIVO em http://localhost:${PORT}`);
});