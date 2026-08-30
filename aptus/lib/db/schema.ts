import { pgTable, serial, text, integer, timestamp, unique } from 'drizzle-orm/pg-core';

export const solvedIssues = pgTable('solved_issues', {
  id: serial('id').primaryKey(),
  githubUsername: text('github_username').notNull(),
  issueUrl: text('issue_url').notNull(),
  issueTitle: text('issue_title').notNull(),
  repoFullName: text('repo_full_name').notNull(),
  matchScore: integer('match_score'),
  difficulty: integer('difficulty'),
  solvedAt: timestamp('solved_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserIssue: unique().on(table.githubUsername, table.issueUrl),
}));
