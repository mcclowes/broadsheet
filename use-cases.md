# Broadsheet — professional use cases

**Status:** Discovery / brainstorming
**Last updated:** April 2026

What professional personas would use a read-it-later tool seriously enough to pay for it, and what does each pull from the product?

---

## 1. Academic researchers

Save papers, blog posts, pre-prints, and grey literature. Organize by research question, not just recency.

**Key needs:**

- Highlight and save specific passages (quotes, data points, key claims)
- Annotate with interpretation, critique, or links to related work
- Organize by project or paper — tags alone aren't enough; they want collections scoped to a research question
- Export citations and collected quotes (BibTeX, formatted references, "copy all highlights from this collection")
- Cross-reference: "which of my saved articles cite this same source?"

**Why Broadsheet specifically:** Full-text markdown storage means their saved content survives source link rot, paywalls going up, and site redesigns. Researchers are burned by this constantly.

---

## 2. Journalists / investigative reporters

Source tracking during active reporting. Save-and-quote under time pressure.

**Key needs:**

- Source tracking — save an article, highlight a claim, annotate "confirmed by X on Y date"
- Story folders — group everything related to an investigation or beat
- Quick clip — grab a quote while skimming, return to it during writing
- Permanent archive — sources get edited, go down, or get paywalled after publication
- Timeline awareness — when was this saved, when was it published, has the source changed?

**Why Broadsheet specifically:** Archival fidelity. The ingestion-time snapshot is genuinely valuable when original sources change or disappear.

---

## 3. Policy / market analysts

Think-tank researchers, competitive intelligence, investor research. Monitor a topic over time and distill it.

**Key needs:**

- Topic monitoring — save articles on a theme, track how a narrative or dataset evolves
- Key data extraction — highlight specific stats, forecasts, or claims to build briefing docs
- Shared collections — team members contribute to and consume a shared reading list
- Synthesis support — "here are 12 articles on X; surface common themes and contradictions"
- Bulk operations — manage hundreds of articles without friction

**Why Broadsheet specifically:** Clean reading experience for high-volume consumption. No ads, no pop-ups, consistent typography across sources.

---

## 4. Students

Lighter version of the researcher persona. Driven by coursework and deadlines.

**Key needs:**

- Course reading lists — organized by class, week, or assignment
- Exam prep — highlight key passages, review highlights later as a study aid
- Citation export for essays and papers
- Low friction — if it's harder than a screenshot, they won't use it

**Why Broadsheet specifically:** Free or cheap tier matters here. The quote-export-to-citation pipeline could be a genuine differentiator vs. "save a bunch of tabs."

---

## 5. Content creators / newsletter writers

Curators who read widely and reference what they've read in their own output.

**Key needs:**

- Inspiration queue — save articles they might reference or riff on
- Quote bank — pull specific passages to cite or link in their writing
- Organize by output — "articles for next week's newsletter" as a collection
- Share/publish a curated list — "here's what I read this week" as a public page

**Why Broadsheet specifically:** The bridge between "I read this" and "I'm writing about this" is short. Quote extraction + collections could make that workflow seamless.

---

## 6. Lawyers / legal professionals

Case research, regulatory tracking, and opinion monitoring. Precision and confidentiality matter.

**Key needs:**

- Case-organized research — save articles, commentary, and analysis grouped by matter
- Precise quoting — exact passage preservation; paraphrasing isn't acceptable in legal work
- Annotation with privileged notes — security and privacy of notes is non-negotiable
- Audit trail — when was this saved, by whom, has it been modified?
- Export for briefs and memos

**Why Broadsheet specifically:** Archival integrity (content doesn't change after save) and per-user isolation (Folio volumes are already user-scoped) align well with legal confidentiality requirements.

---

## Feature priority matrix

Features ranked by how many professional personas need them and at what intensity.

| Feature                         | Researchers | Journalists | Analysts | Students | Creators | Legal  |
| ------------------------------- | ----------- | ----------- | -------- | -------- | -------- | ------ |
| **Highlights**                  | Must        | Must        | Must     | Must     | Must     | Must   |
| **Annotations / notes**         | Must        | Must        | Should   | Nice     | Nice     | Must   |
| **Collections / projects**      | Must        | Must        | Must     | Should   | Should   | Must   |
| **Full-text search**            | Must        | Must        | Must     | Should   | Nice     | Must   |
| **Export (quotes + citations)** | Must        | Should      | Should   | Must     | Nice     | Should |
| **Shared collections**          | Nice        | Nice        | Must     | Nice     | Nice     | Nice   |
| **Audit trail / versioning**    | Nice        | Should      | Nice     | —        | —        | Must   |

### Reading the matrix

- **Highlights are universal.** Every professional use case requires selecting and saving specific passages. This is the single feature that separates "personal bookmarking" from "professional knowledge tool." Build this first.
- **Annotations and collections are the next tier.** They unlock the researcher, journalist, and legal personas — the three with the strongest willingness to pay.
- **Full-text search is already on the MVP-unbuilt list** and becomes non-negotiable the moment any professional persona adopts the tool.
- **Export is the monetisation lever.** Free users save and read; paid users extract their knowledge in useful formats.
- **Shared collections are a v2+ concern** but worth designing for now (collection as a first-class entity, not just a tag alias).

---

## Implications for the data model

Highlights and annotations would require extending the per-article storage:

1. **Highlights** — a list of text selections anchored to positions in the article markdown. Minimum viable: `{ text: string, startOffset: number, endOffset: number, createdAt: string }`.
2. **Annotations** — a note attached to a highlight or to the article as a whole. `{ body: string, highlightId?: string, createdAt: string }`.
3. **Collections** — a named grouping of articles, separate from tags. Could live as a top-level entity in the user's Folio volume rather than per-article metadata.

All three can live in Folio frontmatter (highlights/annotations per article) or as separate pages (collections as an index). No Postgres needed yet — but this is the kind of structured querying ("show me all highlights tagged 'methodology' across my research collection") that will eventually push toward a relational store.
