import { layout } from "./layout";

export function renderNotFound(): string {
  const body = `
<div class="nav">
  <a href="/">← Voltar pra home</a>
  <span></span>
</div>
<h1>Página não encontrada</h1>
<p class="sub">Esse caminho não existe no Farenheit.</p>
`;
  return layout("404 — Farenheit", body);
}
