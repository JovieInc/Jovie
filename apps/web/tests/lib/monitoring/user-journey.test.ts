/**
 * UserJourneyTracker Tests
 * Tests for the user journey tracking system
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { track } from '@/lib/analytics';
import { UserJourneyTracker } from '@/lib/monitoring/user-journey';

describe('UserJourneyTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with journey name and steps', () => {
      const tracker = new UserJourneyTracker('checkout', [
        'cart',
        'payment',
        'confirm',
      ]);

      // Tracker should be created without error
      expect(tracker).toBeInstanceOf(UserJourneyTracker);
    });
  });

  describe('start', () => {
    it('should track journey start event', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1', 'step2']);

      tracker.start();

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_start',
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
    });

    it('should return self for chaining', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      const result = tracker.start();

      expect(result).toBe(tracker);
    });

    it('should reset state when starting', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1', 'step2']);

      tracker.start();
      tracker.nextStep();
      tracker.start();

      // After restart, nextStep should be step1 again
      tracker.nextStep();

      expect(track).toHaveBeenLastCalledWith(
        'journey_checkout_step',
        expect.objectContaining({
          step: 'step1',
          stepIndex: 0,
        })
      );
    });
  });

  describe('nextStep', () => {
    it('should track step progression', () => {
      const tracker = new UserJourneyTracker('checkout', ['cart', 'payment']);

      tracker.start();
      vi.clearAllMocks();

      tracker.nextStep();

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_step',
        expect.objectContaining({
          journey: 'checkout',
          step: 'cart',
          stepIndex: 0,
        })
      );
    });

    it('should track time since start', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      vi.advanceTimersByTime(5000);

      tracker.nextStep();

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_step',
        expect.objectContaining({
          timeSinceStart: 5000,
        })
      );
    });

    it('should track time since previous step', () => {
      const tracker = new UserJourneyTracker('checkout', [
        'step1',
        'step2',
        'step3',
      ]);

      tracker.start();
      tracker.nextStep(); // step1

      vi.advanceTimersByTime(3000);
      vi.clearAllMocks();

      tracker.nextStep(); // step2

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_step',
        expect.objectContaining({
          step: 'step2',
          timeSincePreviousStep: 3000,
        })
      );
    });

    it('should include custom data', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      tracker.nextStep({ customField: 'value' });

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_step',
        expect.objectContaining({
          customField: 'value',
        })
      );
    });

    it('should warn when no more steps', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      tracker.nextStep(); // step1
      tracker.nextStep(); // no more steps

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'user-journey',
        message: 'Journey checkout has no more steps defined',
        level: 'warning',
      });
    });

    it('should return self for chaining', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);
      tracker.start();

      const result = tracker.nextStep();

      expect(result).toBe(tracker);
    });

    it('should dispatch custom event when window exists', () => {
      const dispatchEventSpy = vi.fn();
      global.window = {
        dispatchEvent: dispatchEventSpy,
      } as unknown as Window & typeof globalThis;

      const tracker = new UserJourneyTracker('checkout', ['step1']);
      tracker.start();
      tracker.nextStep();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'jovie:checkout_step1',
        })
      );

      // @ts-expect-error - cleanup
      delete global.window;
    });
  });

  describe('goToStep', () => {
    it('should jump to a specific step', () => {
      const tracker = new UserJourneyTracker('checkout', [
        'cart',
        'payment',
        'confirm',
      ]);

      tracker.start();
      vi.clearAllMocks();

      tracker.goToStep('payment');

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_step',
        expect.objectContaining({
          step: 'payment',
          stepIndex: 1,
          outOfOrder: true,
        })
      );
    });

    it('should warn if step not found', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      tracker.goToStep('nonexistent');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'user-journey',
        message: 'Step nonexistent not found in journey checkout',
        level: 'warning',
      });
    });

    it('should include custom data', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      tracker.goToStep('step1', { reason: 'user_action' });

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_step',
        expect.objectContaining({
          reason: 'user_action',
        })
      );
    });

    it('should return self for chaining', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);
      tracker.start();

      const result = tracker.goToStep('step1');

      expect(result).toBe(tracker);
    });
  });

  describe('complete', () => {
    it('should track journey completion', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1', 'step2']);

      tracker.start();
      tracker.nextStep();
      tracker.nextStep();
      vi.clearAllMocks();

      tracker.complete();

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_complete',
        expect.objectContaining({
          journey: 'checkout',
          success: true,
          stepsCompleted: 2,
          totalSteps: 2,
          completionRate: 100,
        })
      );
    });

    it('should track partial completion', () => {
      const tracker = new UserJourneyTracker('checkout', [
        'step1',
        'step2',
        'step3',
      ]);

      tracker.start();
      tracker.nextStep(); // step1
      vi.clearAllMocks();

      tracker.complete();

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_complete',
        expect.objectContaining({
          stepsCompleted: 1,
          totalSteps: 3,
          completionRate: expect.closeTo(33.33, 1),
        })
      );
    });

    it('should track unsuccessful completion', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      tracker.complete(false);

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_complete',
        expect.objectContaining({
          success: false,
        })
      );
    });

    it('should track total time', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      vi.advanceTimersByTime(10000);
      tracker.complete();

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_complete',
        expect.objectContaining({
          totalTime: 10000,
        })
      );
    });

    it('should include custom data', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      tracker.complete(true, { orderValue: 99.99 });

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_complete',
        expect.objectContaining({
          orderValue: 99.99,
        })
      );
    });

    it('should dispatch custom event when window exists', () => {
      const dispatchEventSpy = vi.fn();
      global.window = {
        dispatchEvent: dispatchEventSpy,
      } as unknown as Window & typeof globalThis;

      const tracker = new UserJourneyTracker('checkout', ['step1']);
      tracker.start();
      tracker.complete();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'jovie:checkout_complete',
        })
      );

      // @ts-expect-error - cleanup
      delete global.window;
    });

    it('should return self for chaining', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);
      tracker.start();

      const result = tracker.complete();

      expect(result).toBe(tracker);
    });
  });

  describe('abandon', () => {
    it('should track journey abandonment', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1', 'step2']);

      tracker.start();
      tracker.nextStep();
      vi.clearAllMocks();

      tracker.abandon('user_navigated_away');

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_abandon',
        expect.objectContaining({
          journey: 'checkout',
          reason: 'user_navigated_away',
          lastStep: 'step1',
          stepsCompleted: 1,
          totalSteps: 2,
          completionRate: 50,
        })
      );
    });

    it('should handle abandonment before any steps', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      vi.clearAllMocks();

      tracker.abandon('immediate_exit');

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_abandon',
        expect.objectContaining({
          lastStep: null,
          stepsCompleted: 0,
        })
      );
    });

    it('should track total time before abandonment', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      vi.advanceTimersByTime(5000);
      tracker.abandon('timeout');

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_abandon',
        expect.objectContaining({
          totalTime: 5000,
        })
      );
    });

    it('should include custom data', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);

      tracker.start();
      tracker.abandon('error', { errorCode: 500 });

      expect(track).toHaveBeenCalledWith(
        'journey_checkout_abandon',
        expect.objectContaining({
          errorCode: 500,
        })
      );
    });

    it('should return self for chaining', () => {
      const tracker = new UserJourneyTracker('checkout', ['step1']);
      tracker.start();

      const result = tracker.abandon('test');

      expect(result).toBe(tracker);
    });
  });

  describe('trackOnboardingFunnel', () => {
    it('should create and start an onboarding journey', () => {
      const journey = UserJourneyTracker.trackOnboardingFunnel();

      expect(journey).toBeInstanceOf(UserJourneyTracker);
      expect(track).toHaveBeenCalledWith(
        'journey_onboarding_start',
        expect.any(Object)
      );
    });

    it('should have correct onboarding steps', () => {
      const journey = UserJourneyTracker.trackOnboardingFunnel();

      // Progress through steps
      journey.nextStep(); // onboarding_start

      expect(track).toHaveBeenCalledWith(
        'journey_onboarding_step',
        expect.objectContaining({
          step: 'onboarding_start',
        })
      );
    });

    it('should set up event listeners when window exists', () => {
      const addEventListenerSpy = vi.fn();
      global.window = {
        addEventListener: addEventListenerSpy,
        dispatchEvent: vi.fn(),
      } as unknown as Window & typeof globalThis;

      UserJourneyTracker.trackOnboardingFunnel();

      // Should set up listeners for each step + completion + abandonment
      expect(addEventListenerSpy).toHaveBeenCalled();

      // @ts-expect-error - cleanup
      delete global.window;
    });
  });
});
