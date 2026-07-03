-- Praeto Compliance Club — PostgreSQL Schema
-- Run once against your database: psql -U youruser -d praeto -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── MEMBERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) UNIQUE NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,
  full_name           VARCHAR(255) NOT NULL,
  fsp_licence         VARCHAR(50),
  phone               VARCHAR(30),
  province            VARCHAR(50),
  tier                VARCHAR(20)  NOT NULL DEFAULT 'foundation', -- foundation | practitioner | elite
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending',    -- pending | active | suspended | cancelled
  is_admin            BOOLEAN      NOT NULL DEFAULT FALSE,
  elite_seats_hold    BOOLEAN      NOT NULL DEFAULT FALSE,
  reset_token         VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_email  ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_tier   ON members(tier);

-- ─── PAYMENTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  payfast_payment_id  VARCHAR(255),
  payfast_pf_payment_id VARCHAR(255),
  amount              DECIMAL(10,2) NOT NULL,
  tier                VARCHAR(20),
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | complete | failed | cancelled
  payment_date        TIMESTAMPTZ,
  itn_raw             JSONB,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_status    ON payments(status);

-- ─── COMPLIANCE ALERTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(500) NOT NULL,
  body         TEXT         NOT NULL,
  summary      VARCHAR(500),
  severity     VARCHAR(20)  NOT NULL DEFAULT 'info',       -- info | warning | critical
  category     VARCHAR(100) NOT NULL DEFAULT 'FSCA',       -- FSCA | FIC | FAIS | CPD | RE | PPR
  tier_access  VARCHAR(20)  NOT NULL DEFAULT 'foundation', -- foundation | practitioner | elite
  published    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by   UUID         REFERENCES members(id),
  published_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_published_at ON compliance_alerts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_tier         ON compliance_alerts(tier_access);

-- ─── ALERT READS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_alert_reads (
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  alert_id  UUID NOT NULL REFERENCES compliance_alerts(id) ON DELETE CASCADE,
  read_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, alert_id)
);

-- ─── CPD RECORDS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpd_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  module_name     VARCHAR(255) NOT NULL,
  provider        VARCHAR(255) NOT NULL DEFAULT 'Praeto Training Institute',
  hours           DECIMAL(4,1) NOT NULL CHECK (hours > 0 AND hours <= 30),
  cpd_year        INTEGER      NOT NULL,
  certificate_url VARCHAR(500),
  completed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpd_member_year ON cpd_records(member_id, cpd_year);

-- ─── AI CONVERSATIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID  NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  messages   JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_member ON ai_conversations(member_id);

-- ─── EMAIL BROADCASTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_broadcasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          VARCHAR(500) NOT NULL,
  body             TEXT         NOT NULL,
  tier_filter      VARCHAR(20),    -- NULL = all tiers
  sent_at          TIMESTAMPTZ,
  sent_by          UUID REFERENCES members(id),
  recipient_count  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CPD MODULES CATALOGUE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpd_modules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  hours        DECIMAL(4,1) NOT NULL,
  category     VARCHAR(100),
  tier_access  VARCHAR(20) NOT NULL DEFAULT 'foundation',
  video_url    VARCHAR(500),
  doc_url      VARCHAR(500),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TEMPLATES LIBRARY ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  category     VARCHAR(100) NOT NULL DEFAULT 'General',
  tier_access  VARCHAR(20) NOT NULL DEFAULT 'foundation',
  file_url     VARCHAR(500),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER members_updated_at
  BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER ai_conv_updated_at
  BEFORE UPDATE ON ai_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── SEED DATA ──────────────────────────────────────────────────────────────

-- Default admin (password = Admin@Praeto2026 — CHANGE THIS)
INSERT INTO members (email, password_hash, full_name, fsp_licence, tier, status, is_admin)
VALUES (
  'berkeley@praeto.co.za',
  '$2b$12$placeholder_change_via_node_seed',
  'Berkeley Pretorius',
  '1457',
  'elite',
  'active',
  TRUE
) ON CONFLICT (email) DO NOTHING;

-- Seed CPD modules
INSERT INTO cpd_modules (title, description, hours, category, tier_access, sort_order) VALUES
('FAIS Act Fundamentals 2026', 'Core FAIS obligations for Category I FSPs including fit & proper requirements', 3.0, 'FAIS', 'foundation', 1),
('FIC Act AML/CFT Programme', 'Anti-money laundering and counter-terrorism financing programme requirements', 4.0, 'FIC', 'foundation', 2),
('PPR Section 8 — Replacement Disclosures', 'Updated replacement disclosure requirements post-June 2026 amendments', 2.0, 'PPR', 'foundation', 3),
('RE5 Scenario-Based Preparation 2026', 'Structured preparation for the new INSETA scenario-based RE5 format', 5.0, 'RE', 'foundation', 4),
('KI Supervision & Oversight', 'Key Individual responsibilities for supervising representatives', 3.0, 'FAIS', 'foundation', 5),
('Cell Captive Funeral Schemes', 'Compliance requirements for funeral product distribution', 2.5, 'Products', 'practitioner', 6),
('ROA & FNA Compliance Review', 'Record of Advice and Financial Needs Analysis documentation standards', 3.0, 'PPR', 'foundation', 7),
('FSCA Enforcement Actions 2026', 'Case studies from 2026 FSCA enforcement actions and lessons learned', 2.0, 'FSCA', 'foundation', 8),
('RE1 Key Individual Master Class', 'Advanced RE1 preparation with Berkeley Pretorius — scenario workshop', 6.0, 'RE', 'practitioner', 9),
('Bespoke Practice Management Review', 'Full compliance framework review with 1:1 KI mentoring session', 4.0, 'Practice', 'elite', 10)
ON CONFLICT DO NOTHING;

-- Seed compliance templates
INSERT INTO templates (title, description, category, tier_access) VALUES
('ROA Template — Life Risk 2026', 'Record of Advice compliant with PPR Section 8 June 2026 amendments', 'ROA/FNA', 'foundation'),
('ROA Template — Investment Products', 'Record of Advice for investment product advice — FAIS compliant', 'ROA/FNA', 'foundation'),
('FNA Template — Comprehensive', 'Financial Needs Analysis covering all product categories', 'ROA/FNA', 'foundation'),
('KI Supervision Log', 'Monthly supervision log for Key Individuals with representative oversight', 'Supervision', 'foundation'),
('AML/CFT Programme — FATF Aligned', 'Full AML/CFT compliance programme updated for FATF 2026 recommendations', 'FIC Act', 'practitioner'),
('Compliance Manual Template', 'Comprehensive FSP compliance manual covering all FAIS obligations', 'Compliance Manual', 'practitioner'),
('Complaints Register', 'FAIS-compliant complaints register and resolution tracking', 'Compliance Manual', 'foundation'),
('Conflict of Interest Policy', 'Compliant COI policy with required disclosures', 'Compliance Manual', 'foundation'),
('Funeral Product Disclosure Template', 'Cell captive funeral scheme member disclosure documents', 'Products', 'practitioner'),
('FSCA Enquiry Response Template', 'Template for responding to FSCA information requests and investigations', 'FSCA', 'elite'),
('Fit & Proper Assessment Checklist', 'Annual fit & proper assessment documentation for representatives', 'Supervision', 'practitioner'),
('Business Continuity Plan Template', 'FSP business continuity and disaster recovery plan', 'Risk', 'practitioner')
ON CONFLICT DO NOTHING;

-- Seed initial compliance alerts
INSERT INTO compliance_alerts (title, body, summary, severity, category, tier_access) VALUES
('FSCA Sanctions Four Category I FSPs — June 2026',
 'The FSCA has imposed administrative sanctions totalling R2.3 million on four Category I FSPs for contraventions of the FAIS Act and the Financial Intelligence Centre Act. The sanctions relate primarily to inadequate AML/CFT programmes and failure to maintain proper records of advice. All four FSPs have been ordered to appoint an independent compliance auditor within 30 days. Members should review their AML/CFT programmes immediately using the updated template in your library.',
 'R2.3M in fines — review your AML/CFT programme immediately',
 'critical', 'FSCA', 'foundation'),
('RE5 Examination Format Change — Q3 2026',
 'INSETA has confirmed that the RE5 examination format for Q3 2026 sitting will include 40% scenario-based questions, up from 20% in prior years. The scenario questions require candidates to apply regulatory knowledge to practical client situations. Praeto''s RE5 module has been updated to cover the new format with worked examples. Foundation and Practitioner members can access the updated module in the CPD library.',
 'Scenario questions now 40% of the RE5 paper — updated prep module available',
 'warning', 'RE', 'foundation'),
('PPR Section 8 Replacement Disclosure Amendments in Effect',
 'The amended Policyholder Protection Rules Section 8, which updates replacement disclosure requirements, came into full effect on 1 June 2026. FSPs advising on replacement of life risk policies must now use the updated disclosure format within the ROA. Old ROA templates that were PPR-compliant before June 2026 are now non-compliant. The updated ROA template is available in your template library.',
 'Old ROA templates are now non-compliant — download updated version',
 'critical', 'PPR', 'foundation'),
('FSCA Guidance Note 4/2026 — Microinsurance Product Definitions',
 'The FSCA has issued Guidance Note 4 of 2026 clarifying product definitions for microinsurance products distributed by Category I FSPs. The guidance confirms that cell captive funeral products must comply with the Microinsurance Act definitions for premium limits and benefit caps. Practitioner and Elite members can access the updated funeral scheme compliance templates.',
 'Funeral product FSPs must review product definitions against the Microinsurance Act',
 'info', 'FSCA', 'practitioner'),
('FIC Act AML/CFT Programme Reviews Due Q3 2026',
 'The Financial Intelligence Centre has indicated that scheduled review visits to accountable institutions will prioritise AML/CFT programme completeness in Q3 2026. FSPs should ensure their programmes include: risk assessment, customer due diligence procedures, record keeping, reporting obligations, and staff training records. All Praeto members have access to the updated AML/CFT programme template.',
 'FIC review season: ensure your AML/CFT programme is complete and current',
 'warning', 'FIC', 'foundation')
ON CONFLICT DO NOTHING;
