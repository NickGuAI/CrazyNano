import { useEffect, useRef, useCallback, ReactNode } from 'react';
import anime from 'animejs';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Show animation
      anime({
        targets: overlayRef.current,
        opacity: [0, 1],
        duration: 200,
        easing: 'easeOutCubic',
      });
      anime({
        targets: modalRef.current,
        scale: [0.95, 1],
        opacity: [0, 1],
        duration: 300,
        easing: 'easeOutCubic',
      });
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    // Hide animation
    anime({
      targets: overlayRef.current,
      opacity: 0,
      duration: 200,
      easing: 'easeInCubic',
      complete: onClose,
    });
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleClose();
      }}
    >
      <div
        ref={modalRef}
        className="bg-bg-elevated border border-border rounded-xl w-[90%] max-w-[500px] p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2 id="modal-title" className="text-2xl font-medium mb-4">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
