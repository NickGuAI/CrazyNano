interface ProgressProps {
  value: number; // 0-100
  className?: string;
}

export function Progress({ value, className = '' }: ProgressProps) {
  return (
    <div className={`h-0.5 bg-border rounded-sm overflow-hidden ${className}`}>
      <div
        className="h-full bg-text-primary transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
