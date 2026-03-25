import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

/**
 * CONFIGURAÇÕES GLOBAIS
 */
const COLORS = [
  ['#FF416C', '#FF4B2B'], ['#1FA2FF', '#12D8FA'], 
  ['#F7971E', '#FFD200'], ['#00B09B', '#96C93D'], 
  ['#8E2DE2', '#4A00E0'], ['#f80759', '#bc4e9c']
];


const Wheel = forwardRef(({ prizes, onSpinFinish, spinning, setSpinning }, ref) => {
  const canvasRef = useRef(null);
  const angleRef = useRef(0);

  // Desenha a roleta baseada num ângulo específico
  const draw = (currentAngle) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 15;
    const arc = (Math.PI * 2) / prizes.length;

    ctx.clearRect(0, 0, size, size);

    prizes.forEach((prize, i) => {
      const startAngle = currentAngle + i * arc;
      const endAngle = startAngle + arc;
      
      // Fatia
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      const [c1, c2] = COLORS[i % COLORS.length];
      const grad = ctx.createRadialGradient(center, center, 0, center, center, radius);
      grad.addColorStop(0.2, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Texto
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'black';
      ctx.fillText(prize.length > 12 ? prize.substring(0,10)+'..' : prize, radius - 40, 6);
      ctx.restore();
    });

    // Centro decorativo
    ctx.beginPath();
    ctx.arc(center, center, 35, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 5;
    ctx.stroke();
    
    // Texto "GO" no centro
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    ctx.shadowBlur = 0;
    ctx.fillText("GO!", center, center + 7);
  };

  // Lógica de animação matemática precisa
  useImperativeHandle(ref, () => ({
    startAnimation: (winningIndex) => {
      const duration = 4000;
      const arc = (Math.PI * 2) / prizes.length;
      
      // O ponteiro visual está no topo (ângulo 1.5 * PI)
      // Precisamos que o CENTRO da fatia ganhadora pare em 1.5 * PI
      const pointerAngle = 1.5 * Math.PI;
      const sliceCenter = (winningIndex * arc) + (arc / 2);
      
      // O ângulo final deve ser: Rotação para alinhar + Voltas extras
      const extraRotations = 8 * Math.PI * 2;
      const currentAngleBase = angleRef.current % (Math.PI * 2);
      
      // Cálculo de compensação:
      const targetAngle = angleRef.current + extraRotations + (pointerAngle - currentAngleBase - sliceCenter);

      const start = performance.now();
      const animate = (time) => {
        const progress = Math.min((time - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // Quartic Ease Out
        const current = angleRef.current + (targetAngle - angleRef.current) * ease;
        
        draw(current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          angleRef.current = current;
          setSpinning(false);
          onSpinFinish(prizes[winningIndex]);
        }
      };
      requestAnimationFrame(animate);
    }
  }));

  useEffect(() => { draw(angleRef.current); }, [prizes]);

  return (
    <div className="position-relative d-inline-block">
      {/* Ponteiro estilizado */}
      <div className="wheel-pointer" />
      <canvas ref={canvasRef} width={480} height={480} className="wheel-canvas" />
      <style>{`
        .wheel-pointer {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 20px solid transparent;
          border-right: 20px solid transparent;
          border-top: 35px solid #fff;
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));
          z-index: 10;
        }
        .wheel-canvas {
          border-radius: 50%;
          box-shadow: 0 0 60px rgba(0,0,0,0.6);
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
});

export default Wheel;