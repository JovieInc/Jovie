'use client';

import { Input } from '@jovie/ui';

export interface ContactFormFieldsProps {
  readonly personName: string | null | undefined;
  readonly companyName: string | null | undefined;
  readonly email: string | null | undefined;
  readonly phone: string | null | undefined;
  readonly onPersonNameChange: (value: string) => void;
  readonly onCompanyNameChange: (value: string) => void;
  readonly onEmailChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
}

export function ContactFormFields({
  personName,
  companyName,
  email,
  phone,
  onPersonNameChange,
  onCompanyNameChange,
  onEmailChange,
  onPhoneChange,
}: ContactFormFieldsProps) {
  return (
    <>
      <div className='grid gap-3 md:grid-cols-2'>
        <Input
          label='Person name'
          placeholder='Sarah Lee'
          value={personName ?? ''}
          onChange={event => onPersonNameChange(event.target.value)}
        />
        <Input
          label='Company / agency'
          placeholder='XYZ Agency'
          value={companyName ?? ''}
          onChange={event => onCompanyNameChange(event.target.value)}
        />
      </div>

      <div className='grid gap-3 md:grid-cols-2'>
        <Input
          label='Email'
          type='email'
          placeholder='bookings@agency.com'
          value={email ?? ''}
          onChange={event => onEmailChange(event.target.value)}
        />
        <Input
          label='Phone'
          type='tel'
          placeholder='+1 555 123 4567'
          value={phone ?? ''}
          onChange={event => onPhoneChange(event.target.value)}
        />
      </div>
    </>
  );
}
