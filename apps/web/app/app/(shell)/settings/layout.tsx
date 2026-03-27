export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='mx-auto w-full max-w-[820px] space-y-6 px-4 pb-10 pt-4 sm:px-6 lg:px-8'>
      {children}
    </div>
  );
}
