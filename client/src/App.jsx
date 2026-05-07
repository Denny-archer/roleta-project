import React, { useState, useRef, useEffect, useMemo } from 'react';
import Wheel from './components/Wheel';
import Sidebar from './components/Sidebar';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

export default function App() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';

  // Captura o evento E o email pela URL (ex: ?evento=brasilia&email=user@coffito.gov.br)
  const queryParams = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );
  const currentEvent = queryParams.get('evento') || 'geral';
  const emailFromUrl = queryParams.get('email') || '';
  const emailBloqueado = !!emailFromUrl; // true se veio da URL (Forms)

  const [prizes, setPrizes] = useState([]);
  // ✅ FIX 1: Estado de loading separado para prêmios — evita tela "Sem Inventário" durante fetch
  const [isLoadingPrizes, setIsLoadingPrizes] = useState(true);

  const [adminAuth, setAdminAuth] = useState('');
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const wheelRef = useRef(null);
  const [email, setEmail] = useState(emailFromUrl);
  const [hasGiro, setHasGiro] = useState(false);

  // ✅ FIX 3: Estado para mensagem de erro inline (substitui alert() agressivo)
  const [errorMsg, setErrorMsg] = useState('');

  // ✅ FIX 1 + 2: useEffect unificado — carrega prêmios E verifica participação prévia
  useEffect(() => {
    const initializePage = async () => {
      setIsLoadingPrizes(true);
      setErrorMsg('');

      try {
        // 1) Carrega os prêmios do evento
        const r1 = await fetch(`${API_URL}/api/prizes?evento=${currentEvent}`);
        if (r1.ok) {
          const dbPrizes = await r1.json();
          if (dbPrizes && dbPrizes.length > 0) {
            setPrizes(dbPrizes);
          }
        } else {
          console.error('Erro ao carregar prêmios:', r1.status);
        }

        // 2) ✅ FIX 2: Se o email veio da URL, verifica se já participou
        //    Isso evita que a roleta apareça habilitada após refresh
        //    quando o backend já tem o registro de participação
        if (emailFromUrl) {
          const r2 = await fetch(
            `${API_URL}/api/check-spin?evento=${currentEvent}&email=${encodeURIComponent(emailFromUrl)}`
          );
          if (r2.ok) {
            const { jaParticipou } = await r2.json();
            if (jaParticipou) {
              setHasGiro(true); // Trava o botão corretamente
            }
          }
        }
      } catch (error) {
        console.error('Erro ao inicializar página:', error);
        // Não bloqueia a UI — apenas loga. O usuário ainda pode tentar girar.
      } finally {
        setIsLoadingPrizes(false); // ✅ Sempre libera o loading, com ou sem erro
      }
    };

    initializePage();
  }, [API_URL, currentEvent, emailFromUrl]);

  const availablePrizes = prizes.filter(p => p.quantity > 0);

  const handleOpenSettings = async () => {
    const pass = window.prompt(`🔒 Acesso Restrito [Evento: ${currentEvent.toUpperCase()}]\nDigite a senha de administrador:`);
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
        alert('❌ Senha incorreta! Acesso negado.');
      }
    } catch (e) {
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
    } catch (e) {
      alert('Erro ao conectar com o banco.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearDB = async () => {
    if (!window.confirm(`Aviso: Isto vai apagar TODOS os brindes do evento "${currentEvent}". Confirmar?`)) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/prizes/clear?evento=${currentEvent}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Password': adminAuth }
      });
      if (response.status === 401) throw new Error('Senha incorreta');
      if (!response.ok) throw new Error('Falha ao limpar');
      setPrizes([{ name: 'Prémio 1', quantity: 0 }, { name: 'Prémio 2', quantity: 0 }]);
      alert('Banco de dados limpo com sucesso!');
    } catch (e) {
      alert('Erro ao limpar banco.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpin = async () => {
    if (spinning || loading || hasGiro) return;
    setErrorMsg(''); // Limpa erro anterior

    // Validação de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setErrorMsg('Por favor, insira um e-mail válido para participar.');
      return;
    }

    if (availablePrizes.length < 2) {
      alert('Precisas de pelo menos 2 brindes com stock!');
      return setIsSidebarOpen(true);
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento: currentEvent, email })
      });

      // ✅ FIX 3: Erros do backend mostrados inline, não em alert()
      if (!response.ok) {
        let errorData = {};

        try {
          errorData = await response.json();
        } catch { }
        setErrorMsg(errorData.error || 'Erro ao processar sorteio.');
        // Se já participou, trava o botão também (caso raro de race condition)
        if (response.status === 403) setHasGiro(true);
        setLoading(false);
        return;
      }

      const data = await response.json();
      setLoading(false);
      setSpinning(true);


      const winningIndex = availablePrizes.findIndex(p => p.name === data.prize);
      if (winningIndex !== -1) {
        if (wheelRef.current?.startAnimation) {
          wheelRef.current.startAnimation(winningIndex, data.prize);
        } else {
          setResult(data.prize);
          setSpinning(false);
        }
      } else {
        setLoading(false);
        setSpinning(false);
        setErrorMsg('Erro ao localizar prêmio sorteado.');
      }

      setPrizes(prev =>
        prev.map(p =>
          p.name === data.prize
            ? { ...p, quantity: p.quantity - 1 }
            : p
        )
      );
    } catch (e) {
      // Só cai aqui se for erro de rede real (servidor offline)
      setLoading(false);
      setErrorMsg('Erro de conexão com o servidor. Tente novamente.');
    }
  };

  // ✅ Conteúdo central — 3 estados: carregando / com prêmios / sem prêmios
  const renderMainContent = () => {
    if (isLoadingPrizes) {
      return (
        <div className="glass-card p-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '350px' }}>
          <div className="spinner-border text-warning mb-4" style={{ width: '3rem', height: '3rem' }} role="status" />
          <h5 className="text-white-50 fw-normal">A carregar roleta...</h5>
        </div>
      );
    }

    if (availablePrizes.length >= 2) {
      return (
        <div className="glass-card p-5 d-flex flex-column align-items-center justify-content-center shadow-lg position-relative">
          <Wheel
            ref={wheelRef}
            prizes={availablePrizes}
            spinning={spinning}
            setSpinning={setSpinning}
            onSpinFinish={(prize) => {
              setResult(prize);
              setHasGiro(true);
            }}
            onSpinClick={handleSpin}
          />

          <div className="mt-4 w-100">
            <label htmlFor="email" className="form-label text-white-50">Email</label>
            <input
              type="email"
              className={`form-control bg-dark border-secondary text-white placeholder:text-white-50 ${errorMsg ? 'border-danger' : ''}`}
              id="email"
              placeholder="Digite seu email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
              disabled={emailBloqueado}
            />

            {/* ✅ FIX 3: Erro inline no lugar de alert() */}
            {errorMsg && (
              <small className="text-danger mt-1 d-block">
                <i className="bi bi-exclamation-circle-fill me-1"></i>
                {errorMsg}
              </small>
            )}

            {emailBloqueado && !errorMsg && (
              <small className="text-success mt-1 d-block">
                <i className="bi bi-check-circle-fill me-1"></i>
                Email verificado pelo formulário
              </small>
            )}

            {/* ✅ FIX 2: Mensagem clara quando já participou */}
            {hasGiro && !spinning && (
              <div className="alert alert-warning mt-3 mb-0 py-2 text-center" role="alert">
                <i className="bi bi-lock-fill me-2"></i>
                Este e-mail já participou do sorteio neste evento.
              </div>
            )}
          </div>

          <div className="mt-5 mb-2 w-100 z-3 position-relative">
            <button
              className={`btn btn-lg btn-spin ${spinning || loading ? 'btn-secondary' : hasGiro ? 'btn-secondary' : 'btn-success pulse'}`}
              onClick={handleSpin}
              disabled={spinning || loading || hasGiro}
            >
              {loading
                ? 'A PROCESSAR...'
                : spinning
                  ? 'A GIRAR...'
                  : hasGiro
                    ? <><i className="bi bi-lock-fill me-2"></i>JÁ PARTICIPOU</>
                    : <><i className="bi bi-bullseye me-2"></i>GIRAR ROLETA</>
              }
            </button>
          </div>
        </div>
      );
    }

    // Sem inventário suficiente
    return (
      <div className="glass-card p-5 text-center text-white-50 border-danger">
        <h1 className="display-1 opacity-25 mb-4"><i className="bi bi-exclamation-triangle-fill"></i></h1>
        <h3>Sem Inventário Suficiente</h3>
        <p>Configura pelo menos 2 brindes no evento <b>{currentEvent.toUpperCase()}</b> para girar.</p>
        <button className="btn btn-primary mt-3" onClick={handleOpenSettings}>Abrir Configurações</button>
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

          {/* Badge de stock — oculto enquanto carrega */}
          {!isLoadingPrizes && (
            <div className="mb-4">
              <span className="badge bg-dark border border-secondary px-3 py-2 text-white-50">
                {availablePrizes.length} Itens em Stock Disponível
              </span>
            </div>
          )}

          {/* ✅ FIX 1: Renderização condicional com estado de loading */}
          {renderMainContent()}

          {!result && !isLoadingPrizes && (
            <div className="result-box mt-4 mx-auto" style={{ maxWidth: '600px' }}>
              <h2 className="mb-0 fw-black" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {hasGiro ? 'Obrigado pela participação!' : 'Pronto para sortear...'}
              </h2>
            </div>
          )}

          {result && (
            <div className="win-popup-overlay d-flex align-items-center justify-content-center">
              <div className="win-popup-content text-center p-5 position-relative">
                <div className="glow-effect"></div>
                <div className="win-icon-wrapper mb-3"><span className="win-icon">🎁</span></div>
                <h2 className="win-title mb-1">PARABÉNS!</h2>
                <p className="win-subtitle mb-4 text-white-50">Acabaste de ganhar o prémio:</p>
                <h1 className="win-prize-name display-4 fw-black mb-5 text-uppercase">{result}</h1>
                <button
                  className="btn btn-warning btn-lg px-5 py-3 fw-bold rounded-pill shadow-lg win-btn"
                  onClick={() => setResult(null)}
                >
                  🎉 CONTINUAR
                </button>
              </div>
            </div>
          )}
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
        .app-wrapper { min-height: 100vh; width: 100%; background: linear-gradient(135deg, #091217, #15252e, #1c323d); font-family: 'Inter', sans-serif; color: white; }
        .glass-card { background: rgba(255,255,255,0.02); border-radius: 40px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(4px); }
        .btn-spin { font-weight: 900; border-radius: 50px; text-transform: uppercase; letter-spacing: 2px; transition: all 0.3s ease; box-shadow: 0 10px 20px rgba(0,0,0,0.3); width: 100%; }
        .pulse { animation: pulse-animation 2s infinite; }
        .glass-card {
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          }

        @supports not ((-webkit-backdrop-filter: blur(4px)) or (backdrop-filter: blur(4px)))) {
          .glass-card {
            background: rgba(30,41,59,0.95);
          }
        }
        @keyframes pulse-animation { 0% { box-shadow: 0 0 0 0px rgba(25, 135, 84, 0.4); } 100% { box-shadow: 0 0 0 20px rgba(25, 135, 84, 0); } }
        .result-box { background: rgba(0,0,0,0.4); padding: 30px; border-radius: 20px; border: 2px dashed rgba(255,255,255,0.1); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .hover-glow:hover { box-shadow: 0 0 15px rgba(255,255,255,0.3) !important; transform: translateY(-1px); }
        .win-popup-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); z-index: 2000; animation: fadeInOverlay 0.3s ease-out forwards; }
        .win-popup-content { background: linear-gradient(145deg, #1e293b, #0f172a); border: 1px solid rgba(255, 210, 0,
        .win-icon { font-size: 4rem; position: relative; z-index: 1; animation: floatIcon 2s ease-in-out infinite; display: inline-block; }
        .win-title { color: #FFD200; font-weight: 900; letter-spacing: 2px; position: relative; z-index: 1; }
        .win-prize-name { color: white; text-shadow: 0 0 20px rgba(255,255,255,0.4); position: relative; z-index: 1; }
        .win-btn { position: relative; z-index: 1; background: linear-gradient(to right, #F7971E, #FFD200); border: none; color: #000; text-transform: uppercase; letter-spacing: 1px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .win-btn:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 10px 25px rgba(255, 210, 0, 0.4) !important; }
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes floatIcon { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>
    </div>
  );
}