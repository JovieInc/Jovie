import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { clerkClient } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

interface ClerkWebhookEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted';
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      verification?: {
        status: string;
      };
    }>;
    first_name?: string;
    last_name?: string;
    username?: string;
    private_metadata?: Record<string, any>;
    public_metadata?: Record<string, any>;
    unsafe_metadata?: Record<string, any>;
  };
}

/**
 * Generates username suggestions based on first name or email
 */
function generateUsernameSuggestions(firstName?: string, email?: string): string[] {
  const suggestions: string[] = [];
  
  if (firstName && firstName.length >= 3) {
    const cleanFirstName = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanFirstName.length >= 3) {
      suggestions.push(cleanFirstName);
      suggestions.push(`${cleanFirstName}${Math.floor(Math.random() * 100)}`);
      suggestions.push(`${cleanFirstName}${Math.floor(Math.random() * 1000)}`);
    }
  }
  
  if (email) {
    const emailBase = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (emailBase.length >= 3) {
      suggestions.push(emailBase);
      suggestions.push(`${emailBase}${Math.floor(Math.random() * 100)}`);
    }
  }
  
  // Fallback suggestions
  if (suggestions.length === 0) {
    const randomNum = Math.floor(Math.random() * 10000);
    suggestions.push(`user${randomNum}`);
    suggestions.push(`creator${randomNum}`);
  }
  
  return suggestions.slice(0, 3); // Return max 3 suggestions
}

/**
 * Extracts full name from Clerk user data with fallback logic
 */
function extractFullName(userData: ClerkWebhookEvent['data']): string | null {
  // Try first_name + last_name combination
  if (userData.first_name && userData.last_name) {
    return `${userData.first_name.trim()} ${userData.last_name.trim()}`;
  }
  
  // Try just first_name if last_name is missing
  if (userData.first_name) {
    return userData.first_name.trim();
  }
  
  // Try username as fallback
  if (userData.username) {
    return userData.username.trim();
  }
  
  // Try extracting from email
  if (userData.email_addresses?.[0]?.email_address) {
    const emailBase = userData.email_addresses[0].email_address.split('@')[0];
    // Convert camelCase or snake_case to readable format
    const readable = emailBase
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
      .replace(/[_.-]/g, ' ') // separators
      .replace(/\s+/g, ' ') // multiple spaces
      .trim();
    
    if (readable.length > 0) {
      // Capitalize first letter of each word
      return readable
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Get webhook secret from environment
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('CLERK_WEBHOOK_SECRET is not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Get headers
    const headersList = await headers();
    const svixId = headersList.get('svix-id');
    const svixTimestamp = headersList.get('svix-timestamp');
    const svixSignature = headersList.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: 'Missing svix headers' },
        { status: 400 }
      );
    }

    // Get request body
    const payload = await request.text();

    // Verify webhook signature
    const wh = new Webhook(webhookSecret);
    let evt: ClerkWebhookEvent;

    try {
      evt = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      console.error('Error verifying webhook:', err);
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 400 }
      );
    }

    // Handle different event types
    switch (evt.type) {
      case 'user.created':
        try {
          const { data: user } = evt;
          
          // Extract full name from user data
          const fullName = extractFullName(user);
          
          // Generate username suggestions
          const usernameSuggestions = generateUsernameSuggestions(
            user.first_name,
            user.email_addresses?.[0]?.email_address
          );
          
          // Update user's private metadata with full name and suggestions
          const updateData: any = {
            privateMetadata: {
              ...user.private_metadata,
              fullName,
              usernameSuggestions,
              webhookProcessed: true,
              webhookProcessedAt: new Date().toISOString(),
            }
          };
          
          await clerkClient.users.updateUser(user.id, updateData);
          
          console.log(`Successfully processed user.created for ${user.id}`, {
            fullName,
            usernameSuggestions,
            email: user.email_addresses?.[0]?.email_address,
          });
          
        } catch (error) {
          console.error('Error processing user.created webhook:', error);
          // Don't return error response - we don't want Clerk to retry
          // Just log the error and return success
        }
        break;
      
      default:
        console.log(`Unhandled webhook event type: ${evt.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}