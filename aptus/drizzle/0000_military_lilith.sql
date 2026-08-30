CREATE TABLE "solved_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_username" text NOT NULL,
	"issue_url" text NOT NULL,
	"issue_title" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"match_score" integer,
	"difficulty" integer,
	"solved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "solved_issues_github_username_issue_url_unique" UNIQUE("github_username","issue_url")
);
