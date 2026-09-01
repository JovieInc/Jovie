'use client';

import { Field, type FieldProps } from '@jovie/ui';

interface FormFieldProps {
  readonly label?: FieldProps['label'];
  readonly error?: string;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: FieldProps['children'];
  readonly id?: string;
  readonly helpText?: FieldProps['description'];
}

export function FormField({
  label,
  error,
  required = false,
  className,
  children,
  id: providedId,
  helpText,
}: Readonly<FormFieldProps>) {
  return (
    <Field
      label={label}
      description={helpText}
      error={error}
      required={required}
      id={providedId}
      className={className}
    >
      {children}
    </Field>
  );
}
