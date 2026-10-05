import { z } from "zod";

/**
 * Password strength is enforced with the same rule set on client and
 * server. The canonical check lives in `src/lib/auth/password.server.ts`
 * (server-only); this schema mirrors its length/character-class rules so
 * client-side forms can validate without importing server-only code, while
 * `registerSchema`/`resetPasswordSchema` below are still re-checked against
 * the server-only helper before a password is ever hashed.
 */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

/** Roles that may self-register through the public /register form. */
export const selfRegisterableRoleSchema = z.enum(["PATIENT", "DOCTOR", "HOSPITAL_ADMIN"]);
export type SelfRegisterableRole = z.infer<typeof selfRegisterableRoleSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z
  .object({
    role: selfRegisterableRoleSchema,
    firstName: z.string().trim().min(1, "First name is required.").max(120),
    lastName: z.string().trim().min(1, "Last name is required.").max(120),
    phone: z.string().trim().max(30).optional(),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Missing reset token."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
