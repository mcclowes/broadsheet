"use client";

import { useState } from "react";
import type { Highlight } from "@/lib/highlights";
import type { Annotation } from "@/lib/annotations";
import { HighlightLayer } from "./highlight-layer";
import { AnnotationPanel } from "./annotation-panel";
import { ExportPanel } from "./export-panel";

interface Props {
  articleId: string;
  articleBody: string;
  html: string;
  initialHighlights: Highlight[];
  initialAnnotations: Annotation[];
}

export function ReaderFeatures({
  articleId,
  articleBody,
  html,
  initialHighlights,
  initialAnnotations,
}: Props) {
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(
    null,
  );

  return (
    <>
      <HighlightLayer
        articleId={articleId}
        articleBody={articleBody}
        initialHighlights={initialHighlights}
        onHighlightSelect={setSelectedHighlightId}
      >
        <article
          className="reader-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </HighlightLayer>

      <AnnotationPanel
        articleId={articleId}
        initialAnnotations={initialAnnotations}
        highlights={initialHighlights}
        selectedHighlightId={selectedHighlightId}
      />

      <ExportPanel articleId={articleId} />
    </>
  );
}
