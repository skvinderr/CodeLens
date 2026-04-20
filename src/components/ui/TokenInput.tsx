import type { ChangeEvent } from 'react'

export interface TokenInputProps {
  id: string
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function TokenInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: TokenInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value)
  }

  return (
    <label className="token-input" htmlFor={id}>
      <span className="token-input-label">{label}</span>
      <input
        id={id}
        className="token-input-field"
        type="password"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={handleChange}
      />
    </label>
  )
}
