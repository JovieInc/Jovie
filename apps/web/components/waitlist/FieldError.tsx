'use client';

interface FieldErrorProps {
  id: string;
  errors: string[] | undefined;
}

export function FieldError({ id, errors }: FieldErrorProps) {
  if (!errors || errors.length === 0) return null;

  return (
    <p id={id} role='alert' className='text-sm text-red-400'>
      {errors[0]}
    </p>
  );
}
