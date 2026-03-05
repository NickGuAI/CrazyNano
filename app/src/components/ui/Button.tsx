import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-text-primary text-bg hover:opacity-90 hover:-translate-y-px',
  secondary: 'bg-bg-card text-text-primary border border-border hover:bg-accent-dim',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          px-5 py-2.5 rounded-lg text-base font-medium cursor-pointer
          transition-all duration-200 inline-flex items-center gap-2
          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
          ${variantStyles[variant]}
          ${className}
        `}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
