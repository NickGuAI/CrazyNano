import type { GenerationStatus } from '@/types';

interface BadgeProps {
  status: GenerationStatus;
  className?: string;
}

const statusStyles: Record<GenerationStatus, string> = {
  pending: 'bg-accent-dim text-text-primary',
  generating: 'bg-text-primary text-bg',
  validating: 'bg-text-primary text-bg',
  complete: 'bg-accent-dim text-text-primary',
  failed: 'bg-accent-dim text-text-secondary',
};

const statusLabels: Record<GenerationStatus, string> = {
  pending: 'Pending',
  generating: 'Generating',
  validating: 'Validating',
  complete: 'Complete',
  failed: 'Failed',
};

export function Badge({ status, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        text-xs px-2 py-0.5 rounded
        ${statusStyles[status]}
        ${className}
      `}
    >
      {statusLabels[status]}
    </span>
  );
}
