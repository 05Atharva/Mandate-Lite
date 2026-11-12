// Run before first paint, with an external script allowed by the production CSP.
try {
  const preference = localStorage.getItem('mandate-theme');
  const theme =
    preference === 'light' || preference === 'dark'
      ? preference
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
} catch {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
