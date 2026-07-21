import '../(home)/home.css';

export const revalidate = false;

export default function PitchLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='system-b-marketing dark min-h-svh bg-base text-primary-token'>
      {children}
    </div>
  );
}
