-- Tabela de Configuração de Inventário (Atualizada para Multi-Eventos)
CREATE TABLE IF NOT EXISTS prizes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    event_slug TEXT NOT NULL DEFAULT 'geral',
    
    -- Garante que o mesmo brinde não se repete DENTRO do mesmo evento,
    -- mas permite ter 'Caneca' no evento A e 'Caneca' no evento B.
    CONSTRAINT prizes_name_event_unique UNIQUE (name, event_slug)
);

-- Histórico de Sorteios (Atualizado para Multi-Eventos)
CREATE TABLE IF NOT EXISTS spin_history (
    id SERIAL PRIMARY KEY,
    prize_name TEXT NOT NULL,
    event_slug TEXT NOT NULL DEFAULT 'geral',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);