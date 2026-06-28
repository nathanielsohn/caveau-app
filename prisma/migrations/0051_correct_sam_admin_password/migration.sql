-- Correct Sam's admin password hash to match the current shared credential.
-- This follows 0050 so any database that received the earlier transcription
-- is reset without rewriting a migration that may already have run.

UPDATE members
SET
  name = 'Sam Jalloh',
  tier = 'black',
  role = 'admin',
  password_hash = '$2b$13$6tRedBMrWEuJPBshCjdvLOTx8hPjqfNEyZ7Z0lk/ylXyEpH3Q5C1a',
  onboarded_at = COALESCE(onboarded_at, CURRENT_TIMESTAMP),
  session_version = session_version + 1,
  updated_at = CURRENT_TIMESTAMP
WHERE email = 'samuel@caveauwine.com';
