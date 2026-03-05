import { useEffect, useRef } from 'react';
import anime from 'animejs';

interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className = '' }: TypingIndicatorProps) {
  const dotsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dotsRef.current) return;

    const dots = dotsRef.current.querySelectorAll('.typing-dot');

    const animation = anime({
      targets: dots,
      translateY: [-4, 0],
      duration: 400,
      delay: anime.stagger(100),
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutQuad',
    });

    return () => animation.pause();
  }, []);

  return (
    <div ref={dotsRef} className={`flex gap-1 py-2 ${className}`}>
      <div className="typing-dot w-1.5 h-1.5 bg-text-secondary rounded-full" />
      <div className="typing-dot w-1.5 h-1.5 bg-text-secondary rounded-full" />
      <div className="typing-dot w-1.5 h-1.5 bg-text-secondary rounded-full" />
    </div>
  );
}
