
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const savedIssues = pgTable(
  'saved_issues',
  {
    id: serial('id').primaryKey(),
    githubUsername: text('github_username').notNull(),
    issueUrl: text('issue_url').notNull(),
    issueTitle: text('issue_title').notNull(),
    repoFullName: text('repo_full_name').notNull(),
    matchScore: integer('match_score'),
    difficulty: integer('difficulty'),
    savedAt: timestamp('saved_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserIssue: unique().on(
      table.githubUsername,
      table.issueUrl
    ),
  })
);

export const scanHistory = pgTable('scan_history', {
  id: serial('id').primaryKey(),
  scannedBy: text('scanned_by').notNull(),
  targetUsername: text('target_username').notNull(),
  profileJson: text('profile_json'),
  skillGraphJson: text('skill_graph_json'),
  resultsJson: text('results_json').notNull(),
  scannedAt: timestamp('scanned_at').defaultNow().notNull(),
});
