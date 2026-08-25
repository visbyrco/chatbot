import { headers } from "next/headers";

import { FONT_ROLES } from "@/lib/fonts";

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(190deg 18% 8%)";
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
  window.addEventListener('pagehide', function() { observer.disconnect(); });
  window.addEventListener('beforeunload', function() { observer.disconnect(); });
})();`;

const FONT_SCRIPT = `\
(function() {
  var roles = ${JSON.stringify(FONT_ROLES).replace(/</g, "\\u003c")};
  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : undefined;
  }
  var html = document.documentElement;
  for (var roleKey in roles) {
    var role = roles[roleKey];
    var id = readCookie(role.cookieName);
    var font = null;
    for (var i = 0; i < role.fonts.length; i++) {
      if (role.fonts[i].id === id) font = role.fonts[i];
      if (!font && role.fonts[i].id === role.defaultId) font = role.fonts[i];
    }
    if (font) {
      html.style.setProperty(role.cssVar, font.stack);
      if (role.cssVarItalic) {
        html.style.setProperty(role.cssVarItalic, font.italicStack || font.stack);
      }
    }
  }
})();`;

export async function NonceScripts() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: "Required for theme nonce"
        dangerouslySetInnerHTML={{ __html: THEME_COLOR_SCRIPT }}
        nonce={nonce}
      />
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: "Required for font nonce"
        dangerouslySetInnerHTML={{ __html: FONT_SCRIPT }}
        nonce={nonce}
      />
    </>
  );
}
