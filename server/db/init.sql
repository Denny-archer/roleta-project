CREATE SCHEMA IF NOT EXISTS roleta;

-- Tabela de Configuração de Inventário (Atualizada para Multi-Eventos)
CREATE TABLE IF NOT EXISTS roleta.prizes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    event_slug TEXT NOT NULL DEFAULT 'geral',
    
    -- Garante que o mesmo brinde não se repete DENTRO do mesmo evento,
    -- mas permite ter 'Caneca' no evento A e 'Caneca' no evento B.
    CONSTRAINT prizes_name_event_unique UNIQUE (name, event_slug)
);

-- Participantes habilitados pelo Google Forms
CREATE TABLE IF NOT EXISTS roleta.participants (
    id SERIAL PRIMARY KEY,
    event_slug TEXT NOT NULL DEFAULT 'geral',
    email TEXT NOT NULL,
    has_spun BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    spun_at TIMESTAMP WITH TIME ZONE,

    -- Garante apenas uma inscrição por e-mail dentro do mesmo evento.
    CONSTRAINT participants_event_email_unique UNIQUE (event_slug, email)
);

-- Histórico de Sorteios (Atualizado para Multi-Eventos)
CREATE TABLE IF NOT EXISTS roleta.spin_history (
    id SERIAL PRIMARY KEY,
    prize_name TEXT NOT NULL,
    event_slug TEXT NOT NULL DEFAULT 'geral',
    participant_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
