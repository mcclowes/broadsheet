/**
 * Shared DOMPurify sanitization config used by both server-side and
 * client-side markdown rendering. Extracted to prevent security-critical
 * config drift between the two code paths.
 *
 * Policy decisions:
 * - External links get target="_blank" rel="noreferrer noopener" (added
 *   via a DOMPurify hook in the render path, not by allowing arbitrary
 *   target/rel values here).
 * - data: URIs are allowed only for images (LQIP placeholders, inline
 *   tiny images). text/html and other dangerous MIME types are blocked
 *   by the regexp.
 * - data-* attributes are explicitly denied — they carry no semantic
 *   value in a reader view and expand the attack surface.
 */
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "span",
    "em",
    "strong",
    "code",
    "pre",
    "kbd",
    "samp",
    "var",
    "a",
    "img",
    "figure",
    "figcaption",
    "picture",
    "source",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "sub",
    "sup",
    "mark",
    "del",
    "ins",
  ],
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "textarea",
    "select",
    "button",
    "svg",
    "math",
    "meta",
    "link",
    "base",
    "noscript",
  ],
  ALLOWED_ATTR: [
    "href",
    "title",
    "src",
    "alt",
    "srcset",
    "sizes",
    "loading",
    // Links: target/rel for opening external links in new tabs.
    "target",
    "rel",
    // Images: width/height prevent layout shift.
    "width",
    "height",
    // Table semantics: markdown tables inherit alignment via `align`, and
    // headerless tables are preserved as raw HTML which may use colspan /
    // rowspan / scope. None of these are vectors for script execution.
    "align",
    "colspan",
    "rowspan",
    "scope",
  ],
  ALLOW_DATA_ATTR: false,
  // DOMPurify applies ALLOWED_URI_REGEXP to every attribute value unless the
  // attribute is flagged URI-safe. Table layout attrs have non-URI values
  // ("row", "2", ...) which would otherwise be stripped.
  ADD_URI_SAFE_ATTR: [
    "align",
    "colspan",
    "rowspan",
    "scope",
    "width",
    "height",
  ],
  // Allow https, http, mailto, fragment, and data:image/* URIs.
  // data:text/html and other dangerous MIME types are excluded.
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|data:image\/)/i,
};
