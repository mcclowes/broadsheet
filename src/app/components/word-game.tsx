"use client";

import { useState } from "react";
import type { WordScramble } from "@/lib/diversions";
import styles from "../page.module.scss";

export function WordGame({ scrambles }: { scrambles: WordScramble[] }) {
  const [guesses, setGuesses] = useState<string[]>(() =>
    new Array(scrambles.length).fill(""),
  );
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    new Array(scrambles.length).fill(false),
  );
  const [showHint, setShowHint] = useState<boolean[]>(() =>
    new Array(scrambles.length).fill(false),
  );

  function handleChange(idx: number, value: string) {
    setGuesses((prev) => {
      const next = [...prev];
      next[idx] = value.toLowerCase().replace(/[^a-z]/g, "");
      return next;
    });
  }

  function handleReveal(idx: number) {
    setRevealed((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  }

  function toggleHint(idx: number) {
    setShowHint((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }

  const solved = scrambles.filter(
    (s, i) => guesses[i] === s.answer || revealed[i],
  ).length;

  return (
    <div className={styles.diversionCard}>
      <h4 className={styles.diversionTitle}>Word scramble</h4>
      <p className={styles.diversionIntro}>
        Unscramble the letters to find words from today&rsquo;s headlines.
      </p>
      <ol className={styles.scrambleList}>
        {scrambles.map((s, i) => {
          const isCorrect = guesses[i] === s.answer;
          const isRevealed = revealed[i];
          const done = isCorrect || isRevealed;

          return (
            <li key={i} className={styles.scrambleItem}>
              <span className={styles.scrambledWord}>{s.scrambled}</span>
              {done ? (
                <span
                  className={
                    isCorrect ? styles.scrambleCorrect : styles.scrambleRevealed
                  }
                >
                  {s.answer}
                </span>
              ) : (
                <span className={styles.scrambleInputRow}>
                  <input
                    type="text"
                    className={styles.scrambleInput}
                    value={guesses[i]}
                    onChange={(e) => handleChange(i, e.target.value)}
                    maxLength={s.answer.length}
                    placeholder={"\u00b7".repeat(s.answer.length)}
                    spellCheck={false}
                    autoComplete="off"
                    aria-label={`Unscramble: ${s.scrambled}`}
                  />
                  <button
                    className={styles.scrambleHintBtn}
                    onClick={() => toggleHint(i)}
                    type="button"
                  >
                    {showHint[i] ? "hide" : "hint"}
                  </button>
                  <button
                    className={styles.scrambleRevealBtn}
                    onClick={() => handleReveal(i)}
                    type="button"
                  >
                    reveal
                  </button>
                </span>
              )}
              {showHint[i] && !done ? (
                <span className={styles.scrambleHint}>
                  From: &ldquo;{s.hint}&rdquo;
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className={styles.scrambleScore}>
        {solved} of {scrambles.length} solved
      </p>
    </div>
  );
}
