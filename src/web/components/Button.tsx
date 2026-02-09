import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({
  variant = "primary",
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const base = "px-5 py-2.5 rounded-[10px] transition-all font-medium text-sm shadow-sm";

  const variants = {
    primary: disabled
      ? "bg-accent text-accent-foreground opacity-50 cursor-not-allowed"
      : "bg-accent text-accent-foreground cursor-pointer hover:bg-accent-hover",
    secondary: disabled
      ? "bg-gray-100 dark:bg-surface-secondary text-gray-900 dark:text-text-primary opacity-50 cursor-not-allowed"
      : "bg-gray-100 dark:bg-surface-secondary text-gray-900 dark:text-text-primary cursor-pointer hover:bg-interactive-hover",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
