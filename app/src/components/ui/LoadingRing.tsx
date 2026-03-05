import { useEffect, useRef } from 'react';
import anime from 'animejs';

interface LoadingRingProps {
  size?: number;
  className?: string;
}

export function LoadingRing({ size = 60, className = '' }: LoadingRingProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!circleRef.current || !svgRef.current) return;

    // Dash animation
    const dashAnimation = anime({
      targets: circleRef.current,
      strokeDashoffset: [150, 0],
      duration: 2000,
      easing: 'easeInOutQuad',
      loop: true,
    });

    // Rotation animation
    const rotateAnimation = anime({
      targets: svgRef.current,
      rotate: 360,
      duration: 1500,
      easing: 'linear',
      loop: true,
    });

    return () => {
      dashAnimation.pause();
      rotateAnimation.pause();
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 60 60"
    >
      <circle
        ref={circleRef}
        cx="30"
        cy="30"
        r="25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="150"
        strokeDashoffset="150"
        strokeLinecap="round"
        className="text-text-primary"
      />
    </svg>
  );
}
