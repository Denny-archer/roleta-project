import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

// Nova paleta de cores neutras, sofisticadas e sóbrias
const COLORS = [
  ['#475569', '#334155'], // Slate (Azul-acinzentado escuro)
  ['#52525b', '#3f3f46'], // Zinc (Cinza neutro médio)
  ['#78716c', '#57534e'], // Stone (Cinza acastanhado / Taupe)
  ['#4b5563', '#374151'], // Gray (Cinza clássico)
  ['#3f3f46', '#27272a'], // Dark Zinc (Cinza quase chumbo)
  ['#64748b', '#475569']  // Light Slate (Azul-acinzentado suave)
];

// 👇 Adicionámos as props 'spinning' e 'onSpinClick'
const Wheel = forwardRef(({ prizes, onSpinFinish, spinning, setSpinning, onSpinClick }, ref) => {
  const canvasRef = useRef(null);
  const angleRef = useRef(0);

  const draw = (currentAngle) => {
    const canvas = canvasRef.current;
    if (!canvas || prizes.length === 0) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 15;
    const arc = (Math.PI * 2) / prizes.length;

    ctx.clearRect(0, 0, size, size);

    prizes.forEach((prizeObj, i) => {
      const prizeName = prizeObj.name;
      const startAngle = currentAngle + i * arc;
      const endAngle = startAngle + arc;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      
      const [c1, c2] = COLORS[i % COLORS.length];
      const grad = ctx.createRadialGradient(center, center, 0, center, center, radius);
      grad.addColorStop(0.2, c1); 
      grad.addColorStop(1, c2);
      
      ctx.fillStyle = grad; 
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; 
      ctx.lineWidth = 1.5; 
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = 'right'; 
      ctx.fillStyle = '#f8fafc'; 
      
      ctx.font = '600 16px sans-serif'; 
      ctx.shadowBlur = 4; 
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      
      ctx.fillText(prizeName.length > 12 ? prizeName.substring(0, 10) + '..' : prizeName, radius - 40, 6);
      ctx.restore();
    });

    // Círculo central modernizado
    ctx.beginPath(); 
    ctx.arc(center, center, 35, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b'; 
    ctx.fill();
    ctx.shadowBlur = 10; 
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.strokeStyle = '#475569'; 
    ctx.lineWidth = 4; 
    ctx.stroke();

    ctx.fillStyle = '#f8fafc'; 
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif'; 
    ctx.shadowBlur = 0;
    ctx.fillText("GO!", center, center + 6);
  };

  useImperativeHandle(ref, () => ({
    startAnimation: (winningIndex, prizeName) => {
      if (prizes.length === 0) return;
      const duration = 4000;
      const arc = (Math.PI * 2) / prizes.length;
      const pointerAngle = 1.5 * Math.PI;
      const sliceCenter = (winningIndex * arc) + (arc / 2);
      const extraRotations = 8 * Math.PI * 2;
      const currentAngleBase = angleRef.current % (Math.PI * 2);
      const targetAngle = angleRef.current + extraRotations + (pointerAngle - currentAngleBase - sliceCenter);

      const start = performance.now();
      const animate = (time) => {
        const progress = Math.min((time - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4);
        const startAngle = angleRef.current;

        const current = startAngle + (targetAngle - startAngle) * ease;
        draw(current);
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          angleRef.current = current;
          setSpinning(false);
          onSpinFinish(prizeName);
        }
      };
      requestAnimationFrame(animate);
    }
  }));

  useEffect(() => { draw(angleRef.current); }, [prizes]);

  // 👇 NOVA LÓGICA DE CLIQUE E MOUSE 👇
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseMove = (e) => {
    if (spinning) return; // Desativa o hover se já estiver a girar
    const pos = getMousePos(e);
    const center = canvasRef.current.width / 2;
    // Teorema de Pitágoras para calcular distância ao centro
    const distance = Math.sqrt(Math.pow(pos.x - center, 2) + Math.pow(pos.y - center, 2));

    // O raio do nosso botão GO é 35
    if (distance <= 35) {
      canvasRef.current.style.cursor = 'pointer';
    } else {
      canvasRef.current.style.cursor = 'default';
    }
  };

  const handleClick = (e) => {
    if (spinning) return;
    const pos = getMousePos(e);
    const center = canvasRef.current.width / 2;
    const distance = Math.sqrt(Math.pow(pos.x - center, 2) + Math.pow(pos.y - center, 2));

    // Se clicou dentro do raio de 35 e temos a função onSpinClick, dispara!
    if (distance <= 35 && onSpinClick) {
      onSpinClick();
    }
  };

  return (
    <div className="position-relative d-inline-block mt-4">
      <div className="wheel-pointer" />
      {/* 👇 Adicionámos onClick e onMouseMove ao canvas 👇 */}
      <canvas 
        ref={canvasRef} 
        width={480} 
        height={480} 
        className="wheel-canvas" 
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if(canvasRef.current) canvasRef.current.style.cursor = 'default'; }}
      />
      <style>{`
        .wheel-pointer {
          position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
          width: 0; height: 0; 
          border-left: 18px solid transparent; 
          border-right: 18px solid transparent; 
          border-top: 30px solid #cbd5e1;
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); 
          z-index: 10;
        }
        .wheel-canvas { 
          border-radius: 50%; 
          box-shadow: 0 0 40px rgba(0,0,0,0.4);
          max-width: 100%; height: auto; 
          /* Removemos a seleção de texto acidental ao clicar rápido */
          user-select: none; 
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  );
});

export default Wheel;