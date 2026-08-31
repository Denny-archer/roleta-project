import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('connect', client => {
    client.query('SET search_path TO roleta, public').catch(err => {
        console.error('[ERRO search_path]:', err.message);
    });
});

const app = Fastify({
    logger: true,
});

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://roleta.coffito.gov.br',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://172.16.10.28:8081',
    'http://172.16.10.19:8081',
    'https://gsb.ti.coffito.gov.br',
].filter(Boolean);

const errorResponseSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
    },
};

const messageResponseSchema = {
    type: 'object',
    properties: {
        message: { type: 'string' },
    },
};

const prizeSchema = {
    type: 'object',
    required: ['name', 'quantity'],
    properties: {
        name: { type: 'string' },
        quantity: { type: 'integer', minimum: 0 },
    },
};

const normalizeEventSlug = value => {
    const eventSlug = String(value || '').trim();
    return eventSlug || 'geral';
};

const normalizeEmail = value => String(value || '').trim().toLowerCase();

const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getAdminPassword = request => request.headers['x-admin-password'];

const requireAdmin = async (request, reply) => {
    const clientPassword = getAdminPassword(request);
    const serverPassword = process.env.ADMIN_PASSWORD;

    if (!clientPassword || clientPassword !== serverPassword) {
        return reply.code(401).send({ error: 'Acesso negado: Senha incorreta ou ausente.' });
    }
};

const requireFormsSecret = async (request, reply) => {
    const clientSecret = request.headers['x-forms-secret'];
    const serverSecret = process.env.FORMS_WEBHOOK_SECRET;

    if (!serverSecret) {
        return reply.code(500).send({ error: 'FORMS_WEBHOOK_SECRET não configurado no servidor.' });
    }

    if (!clientSecret || clientSecret !== serverSecret) {
        return reply.code(401).send({ error: 'Acesso negado: segredo do Forms incorreto ou ausente.' });
    }
};

const getParticipantResult = async (client, eventSlug, email) => {
    const { rows } = await client.query(
        `SELECT prize_name, created_at
         FROM roleta.spin_history
         WHERE event_slug = $1 AND participant_email = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [eventSlug, email]
    );

    if (rows.length === 0) return null;
    return {
        prize: rows[0].prize_name,
        timestamp: rows[0].created_at,
    };
};

const ensureDatabaseSchema = async () => {
    await pool.query(`
        CREATE SCHEMA IF NOT EXISTS roleta;

        CREATE TABLE IF NOT EXISTS roleta.prizes (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            event_slug TEXT NOT NULL DEFAULT 'geral',
            CONSTRAINT prizes_name_event_unique UNIQUE (name, event_slug)
        );

        CREATE TABLE IF NOT EXISTS roleta.participants (
            id SERIAL PRIMARY KEY,
            event_slug TEXT NOT NULL DEFAULT 'geral',
            email TEXT NOT NULL,
            has_spun BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            spun_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT participants_event_email_unique UNIQUE (event_slug, email)
        );

        CREATE TABLE IF NOT EXISTS roleta.spin_history (
            id SERIAL PRIMARY KEY,
            prize_name TEXT NOT NULL,
            event_slug TEXT NOT NULL DEFAULT 'geral',
            participant_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE roleta.spin_history
        ADD COLUMN IF NOT EXISTS participant_email TEXT;

        CREATE UNIQUE INDEX IF NOT EXISTS participants_event_email_unique_idx
        ON roleta.participants (event_slug, email);
    `);
};

await app.register(cors, {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`Origem não permitida pelo CORS: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-admin-password',
        'X-Admin-Password',
        'x-forms-secret',
        'X-Forms-Secret',
    ],
    credentials: true,
});

await app.register(swagger, {
    openapi: {
        info: {
            title: 'Roleta API',
            description: 'API para gerenciar eventos, brindes, participantes e sorteios.',
            version: '1.0.0',
        },
        tags: [
            { name: 'system', description: 'Status da API' },
            { name: 'admin', description: 'Operações administrativas' },
            { name: 'prizes', description: 'Cadastro e consulta de brindes' },
            { name: 'participants', description: 'Validação de participantes do Forms' },
            { name: 'spin', description: 'Sorteio da roleta' },
        ],
    },
});

await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
    },
});

app.get('/', {
    schema: {
        tags: ['system'],
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    message: { type: 'string' },
                },
            },
        },
    },
}, async () => ({ status: 'Online', message: 'Backend Multi-Tenant com Fastify ativo.' }));

app.get('/health', {
    schema: {
        tags: ['system'],
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                },
            },
        },
    },
}, async () => ({ status: 'ok' }));

app.post('/api/auth', {
    preHandler: requireAdmin,
    schema: {
        tags: ['admin'],
        headers: {
            type: 'object',
            properties: {
                'x-admin-password': { type: 'string' },
            },
        },
        response: {
            200: messageResponseSchema,
            401: errorResponseSchema,
        },
    },
}, async () => ({ message: 'Autenticado com sucesso' }));

app.get('/api/prizes', {
    schema: {
        tags: ['prizes'],
        querystring: {
            type: 'object',
            properties: {
                evento: { type: 'string', default: 'geral' },
            },
        },
        response: {
            200: {
                type: 'array',
                items: prizeSchema,
            },
            500: errorResponseSchema,
        },
    },
}, async (request, reply) => {
    const eventSlug = normalizeEventSlug(request.query.evento);

    try {
        const result = await pool.query(
            'SELECT name, quantity FROM roleta.prizes WHERE event_slug = $1 ORDER BY id ASC',
            [eventSlug]
        );
        return result.rows;
    } catch (error) {
        request.log.error({ err: error }, '[ERRO AO BUSCAR PREMIOS]');
        return reply.code(500).send({ error: 'Erro ao buscar prêmios.' });
    }
});

app.post('/api/prizes/save', {
    preHandler: requireAdmin,
    schema: {
        tags: ['prizes'],
        headers: {
            type: 'object',
            properties: {
                'x-admin-password': { type: 'string' },
            },
        },
        body: {
            type: 'object',
            required: ['prizes'],
            properties: {
                evento: { type: 'string', default: 'geral' },
                prizes: {
                    type: 'array',
                    items: prizeSchema,
                },
            },
        },
        response: {
            200: messageResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
        },
    },
}, async (request, reply) => {
    const { prizes, evento } = request.body;
    const eventSlug = normalizeEventSlug(evento);

    if (!Array.isArray(prizes)) {
        return reply.code(400).send({ error: 'Lista de prêmios inválida.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM roleta.prizes WHERE event_slug = $1', [eventSlug]);

        for (const prize of prizes) {
            const name = String(prize.name || '').trim();
            const quantity = Number.isInteger(prize.quantity) ? prize.quantity : Number(prize.quantity || 0);

            if (!name) {
                await client.query('ROLLBACK');
                return reply.code(400).send({ error: 'Nome do prêmio não pode ficar vazio.' });
            }

            await client.query(
                'INSERT INTO roleta.prizes (name, quantity, event_slug) VALUES ($1, $2, $3)',
                [name, Math.max(0, quantity), eventSlug]
            );
        }

        await client.query('COMMIT');
        return { message: `Configurações salvas para o evento: ${eventSlug}` };
    } catch (error) {
        await client.query('ROLLBACK');
        request.log.error({ err: error }, '[ERRO AO SALVAR]');
        return reply.code(500).send({ error: 'Erro ao salvar configurações.' });
    } finally {
        client.release();
    }
});

app.delete('/api/prizes/clear', {
    preHandler: requireAdmin,
    schema: {
        tags: ['prizes'],
        headers: {
            type: 'object',
            properties: {
                'x-admin-password': { type: 'string' },
            },
        },
        querystring: {
            type: 'object',
            properties: {
                evento: { type: 'string', default: 'geral' },
            },
        },
        response: {
            200: messageResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
        },
    },
}, async (request, reply) => {
    const eventSlug = normalizeEventSlug(request.query.evento);

    try {
        await pool.query('DELETE FROM roleta.prizes WHERE event_slug = $1', [eventSlug]);
        await pool.query('DELETE FROM roleta.spin_history WHERE event_slug = $1', [eventSlug]);
        await pool.query('DELETE FROM roleta.participants WHERE event_slug = $1', [eventSlug]);
        return { message: `Banco limpo para o evento: ${eventSlug}` };
    } catch (error) {
        request.log.error({ err: error }, '[ERRO AO LIMPAR BANCO]');
        return reply.code(500).send({ error: 'Erro ao limpar banco.' });
    }
});

app.post('/api/forms/submit', {
    preHandler: requireFormsSecret,
    schema: {
        tags: ['participants'],
        headers: {
            type: 'object',
            properties: {
                'x-forms-secret': { type: 'string' },
            },
        },
        body: {
            type: 'object',
            required: ['email'],
            properties: {
                evento: { type: 'string', default: 'geral' },
                email: { type: 'string', format: 'email' },
            },
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    message: { type: 'string' },
                    eventSlug: { type: 'string' },
                    email: { type: 'string' },
                },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
        },
    },
}, async (request, reply) => {
    const eventSlug = normalizeEventSlug(request.body.evento);
    const email = normalizeEmail(request.body.email);

    if (!isValidEmail(email)) {
        return reply.code(400).send({ error: 'E-mail inválido.' });
    }

    try {
        await pool.query(
            `INSERT INTO roleta.participants (event_slug, email)
             VALUES ($1, $2)
             ON CONFLICT (event_slug, email) DO NOTHING`,
            [eventSlug, email]
        );
        return { message: 'Participante registrado com sucesso.', eventSlug, email };
    } catch (error) {
        request.log.error({ err: error }, '[ERRO AO REGISTRAR PARTICIPANTE]');
        return reply.code(500).send({ error: 'Erro ao registrar participante.' });
    }
});

app.post('/api/participant/validate', {
    schema: {
        tags: ['participants'],
        body: {
            type: 'object',
            required: ['email'],
            properties: {
                evento: { type: 'string', default: 'geral' },
                email: { type: 'string', format: 'email' },
            },
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    eligible: { type: 'boolean' },
                    hasSpun: { type: 'boolean' },
                    prize: { type: 'string', nullable: true },
                    timestamp: { type: 'string', nullable: true },
                    message: { type: 'string' },
                },
            },
            400: errorResponseSchema,
            500: errorResponseSchema,
        },
    },
}, async (request, reply) => {
    const eventSlug = normalizeEventSlug(request.body.evento);
    const email = normalizeEmail(request.body.email);

    if (!isValidEmail(email)) {
        return reply.code(400).send({ error: 'E-mail inválido.' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT has_spun FROM roleta.participants WHERE event_slug = $1 AND email = $2',
            [eventSlug, email]
        );

        if (rows.length === 0) {
            return {
                eligible: false,
                hasSpun: false,
                prize: null,
                timestamp: null,
                message: 'E-mail não encontrado para este evento. Responda o Forms antes de acessar a roleta.',
            };
        }

        if (rows[0].has_spun) {
            const previousResult = await getParticipantResult(pool, eventSlug, email);
            return {
                eligible: true,
                hasSpun: true,
                prize: previousResult?.prize || null,
                timestamp: previousResult?.timestamp || null,
                message: 'Este e-mail já participou do sorteio deste evento.',
            };
        }

        return {
            eligible: true,
            hasSpun: false,
            prize: null,
            timestamp: null,
            message: 'Participante liberado para girar.',
        };
    } catch (error) {
        request.log.error({ err: error }, '[ERRO AO VALIDAR PARTICIPANTE]');
        return reply.code(500).send({ error: 'Erro ao validar participante.' });
    }
});

app.post('/api/spin', {
    schema: {
        tags: ['spin'],
        body: {
            type: 'object',
            required: ['email'],
            properties: {
                evento: { type: 'string', default: 'geral' },
                email: { type: 'string', format: 'email' },
            },
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    prize: { type: 'string' },
                    timestamp: { type: 'string' },
                },
            },
            400: errorResponseSchema,
            403: errorResponseSchema,
            409: {
                type: 'object',
                properties: {
                    error: { type: 'string' },
                    prize: { type: 'string', nullable: true },
                    timestamp: { type: 'string', nullable: true },
                },
            },
            500: errorResponseSchema,
        },
    },
}, async (request, reply) => {
    const eventSlug = normalizeEventSlug(request.body.evento);
    const email = normalizeEmail(request.body.email);

    if (!isValidEmail(email)) {
        return reply.code(400).send({ error: 'E-mail inválido.' });
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
        await client.query('BEGIN');
        transactionStarted = true;

        const participantResult = await client.query(
            `SELECT id, has_spun
             FROM roleta.participants
             WHERE event_slug = $1 AND email = $2
             FOR UPDATE`,
            [eventSlug, email]
        );

        if (participantResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;
            return reply.code(403).send({ error: 'E-mail não habilitado para este evento.' });
        }

        if (participantResult.rows[0].has_spun) {
            const previousResult = await getParticipantResult(client, eventSlug, email);
            await client.query('ROLLBACK');
            transactionStarted = false;
            return reply.code(409).send({
                error: 'Este e-mail já participou do sorteio deste evento.',
                prize: previousResult?.prize || null,
                timestamp: previousResult?.timestamp || null,
            });
        }

        let finalPrize = '';
        let historyRow = null;
        let attempts = 0;
        const maxAttempts = 5;

        while (!finalPrize && attempts < maxAttempts) {
            attempts += 1;

            const { rows: availablePrizes } = await client.query(
                'SELECT name, quantity FROM roleta.prizes WHERE quantity > 0 AND event_slug = $1',
                [eventSlug]
            );

            if (availablePrizes.length === 0) {
                await client.query('ROLLBACK');
                transactionStarted = false;
                return reply.code(400).send({ error: `Brindes esgotados para o evento: ${eventSlug}` });
            }

            const totalStock = availablePrizes.reduce((acc, prize) => acc + prize.quantity, 0);
            let randomValue = Math.floor(Math.random() * totalStock);
            let prizeName = '';

            for (const prize of availablePrizes) {
                randomValue -= prize.quantity;
                if (randomValue < 0) {
                    prizeName = prize.name;
                    break;
                }
            }

            const updateResult = await client.query(
                'UPDATE roleta.prizes SET quantity = quantity - 1 WHERE name = $1 AND event_slug = $2 AND quantity > 0 RETURNING *',
                [prizeName, eventSlug]
            );

            if (updateResult.rowCount > 0) {
                const historyResult = await client.query(
                    `INSERT INTO roleta.spin_history (prize_name, event_slug, participant_email)
                     VALUES ($1, $2, $3)
                     RETURNING *`,
                    [prizeName, eventSlug, email]
                );

                historyRow = historyResult.rows[0];
                finalPrize = prizeName;
            }
        }

        if (!finalPrize || !historyRow) {
            await client.query('ROLLBACK');
            transactionStarted = false;
            return reply.code(500).send({ error: 'Muitos acessos simultâneos. Tente novamente.' });
        }

        await client.query(
            'UPDATE roleta.participants SET has_spun = TRUE, spun_at = $1 WHERE event_slug = $2 AND email = $3',
            [historyRow.created_at, eventSlug, email]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        return { prize: finalPrize, timestamp: historyRow.created_at };
    } catch (error) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }

        request.log.error({ err: error }, '[ERRO NO SORTEIO]');
        return reply.code(500).send({ error: 'Erro ao processar sorteio.' });
    } finally {
        client.release();
    }
});

app.get('/api/history', {
    schema: {
        tags: ['spin'],
        querystring: {
            type: 'object',
            properties: {
                evento: { type: 'string', default: 'geral' },
            },
        },
        response: {
            200: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        prize_name: { type: 'string' },
                        event_slug: { type: 'string' },
                        participant_email: { type: 'string', nullable: true },
                        created_at: { type: 'string' },
                    },
                },
            },
            500: errorResponseSchema,
        },
    },
}, async (request, reply) => {
    const eventSlug = normalizeEventSlug(request.query.evento);

    try {
        const result = await pool.query(
            'SELECT * FROM roleta.spin_history WHERE event_slug = $1 ORDER BY created_at DESC LIMIT 10',
            [eventSlug]
        );
        return result.rows;
    } catch (error) {
        request.log.error({ err: error }, '[ERRO AO BUSCAR HISTORICO]');
        return reply.code(500).send({ error: 'Erro ao buscar histórico.' });
    }
});

app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: 'Rota não encontrada.' });
});

app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, '[ERRO GLOBAL]');
    return reply.code(error.statusCode || 500).send({
        error: error.statusCode ? error.message : 'Erro interno do servidor.',
    });
});

const start = async () => {
    try {
        await app.ready();
        await ensureDatabaseSchema();
        await app.listen({ port: PORT, host: '0.0.0.0' });
        app.log.info(`Server running on port ${PORT}`);
        app.log.info(`Swagger UI available at http://localhost:${PORT}/docs`);
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};

start();
