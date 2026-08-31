CREATE TABLE "saved_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_username" text NOT NULL,
	"issue_url" text NOT NULL,
	"issue_title" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"match_score" integer,
	"difficulty" integer,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_issues_github_username_issue_url_unique" UNIQUE("github_username","issue_url")
);
--> statement-breakpoint
DROP TABLE "solved_issues" CASCADE;