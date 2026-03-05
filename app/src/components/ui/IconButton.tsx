import { ButtonHTMLAttributes, forwardRef } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className = '', size = 'md', children, ...props }, ref) => {
    const sizeStyles = {
      sm: 'w-7 h-7',
      md: 'w-8 h-8',
    };

    return (
      <button
        ref={ref}
        className={`
          ${sizeStyles[size]} rounded-md bg-transparent border border-border
          flex items-center justify-center cursor-pointer
          transition-all duration-200
          hover:bg-accent-dim hover:border-text-secondary
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
