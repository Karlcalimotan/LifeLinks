import { z } from "zod";

export const loginSchema = z.object({
	email: z.string().trim().toLowerCase().email("Enter a valid email address."),
	password: z
		.string()
		.min(1, "Password is required.")
		.max(128, "Password must be at most 128 characters."),
});

export const passwordSchema = z
	.string()
	.min(8, "Use at least 8 characters.")
	.max(128, "Use at most 128 characters.")
	.regex(/[A-Za-z]/, "Include at least one letter.")
	.regex(/[0-9]/, "Include at least one number.");

export const createUserSchema = z.object({
	name: z.string().trim().min(2, "Enter a name.").max(120),
	email: z.string().trim().toLowerCase().email("Enter a valid email address."),
	password: passwordSchema,
	role: z.enum(["USER", "RESPONDER", "ADMIN"]).default("USER"),
});
