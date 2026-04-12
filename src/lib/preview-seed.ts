import { articleFrontmatterSchema, type ArticleFrontmatter } from "./articles";
import { authedUserId } from "./auth-types";
import { getFolio, volumeNameForUser } from "./folio";
import { isPreviewMode, PREVIEW_USER_ID } from "./preview-mode";

interface Fixture {
  id: string;
  body: string;
  frontmatter: ArticleFrontmatter;
}

// Article IDs must be 32 hex chars (see `articleIdForUrl`). These are
// hand-picked constants so fixture URLs stay stable across cold starts.
const FIXTURES: Fixture[] = [
  {
    id: "a1".padEnd(32, "0"),
    frontmatter: {
      title: "The quiet return of the long read",
      url: "https://example.com/quiet-return-long-read",
      source: "The Atlantic",
      byline: "Eliza Waring",
      excerpt:
        "After a decade of fragmentation, readers are rediscovering essays that ask for more than three minutes.",
      lang: "en",
      image: null,
      wordCount: 2400,
      readMinutes: 12,
      savedAt: "2026-04-10T08:14:00.000Z",
      readAt: null,
      archivedAt: null,
      tags: ["media", "culture", "writing"],
    },
    body: [
      "# The quiet return of the long read",
      "",
      "For the last decade, the essay was supposed to be dead. The feeds were louder, the attention spans shorter, the advertising cheaper. And yet, quietly, the long read is back.",
      "",
      "You can see it in the newsletters people forward at 11pm. You can see it in the subscriptions people willingly pay for — not because they feel guilty about journalism, but because they actually want to read 4,000 words about the collapse of a regional airline.",
      "",
      "## What changed",
      "",
      "A few things at once. The open web became less habitable for text, so text moved to places that protected it. Podcasts normalised the idea that people would pay attention to a single thing for an hour. And readers, exhausted by infinite scroll, started curating again.",
      "",
      "> The long read never really left. We just had to remember how to find it.",
      "",
      "It's a small shift, but it matters. A sentence can carry more than a tweet. A paragraph can change your mind. Whole arguments can unfold across pages in ways a thread never will.",
    ].join("\n"),
  },
  {
    id: "a2".padEnd(32, "0"),
    frontmatter: {
      title: "How a small town saved its bookshop",
      url: "https://example.com/town-saved-bookshop",
      source: "The Guardian",
      byline: "Martha Okafor",
      excerpt:
        "When the last independent bookshop in Bridgwater put up a closing sign, 400 residents quietly bought it.",
      lang: "en",
      image: null,
      wordCount: 1800,
      readMinutes: 9,
      savedAt: "2026-04-09T17:02:00.000Z",
      readAt: "2026-04-10T07:40:00.000Z",
      archivedAt: null,
      tags: ["community", "books"],
    },
    body: [
      "# How a small town saved its bookshop",
      "",
      "The sign went up on a Tuesday. By Friday, Bridgwater had a plan.",
      "",
      "This is a story about a shop, but really it's a story about what people still show up for. The numbers are small — forty thousand pounds, four hundred shareholders, one narrow Victorian frontage on Eastover — and the lesson is not.",
      "",
      "## The maths of mattering",
      "",
      "Nothing about the economics had changed. Rent was still rent. Amazon was still Amazon. But the arithmetic of ownership had. Instead of one person shouldering an impossible margin, four hundred people shared a bearable one.",
      "",
      'Pearl, the new part-time manager, puts it more plainly: "Turns out a bookshop doesn\'t have to make a fortune. It has to make enough."',
    ].join("\n"),
  },
  {
    id: "a3".padEnd(32, "0"),
    frontmatter: {
      title: "The case for boring infrastructure",
      url: "https://example.com/boring-infrastructure",
      source: "Works in Progress",
      byline: "Noah Kellerman",
      excerpt:
        "The most successful technology of the last twenty years wasn't ambitious. It was unfashionable, unglamorous, and it worked.",
      lang: "en",
      image: null,
      wordCount: 3100,
      readMinutes: 15,
      savedAt: "2026-04-08T11:22:00.000Z",
      readAt: null,
      archivedAt: null,
      tags: ["technology", "infrastructure", "engineering"],
    },
    body: [
      "# The case for boring infrastructure",
      "",
      "The best technology of the last two decades is the stuff nobody wrote a blog post about. The container orchestrator that just worked. The database that didn't lose your data. The protocol nobody had to learn.",
      "",
      "We talk about breakthroughs because breakthroughs are legible. But most of the compounding returns in software come from boring infrastructure maintained by people whose names you'll never know.",
      "",
      "## Interesting is a liability",
      "",
      'When a team calls something "interesting," at the infrastructure layer, the polite translation is usually: this is going to break in an interesting way, at an interesting hour, and we will all find it interesting for the rest of the quarter.',
      "",
      "Boring, by contrast, is a design goal.",
    ].join("\n"),
  },
  {
    id: "a4".padEnd(32, "0"),
    frontmatter: {
      title: "Notes from a week without maps",
      url: "https://example.com/week-without-maps",
      source: "Granta",
      byline: "Priya Ramanathan",
      excerpt:
        "I spent seven days in a city I didn't know, without a phone. Here is what I found, and what found me.",
      lang: "en",
      image: null,
      wordCount: 2100,
      readMinutes: 11,
      savedAt: "2026-04-07T20:45:00.000Z",
      readAt: null,
      archivedAt: null,
      tags: ["travel", "essay"],
    },
    body: [
      "# Notes from a week without maps",
      "",
      "I landed in Porto with a paper guidebook from 2011 and a promise to myself: no phone, no maps, no search. For seven days, I would be as lost as a person can reasonably be in a city of a quarter million people.",
      "",
      "I expected to feel free. Mostly I felt inconvenient. Being inconvenient, it turns out, is where the city lives.",
      "",
      "## Day three: the butcher on Rua do Almada",
      "",
      "I was trying to find a bakery I'd walked past yesterday and couldn't place. A butcher — apron, forearms, half a cigarette — drew me a map on the back of a receipt. He included a fountain. He was proud of the fountain.",
      "",
      "I'll never forget the fountain.",
    ].join("\n"),
  },
  {
    id: "a5".padEnd(32, "0"),
    frontmatter: {
      title: "Why the office isn't the problem",
      url: "https://example.com/office-isnt-problem",
      source: "Harvard Business Review",
      byline: "Daniel Hsu",
      excerpt:
        "Five years into the remote-work debate, we're still arguing about the wrong thing.",
      lang: "en",
      image: null,
      wordCount: 1600,
      readMinutes: 8,
      savedAt: "2026-04-06T09:10:00.000Z",
      readAt: null,
      archivedAt: "2026-04-09T12:00:00.000Z",
      tags: ["work", "management"],
    },
    body: [
      "# Why the office isn't the problem",
      "",
      "The return-to-office debate has calcified into two camps who no longer talk to each other. One side says presence builds culture. The other says location is a proxy for trust. Both are partly right, and both are arguing about the wrong thing.",
      "",
      "The real question isn't where people work. It's what the work is for.",
      "",
      "## Three modes, not two",
      "",
      "Most knowledge work is actually three jobs in a trench coat: deep focus, coordinating with a small group, and maintaining the social tissue of the wider team. Offices are great for the third, okay for the second, actively harmful to the first.",
      "",
      "Policies that pretend all three are the same will always disappoint two-thirds of the people they apply to.",
    ].join("\n"),
  },
  {
    id: "a6".padEnd(32, "0"),
    frontmatter: {
      title: "The last independent synth repair shop in Brooklyn",
      url: "https://example.com/synth-repair-brooklyn",
      source: "Pitchfork",
      byline: "Sam Elowen",
      excerpt:
        "For forty years, Rico's has kept New York's analog synthesizers alive. This summer, it's closing.",
      lang: "en",
      image: null,
      wordCount: 2800,
      readMinutes: 14,
      savedAt: "2026-04-05T15:30:00.000Z",
      readAt: null,
      archivedAt: null,
      tags: ["music", "craft", "new-york"],
    },
    body: [
      "# The last independent synth repair shop in Brooklyn",
      "",
      "The shop is on the ground floor of a building that wasn't supposed to last the eighties. You find it by walking past it twice.",
      "",
      "Inside, Rico is bent over a Juno-60 that belongs to someone famous. He won't say who. He never does.",
      "",
      "## What disappears when a shop disappears",
      "",
      "It isn't just the expertise, though the expertise is a small miracle: forty years of knowing which tantalum capacitor on which revision of which board is about to fail. It's the institutional memory of a music scene that couldn't have existed without it.",
      "",
      "When Rico's closes in September, a surprising number of albums you love will get slightly harder to make.",
    ].join("\n"),
  },
];

let seedingPromise: Promise<void> | null = null;

/**
 * Seeds the preview user's library with fixture articles if it's empty.
 * Idempotent, safe to call on every request. In non-preview mode this is
 * a no-op.
 *
 * The first in-flight call is cached so concurrent requests on a cold
 * boot don't double-seed. If the first seed throws, later calls retry.
 */
export async function ensurePreviewSeed(): Promise<void> {
  if (!isPreviewMode()) return;
  if (seedingPromise) return seedingPromise;
  seedingPromise = seed().catch((err) => {
    seedingPromise = null;
    throw err;
  });
  return seedingPromise;
}

async function seed(): Promise<void> {
  const userId = authedUserId(PREVIEW_USER_ID);
  const volume = getFolio().volume<ArticleFrontmatter>(
    volumeNameForUser(userId),
    { schema: articleFrontmatterSchema },
  );
  const existing = await volume.list();
  if (existing.length > 0) return;
  for (const fx of FIXTURES) {
    await volume.set(fx.id, { frontmatter: fx.frontmatter, body: fx.body });
  }
}
