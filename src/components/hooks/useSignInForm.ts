import { useState } from "react";
import type { SyntheticEvent } from "react";

interface Errors {
  email?: string;
  password?: string;
}

export function useSignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  function validate() {
    const next: Errors = {};
    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address";
    }
    if (!password) {
      next.password = "Password is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof Errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  function toggleShowPassword() {
    setShowPassword((p) => !p);
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    errors,
    clearError,
    handleSubmit,
  };
}
