// Aplicar antes del CSS evita un destello claro al recuperar el modo oscuro.
(() => {
  const key = "suipacha-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try { preference = localStorage.getItem(key); } catch { /* Almacenamiento restringido. */ }
  if (preference !== "dark" && preference !== "light") preference = null;

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (!button) return;
    const dark = theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
    document.getElementById("theme-label").textContent = dark ? "Modo claro" : "Modo oscuro";
  }
  apply(preference || (system.matches ? "dark" : "light"));
  system.addEventListener("change", () => {
    if (!preference) apply(system.matches ? "dark" : "light");
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply(document.documentElement.dataset.theme);
    document.getElementById("theme-toggle").addEventListener("click", () => {
      preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      apply(preference);
      try { localStorage.setItem(key, preference); } catch { /* El toggle sigue funcionando. */ }
    });
  });
})();
