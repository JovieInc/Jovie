export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='mx-auto w-full max-w-[720px] space-y-5 px-3 pb-6 pt-1 sm:px-4 lg:px-5'>
      {children}
    </div>
  );
}
