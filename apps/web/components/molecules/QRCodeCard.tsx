import { QRCode } from '@/components/molecules/QRCode';

interface QRCodeCardProps {
  readonly data: string;
  readonly title?: string;
  readonly description?: string;
  readonly qrSize?: number;
  readonly className?: string;
}

export function QRCodeCard({
  data,
  title = 'Scan QR Code',
  description,
  qrSize = 120,
  className = '',
}: QRCodeCardProps) {
  return (
    <div className={`space-y-3 text-center ${className}`}>
      <QRCode data={data} size={qrSize} label={title} className='mx-auto' />
      {title && (
        <h3 className='text-sm font-medium text-primary-token'>{title}</h3>
      )}
      {description && (
        <p className='text-xs leading-5 text-secondary-token'>{description}</p>
      )}
    </div>
  );
}
