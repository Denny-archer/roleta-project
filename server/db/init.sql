-- Tabela de Configuração de Inventário
CREATE TABLE IF NOT EXISTS prizes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    quantity INTEGER NOT NULL DEFAULT 0
);

-- Histórico de Sorteios (Já existente, mantemos para auditoria)
CREATE TABLE IF NOT EXISTS spin_history (
    id SERIAL PRIMARY KEY,
    prize_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);