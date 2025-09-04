import { createClerkClient } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export const runtime = 'nodejs'; // Required for Clerk webhooks

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: { email_address: string }[];
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

function verifyClerkWebhook(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    // Clerk webhooks typically use 'sha256=' prefix
    const formattedSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    return expectedSignature === formattedSignature;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.CLERK_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Clerk webhook not configured' },
        { status: 500 }
      );
    }

    const body = await request.text();
    const headersList = await headers();
    
    const signature = headersList.get('clerk-signature') || headersList.get('x-clerk-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 400 }
      );
    }

    let event: ClerkWebhookEvent;

    try {
      // Verify the webhook signature
      if (!verifyClerkWebhook(body, signature, process.env.CLERK_WEBHOOK_SECRET)) {
        throw new Error('Invalid signature');
      }
      
      event = JSON.parse(body) as ClerkWebhookEvent;
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Handle the event
    switch (event.type) {
      case 'user.created':
        const { data: user } = event;
        
        try {
          // Generate a suggested username from email or first name
          let suggestedUsername = '';
          
          if (user.first_name) {
            // Use first name as base for username suggestion
            suggestedUsername = user.first_name.toLowerCase().replace(/[^a-z0-9]/g, '');
          } else if (user.email_addresses.length > 0) {
            // Use email local part as base for username suggestion
            const email = user.email_addresses[0].email_address;
            const emailLocal = email.split('@')[0];
            suggestedUsername = emailLocal.toLowerCase().replace(/[^a-z0-9]/g, '');
          }
          
          // Ensure minimum length
          if (suggestedUsername.length < 3) {
            suggestedUsername = `user${Date.now().toString().slice(-6)}`;
          }
          
          // Truncate if too long
          if (suggestedUsername.length > 20) {
            suggestedUsername = suggestedUsername.substring(0, 20);
          }

          // Construct full name
          const firstName = user.first_name || '';
          const lastName = user.last_name || '';
          let fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
          
          // Fallback to email local part if no name provided
          if (!fullName && user.email_addresses.length > 0) {
            const email = user.email_addresses[0].email_address;
            fullName = email.split('@')[0];
          }

          // Update user metadata with suggested username and full name
          await clerkClient.users.updateUserMetadata(user.id, {
            publicMetadata: {
              suggested_username: suggestedUsername,
            },
            privateMetadata: {
              full_name: fullName,
            },
          });

          console.log(
            `Updated new user ${user.id} with suggested username: ${suggestedUsername}, full name: ${fullName}`
          );
        } catch (error) {
          console.error('Failed to update user metadata:', error);
          // Don't return error to Clerk - log it but continue
        }
        break;

      default:
        console.log(`Unhandled Clerk webhook event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Clerk webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}