<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Client Questions Flow

- **Plan**: `context/changes/client-questions-flow/plan.md`
- **Scope**: Full plan (Phase 1 + Phase 2)
- **Date**: 2026-06-13
- **Verdict**: APPROVED (all findings fixed in fe527a7)
- **Findings**: 0 critical · 0 warnings · 0 observations (all resolved)

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — setTimeout not cleaned up on unmount

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/ClientQuestionsList.tsx:15–17
- **Detail**: setTimeout in handleCopy not cancelled on unmount — setState on unmounted component risk.
- **Fix**: Added `useRef` timer + `useEffect` cleanup matching `resetTimerRef` pattern from `useQuoteCreator.ts`.
- **Decision**: FIXED — fe527a7

### F2 — Clipboard promise silently discarded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/ClientQuestionsList.tsx:13
- **Detail**: `void navigator.clipboard.writeText()` discards Promise — "Skopiowano!" shown even on failure.
- **Fix**: Moved `setCopied(true)` into `.then()` callback; `.catch()` silently ignores clipboard errors.
- **Decision**: FIXED — fe527a7

### F3 — Sparse-path catch uses misleading error message

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.ts:71–73
- **Detail**: Network/AI error blamed on user's brief length.
- **Fix**: Replaced with neutral "Nie udało się wygenerować pytań. Spróbuj ponownie."
- **Decision**: FIXED — fe527a7

### F4 — questions.ts accepts min(3) vs min(20) in peer endpoints

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/ai/questions.ts:9
- **Detail**: Undocumented divergence from peer endpoints — intentional but confusing.
- **Fix A ⭐**: Added inline comment explaining why min(3) is intentional.
- **Decision**: FIXED via Fix A — fe527a7

### F5 — callQuestions casts response without runtime check

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.ts:19–21
- **Detail**: Unchecked cast `data.questions` — malformed 200 would set undefined.
- **Fix**: Added `!Array.isArray(data.questions)` guard before returning.
- **Decision**: FIXED — fe527a7

### F6 — key={i} on list items

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/quotes/ClientQuestionsList.tsx:27
- **Detail**: Array index as key — not harmful (static list) but not idiomatic.
- **Fix**: Changed to `key={q}` (question string is unique).
- **Decision**: FIXED — fe527a7

### F7 — Generic "Analizuję..." during questions-fetch loading

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/quotes/QuoteCreator.tsx:81 / InquiryForm.tsx
- **Detail**: Submit button showed "Analizuję..." even when user clicked "Generuj pytania".
- **Fix**: Added `questionsLoading` boolean to hook state; InquiryForm shows correct spinner per button.
- **Decision**: FIXED — fe527a7
