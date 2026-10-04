// Shared shell for the server-rendered pages (admin, legal, messages), so they match the app:
// coral moving backdrop, white logo, frosted pill navigation, dark frosted glass panels.
// Styles: public/glass/site.css · backdrop + glass refraction: public/glass/site.js.

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/gu, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const NAV = {
  create: { href: "/", label: "创作" },
  admin: { href: "/admin", label: "管理后台" },
  logout: { href: "/access-logout", label: "退出后台" },
  home: { href: "/", label: "返回首页" },
};

/**
 * @param {{ title: string, body: string, nav?: Array<keyof typeof NAV>, active?: keyof typeof NAV }} opts
 */
export function glassPage({ title, body, nav = ["create", "admin", "logout"], active }) {
  const links = nav
    .map((key) => NAV[key])
    .filter(Boolean)
    .map((item, i) => `<a href="${item.href}"${nav[i] === active ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#b8274f" />
<title>${escapeHtml(title)} · BAKABAKA 巴卡巴卡</title>
<link rel="icon" type="image/png" href="/icons/lipa-icon.png" />
<link rel="stylesheet" href="/glass/site.css" />
</head>
<body>
  <div class="bd" id="bd" aria-hidden="true"></div>
  <header class="top">
    <a class="brand" href="/" aria-label="巴卡巴卡 · 回首页"><img src="/glass/logo-white.png" alt="巴卡巴卡 BAKABAKA" /></a>
    <nav class="nav" aria-label="导航">${links}</nav>
  </header>
  <main>
${body}
  </main>
  <script src="/glass/site.js" defer></script>
</body>
</html>`;
}

/** A short glass page for errors and confirmations (replaces bare text responses). */
export function glassMessage({ title, message, backHref = "/", backLabel = "返回", nav }) {
  return glassPage({
    title,
    nav,
    body: `<section class="message"><div class="glass">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a class="btn" href="${escapeHtml(backHref)}">${escapeHtml(backLabel)}</a>
    </div></section>`,
  });
}
