import { layout } from "./layout";

export function renderNotFound(): string {
  const body = `
<table class="topbar-main"><tr>
  <td class="col-left"><a class="back" href="/"><span class="back-arrow">←</span>back</a></td>
  <td class="col-center"><span class="heading">404</span></td>
  <td class="col-right"></td>
</tr></table>
<div class="page-narrow">
  <div class="overline">404</div>
  <h1>page not found</h1>
  <div class="empty">That path doesn't exist in the catalog.</div>
</div>`;
  return layout("404 — Farenheit", body);
}
