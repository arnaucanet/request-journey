// Formatos de la UI, al estilo de las DevTools de Chrome
export function ms(value) {
  if (value < 10) return `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ms`;
  return `${Math.round(value)} ms`;
}

export function bytes(value) {
  if (!value) return '0 B';
  return `${(value / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} kB`;
}

export function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
