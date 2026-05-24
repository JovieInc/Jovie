import '../(home)/home.css';

export const revalidate = false;

export default function PitchLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='dark linear-marketing min-h-svh bg-black text-primary-token'>
      {children}
    </div>
  );
}
