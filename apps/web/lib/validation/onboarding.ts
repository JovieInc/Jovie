import { z } from 'zod';
import { usernameSchema } from './schemas/username';

export const onboardingSchema = z.object({
  handle: usernameSchema,
  fullName: z
    .string()
    .min(1, { message: 'Full name is required' })
    .max(50, { message: 'Must be no more than 50 characters' })
    .regex(/^[\p{L}0-9\s\-'\.]+$/u, {
      message:
        'Only letters, numbers, spaces, hyphens, apostrophes, and periods are allowed',
    }),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
