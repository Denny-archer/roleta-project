import React, { useState, useRef } from 'react';
import Wheel from './components/Wheel.jsx';

export default function App() {
  const [prizes, setPrizes] = useState(['Camiseta', 'Caneca', 'Mouse', 'Teclado', 'Boné']);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const wheelRef = useRef(null);

  // Chamada à API ou Mock local
  const handleSpin = async () => {
    if (spinning || loading) return;
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('http://localhost:3000/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prizes })
      });
      const data = await response.json();
      setLoading(false);
      setSpinning(true);
      wheelRef.current.startAnimation(data.winningIndex);
    } catch (e) {
      // Mock para quando o servidor não está ativo
      setTimeout(() => {
        setLoading(false);
        setSpinning(true);
        wheelRef.current.startAnimation(Math.floor(Math.random() * prizes.length));
      }, 500);
    }
  };

  return (
    <div className="app-wrapper">
      {/* Bootstrap via CDN e Font Inter */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* HEADER FULL WIDTH */}
      <header className="page-header px-4 py-3 d-flex justify-content-between align-items-center">
        <h4 className="m-0 fw-black text-white">🎁 ROLETA DE BRINDES</h4>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-light btn-sm px-3" onClick={() => setPrizes(['Item 1', 'Item 2'])}>Limpar</button>
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm">Salvar Config</button>
        </div>
      </header>

      <div className="container px-3 px-md-4 py-4">
        <div className="row g-4 justify-content-center">
          
          {/* PAINEL DA ROLETA */}
          <div className="col-12 col-lg-7 d-flex flex-column align-items-center">
            <div className="glass-card wheel-container p-4 w-100 text-center">
              <Wheel 
                ref={wheelRef} 
                prizes={prizes} 
                spinning={spinning} 
                setSpinning={setSpinning} 
                onSpinFinish={setResult}
              />
              
              <div className="mt-4">
                <button 
                  className={`btn btn-lg btn-spin ${spinning || loading ? 'btn-secondary' : 'btn-success pulse'}`}
                  onClick={handleSpin}
                  disabled={spinning || loading}
                >
                  {loading ? 'A LER API...' : spinning ? 'A GIRAR...' : 'GIRAR AGORA'}
                </button>
              </div>
            </div>

            {/* BOX DE RESULTADO */}
            <div className={`result-box mt-4 w-100 ${result ? 'active' : ''}`}>
              <h3 className="mb-0 text-warning fw-bold">
                {result ? `🏆 Ganhou: ${result}` : 'Aguardando Sorteio...'}
              </h3>
            </div>
          </div>

          {/* PAINEL DE CONFIGURAÇÕES */}
          <div className="col-xl-4 col-lg-5">
            <div className="glass-card p-4 h-100 shadow-lg">
              <h5 className="mb-4 text-white opacity-75 border-bottom pb-2 border-secondary">Configurações</h5>
              
              <div className="prizes-list mb-3 pe-2">
                {prizes.map((p, i) => (
                  <div key={i} className="prize-input-group mb-2 animate-in">
                    <input 
                      className="form-control" 
                      value={p} 
                      onChange={(e) => {
                        const next = [...prizes];
                        next[i] = e.target.value;
                        setPrizes(next);
                      }}
                    />
                    <button className="btn btn-del" onClick={() => setPrizes(prizes.filter((_, idx) => idx !== i))}>🗑</button>
                  </div>
                ))}
              </div>

              <button className="btn btn-outline-success w-100 mb-4 py-2 fw-bold" onClick={() => setPrizes([...prizes, `Novo Item ${prizes.length + 1}`])}>
                + Adicionar Item
              </button>

              <div className="settings-footer p-3 rounded-4 bg-black bg-opacity-25 border border-white border-opacity-10">
                <div className="form-check form-switch mb-3">
                  <input className="form-check-input" type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
                  <label className="form-check-label text-white">Efeitos Sonoros</label>
                </div>
                
                <label className="small text-white-50 d-block mb-1">Tempo de Animação</label>
                <select className="form-select bg-dark text-white border-0">
                  <option>3 segundos (Rápido)</option>
                  <option selected>5 segundos (Ideal)</option>
                </select>
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        body, html {
          margin: 0;
          padding: 0;
          overflow-x: hidden;
          background: #0f2027;
        }
        .app-wrapper {
          min-height: 100%;
          width: 100vw;
          background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
          font-family: 'Inter', sans-serif;
        }
        .page-header {
          background: rgba(0,0,0,0.2);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .glass-card {
          background: rgba(255,255,255,0.03);
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(20px);
        }
        .wheel-container {
          min-height: 600px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .btn-spin {
          padding: 15px 50px;
          font-weight: 900;
          border-radius: 50px;
          text-transform: uppercase;
          letter-spacing: 2px;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .pulse {
          animation: pulse-animation 2s infinite;
        }
        @keyframes pulse-animation {
          0% { box-shadow: 0 0 0 0px rgba(25, 135, 84, 0.4); }
          100% { box-shadow: 0 0 0 20px rgba(25, 135, 84, 0); }
        }
        .result-box {
          background: rgba(0,0,0,0.4);
          padding: 25px;
          border-radius: 20px;
          text-align: center;
          border: 2px dashed rgba(255,255,255,0.1);
          transition: all 0.5s ease;
        }
        .result-box.active {
          border: 2px solid #ffc107;
          background: rgba(255, 193, 7, 0.05);
          transform: scale(1.02);
        }
        .prize-input-group {
          display: flex;
          gap: 10px;
        }
        .prize-input-group .form-control {
          background: rgba(0,0,0,0.3);
          color: white;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
        }
        .btn-del {
          color: #ff4d4d;
          border: none;
          background: transparent;
        }
        .prizes-list {
          max-height: 380px;
          overflow-y: auto;
        }
        .animate-in {
          animation: slideUp 0.3s ease-out forwards;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Responsividade */
        @media (max-width: 768px) {
          .wheel-canvas { width: 320px !important; height: 320px !important; }
          .wheel-container { min-height: 450px; }
        }
      `}</style>
    </div>
  );
}