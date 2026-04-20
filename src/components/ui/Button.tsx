import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

export interface ButtonProps
  extends PropsWithChildren,
    ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

const variantClassMap: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classNames = ['btn', variantClassMap[variant], className]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classNames} {...rest}>
      {children}
    </button>
  )
}
