-- Sprint 10: Extend profiles table to store full risk questionnaire responses

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_questionnaire JSONB DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS questionnaire_version INT DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Index for fetching users with completed questionnaires
CREATE INDEX IF NOT EXISTS idx_profiles_questionnaire ON profiles(user_id, questionnaire_version) WHERE full_questionnaire IS NOT NULL;
