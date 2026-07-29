export const valid = (value: string) => /^ORD-[A-Z0-9]{8}$/.test(value)
export const normalize = (value: string) => value.trim().toUpperCase()
