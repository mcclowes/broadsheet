"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/diversions";
import styles from "../page.module.scss";

export function MiniQuiz({ questions }: { questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    new Array(questions.length).fill(null),
  );

  function handlePick(qIdx: number, optIdx: number) {
    if (answers[qIdx] !== null) return; // already answered
    setAnswers((prev) => {
      const next = [...prev];
      next[qIdx] = optIdx;
      return next;
    });
  }

  const answered = answers.filter((a) => a !== null).length;
  const correct = answers.filter(
    (a, i) => a !== null && a === questions[i].correctIndex,
  ).length;

  return (
    <div className={styles.diversionCard}>
      <h4 className={styles.diversionTitle}>Mini quiz</h4>
      <p className={styles.diversionIntro}>
        Test your knowledge of today&rsquo;s edition.
      </p>
      <ol className={styles.quizList}>
        {questions.map((q, qi) => {
          const picked = answers[qi];
          const isAnswered = picked !== null;

          return (
            <li key={qi} className={styles.quizQuestion}>
              <p className={styles.quizPrompt}>{q.question}</p>
              <ul className={styles.quizOptions}>
                {q.options.map((opt, oi) => {
                  let state = "";
                  if (isAnswered) {
                    if (oi === q.correctIndex) state = styles.quizCorrect;
                    else if (oi === picked) state = styles.quizWrong;
                  }
                  return (
                    <li key={oi}>
                      <button
                        type="button"
                        className={`${styles.quizOption} ${state}`}
                        onClick={() => handlePick(qi, oi)}
                        disabled={isAnswered}
                        aria-label={opt}
                      >
                        {opt}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {answered === questions.length ? (
        <p className={styles.quizScore}>
          {correct} of {questions.length} correct
        </p>
      ) : null}
    </div>
  );
}
