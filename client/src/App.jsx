import React, { useState, useRef } from 'react';
import Wheel from './components/Wheel';
import Sidebar from './components/Sidebar';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';


export default function App() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';

  const [prizes, setPrizes] = useState([
    { name: 'Camiseta', quantity: 5 },
    { name: 'Caneca', quantity: 10 },
    { name: 'Mouse', quantity: 2 },
    { name: 'Teclado', quantity: 1 },
    { name: 'Boné', quantity: 0 }
  ]);

  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const wheelRef = useRef(null);

  const availablePrizes = prizes.filter(p => p.quantity > 0);

  const handleSaveToDB = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/prizes/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prizes })
      });
      if (!response.ok) throw new Error('Falha ao salvar');
      alert("Sucesso! Banco de dados atualizado.");
      setIsSidebarOpen(false);
    } catch (e) {
      console.error(e);
      alert("Erro ao conectar com o banco. O backend está a correr?");
    } finally {
      setLoading(false);
    }
  };

  const handleClearDB = async () => {
    if (!window.confirm("Aviso: Isto vai apagar TODOS os brindes e o histórico de sorteios do banco de dados. Confirmar?")) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/prizes/clear`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Falha ao limpar');
      setPrizes([{ name: 'Prémio 1', quantity: 0 }, { name: 'Prémio 2', quantity: 0 }]);
      alert("Banco de dados limpo com sucesso!");
    } catch (e) {
      alert("Erro ao limpar banco.");
    } finally {
      setLoading(false);
    }
  };

  const handleSpin = async () => {
    if (spinning || loading) return;

    if (availablePrizes.length < 2) {
      alert("Precisas de pelo menos 2 brindes com stock no inventário para girar!");
      return setIsSidebarOpen(true);
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/spin`, { method: 'POST' });

      // MOCK LOCAL PARA EFEITOS DE DEMONSTRAÇÃO (fallback caso o backend falhe)
      if (!response.ok) {
        throw new Error("Usando sorteio local");
      }

      const data = await response.json();
      setLoading(false);
      setSpinning(true);

      const winningIndex = availablePrizes.findIndex(p => p.name === data.prize);

      if (winningIndex !== -1) {
        wheelRef.current.startAnimation(winningIndex, data.prize);
      } else {
        throw new Error("Prémio sorteado não encontrado na lista atual");
      }

      const updatedPrizes = prizes.map(p =>
        p.name === data.prize ? { ...p, quantity: p.quantity - 1 } : p
      );
      setPrizes(updatedPrizes);

    } catch (e) {
      // FALLBACK LOCAL: Se o backend não responder, fazemos o sorteio localmente para garantir a UI a funcionar
      setLoading(false);
      setSpinning(true);
      const mockIndex = Math.floor(Math.random() * availablePrizes.length);
      const mockPrizeName = availablePrizes[mockIndex].name;
      wheelRef.current.startAnimation(mockIndex);

      const updatedPrizes = prizes.map(p =>
        p.name === mockPrizeName ? { ...p, quantity: p.quantity - 1 } : p
      );
      setPrizes(updatedPrizes);
    }
  };

  return (
    <div className="app-wrapper d-flex flex-column">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet" />

      <header className="px-4 py-3 d-flex justify-content-between align-items-center" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
        <h3 className="m-0 fw-black text-white text-uppercase tracking-wider">
          <i className="bi bi-gift-fill me-2" style={{ color: '#FFD200' }}></i> Sorteio Premium
        </h3>

        <button
          className="btn btn-outline-light px-4 fw-bold rounded-pill shadow-sm hover-glow"
          onClick={() => setIsSidebarOpen(true)}
        >
          <i className="bi bi-gear-fill"></i>
        </button>
      </header>

      <main className="flex-grow-1 d-flex align-items-center justify-content-center p-4">
        <div className="text-center w-100" style={{ maxWidth: '800px' }}>

          <div className="mb-4">
            <span className="badge bg-dark border border-secondary px-3 py-2 text-white-50">
              {availablePrizes.length} Itens em Stock Disponível
            </span>
          </div>

          {availablePrizes.length >= 2 ? (
            <div className="glass-card p-5 d-flex flex-column align-items-center justify-content-center shadow-lg position-relative">
              <Wheel
                ref={wheelRef}
                prizes={availablePrizes}
                spinning={spinning}
                setSpinning={setSpinning}
                onSpinFinish={setResult}
              />

              <div className="mt-5 mb-2 w-100 z-3 position-relative">
                <button
                  className={`btn btn-lg btn-spin ${spinning || loading ? 'btn-secondary' : 'btn-success pulse'}`}
                  onClick={handleSpin}
                  disabled={spinning || loading}
                >
                  {loading ? 'A PROCESSAR...' : spinning ? 'A GIRAR...' : (
                    <>
                      <i className="bi bi-bullseye me-2"></i>
                      GIRAR ROLETA
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card p-5 text-center text-white-50 border-danger">
              <h1 className="display-1 opacity-25 mb-4">
                <i className="bi bi-exclamation-triangle-fill"></i>
              </h1>
              <h3>Sem Inventário Suficiente</h3>
              <p>É necessário configurar pelo menos 2 brindes com stock na Sidebar para realizar um sorteio.</p>
              <button className="btn btn-primary mt-3" onClick={() => setIsSidebarOpen(true)}>Abrir Configurações</button>
            </div>
          )}

          <div className={`result-box mt-4 mx-auto ${result ? 'active' : ''}`} style={{ maxWidth: '600px' }}>
            <h2 className="mb-0 fw-black" style={{ color: result ? '#FFD200' : 'rgba(255,255,255,0.3)' }}>
              {result ? <>
                <i className="bi bi-trophy-fill me-2"></i>
                {`PARABÉNS! GANHOU: ${result.toUpperCase()}`}
              </> : 'Pronto para sortear...'}
            </h2>
          </div>

        </div>
      </main>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        prizes={prizes}
        setPrizes={setPrizes}
        onSave={handleSaveToDB}
        onClear={handleClearDB}
        isLoading={loading}
      />

      <style>{`
        body, html { margin: 0; padding: 0; overflow-x: hidden; background: #0f2027; }
        .app-wrapper { min-height: 100vh; width: 100vw; background: linear-gradient(135deg, #091217, #15252e, #1c323d); font-family: 'Inter', sans-serif; color: white; }
        .glass-card { background: rgba(255,255,255,0.02); border-radius: 40px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
        .btn-spin { font-weight: 900; border-radius: 50px; text-transform: uppercase; letter-spacing: 2px; transition: all 0.3s ease; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
        .pulse { animation: pulse-animation 2s infinite; }
        @keyframes pulse-animation { 0% { box-shadow: 0 0 0 0px rgba(25, 135, 84, 0.4); } 100% { box-shadow: 0 0 0 20px rgba(25, 135, 84, 0); } }
        .result-box { background: rgba(0,0,0,0.4); padding: 30px; border-radius: 20px; border: 2px dashed rgba(255,255,255,0.1); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .result-box.active { border: 2px solid #FFD200; background: rgba(255, 210, 0, 0.1); transform: scale(1.05); box-shadow: 0 0 40px rgba(255, 210, 0, 0.2); }
        .hover-glow:hover { box-shadow: 0 0 15px rgba(255,255,255,0.3) !important; transform: translateY(-1px); }
      `}</style>
    </div>
  );
}