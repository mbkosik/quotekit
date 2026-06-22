---
change_id: code-review-ci-cd
title: AI agent code review on GitHub PRs with structured output
status: impl_reviewed
created: 2026-06-22
updated: 2026-06-22
archived_at: null
---

## Notes

code-review przeprowadzone przez agenta ai przy PR w githubie. agent dodaje odpowiednie komentarze do kodu oraz odpowiedź zgodnie z określonym structured output (ocena per kryterium plus ogólny werdykt). w system prompcie do agenta powinny znaleźć się ustalenia z pliku @context/foundation/review-criteria.md. agent powinien mieć dostęp do planu wprowadzanego change'a (do ustalenia sposób podpięcia PR -> change w context).
