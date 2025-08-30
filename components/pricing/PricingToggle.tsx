'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface PricingToggleProps {
  onChange: (isYearly: boolean) => void;
}

export function PricingToggle({ onChange }: PricingToggleProps) {
  const [isYearly, setIsYearly] = useState(false);

  const handleToggle = () => {
    const newValue = !isYearly;
    setIsYearly(newValue);
    onChange(newValue);
  };

  return (
    <div className="flex items-center justify-center space-x-4">
      <span 
        className={`text-sm font-medium transition-colors duration-200 ${
          !isYearly ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        Monthly $5
      </span>
      
      <button
        type="button"
        role="switch"
        aria-checked={isYearly}
        onClick={handleToggle}
        className={`
          relative inline-flex h-6 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${isYearly ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}
        `}
      >
        <span className="sr-only">Toggle between monthly and yearly billing</span>
        <motion.span
          className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
          animate={{ x: isYearly ? 24 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
      
      <span 
        className={`text-sm font-medium transition-colors duration-200 ${
          isYearly ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        Yearly $50
        <span className="ml-1 text-xs text-green-500">
          (2 months free)
        </span>
      </span>
    </div>
  );
}

