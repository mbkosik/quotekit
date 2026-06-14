import { useState } from "react";
import type { SyntheticEvent } from "react";

const MIN_PASSWORD_LENGTH = 6;

export { MIN_PASSWORD_LENGTH };

interface Errors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function useSignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (!confirmPassword) {
      next.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match";
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

  function toggleShowConfirmPassword() {
    setShowConfirmPassword((p) => !p);
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    toggleShowPassword,
    showConfirmPassword,
    toggleShowConfirmPassword,
    errors,
    clearError,
    handleSubmit,
  };
}
