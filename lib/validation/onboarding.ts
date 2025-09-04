import { z } from 'zod';

export const onboardingSchema = z.object({
  handle: z
    .string()
    .min(3, { message: 'Must be at least 3 characters' })
    .max(24, { message: 'Must be no more than 24 characters' })
    .regex(/^[a-z0-9-]+$/, {
      message: 'Only lowercase letters, numbers, and hyphens are allowed',
    }),
  fullName: z
    .string()
    .min(1, { message: 'Please enter your name' })
    .max(50, { message: 'Name must be 50 characters or less' })
    .regex(/^[a-zA-Z0-9\s\-'.]+$/, {
      message: 'Please use only letters, numbers, spaces, hyphens, apostrophes, and periods',
    }),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
