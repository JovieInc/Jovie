// Reviewed image/Markdown allowances; any flag except explicit false can opt in.
export const allowanceEnabled = (value: unknown) =>
  value !== undefined &&
  value !== false &&
  !['', 'false'].includes(String(value));
