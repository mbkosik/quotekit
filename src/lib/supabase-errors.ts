const errorMap: Record<string, string> = {
  "Invalid login credentials": "Nieprawidłowy adres e-mail lub hasło.",
  "Email not confirmed": "Potwierdź adres e-mail, by się zalogować.",
  "Too many requests": "Zbyt wiele prób logowania. Poczekaj chwilę.",
};

const FALLBACK = "Wystąpił błąd logowania. Spróbuj ponownie.";

export function translateAuthError(message: string): string {
  return errorMap[message] ?? FALLBACK;
}
