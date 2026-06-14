const signinErrorMap: Record<string, string> = {
  "invalid login credentials": "Nieprawidłowy adres e-mail lub hasło.",
  "email not confirmed": "Potwierdź adres e-mail, by się zalogować.",
  "too many requests": "Zbyt wiele prób logowania. Poczekaj chwilę.",
};

const SIGNIN_FALLBACK = "Wystąpił błąd logowania. Spróbuj ponownie.";

export function translateAuthError(message: string): string {
  return signinErrorMap[message.toLowerCase()] ?? SIGNIN_FALLBACK;
}

const signupErrorMap: Record<string, string> = {
  "password should be at least 6 characters": "Hasło musi mieć co najmniej 6 znaków.",
  "user already registered": "Konto z tym adresem e-mail już istnieje.",
  "email address is already taken": "Konto z tym adresem e-mail już istnieje.",
  "too many requests": "Zbyt wiele prób rejestracji. Poczekaj chwilę.",
};

const SIGNUP_FALLBACK = "Wystąpił błąd rejestracji. Spróbuj ponownie.";

export function translateSignupError(message: string): string {
  return signupErrorMap[message.toLowerCase()] ?? SIGNUP_FALLBACK;
}
