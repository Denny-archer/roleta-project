import React from 'react';


function Sidebar({ isOpen, onClose, prizes, setPrizes, onSave, onClear, isLoading }) {
  const handleAddPrize = () => {
    setPrizes([...prizes, { name: `Brinde ${prizes.length + 1}`, quantity: 1 }]);
  };

  const handleUpdatePrize = (index, field, value) => {
    const newPrizes = [...prizes];
    newPrizes[index][field] = value;
    setPrizes(newPrizes);
  };

  const handleRemovePrize = (index) => {
    if (prizes.length <= 2) {
      alert("A roleta precisa de pelo menos 2 brindes para girar!");
      return;
    }
    const newPrizes = prizes.filter((_, i) => i !== index);
    setPrizes(newPrizes);
  };

  return (
    <>
      <div
        className={`sidebar-overlay ${isOpen ? 'show' : ''}`}
        onClick={onClose}
      />

      <div className={`sidebar-container ${isOpen ? 'open' : ''}`}>
        <div className="p-4 h-100 d-flex flex-column">

          <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary">
            <h5 className="m-0 fw-bold text-white d-flex align-items-center gap-2">
              <i className="bi bi-gear-fill me-2"></i> Configurações
            </h5>
            <button className="btn btn-sm btn-outline-light border-0" onClick={onClose}>
              <>
                <i className="bi bi-x-lg me-1"></i> Fechar
              </>
            </button>
          </div>

          <div className="flex-grow-1 overflow-auto pe-2 custom-scrollbar mb-4">
            <p className="text-white-50 small mb-3 text-uppercase tracking-widest">
              Inventário de Brindes
            </p>

            {prizes.map((p, i) => (
              <div key={i} className="prize-card p-3 mb-3 bg-black bg-opacity-50 rounded-3 border border-white border-opacity-10 position-relative">
                <button
                  className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2 px-2 py-0 border-0"
                  style={{ fontSize: '10px' }}
                  onClick={() => handleRemovePrize(i)}
                >
                  <i className="bi bi-x"></i>
                </button>

                <div className="mb-2 pe-4">
                  <label className="small text-white-50 mb-1 d-block" style={{ fontSize: '0.75rem' }}>Nome do Item</label>
                  <input
                    className="form-control form-control-sm bg-dark text-white border-secondary"
                    value={p.name}
                    placeholder="Ex: Caneca"
                    onChange={(e) => handleUpdatePrize(i, 'name', e.target.value)}
                  />
                </div>

                <div>
                  <label className="small text-white-50 mb-1 d-block" style={{ fontSize: '0.75rem' }}>Quantidade no Banco</label>
                  <div className="input-group input-group-sm w-50">
                    <button
                      className="btn btn-outline-secondary"
                      onClick={() => handleUpdatePrize(i, 'quantity', Math.max(0, p.quantity - 1))}
                    ><i className="bi bi-dash"></i></button>
                    <input
                      type="number"
                      className="form-control bg-dark text-white border-secondary text-center px-1"
                      value={p.quantity}
                      onChange={(e) => handleUpdatePrize(i, 'quantity', parseInt(e.target.value) || 0)}
                    />
                    <button
                      className="btn btn-outline-secondary"
                      onClick={() => handleUpdatePrize(i, 'quantity', p.quantity + 1)}
                    ><i className="bi bi-plus"></i></button>
                  </div>
                </div>
              </div>
            ))}

            <button
              className="btn btn-outline-success w-100 py-2 border-dashed"
              onClick={handleAddPrize}
            >
              <>
                <i className="bi bi-plus-circle me-2"></i>
                Adicionar Novo Brinde
              </>
            </button>
          </div>

          <div className="mt-auto pt-3 border-top border-secondary">
            <div className="d-grid gap-2">
              <button
                className="btn btn-primary py-3 fw-bold shadow-sm"
                onClick={onSave}
                disabled={isLoading}
              >
                {isLoading ? 'A GUARDAR...' : <>
                  <i className="bi bi-save2-fill me-2"></i>
                  GUARDAR E ENVIAR AO BANCO
                </>}
              </button>
              <button
                className="btn btn-outline-danger py-2"
                onClick={onClear}
                disabled={isLoading}
              >
                <>
                  <i className="bi bi-trash-fill me-2"></i>
                  Limpar Banco de Dados
                </>
              </button>
            </div>
            <p className="text-center text-white-50 small mt-3 mb-0" style={{ fontSize: '0.7rem' }}>
              Ao salvar, a roleta será atualizada automaticamente apenas com os itens em stock.
            </p>
          </div>

        </div>

        <style>{`.sidebar-container {
                  position: fixed; right: 0; top: 0; bottom: 0; width: 400px;
                  background: linear-gradient(135deg, #091217, #15252e, #1c323d);
                  box-shadow: -20px 0 60px rgba(0,0,0,0.8);
                  transform: translateX(100%);
                  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                  z-index: 1050;
                  border-left: 1px solid rgba(255,255,255,0.05);
                }

                .sidebar-container.open { 
                  transform: translateX(0); 
                }

                .prize-card {
                  transition: all 0.25s ease;
                  cursor: pointer;
                }

                .prize-card:hover {
                  transform: translateY(-3px) scale(1.01);
                  box-shadow: 0 10px 25px rgba(0,0,0,0.4);
                  border: 1px solid rgba(255,255,255,0.2);
                }

                .prize-card input {
                  transition: all 0.2s ease;
                }

                .prize-card input:focus {
                  border-color: #FFD200 !important;
                  box-shadow: 0 0 0 2px rgba(255, 210, 0, 0.2);
                }

                .btn {
                  transition: all 0.2s ease !important;
                }

                .btn:hover {
                  transform: translateY(-1px);
                }

                .btn-primary {
                  background: linear-gradient(135deg, #FFD200, #ffb700);
                  border: none;
                  color: #000;
                }

                .btn-primary:hover {
                  filter: brightness(1.1);
                  box-shadow: 0 5px 20px rgba(255, 210, 0, 0.4);
                }

                .btn-outline-danger:hover {
                  box-shadow: 0 0 15px rgba(220,53,69,0.5);
                }

                .btn-outline-success:hover {
                  box-shadow: 0 0 15px rgba(25,135,84,0.5);
                }

                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { 
                  background: rgba(255,255,255,0.2); 
                  border-radius: 10px; 
                }

                .border-dashed { 
                  border-style: dashed !important; 
                  border-width: 2px !important; 
                }

                /* animação suave ao entrar */
                .sidebar-container.open {
                  animation: slideIn 0.4s ease;
                }

                @keyframes slideIn {
                  from { transform: translateX(100%); opacity: 0; }
                  to { transform: translateX(0); opacity: 1; }
                }

              `}</style>
      </div>
    </>
  );
}

export default Sidebar;