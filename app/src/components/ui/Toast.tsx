import { useEffect, useRef } from 'react';
import anime from 'animejs';

interface ToastProps {
  message: string;
  isVisible: boolean;
  onHide: () => void;
  duration?: number;
}

export function Toast({ message, isVisible, onHide, duration = 2500 }: ToastProps) {
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && toastRef.current) {
      // Show animation
      anime({
        targets: toastRef.current,
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 300,
        easing: 'easeOutCubic',
      });

      // Auto hide
      const timer = setTimeout(() => {
        anime({
          targets: toastRef.current,
          opacity: 0,
          translateY: 10,
          duration: 300,
          easing: 'easeInCubic',
          complete: onHide,
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onHide]);

  if (!isVisible) return null;

  return (
    <div
      ref={toastRef}
      className="fixed bottom-6 right-6 bg-bg-card border border-border rounded-lg px-5 py-3 text-base z-50"
    >
      {message}
    </div>
  );
}
