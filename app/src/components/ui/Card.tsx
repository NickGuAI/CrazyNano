import { HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'dashed';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: 'border-solid',
      interactive: 'border-solid cursor-pointer hover:border-text-secondary hover:-translate-y-0.5',
      dashed: 'border-dashed',
    };

    return (
      <div
        ref={ref}
        className={`
          bg-bg-card border border-border rounded-lg
          transition-all duration-200
          ${variantStyles[variant]}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
