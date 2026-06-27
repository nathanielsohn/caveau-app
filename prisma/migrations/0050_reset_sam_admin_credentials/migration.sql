-- Reset Sam's admin account to the active Caveau Wine email and revoke
-- the previous seeded credentials without deleting any related audit data.

DO $$
DECLARE
  target_password_hash CONSTANT text := '$2b$13$xqQS5iUHGDnvOORFqnYu0ebAF/RVG4OaCGpQW5hx.TqL/oiud6.mm';
  old_member_id text;
  target_member_id text;
BEGIN
  SELECT id INTO old_member_id
  FROM members
  WHERE email = 'samuel@caveau.com'
  LIMIT 1;

  SELECT id INTO target_member_id
  FROM members
  WHERE email = 'samuel@caveauwine.com'
  LIMIT 1;

  IF target_member_id IS NOT NULL THEN
    UPDATE members
    SET
      name = 'Sam Jalloh',
      tier = 'black',
      role = 'admin',
      password_hash = target_password_hash,
      onboarded_at = COALESCE(onboarded_at, CURRENT_TIMESTAMP),
      session_version = session_version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = target_member_id;

    IF old_member_id IS NOT NULL AND old_member_id <> target_member_id THEN
      UPDATE members
      SET
        email = 'disabled+' || old_member_id || '+samuel@caveau.com',
        password_hash = NULL,
        session_version = session_version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = old_member_id;
    END IF;
  ELSIF old_member_id IS NOT NULL THEN
    UPDATE members
    SET
      name = 'Sam Jalloh',
      email = 'samuel@caveauwine.com',
      tier = 'black',
      role = 'admin',
      password_hash = target_password_hash,
      onboarded_at = COALESCE(onboarded_at, CURRENT_TIMESTAMP),
      session_version = session_version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = old_member_id;
  ELSE
    INSERT INTO members (
      id,
      name,
      email,
      tier,
      role,
      password_hash,
      onboarded_at,
      session_version,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid()::text,
      'Sam Jalloh',
      'samuel@caveauwine.com',
      'black',
      'admin',
      target_password_hash,
      CURRENT_TIMESTAMP,
      0,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
