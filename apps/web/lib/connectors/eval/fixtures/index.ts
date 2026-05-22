/**
 * Labeled fixture set for the AI Connector extraction eval harness.
 *
 * Ground-truth labels:
 *   - should_suggest: extractor MUST propose a calendar event
 *   - should_not_suggest: extractor MUST NOT propose any events
 *
 * Precision = (should_suggest AND extractor suggested) / (all extractor suggestions)
 * A false positive (should_not_suggest but extractor suggested) hurts precision.
 * The eval gate requires precision ≥ 0.97 before the harness wave proceeds.
 */

export { fixture as booking_already_present } from './booking_already_present';
export { fixture as booking_asia_pacific } from './booking_asia_pacific';
export { fixture as booking_cancelled } from './booking_cancelled';
export { fixture as booking_confirmed } from './booking_confirmed';
export { fixture as booking_conflicting } from './booking_conflicting';
export { fixture as booking_europe_tour } from './booking_europe_tour';
export { fixture as booking_festival_stage } from './booking_festival_stage';
export { fixture as booking_missing } from './booking_missing';
export { fixture as booking_no_time } from './booking_no_time';
export { fixture as booking_private_event } from './booking_private_event';
export { fixture as booking_rescheduled } from './booking_rescheduled';
export { fixture as booking_south_america } from './booking_south_america';
export { fixture as booking_tentative_hold } from './booking_tentative_hold';
export { fixture as booking_us_east_coast } from './booking_us_east_coast';
export { fixture as booking_vague_subject_clear_body } from './booking_vague_subject_clear_body';
export { fixture as contract_with_multiple_dates } from './contract_with_multiple_dates';
export { fixture as deep_thread_message_14 } from './deep_thread_message_14';
export { fixture as human_edited_after_create } from './human_edited_after_create';
export { fixture as invoice_not_booking } from './invoice_not_booking';
export { fixture as newsletter_not_booking } from './newsletter_not_booking';
export { fixture as prompt_injection } from './prompt_injection';
export { fixture as spotify_analytics_email } from './spotify_analytics_email';
export { fixture as timezone_mismatch } from './timezone_mismatch';
export { fixture as travel_itinerary_not_booking } from './travel_itinerary_not_booking';
