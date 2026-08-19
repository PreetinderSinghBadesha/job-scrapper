import { describe, expect, it } from "vitest";
import { simplifyHtmlForPrompt } from "../htmlCleanup.js";

describe("simplifyHtmlForPrompt", () => {
  it("strips script, style, svg, and noscript blocks", () => {
    const html = `
      <div>
        <script>trackEvent();</script>
        <style>.card { color: red; }</style>
        <svg viewBox="0 0 10 10"><path d="M0 0"/></svg>
        <noscript>Enable JS</noscript>
        <p>Software Engineer</p>
      </div>
    `;

    const result = simplifyHtmlForPrompt(html, 10000);

    expect(result).not.toContain("trackEvent");
    expect(result).not.toContain("color: red");
    expect(result).not.toContain("viewBox");
    expect(result).not.toContain("Enable JS");
    expect(result).toContain("Software Engineer");
  });

  it("strips HTML comments", () => {
    const html = "<div><!-- internal note --><p>Title</p></div>";

    const result = simplifyHtmlForPrompt(html, 10000);

    expect(result).not.toContain("internal note");
    expect(result).toContain("Title");
  });

  it("collapses repeated whitespace", () => {
    const html = "<div>\n\n   <p>Title</p>\n\n   <p>Company</p>\n\n</div>";

    const result = simplifyHtmlForPrompt(html, 10000);

    expect(result).not.toMatch(/\s{2,}/);
  });

  it("truncates to the given character limit", () => {
    const html = "<p>" + "a".repeat(500) + "</p>";

    const result = simplifyHtmlForPrompt(html, 100);

    expect(result.length).toBe(100);
  });

  it("leaves short input under the limit untouched in length", () => {
    const html = "<p>Short</p>";

    const result = simplifyHtmlForPrompt(html, 10000);

    expect(result.length).toBeLessThan(10000);
    expect(result).toContain("Short");
  });
});
