CREATE TABLE "leaderboard_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"model_id" integer,
	"variant_key" text DEFAULT '' NOT NULL,
	"raw_name" text NOT NULL,
	"raw_org" text,
	"rank" integer,
	"score" double precision,
	"score_lower" double precision,
	"score_upper" double precision,
	"votes" integer,
	"percentile" double precision,
	"redistributable" boolean DEFAULT true NOT NULL,
	"extra" jsonb
);
--> statement-breakpoint
CREATE TABLE "leaderboards" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"source_id" integer NOT NULL,
	"board_key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"category_raw" text,
	"score_type" text NOT NULL,
	"higher_is_better" boolean DEFAULT true NOT NULL,
	"external_url" text,
	"description" text,
	CONSTRAINT "leaderboards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "match_review_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_slug" text NOT NULL,
	"raw_name" text NOT NULL,
	"raw_org" text,
	"suggested_model_slug" text,
	"suggestion_score" double precision,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"source_slug" text NOT NULL,
	"raw_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"variant_key" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_history" (
	"model_id" integer NOT NULL,
	"leaderboard_id" integer NOT NULL,
	"published_at" date NOT NULL,
	"rank" integer,
	"score" double precision,
	"percentile" double precision,
	"batch_key" text,
	CONSTRAINT "model_history_model_id_leaderboard_id_published_at_pk" PRIMARY KEY("model_id","leaderboard_id","published_at")
);
--> statement-breakpoint
CREATE TABLE "model_meta" (
	"model_id" integer PRIMARY KEY NOT NULL,
	"openrouter_id" text NOT NULL,
	"context_length" integer,
	"price_prompt_per_m" double precision,
	"price_completion_per_m" double precision,
	"input_modalities" text[],
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "model_summaries" (
	"model_id" integer PRIMARY KEY NOT NULL,
	"coverage" integer NOT NULL,
	"source_count" integer NOT NULL,
	"median_percentile" double precision,
	"best_percentile" double precision,
	"worst_percentile" double precision,
	"overall_percentile" double precision,
	"disagreement_score" double precision,
	"disagreement_flag" text DEFAULT 'none' NOT NULL,
	"disagreement_pair" jsonb,
	"rank_delta_7d" double precision,
	"rank_delta_30d" double precision,
	"per_leaderboard" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"vendor_id" integer NOT NULL,
	"family" text NOT NULL,
	"params_total" double precision,
	"params_active" double precision,
	"open_weights" boolean,
	"license" text,
	"modalities" text[] DEFAULT '{text}'::text[] NOT NULL,
	"released_at" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_slug" text NOT NULL,
	"mode" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"stats" jsonb,
	"warnings" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"leaderboard_id" integer NOT NULL,
	"published_at" date NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_key" text,
	"content_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"matched_count" integer NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"reject_reason" text,
	"is_latest" boolean DEFAULT false NOT NULL,
	"run_id" bigint
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"homepage" text,
	"license" text,
	"license_url" text,
	"attribution" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" char(2) NOT NULL,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_aliases" ADD CONSTRAINT "model_aliases_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_history" ADD CONSTRAINT "model_history_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_history" ADD CONSTRAINT "model_history_leaderboard_id_leaderboards_id_fk" FOREIGN KEY ("leaderboard_id") REFERENCES "public"."leaderboards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_meta" ADD CONSTRAINT "model_meta_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_summaries" ADD CONSTRAINT "model_summaries_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_leaderboard_id_leaderboards_id_fk" FOREIGN KEY ("leaderboard_id") REFERENCES "public"."leaderboards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_snapshot_idx" ON "leaderboard_entries" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "entries_model_idx" ON "leaderboard_entries" USING btree ("model_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "entries_unmatched_idx" ON "leaderboard_entries" USING btree ("raw_name") WHERE "leaderboard_entries"."model_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboards_source_board_uq" ON "leaderboards" USING btree ("source_id","board_key");--> statement-breakpoint
CREATE UNIQUE INDEX "review_source_raw_uq" ON "match_review_queue" USING btree ("source_slug","raw_name");--> statement-breakpoint
CREATE UNIQUE INDEX "model_aliases_source_raw_uq" ON "model_aliases" USING btree ("source_slug","raw_name");--> statement-breakpoint
CREATE INDEX "model_aliases_norm_idx" ON "model_aliases" USING btree ("source_slug","normalized_name");--> statement-breakpoint
CREATE INDEX "summaries_disagree_idx" ON "model_summaries" USING btree ("disagreement_score");--> statement-breakpoint
CREATE INDEX "models_vendor_idx" ON "models" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "models_family_idx" ON "models" USING btree ("family");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_lb_date_hash_uq" ON "snapshots" USING btree ("leaderboard_id","published_at","content_hash");--> statement-breakpoint
CREATE INDEX "snapshots_latest_idx" ON "snapshots" USING btree ("leaderboard_id") WHERE "snapshots"."is_latest";--> statement-breakpoint
CREATE INDEX "snapshots_lb_date_idx" ON "snapshots" USING btree ("leaderboard_id","published_at");