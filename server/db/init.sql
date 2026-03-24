-- Criação da base de dados (se estiveres a usar um cliente como psql ou DBeaver)
-- CREATE DATABASE roleta_brindes;

-- Tabela para guardar o histórico de sorteios
CREATE TABLE IF NOT EXISTS spin_history (
    id SERIAL PRIMARY KEY,
    spin_id UUID NOT NULL,
    prize_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Metadados extras caso queiras guardar quem sorteou no futuro
    user_identifier TEXT DEFAULT 'Anonimo' 
);

-- Tabela opcional para gerir o inventário de brindes (futura expansão)
CREATE TABLE IF NOT EXISTS prizes_config (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    stock INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE
);

-- Inserção de dados iniciais de exemplo
INSERT INTO prizes_config (name, stock) VALUES 
('Camiseta', 10),
('Caneca', 20),
('Mouse', 5),
('Teclado', 3),
('Boné', 15);