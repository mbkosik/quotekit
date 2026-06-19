---
change_id: quote-creator-refactor
title: Refactor useQuoteCreator into testable orchestrator with typed HTTP contracts
status: preparing
created: 2026-06-15
updated: 2026-06-15
archived_at: null
---

## Notes

1. useQuoteCreator.ts — główny orchestrator, trudny do testowania
Wołuje 3 endpointy w sekwencji (/api/ai/questions → /api/ai/chat → /api/quotes), zarządza 13 stanami. URL-e hardcoded jako literały. Zmiana nazwy route = ręczny grep, nie błąd TS. Test wymaga MSW z co najmniej 3 handlerami.
