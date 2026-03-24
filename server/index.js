import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

// Configuração do CORS
// Em desenvolvimento, permitimos tudo para evitar bloqueios chatos.
app.use(cors());
app.use(express.json());

/**
 * ROTA DE TESTE (GET)
 * Adicionada para que, ao abrir no browser, não veja um erro 404.
 */
app.get('/', (req, res) => {
    res.json({ 
        status: 'Online', 
        message: 'Backend da Roleta de Brindes está a funcionar!',
        endpoints: {
            spin: '/api/spin (POST)'
        }
    });
});

/**
 * ROTA DE SORTEIO (POST)
 */
app.post('/api/spin', (req, res) => {
    const { prizes } = req.body;

    if (!prizes || !Array.isArray(prizes) || prizes.length < 2) {
        return res.status(400).json({ error: 'A lista de prémios é obrigatória.' });
    }

    const winningIndex = Math.floor(Math.random() * prizes.length);
    const prize = prizes[winningIndex];

    console.log(`[SORTEIO] Realizado com sucesso: ${prize}`);

    res.json({
        winningIndex,
        prize,
        timestamp: new Date().toISOString(),
        spinId: crypto.randomUUID()
    });
});

// Tratamento de rotas não encontradas (para evitar o 404 genérico)
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada neste servidor API.' });
});

app.listen(PORT, () => {
    console.log(`
    🚀 BACKEND ATIVO
    --------------------------------------------
    URL: http://localhost:${PORT}
    Teste no Browser: http://localhost:${PORT}/
    Endpoint API: http://localhost:${PORT}/api/spin
    --------------------------------------------
    `);
});