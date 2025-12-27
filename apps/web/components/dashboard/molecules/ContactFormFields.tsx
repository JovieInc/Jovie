'use client';

import { Input } from '@/components/atoms/Input';

export interface ContactFormFieldsProps {
  personName: string | null | undefined;
  companyName: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
  onPersonNameChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
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
