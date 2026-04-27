import { escapeHtml, layout } from "./layout";

export function renderLogin(error?: string): string {
  const errorBlock = error
    ? `<div class="warn">${escapeHtml(error)}</div>`
    : "";

  const body = `
<div class="page-narrow">
  <section class="title-block">
    <div class="overline">Sign in</div>
    <h1>Farenheit</h1>
  </section>
  ${errorBlock}
  <form class="search-form" method="post" action="/login">
    <input type="password" name="token" placeholder="password" autofocus required>
    <br>
    <button type="submit">Enter</button>
  </form>
</div>`;

  return layout("Sign in — Farenheit", body);
}
