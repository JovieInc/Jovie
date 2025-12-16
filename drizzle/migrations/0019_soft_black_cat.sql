CREATE INDEX "idx_audience_members_creator_last_seen_at" ON "audience_members" USING btree ("creator_profile_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_audience_members_creator_updated_at" ON "audience_members" USING btree ("creator_profile_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_click_events_creator_profile_id_created_at" ON "click_events" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_click_events_creator_profile_id_created_at_link_type" ON "click_events" USING btree ("creator_profile_id","created_at","link_type");--> statement-breakpoint
CREATE INDEX "idx_notification_subscriptions_creator_profile_id_created_at" ON "notification_subscriptions" USING btree ("creator_profile_id","created_at");