import React, { useState, useRef, useEffect } from 'react';
import Wheel from './components/Wheel';
import Sidebar from './components/Sidebar';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

export default function App() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';

  const queryParams = new URLSearchParams(window.location.search);
  const currentEvent = queryParams.get('evento') || 'geral';
  const initialEmail = queryParams.get('email') || '';

  const [prizes, setPrizes] = useState([]);
  const [isLoadingPrizes, setIsLoadingPrizes] = useState(true);
  const [adminAuth, setAdminAuth] = useState('');
  const [result, setResult] = useState(null);
  const [spinResult, setSpinResult] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [participantEmail, setParticipantEmail] = useState(initialEmail);
  const [participantError, setParticipantError] = useState('');
  const [validationLoading, setValidationLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [spinError, setSpinError] = useState('');

  const wheelRef = useRef(null);

  useEffect(() => {
    const initializePage = async () => {
      setIsLoadingPrizes(true);
      setSpinError('');

      try {
        const response = await fetch(`${API_URL}/api/prizes?evento=${encodeURIComponent(currentEvent)}`);
        if (response.ok) {
          const dbPrizes = await response.json();
          setPrizes(Array.isArray(dbPrizes) ? dbPrizes : []);
        }
      } catch (error) {
        console.error('Erro ao inicializar página:', error);
      } finally {
        setIsLoadingPrizes(false);
      }
    };

    initializePage();
  }, [API_URL, currentEvent]);

  const availablePrizes = prizes.filter(p => p.quantity > 0);

  const normalizeEmail = value => value.trim().toLowerCase();

  const readError = async (response, fallback) => {
    try {
      const data = await response.json();
      return data.error || data.message || fallback;
    } catch {
      return fallback;
    }
  };

  const handleValidateParticipant = async (event) => {
    event.preventDefault();

    const email = normalizeEmail(participantEmail);
    setParticipantError('');
    setSpinError('');
    setCompletion(null);
    setParticipant(null);

    if (!email) {
      setParticipantError('Informe o e-mail usado no Google Forms.');
      return;
    }

    setValidationLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/participant/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento: currentEvent, email })
      });

      if (!response.ok) {
        setParticipantError(await readError(response, 'Não foi possível validar o participante.'));
        return;
      }

      const data = await response.json();
      if (!data.eligible) {
        setParticipantError(data.message || 'E-mail não encontrado para este evento.');
        return;
      }

      setParticipant({ email, hasSpun: data.hasSpun });
      setParticipantEmail(email);

      if (data.hasSpun) {
        setCompletion({
          prize: data.prize,
          timestamp: data.timestamp,
          alreadySpun: true
        });
      }
    } catch {
      setParticipantError('Erro de conexão com o servidor. Tente novamente.');
    } finally {
      setValidationLoading(false);
    }
  };

  const handleOpenSettings = async () => {
    const pass = window.prompt(`Acesso Restrito [Evento: ${currentEvent.toUpperCase()}]\nDigite a senha de administrador:`);
    if (!pass) return;

    try {
      const response = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'x-admin-password': pass }
      });

      if (response.ok) {
        setAdminAuth(pass);
        setIsSidebarOpen(true);
      } else {
        alert('Senha incorreta! Acesso negado.');
      }
    } catch {
      alert('Erro ao verificar a senha com o servidor.');
    }
  };

  const handleSaveToDB = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/prizes/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminAuth },
        body: JSON.stringify({ prizes, evento: currentEvent })
      });
      if (response.status === 401) throw new Error('Senha incorreta');
      if (!response.ok) throw new Error('Falha ao salvar');
      alert(`Sucesso! Banco atualizado para o evento: ${currentEvent}`);
      setIsSidebarOpen(false);
    } catch {
      alert('Erro ao conectar com o banco.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearDB = async () => {
    if (!window.confirm(`Aviso: Isto vai apagar TODOS os dados do evento "${currentEvent}". Confirmar?`)) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/prizes/clear?evento=${encodeURIComponent(currentEvent)}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Password': adminAuth }
      });
      if (response.status === 401) throw new Error('Senha incorreta');
      if (!response.ok) throw new Error('Falha ao limpar');
      setPrizes([{ name: 'Prêmio 1', quantity: 0 }, { name: 'Prêmio 2', quantity: 0 }]);
      setParticipant(null);
      setCompletion(null);
      setResult(null);
      setSpinResult(null);
      alert('Banco de dados limpo com sucesso!');
    } catch {
      alert('Erro ao limpar banco.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpin = async () => {
    if (spinning || loading) return;
    setSpinError('');

    if (!participant?.email) {
      setParticipantError('Valide seu e-mail antes de girar a roleta.');
      return;
    }

    if (availablePrizes.length < 2) {
      setIsSidebarOpen(true);
      return;
    }

    setLoading(true);
    setResult(null);
    setSpinResult(null);

    try {
      const response = await fetch(`${API_URL}/api/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento: currentEvent, email: participant.email })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 409) {
          setParticipant(previous => previous ? { ...previous, hasSpun: true } : previous);
          setCompletion({
            prize: errorData.prize || null,
            timestamp: errorData.timestamp || null,
            alreadySpun: true
          });
          return;
        }

        setSpinError(errorData.error || 'Erro ao processar sorteio.');
        return;
      }

      const data = await response.json();
      setSpinResult(data);
      setSpinning(true);

      const winningIndex = availablePrizes.findIndex(p => p.name === data.prize);
      if (winningIndex !== -1 && wheelRef.current) {
        wheelRef.current.startAnimation(winningIndex, data.prize);
      } else {
        setSpinning(false);
        setResult(data.prize);
      }

      setPrizes(currentPrizes => currentPrizes.map(p =>
        p.name === data.prize ? { ...p, quantity: Math.max(0, p.quantity - 1) } : p
      ));
    } catch {
      setSpinError('Erro de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    setCompletion({
      prize: spinResult?.prize || result,
      timestamp: spinResult?.timestamp || null,
      alreadySpun: false
    });
    setParticipant(previous => previous ? { ...previous, hasSpun: true } : previous);
    setResult(null);
  };

  const renderCompletion = () => (
    <div className="glass-card p-5 text-center shadow-lg">
      <div className="completion-icon mb-3">
        <i className="bi bi-check-circle-fill"></i>
      </div>
      <h2 className="fw-black text-uppercase mb-3">Participação concluída</h2>
      {completion?.prize ? (
        <>
          <p className="text-white-50 mb-2">
            {completion.alreadySpun ? 'Este e-mail já participou e ganhou:' : 'Seu prêmio foi registrado:'}
          </p>
          <h1 className="win-prize-name display-5 fw-black text-uppercase mb-4">{completion.prize}</h1>
        </>
      ) : (
        <p className="text-white-50 fs-5 mb-4">Este e-mail já participou do sorteio deste evento.</p>
      )}
      <div className="participant-chip mx-auto">
        <i className="bi bi-envelope-check me-2"></i>
        {participant?.email || normalizeEmail(participantEmail)}
      </div>
      <p className="text-white-50 small mt-4 mb-0">
        Guarde esta tela para conferir seu prêmio com a equipe do evento.
      </p>
    </div>
  );

  const renderParticipantGate = () => (
    <div className="glass-card p-5 text-center shadow-lg">
      <h1 className="display-6 fw-black text-uppercase mb-3">Validar participação</h1>
      <p className="text-white-50 mb-4">
        Informe o e-mail usado no Google Forms para liberar um único giro neste evento.
      </p>

      <form onSubmit={handleValidateParticipant} className="mx-auto" style={{ maxWidth: '460px' }}>
        <div className="input-group input-group-lg mb-3">
          <span className="input-group-text bg-dark text-white border-secondary">
            <i className="bi bi-envelope"></i>
          </span>
          <input
            type="email"
            className="form-control bg-dark text-white border-secondary"
            value={participantEmail}
            placeholder="seu.email@empresa.com"
            onChange={(event) => setParticipantEmail(event.target.value)}
            disabled={validationLoading}
            autoComplete="email"
          />
        </div>

        {participantError && (
          <div className="alert alert-danger py-2 text-center" role="alert">
            <i className="bi bi-exclamation-circle-fill me-2"></i>
            {participantError}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-warning btn-lg w-100 fw-bold rounded-pill shadow-lg"
          disabled={validationLoading}
        >
          {validationLoading ? 'VALIDANDO...' : <><i className="bi bi-shield-check me-2"></i>VALIDAR E-MAIL</>}
        </button>
      </form>
    </div>
  );

  const renderMain = () => {
    if (completion) {
      return renderCompletion();
    }

    if (!participant) {
      return renderParticipantGate();
    }

    if (isLoadingPrizes) {
      return (
        <div className="glass-card p-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '300px' }}>
          <div className="spinner-border text-warning mb-3" role="status" style={{ width: '3rem', height: '3rem' }}></div>
          <p className="text-white-50 fs-5 mt-2">Carregando roleta...</p>
        </div>
      );
    }

    if (availablePrizes.length < 2) {
      return (
        <div className="glass-card p-5 text-center text-white-50 border-danger">
          <h1 className="display-1 opacity-25 mb-4"><i className="bi bi-exclamation-triangle-fill"></i></h1>
          <h3>Sem inventário suficiente</h3>
          <p>Configure pelo menos 2 brindes no evento <b>{currentEvent.toUpperCase()}</b> para girar.</p>
          <button className="btn btn-primary mt-3" onClick={() => setIsSidebarOpen(true)}>Abrir configurações</button>
        </div>
      );
    }

    return (
      <div className="glass-card p-5 d-flex flex-column align-items-center justify-content-center shadow-lg position-relative">
        <div className="participant-chip mb-2">
          <i className="bi bi-person-check me-2"></i>
          {participant.email}
        </div>

        <Wheel
          ref={wheelRef}
          prizes={availablePrizes}
          spinning={spinning}
          setSpinning={setSpinning}
          onSpinFinish={setResult}
          onSpinClick={handleSpin}
        />

        {spinError && (
          <div className="alert alert-danger mt-3 w-100 py-2 text-center" role="alert">
            <i className="bi bi-exclamation-circle-fill me-2"></i>
            {spinError}
          </div>
        )}

        <div className="mt-4 mb-2 w-100 z-3 position-relative">
          <button
            className={`btn btn-lg btn-spin w-100 ${spinning || loading ? 'btn-secondary' : 'btn-success pulse'}`}
            onClick={handleSpin}
            disabled={spinning || loading}
          >
            {loading
              ? 'PROCESSANDO...'
              : spinning
              ? 'GIRANDO...'
              : <><i className="bi bi-bullseye me-2"></i>GIRAR ROLETA</>
            }
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-wrapper d-flex flex-column">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet" />

      <header className="px-4 py-3 d-flex justify-content-between align-items-center" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
        <h3 className="m-0 fw-black text-white text-uppercase tracking-wider">
          <i className="bi bi-gift-fill me-2" style={{ color: '#FFD200' }}></i> Sorteio Premium
          <span className="badge bg-secondary ms-3 fs-6 rounded-pill">
            {currentEvent === 'geral' ? 'Geral' : currentEvent.toUpperCase()}
          </span>
        </h3>
        <button className="btn btn-outline-light px-4 fw-bold rounded-pill shadow-sm hover-glow" onClick={handleOpenSettings}>
          <i className="bi bi-gear-fill"></i>
        </button>
      </header>

      <main className="flex-grow-1 d-flex align-items-center justify-content-center p-4">
        <div className="text-center w-100" style={{ maxWidth: '800px' }}>
          <div className="mb-4">
            <span className="badge bg-dark border border-secondary px-3 py-2 text-white-50">
              {isLoadingPrizes ? '...' : availablePrizes.length} Itens em estoque disponível
            </span>
          </div>

          {renderMain()}

          {!result && participant && !completion && !isLoadingPrizes && availablePrizes.length >= 2 && !spinError && (
            <div className="result-box mt-4 mx-auto" style={{ maxWidth: '600px' }}>
              <h2 className="mb-0 fw-black" style={{ color: 'rgba(255,255,255,0.3)' }}>Pronto para sortear...</h2>
            </div>
          )}

          {result && (
            <div className="win-popup-overlay d-flex align-items-center justify-content-center">
              <div className="win-popup-content text-center p-5 position-relative">
                <div className="glow-effect"></div>
                <div className="win-icon-wrapper mb-3"><span className="win-icon">🎁</span></div>
                <h2 className="win-title mb-1">PARABÉNS!</h2>
                <p className="win-subtitle mb-4 text-white-50">Você acabou de ganhar o prêmio:</p>
                <h1 className="win-prize-name display-4 fw-black mb-5 text-uppercase">{result}</h1>
                <button className="btn btn-warning btn-lg px-5 py-3 fw-bold rounded-pill shadow-lg win-btn" onClick={handleFinish}>
                  FINALIZAR
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} prizes={prizes} setPrizes={setPrizes} onSave={handleSaveToDB} onClear={handleClearDB} isLoading={loading} />

      <style>{`
        body, html { margin: 0; padding: 0; overflow-x: hidden; background: #0f2027; }
        .app-wrapper { min-height: 100vh; width: 100vw; background: linear-gradient(135deg, #091217, #15252e, #1c323d); font-family: 'Inter', sans-serif; color: white; }
        .glass-card { background: rgba(255,255,255,0.02); border-radius: 40px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
        .participant-chip { width: fit-content; max-width: 100%; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; color: rgba(255,255,255,0.75); padding: 8px 16px; font-size: 0.9rem; overflow-wrap: anywhere; }
        .completion-icon { color: #2BFF88; font-size: 4rem; line-height: 1; }
        .btn-spin { font-weight: 900; border-radius: 50px; text-transform: uppercase; letter-spacing: 2px; transition: all 0.3s ease; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
        .pulse { animation: pulse-animation 2s infinite; }
        @keyframes pulse-animation { 0% { box-shadow: 0 0 0 0px rgba(25, 135, 84, 0.4); } 100% { box-shadow: 0 0 0 20px rgba(25, 135, 84, 0); } }
        .result-box { background: rgba(0,0,0,0.4); padding: 30px; border-radius: 20px; border: 2px dashed rgba(255,255,255,0.1); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .hover-glow:hover { box-shadow: 0 0 15px rgba(255,255,255,0.3) !important; transform: translateY(-1px); }
        .win-popup-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); z-index: 2000; animation: fadeInOverlay 0.3s ease-out forwards; }
        .win-popup-content { background: linear-gradient(145deg, #1e293b, #0f172a); border: 1px solid rgba(255, 210, 0, 0.3); border-radius: 30px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); width: 90%; max-width: 500px; transform: scale(0.8); opacity: 0; animation: popIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s forwards; }
        .glow-effect { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 200px; height: 200px; background: radial-gradient(circle, rgba(255,210,0,0.15) 0%, rgba(0,0,0,0) 70%); z-index: 0; pointer-events: none; }
        .win-icon { font-size: 4rem; position: relative; z-index: 1; animation: floatIcon 2s ease-in-out infinite; display: inline-block; }
        .win-title { color: #FFD200; font-weight: 900; letter-spacing: 2px; position: relative; z-index: 1; }
        .win-prize-name { color: white; text-shadow: 0 0 20px rgba(255,255,255,0.4); position: relative; z-index: 1; overflow-wrap: anywhere; }
        .win-btn { position: relative; z-index: 1; background: linear-gradient(to right, #F7971E, #FFD200); border: none; color: #000; text-transform: uppercase; letter-spacing: 1px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .win-btn:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 10px 25px rgba(255, 210, 0, 0.4) !important; }
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes floatIcon { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>
    </div>
  );
}
