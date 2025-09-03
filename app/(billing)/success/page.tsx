import Link from 'next/link';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';

export default function CheckoutSuccessPage() {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
        <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      
      <h1 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
        Welcome to Pro! 🎉
      </h1>
      
      <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
        Your subscription has been activated successfully.
      </p>
      
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
        You now have access to all Pro features and can start using advanced analytics, 
        custom branding, and priority support.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Button as={Link} href="/dashboard">
          Go to Dashboard
        </Button>
        
        <Button variant="outline" as={Link} href="/billing">
          View Billing
        </Button>
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
          What's Next?
        </h3>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• Explore advanced analytics in your dashboard</li>
          <li>• Set up custom branding for your profile</li>
          <li>• Check out priority support options</li>
        </ul>
      </div>
    </div>
  );
}

export const metadata = {
  title: 'Subscription Activated | Jovie',
  description: 'Your Pro subscription has been activated successfully',
};
