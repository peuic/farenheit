import { layout } from "./layout";

export function renderNotFound(): string {
  const body = `
<div class="page-narrow">
  <nav class="nav" aria-label="Navegação">
    <a class="back" href="/">voltar pra home</a>
    <a href="/">Farenheit</a>
  </nav>
  <section class="title-block">
    <div class="overline">404</div>
    <h1>página não encontrada</h1>
  </section>
  <div class="empty">Esse caminho não existe no catálogo.</div>
</div>
`;
  return layout("404 — Farenheit", body);
}
