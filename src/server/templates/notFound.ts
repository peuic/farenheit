import { layout } from "./layout";

export function renderNotFound(): string {
  const body = `
<header class="topbar">
  <div class="line primary">
    <a class="back" href="/">voltar</a>
    <span class="heading">404</span>
    <span class="icons"></span>
  </div>
</header>
<div class="page-narrow">
  <div class="overline">404</div>
  <h1>página não encontrada</h1>
  <div class="empty">Esse caminho não existe no catálogo.</div>
</div>
`;
  return layout("404 — Farenheit", body);
}
