'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ClaimHandleForm } from './ClaimHandleForm';
import { Container } from '@/components/site/Container';
import { QRCodeCard } from './QRCodeCard';
import { APP_URL } from '@/constants/app';

export function NewHomeHero() {
  const [isMounted, setIsMounted] = useState(false);
  const [previewHandle, setPreviewHandle] = useState('yourhandle');
  
  // Handle form state updates for QR code preview
  const handlePreviewUpdate = (handle: string) => {
    if (handle && handle.length > 0) {
      setPreviewHandle(handle);
    } else {
      setPreviewHandle('yourhandle');
    }
  };

  // Hydration fix
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <section className="relative overflow-hidden pt-10 pb-12 sm:pt-16 sm:pb-16 lg:pt-20 lg:pb-24">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-black"></div>
      
      {/* Subtle grid background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      
      {/* Ambient light effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 rounded-full blur-3xl"></div>

      <Container className="relative">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
          {/* Left column: Text and form */}
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl">
              Claim your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400">@handle</span>.
            </h1>
            
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 sm:text-xl max-w-2xl mx-auto lg:mx-0">
              Secure your name. Share a profile that's fast, beautiful, and optimized to convert.
            </p>
            
            {/* Handle claim form */}
            <div className="mt-8 max-w-md mx-auto lg:mx-0">
              {isMounted && <ClaimHandleForm onHandleChange={handlePreviewUpdate} />}
            </div>
          </div>
          
          {/* Right column: Device mockup (desktop only) */}
          <div className="hidden lg:block flex-1 mt-12 lg:mt-0 relative">
            <div className="relative mx-auto w-full max-w-sm">
              {/* Phone mockup with shadow */}
              <div className="relative mx-auto rounded-[2.5rem] border-4 border-gray-200 dark:border-gray-800 shadow-xl dark:shadow-gray-900/30 bg-white dark:bg-gray-900 p-1 overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-6 bg-gray-200 dark:bg-gray-800 rounded-t-2xl"></div>
                <div className="h-[580px] rounded-2xl overflow-hidden">
                  {/* Profile preview */}
                  <div className="relative h-full w-full bg-gray-50 dark:bg-black">
                    <div className="absolute top-8 inset-x-0 text-center">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-200">
                        <span className="mr-1 text-gray-400">@</span>{previewHandle}
                      </div>
                    </div>
                    
                    {/* Profile avatar placeholder */}
                    <div className="absolute top-20 inset-x-0 flex justify-center">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                    </div>
                    
                    {/* Profile content placeholders */}
                    <div className="absolute top-52 inset-x-0 px-6 space-y-4">
                      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-3/4 mx-auto"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mx-auto"></div>
                      
                      <div className="pt-4 space-y-3">
                        <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                        <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                        <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* QR code card */}
              <div className="absolute -right-12 bottom-12">
                <QRCodeCard handle={previewHandle} />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

