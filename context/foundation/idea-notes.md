# QuoteKit - MVP

## Główny problem

Freelancer bez doświadczenia nie wie jak wycenić nowy projekt — zakres jest mglisty, stawki niejasne, a ręczne składanie oferty w dokumencie zajmuje godziny. Efekt: albo zaniżona wycena, albo brak odpowiedzi na zapytanie bo "zajmę się tym później".

## Najmniejszy zestaw funkcjonalności

- Wklejenie treści zapytania od klienta jako punkt startowy
- AI zadaje doprecyzowujące pytania o zakres, stack, deadline, budżet klienta
- AI generuje listę pozycji wyceny z estymacją czasu i sugestią stawek
- Użytkownik edytuje pozycje, zatwierdza wycenę i zapisuje ją
- CRUD wycen z statusami: szkic → wysłana → zaakceptowana / odrzucona
- Prosty system kont użytkowników (każdy freelancer widzi tylko swoje wyceny)

## Co NIE wchodzi w zakres MVP

- Wysyłanie wyceny klientowi (PDF, link, email)
- Zarządzanie klientami jako osobnymi encjami z historią
- Faktury i rozliczenia
- Szablony wycen dla konkretnych typów projektów
- Integracje z narzędziami (Notion, Jira, Cal.com)
- Wielowalutowość

## Kryteria sukcesu

- Użytkownik przechodzi od wklejenia zapytania do gotowej wyceny w mniej niż 10 minut
- Co najmniej 80% pozycji wygenerowanych przez AI wymaga tylko drobnych korekt przed zatwierdzeniem
